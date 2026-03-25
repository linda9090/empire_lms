import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPaymentProvider, getStripeProvider } from "@/lib/payment";
import { z } from "zod/v4";
import Stripe from "stripe";

type StripeCheckoutSession = Stripe.Checkout.Session;
type StripePaymentIntent = Stripe.PaymentIntent;

const webhookMetadataSchema = z.object({
  userId: z.string(),
  courseId: z.string(),
});

function getSignature(request: NextRequest): string | null {
  return request.headers.get("stripe-signature");
}

export async function POST(request: NextRequest) {
  try {
    const signature = getSignature(request);

    if (!signature) {
      return NextResponse.json({ error: "No signature provided" }, { status: 400 });
    }

    const payload = await request.text();
    const stripeProvider = getStripeProvider();

    if (!stripeProvider) {
      return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
    }

    let event;
    try {
      event = stripeProvider.constructWebhookEvent(payload, signature);
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as StripeCheckoutSession;

        if (session.payment_status !== "paid") {
          return NextResponse.json(
            { error: "Payment not completed" },
            { status: 400 }
          );
        }

        const metadataResult = webhookMetadataSchema.safeParse(session.metadata);
        if (!metadataResult.success) {
          console.error("Invalid webhook metadata:", session.metadata);
          return NextResponse.json(
            { error: "Invalid metadata" },
            { status: 400 }
          );
        }

        const { userId, courseId } = metadataResult.data;

        const existingEnrollment = await db.enrollment.findUnique({
          where: {
            userId_courseId: {
              userId,
              courseId,
            },
          },
        });

        if (existingEnrollment) {
          console.log(`User ${userId} already enrolled in course ${courseId}`);
          await db.paymentTransaction.updateMany({
            where: {
              providerPaymentId: session.id,
              status: "pending",
            },
            data: {
              status: "succeeded",
            },
          });
          return NextResponse.json({ received: true });
        }

        await db.$transaction([
          db.enrollment.create({
            data: {
              userId,
              courseId,
              status: "ACTIVE",
            },
          }),
          db.paymentTransaction.updateMany({
            where: {
              providerPaymentId: session.payment_intent as string,
              status: "pending",
            },
            data: {
              status: "succeeded",
              updatedAt: new Date(),
            },
          }),
        ]);

        console.log(`Enrolled user ${userId} in course ${courseId}`);
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object as StripeCheckoutSession;

        await db.paymentTransaction.updateMany({
          where: {
            providerPaymentId: session.payment_intent as string,
            status: "pending",
          },
          data: {
            status: "canceled",
            updatedAt: new Date(),
          },
        });
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as StripePaymentIntent;

        await db.paymentTransaction.updateMany({
          where: {
            providerPaymentId: paymentIntent.id,
            status: "pending",
          },
          data: {
            status: "failed",
            updatedAt: new Date(),
          },
        });
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}
