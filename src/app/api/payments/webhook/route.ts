import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { sendPaymentReceiptEmail } from "@/lib/payment-email";

export const runtime = "nodejs";

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

function parseJsonRecord(value: string | null): Record<string, unknown> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

async function processCheckoutCompleted(
  checkoutSession: Stripe.Checkout.Session
): Promise<"ok" | "invalid_metadata"> {
  const metadata = checkoutSession.metadata ?? {};
  const courseId = metadata.courseId;
  const userId = metadata.userId;
  const paymentId = metadata.paymentId;

  if (!courseId || !userId) {
    return "invalid_metadata";
  }

  const alreadyProcessed = await db.paymentTransaction.findFirst({
    where: {
      providerPaymentId: checkoutSession.id,
      status: "succeeded",
    },
  });

  if (alreadyProcessed) {
    return "ok";
  }

  let payment = paymentId
    ? await db.paymentTransaction.findFirst({
        where: { id: paymentId },
      })
    : null;

  if (!payment) {
    payment = await db.paymentTransaction.findFirst({
      where: { providerPaymentId: checkoutSession.id },
    });
  }

  if (payment && payment.status !== "succeeded") {
    payment = await db.paymentTransaction.update({
      where: { id: payment.id },
      data: {
        status: "succeeded",
        providerPaymentId: checkoutSession.id,
      },
    });
  }

  const existingEnrollment = await db.enrollment.findFirst({
    where: {
      userId,
      courseId,
      deletedAt: null,
    },
  });

  if (!existingEnrollment) {
    await db.enrollment.create({
      data: {
        userId,
        courseId,
        status: "ACTIVE",
      },
    });
  }

  const customerEmail =
    checkoutSession.customer_details?.email ?? checkoutSession.customer_email;
  if (customerEmail) {
    const storedMetadata = parseJsonRecord(payment?.metadata ?? null);
    const storedCourseTitle =
      typeof storedMetadata.courseTitle === "string"
        ? storedMetadata.courseTitle
        : undefined;
    const amount =
      payment?.amount ??
      (typeof checkoutSession.amount_total === "number"
        ? checkoutSession.amount_total / 100
        : 0);

    try {
      await sendPaymentReceiptEmail({
        to: customerEmail,
        courseTitle: metadata.courseTitle || storedCourseTitle || "Course",
        amount,
        currency: (payment?.currency || checkoutSession.currency || "usd").toLowerCase(),
        paymentId: payment?.id || paymentId || checkoutSession.id,
        provider: "stripe",
      });
    } catch (error) {
      console.error("Failed to send Stripe receipt email:", error);
    }
  }

  return "ok";
}

async function processChargeRefunded(charge: Stripe.Charge): Promise<void> {
  const paymentIntentId =
    typeof charge.payment_intent === "string" ? charge.payment_intent : null;

  if (!paymentIntentId) {
    return;
  }

  const payment = await db.paymentTransaction.findFirst({
    where: {
      providerPaymentId: paymentIntentId,
    },
  });

  if (!payment) {
    return;
  }

  await db.paymentTransaction.update({
    where: { id: payment.id },
    data: { status: "canceled" },
  });

  const metadata = parseJsonRecord(payment.metadata);
  const courseId =
    typeof metadata.courseId === "string" ? metadata.courseId : undefined;

  if (!courseId) {
    return;
  }

  await db.enrollment.updateMany({
    where: {
      userId: payment.userId,
      courseId,
      status: "ACTIVE",
    },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const signature = request.headers.get("stripe-signature");
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!signature) {
      return NextResponse.json(
        { error: "No signature provided" },
        { status: 400 }
      );
    }

    if (!webhookSecret) {
      return NextResponse.json(
        { error: "Webhook secret is not configured" },
        { status: 500 }
      );
    }

    const body = await request.text();
    let stripe: Stripe;
    try {
      stripe = getStripeClient();
    } catch {
      return NextResponse.json(
        { error: "Stripe not configured" },
        { status: 500 }
      );
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 400 }
      );
    }

    if (event.type === "checkout.session.completed") {
      const result = await processCheckoutCompleted(
        event.data.object as Stripe.Checkout.Session
      );
      if (result === "invalid_metadata") {
        return NextResponse.json(
          { error: "Invalid session metadata" },
          { status: 400 }
        );
      }
    }

    if (event.type === "charge.refunded") {
      await processChargeRefunded(event.data.object as Stripe.Charge);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
