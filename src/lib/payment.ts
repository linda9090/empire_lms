import { z } from "zod/v4";

const PaymentModeSchema = z.enum(["mock", "stripe", "paypal"]);

type PaymentMode = z.infer<typeof PaymentModeSchema>;

interface PaymentIntent {
  id: string;
  amount: number;
  currency: string;
  status: "pending" | "succeeded" | "failed" | "canceled";
  provider: PaymentMode;
  metadata?: Record<string, string>;
}

interface CreatePaymentParams {
  amount: number;
  currency: string;
  userId: string;
  courseId: string;
  metadata?: Record<string, string>;
}

interface PaymentProviderInterface {
  createPayment(params: CreatePaymentParams): Promise<PaymentIntent>;
  verifyPayment(paymentId: string): Promise<PaymentIntent>;
  cancelPayment(paymentId: string): Promise<PaymentIntent>;
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
}

class StripePaymentProvider implements PaymentProviderInterface {
  async createPayment(_params: CreatePaymentParams): Promise<PaymentIntent> {
    throw new Error("Stripe provider not yet implemented");
  }

  async verifyPayment(_paymentId: string): Promise<PaymentIntent> {
    throw new Error("Stripe provider not yet implemented");
  }

  async cancelPayment(_paymentId: string): Promise<PaymentIntent> {
    throw new Error("Stripe provider not yet implemented");
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

export function getPaymentProvider(): PaymentProviderInterface {
  const mode = getPaymentMode();
  switch (mode) {
    case "stripe":
      return new StripePaymentProvider();
    case "paypal":
      return new PayPalPaymentProvider();
    case "mock":
    default:
      return new MockPaymentProvider();
  }
}

export type {
  PaymentIntent,
  CreatePaymentParams,
  PaymentProviderInterface,
  PaymentMode,
};
