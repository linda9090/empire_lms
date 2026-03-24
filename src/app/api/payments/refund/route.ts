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

/**
 * POST /api/payments/refund
 *
 * Processes a refund for a payment transaction.
 * - For Stripe payments: Calls Stripe refund API
 * - For mock payments: Updates status directly
 * - Cancels the associated enrollment
 *
 * Request body:
 * - paymentId: string - The payment transaction ID to refund
 * - reason?: string - Optional refund reason
 *
 * Returns:
 * - refundId: string - The refund transaction ID
 * - amount: number - Refunded amount
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

    // Only ADMINs can process refunds
    if (userRole !== "ADMIN") {
      return NextResponse.json(
        { data: null, error: "Forbidden: Only admins can process refunds" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { paymentId, reason } = body;

    // Validation
    if (!paymentId || typeof paymentId !== "string") {
      return NextResponse.json(
        { data: null, error: "paymentId is required" },
        { status: 400 }
      );
    }

    // Find payment transaction
    const payment = await db.paymentTransaction.findFirst({
      where: { id: paymentId },
    });

    if (!payment) {
      return NextResponse.json(
        { data: null, error: "Payment transaction not found" },
        { status: 404 }
      );
    }

    // Check if payment is in a refundable state
    if (payment.status !== "succeeded") {
      return NextResponse.json(
        { data: null, error: "Payment cannot be refunded. Current status: " + payment.status },
        { status: 400 }
      );
    }

    let refundId: string;

    // Process refund based on provider
    if (payment.provider === "stripe" && PAYMENT_MODE !== "mock") {
      if (!payment.providerPaymentId) {
        return NextResponse.json(
          { data: null, error: "No Stripe payment ID found" },
          { status: 400 }
        );
      }

      // Get the Payment Intent from the Session
      const checkoutSession = await stripe.checkout.sessions.retrieve(
        payment.providerPaymentId
      );

      if (!checkoutSession.payment_intent) {
        return NextResponse.json(
          { data: null, error: "No payment intent found for this session" },
          { status: 400 }
        );
      }

      // Create Stripe refund
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
      // Mock mode: Generate mock refund ID
      refundId = `mock_refund_${Date.now()}`;
    }

    // Update payment transaction status
    await db.paymentTransaction.update({
      where: { id: paymentId },
      data: {
        status: "canceled",
        metadata: JSON.stringify({
          ...JSON.parse(payment.metadata || "{}"),
          refundId,
          refundReason: reason,
          refundedAt: new Date().toISOString(),
        }),
      },
    });

    // Cancel associated enrollment
    const metadata = JSON.parse(payment.metadata || "{}");
    if (metadata.courseId) {
      await db.enrollment.updateMany({
        where: {
          userId: payment.userId,
          courseId: metadata.courseId,
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

/**
 * GET /api/payments/refund
 *
 * Lists refundable payment transactions (ADMIN only).
 */
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

    const where: any = {
      status: "succeeded",
    };

    if (userId) {
      where.userId = userId;
    }

    // Filter by courseId from metadata
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
