import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import Stripe from "stripe";
import { headers } from "next/headers";

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-11-20.acacia" as any,
  typescript: true,
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

/**
 * POST /api/payments/webhook
 *
 * Handles Stripe webhook events.
 * - checkout.session.completed: Activates enrollment after successful payment
 *
 * Security: Verifies Stripe signature to prevent fraudulent requests
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = (await headers()).get("stripe-signature");

    if (!signature) {
      return NextResponse.json(
        { error: "No signature provided" },
        { status: 400 }
      );
    }

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        body,
        signature,
        webhookSecret
      );
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 400 }
      );
    }

    // Handle checkout.session.completed event
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      const { courseId, userId, paymentId } = session.metadata || {};

      if (!courseId || !userId) {
        console.error("Missing metadata in webhook session");
        return NextResponse.json(
          { error: "Invalid session metadata" },
          { status: 400 }
        );
      }

      // Check if payment already processed (idempotency)
      const existingPayment = await db.paymentTransaction.findFirst({
        where: {
          providerPaymentId: session.id,
          status: "succeeded",
        },
      });

      if (existingPayment) {
        console.log("Payment already processed, skipping");
        return NextResponse.json({ received: true });
      }

      // Update payment transaction status
      if (paymentId) {
        await db.paymentTransaction.update({
          where: { id: paymentId },
          data: {
            status: "succeeded",
            providerPaymentId: session.id,
          },
        });
      } else {
        // Find payment by providerPaymentId and update
        const paymentToUpdate = await db.paymentTransaction.findFirst({
          where: { providerPaymentId: session.id },
        });
        if (paymentToUpdate) {
          await db.paymentTransaction.update({
            where: { id: paymentToUpdate.id },
            data: {
              status: "succeeded",
            },
          });
        }
      }

      // Check for existing enrollment
      const existingEnrollment = await db.enrollment.findFirst({
        where: {
          userId,
          courseId,
          deletedAt: null,
        },
      });

      if (!existingEnrollment) {
        // Activate enrollment
        await db.enrollment.create({
          data: {
            userId,
            courseId,
            status: "ACTIVE",
          },
        });
      }

      console.log(`Enrollment activated for user ${userId} in course ${courseId}`);
    }

    // Handle payment_intent.succeeded event (additional safety)
    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      console.log(`Payment succeeded: ${paymentIntent.id}`);
    }

    // Handle charge.refunded event for automatic enrollment cancellation
    if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;

      // Find payment transaction by provider payment ID
      const payment = await db.paymentTransaction.findFirst({
        where: {
          providerPaymentId: charge.payment_intent as string,
        },
      });

      if (payment) {
        // Update payment status
        await db.paymentTransaction.update({
          where: { id: payment.id },
          data: { status: "canceled" },
        });

        // Cancel associated enrollment
        const metadata = JSON.parse(payment.metadata || "{}");
        if (metadata.courseId) {
          await db.enrollment.updateMany({
            where: {
              userId: payment.userId,
              courseId: metadata.courseId,
            },
            data: {
              status: "CANCELLED",
              cancelledAt: new Date(),
            },
          });
        }
      }
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
