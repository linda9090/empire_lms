import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { getSession } from "@/lib/get-session";
import { sendPaymentReceiptEmail } from "@/lib/payment-email";
import type { UserRole } from "@/types";

export const runtime = "nodejs";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

type PaymentMode = "mock" | "stripe" | "paypal";

function getPaymentMode(): PaymentMode {
  const mode = process.env.PAYMENT_MODE;
  if (mode === "stripe" || mode === "paypal") {
    return mode;
  }
  return "mock";
}

function getStripeClient(): Stripe {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    throw new Error("Stripe not configured");
  }

  return new Stripe(stripeSecretKey, {
    apiVersion: "2026-02-25.clover",
    typescript: true,
  });
}

function getCourseId(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("courseId" in body)) {
    return null;
  }

  const { courseId } = body as { courseId?: unknown };
  return typeof courseId === "string" && courseId.trim().length > 0
    ? courseId
    : null;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return NextResponse.json(
        { data: null, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const userRole = session.user.role as UserRole;

    // Only STUDENTS and ADMINs can purchase courses
    if (userRole !== "STUDENT" && userRole !== "ADMIN") {
      return NextResponse.json(
        { data: null, error: "Forbidden: Only students and admins can purchase courses" },
        { status: 403 }
      );
    }

    const courseId = getCourseId(await request.json());

    if (!courseId) {
      return NextResponse.json(
        { data: null, error: "courseId is required" },
        { status: 400 }
      );
    }

    // Check if course exists and get price
    const course = await db.course.findFirst({
      where: { id: courseId, deletedAt: null },
      select: {
        id: true,
        title: true,
        price: true,
        organizationId: true,
      },
    });

    if (!course) {
      return NextResponse.json(
        { data: null, error: "Course not found" },
        { status: 404 }
      );
    }

    const coursePrice = course.price ?? 0;
    const userId = session.user.id;
    const successPath = `/student/courses/${courseId}/checkout/success`;
    const cancelPath = `/student/courses/${courseId}/checkout/canceled`;
    const paymentMode = getPaymentMode();

    const existingEnrollment = await db.enrollment.findFirst({
      where: {
        userId,
        courseId,
        deletedAt: null,
      },
    });

    if (existingEnrollment) {
      return NextResponse.json(
        { data: null, error: "Already enrolled in this course" },
        { status: 409 }
      );
    }

    if (coursePrice <= 0) {
      const enrollment = await db.enrollment.create({
        data: {
          userId,
          courseId,
          status: "ACTIVE",
        },
      });

      if (session.user.email) {
        try {
          await sendPaymentReceiptEmail({
            to: session.user.email,
            courseTitle: course.title,
            amount: 0,
            currency: "usd",
            paymentId: `free_${enrollment.id}`,
            provider: "mock",
          });
        } catch (error) {
          console.error("Failed to send free course receipt email:", error);
        }
      }

      return NextResponse.json({
        data: {
          checkoutUrl: `${successPath}?free=1`,
          paymentId: null,
          freeCourse: true,
          mockMode: paymentMode === "mock",
          enrollment,
        },
        error: null,
      });
    }

    if (paymentMode === "mock") {
      const payment = await db.paymentTransaction.create({
        data: {
          userId,
          organizationId: course.organizationId,
          amount: coursePrice,
          currency: "usd",
          provider: "mock",
          providerPaymentId: `mock_${Date.now()}`,
          status: "succeeded",
          metadata: JSON.stringify({
            courseId,
            courseTitle: course.title,
            mode: "mock",
          }),
        },
      });

      const enrollment = await db.enrollment.create({
        data: {
          userId,
          courseId,
          status: "ACTIVE",
        },
      });

      if (session.user.email) {
        try {
          await sendPaymentReceiptEmail({
            to: session.user.email,
            courseTitle: course.title,
            amount: coursePrice,
            currency: "usd",
            paymentId: payment.id,
            provider: "mock",
          });
        } catch (error) {
          console.error("Failed to send mock receipt email:", error);
        }
      }

      return NextResponse.json({
        data: {
          checkoutUrl: `${successPath}?payment_id=${payment.id}&mock=1`,
          paymentId: payment.id,
          freeCourse: false,
          mockMode: true,
          enrollment,
        },
        error: null,
      });
    }

    if (paymentMode !== "stripe") {
      return NextResponse.json(
        { data: null, error: `Unsupported PAYMENT_MODE: ${paymentMode}` },
        { status: 500 }
      );
    }

    const stripe = getStripeClient();

    const payment = await db.paymentTransaction.create({
      data: {
        userId,
        organizationId: course.organizationId,
        amount: coursePrice,
        currency: "usd",
        provider: "stripe",
        status: "pending",
        metadata: JSON.stringify({
          courseId,
          courseTitle: course.title,
        }),
      },
    });

    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: course.title,
              description: `Enrollment in ${course.title}`,
            },
            unit_amount: Math.round(coursePrice * 100),
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${APP_URL}${successPath}?session_id={CHECKOUT_SESSION_ID}&payment_id=${payment.id}`,
      cancel_url: `${APP_URL}${cancelPath}?payment_id=${payment.id}`,
      customer_email: session.user.email ?? undefined,
      metadata: {
        courseId,
        userId,
        courseTitle: course.title,
        paymentId: payment.id,
      },
    });

    await db.paymentTransaction.update({
      where: { id: payment.id },
      data: {
        providerPaymentId: checkoutSession.id,
      },
    });

    if (!checkoutSession.url) {
      return NextResponse.json(
        { data: null, error: "Stripe checkout URL was not generated" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: {
        checkoutUrl: checkoutSession.url,
        paymentId: payment.id,
        freeCourse: false,
        mockMode: false,
      },
      error: null,
    });
  } catch (error) {
    console.error("Error creating checkout session:", error);
    return NextResponse.json(
      { data: null, error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
