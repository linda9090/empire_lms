import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import Stripe from "stripe";
import type { UserRole } from "@/types";

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-11-20.acacia" as any,
  typescript: true,
});

const PAYMENT_MODE = process.env.PAYMENT_MODE || "mock";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

/**
 * POST /api/payments/checkout
 *
 * Creates a Stripe Checkout session for course enrollment.
 * In mock mode, skips payment and activates enrollment immediately.
 *
 * Request body:
 * - courseId: string - The course to enroll in
 *
 * Returns:
 * - checkoutUrl: string - Stripe Checkout URL (or redirect URL in mock mode)
 * - paymentId: string - Payment transaction ID
 */
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

    const body = await request.json();
    const { courseId } = body;

    // Validation
    if (!courseId || typeof courseId !== "string") {
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

    const userId = session.user.id;

    // Check for existing enrollment
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

    // Free course: Enroll immediately without payment
    if (!course.price || course.price === 0) {
      const enrollment = await db.enrollment.create({
        data: {
          userId,
          courseId,
          status: "ACTIVE",
        },
      });

      return NextResponse.json({
        data: {
          checkoutUrl: `${APP_URL}/student/courses/${courseId}`,
          paymentId: null,
          freeCourse: true,
          enrollment,
        },
        error: null,
      });
    }

    // Mock mode: Skip payment and activate immediately
    if (PAYMENT_MODE === "mock") {
      // Create mock payment transaction
      const payment = await db.paymentTransaction.create({
        data: {
          userId,
          organizationId: course.organizationId,
          amount: course.price,
          currency: "usd",
          provider: "mock",
          providerPaymentId: `mock_${Date.now()}`,
          status: "succeeded",
          metadata: JSON.stringify({ courseId, mode: "mock" }),
        },
      });

      // Activate enrollment
      const enrollment = await db.enrollment.create({
        data: {
          userId,
          courseId,
          status: "ACTIVE",
        },
      });

      return NextResponse.json({
        data: {
          checkoutUrl: `${APP_URL}/student/courses/${courseId}`,
          paymentId: payment.id,
          freeCourse: false,
          mockMode: true,
          enrollment,
        },
        error: null,
      });
    }

    // Stripe mode: Create Checkout Session
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { data: null, error: "Stripe not configured" },
        { status: 500 }
      );
    }

    // Create pending payment transaction
    const payment = await db.paymentTransaction.create({
      data: {
        userId,
        organizationId: course.organizationId,
        amount: course.price,
        currency: "usd",
        provider: "stripe",
        status: "pending",
        metadata: JSON.stringify({ courseId }),
      },
    });

    // Create Stripe Checkout Session
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
            unit_amount: Math.round(course.price * 100), // Convert to cents
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${APP_URL}/student/courses/${courseId}/checkout/success?session_id={CHECKOUT_SESSION_ID}&payment_id=${payment.id}`,
      cancel_url: `${APP_URL}/student/courses/${courseId}/checkout/canceled?payment_id=${payment.id}`,
      customer_email: session.user.email,
      metadata: {
        courseId,
        userId,
        paymentId: payment.id,
      },
    });

    // Update payment with Stripe session ID
    await db.paymentTransaction.update({
      where: { id: payment.id },
      data: {
        providerPaymentId: checkoutSession.id,
      },
    });

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
