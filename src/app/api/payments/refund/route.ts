import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { getSession } from "@/lib/get-session";
import type { UserRole } from "@/types";

export const runtime = "nodejs";

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

function getRefundRequestBody(
  body: unknown
): { paymentId: string; reason?: string } | null {
  if (!body || typeof body !== "object" || !("paymentId" in body)) {
    return null;
  }

  const { paymentId, reason } = body as {
    paymentId?: unknown;
    reason?: unknown;
  };

  if (typeof paymentId !== "string" || paymentId.trim().length === 0) {
    return null;
  }

  return {
    paymentId,
    reason: typeof reason === "string" ? reason : undefined,
  };
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

    // Only ADMINs can process refunds
    if (userRole !== "ADMIN") {
      return NextResponse.json(
        { data: null, error: "Forbidden: Only admins can process refunds" },
        { status: 403 }
      );
    }

    const body = getRefundRequestBody(await request.json());
    if (!body) {
      return NextResponse.json(
        { data: null, error: "paymentId is required" },
        { status: 400 }
      );
    }
    const { paymentId, reason } = body;

    const payment = await db.paymentTransaction.findFirst({
      where: { id: paymentId },
    });

    if (!payment) {
      return NextResponse.json(
        { data: null, error: "Payment transaction not found" },
        { status: 404 }
      );
    }

    if (payment.status !== "succeeded") {
      return NextResponse.json(
        { data: null, error: "Payment cannot be refunded. Current status: " + payment.status },
        { status: 400 }
      );
    }

    let refundId: string;
    const paymentMode = getPaymentMode();

    if (payment.provider === "stripe" && paymentMode !== "mock") {
      let stripe: Stripe;
      try {
        stripe = getStripeClient();
      } catch {
        return NextResponse.json(
          { data: null, error: "Stripe not configured" },
          { status: 500 }
        );
      }

      if (!payment.providerPaymentId) {
        return NextResponse.json(
          { data: null, error: "No Stripe payment ID found" },
          { status: 400 }
        );
      }

      const checkoutSession = await stripe.checkout.sessions.retrieve(
        payment.providerPaymentId
      );

      if (!checkoutSession.payment_intent) {
        return NextResponse.json(
          { data: null, error: "No payment intent found for this session" },
          { status: 400 }
        );
      }

      const refund = await stripe.refunds.create({
        payment_intent: checkoutSession.payment_intent as string,
        reason: "requested_by_customer",
        metadata: {
          originalPaymentId: paymentId,
          reason: reason || "Admin refund",
        },
      });

      refundId = refund.id;
    } else {
      refundId = `mock_refund_${Date.now()}`;
    }

    const existingMetadata = parseJsonRecord(payment.metadata);
    await db.paymentTransaction.update({
      where: { id: paymentId },
      data: {
        status: "canceled",
        metadata: JSON.stringify({
          ...existingMetadata,
          refundId,
          refundReason: reason,
          refundedAt: new Date().toISOString(),
        }),
      },
    });

    const metadata = parseJsonRecord(payment.metadata);
    const courseId =
      typeof metadata.courseId === "string" ? metadata.courseId : undefined;
    if (courseId) {
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

    return NextResponse.json({
      data: {
        refundId,
        amount: payment.amount,
        currency: payment.currency,
        paymentId: payment.id,
      },
      error: null,
    });
  } catch (error) {
    console.error("Error processing refund:", error);
    return NextResponse.json(
      { data: null, error: "Failed to process refund" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return NextResponse.json(
        { data: null, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const userRole = session.user.role as UserRole;

    if (userRole !== "ADMIN") {
      return NextResponse.json(
        { data: null, error: "Forbidden: Only admins can view refunds" },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get("userId");
    const courseId = searchParams.get("courseId");

    const where: {
      status: "succeeded";
      userId?: string;
      metadata?: { contains: string };
    } = {
      status: "succeeded",
    };

    if (userId) {
      where.userId = userId;
    }

    if (courseId) {
      where.metadata = {
        contains: courseId,
      };
    }

    const payments = await db.paymentTransaction.findMany({
      where,
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: payments, error: null });
  } catch (error) {
    console.error("Error fetching refundable payments:", error);
    return NextResponse.json(
      { data: null, error: "Failed to fetch refundable payments" },
      { status: 500 }
    );
  }
}
