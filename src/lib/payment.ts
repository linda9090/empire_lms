import { z } from "zod/v4";
import Stripe from "stripe";

const PaymentModeSchema = z.enum(["mock", "stripe", "paypal"]);

type PaymentMode = z.infer<typeof PaymentModeSchema>;

interface PaymentIntent {
  id: string;
  amount: number;
  currency: string;
  status: "pending" | "succeeded" | "failed" | "canceled";
  provider: PaymentMode;
  checkoutUrl?: string;
  metadata?: Record<string, string>;
}

interface CreatePaymentParams {
  amount: number;
  currency: string;
  userId: string;
  courseId: string;
  courseTitle: string;
  metadata?: Record<string, string>;
}

interface RefundParams {
  paymentId: string;
  amount?: number;
  reason?: string;
}

interface PaymentProviderInterface {
  createPayment(params: CreatePaymentParams): Promise<PaymentIntent>;
  verifyPayment(paymentId: string): Promise<PaymentIntent>;
  cancelPayment(paymentId: string): Promise<PaymentIntent>;
  processRefund(params: RefundParams): Promise<{ id: string; amount: number; status: string }>;
}

class MockPaymentProvider implements PaymentProviderInterface {
  async createPayment(params: CreatePaymentParams): Promise<PaymentIntent> {
    return {
      id: `mock_${crypto.randomUUID()}`,
      amount: params.amount,
      currency: params.currency,
      status: "succeeded",
      provider: "mock",
      metadata: params.metadata,
    };
  }

  async verifyPayment(paymentId: string): Promise<PaymentIntent> {
    return {
      id: paymentId,
      amount: 0,
      currency: "usd",
      status: "succeeded",
      provider: "mock",
    };
  }

  async cancelPayment(paymentId: string): Promise<PaymentIntent> {
    return {
      id: paymentId,
      amount: 0,
      currency: "usd",
      status: "canceled",
      provider: "mock",
    };
  }

  async processRefund(params: RefundParams): Promise<{ id: string; amount: number; status: string }> {
    return {
      id: `refund_${crypto.randomUUID()}`,
      amount: params.amount || 0,
      status: "succeeded",
    };
  }
}

class StripePaymentProvider implements PaymentProviderInterface {
  private stripe: Stripe;
  private webhookSecret: string;

  constructor() {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error("STRIPE_SECRET_KEY environment variable is not set");
    }
    this.stripe = new Stripe(secretKey, {
      apiVersion: undefined,
      typescript: true,
    });
    this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  }

  async createPayment(params: CreatePaymentParams): Promise<PaymentIntent> {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: params.currency,
            product_data: {
              name: params.courseTitle,
              metadata: {
                courseId: params.courseId,
              },
            },
            unit_amount: Math.round(params.amount * 100),
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${appUrl}/student/courses/${params.courseId}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/student/courses/${params.courseId}/checkout/canceled`,
      metadata: {
        userId: params.userId,
        courseId: params.courseId,
      },
    });

    return {
      id: session.id,
      amount: params.amount,
      currency: params.currency,
      status: session.payment_status === "paid" ? "succeeded" : "pending",
      provider: "stripe",
      checkoutUrl: session.url || undefined,
      metadata: params.metadata,
    };
  }

  async verifyPayment(paymentId: string): Promise<PaymentIntent> {
    const session = await this.stripe.checkout.sessions.retrieve(paymentId);

    return {
      id: session.id,
      amount: (session.amount_total ?? 0) / 100,
      currency: session.currency ?? "usd",
      status: session.payment_status === "paid" ? "succeeded" : session.payment_status === "unpaid" ? "pending" : "failed",
      provider: "stripe",
      metadata: (session.metadata as Record<string, string> | null) || undefined,
    };
  }

  async cancelPayment(_paymentId: string): Promise<PaymentIntent> {
    throw new Error("Canceling Stripe payments is not supported. Use refunds instead.");
  }

  async processRefund(params: RefundParams): Promise<{ id: string; amount: number; status: string }> {
    const paymentIntentId = params.paymentId.startsWith("pi_") ? params.paymentId : undefined;

    if (!paymentIntentId) {
      const session = await this.stripe.checkout.sessions.retrieve(params.paymentId);
      if (!session.payment_intent) {
        throw new Error("No payment intent found for this session");
      }
      const pi = typeof session.payment_intent === "string"
        ? await this.stripe.paymentIntents.retrieve(session.payment_intent)
        : session.payment_intent;
      params.paymentId = pi.id;
    }

    const refund = await this.stripe.refunds.create({
      payment_intent: params.paymentId,
      amount: params.amount ? Math.round(params.amount * 100) : undefined,
      reason: (params.reason as Stripe.RefundCreateParams.Reason) ?? "requested_by_customer",
    });

    return {
      id: refund.id,
      amount: refund.amount / 100,
      status: refund.status ?? "unknown",
    };
  }

  constructWebhookEvent(payload: string, signature: string): Stripe.Event {
    if (!this.webhookSecret) {
      throw new Error("STRIPE_WEBHOOK_SECRET environment variable is not set");
    }

    return this.stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);
  }
}

class PayPalPaymentProvider implements PaymentProviderInterface {
  async createPayment(_params: CreatePaymentParams): Promise<PaymentIntent> {
    throw new Error("PayPal provider not yet implemented");
  }

  async verifyPayment(_paymentId: string): Promise<PaymentIntent> {
    throw new Error("PayPal provider not yet implemented");
  }

  async cancelPayment(_paymentId: string): Promise<PaymentIntent> {
    throw new Error("PayPal provider not yet implemented");
  }

  async processRefund(_params: RefundParams): Promise<{ id: string; amount: number; status: string }> {
    throw new Error("PayPal provider not yet implemented");
  }
}

function getPaymentMode(): PaymentMode {
  const mode = process.env.PAYMENT_MODE ?? "mock";
  const result = PaymentModeSchema.safeParse(mode);
  if (!result.success) {
    console.warn(`Invalid PAYMENT_MODE="${mode}", falling back to "mock"`);
    return "mock";
  }
  return result.data;
}

let stripeProviderInstance: StripePaymentProvider | null = null;

export function getPaymentProvider(): PaymentProviderInterface {
  const mode = getPaymentMode();
  switch (mode) {
    case "stripe":
      if (!stripeProviderInstance) {
        stripeProviderInstance = new StripePaymentProvider();
      }
      return stripeProviderInstance;
    case "paypal":
      return new PayPalPaymentProvider();
    case "mock":
    default:
      return new MockPaymentProvider();
  }
}

export function getStripeProvider(): StripePaymentProvider | null {
  const mode = getPaymentMode();
  if (mode === "stripe") {
    if (!stripeProviderInstance) {
      stripeProviderInstance = new StripePaymentProvider();
    }
    return stripeProviderInstance;
  }
  return null;
}

export type {
  PaymentIntent,
  CreatePaymentParams,
  RefundParams,
  PaymentProviderInterface,
  PaymentMode,
};
