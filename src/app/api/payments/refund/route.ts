import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { getPaymentProvider } from "@/lib/payment";

const refundSchema = z.object({
  paymentId: z.string().min(1, "paymentId is required"),
  amount: z.number().optional(),
  reason: z.enum(["duplicate", "fraudulent", "requested_by_customer", "other"]).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Forbidden: Admin access required" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = refundSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { paymentId, amount, reason } = parsed.data;

    const paymentTransaction = await db.paymentTransaction.findFirst({
      where: {
        providerPaymentId: paymentId,
      },
    });

    if (!paymentTransaction) {
      return NextResponse.json({ error: "Payment transaction not found" }, { status: 404 });
    }

    if (paymentTransaction.status !== "succeeded") {
      return NextResponse.json(
        { error: "Can only refund succeeded payments" },
        { status: 400 }
      );
    }

    const provider = getPaymentProvider();

    const refund = await provider.processRefund({
      paymentId,
      amount,
      reason,
    });

    await db.paymentTransaction.update({
      where: { id: paymentTransaction.id },
      data: {
        status: "canceled",
        metadata: JSON.stringify({
          ...JSON.parse(paymentTransaction.metadata ?? "{}"),
          refundId: refund.id,
          refundAmount: refund.amount,
          refundReason: reason,
        }),
        updatedAt: new Date(),
      },
    });

    const enrollment = await db.enrollment.findFirst({
      where: {
        userId: paymentTransaction.userId,
        courseId: JSON.parse(paymentTransaction.metadata ?? "{}").courseId,
      },
    });

    if (enrollment) {
      await db.enrollment.update({
        where: { id: enrollment.id },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
        },
      });
    }

    return NextResponse.json({
      data: {
        refundId: refund.id,
        amount: refund.amount,
        status: refund.status,
      },
    });
  } catch (error) {
    console.error("Refund error:", error);
    return NextResponse.json(
      { error: "Failed to process refund" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const paymentId = searchParams.get("paymentId");

    if (!paymentId) {
      return NextResponse.json(
        { error: "paymentId query parameter is required" },
        { status: 400 }
      );
    }

    const paymentTransaction = await db.paymentTransaction.findFirst({
      where: {
        providerPaymentId: paymentId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!paymentTransaction) {
      return NextResponse.json({ error: "Payment transaction not found" }, { status: 404 });
    }

    if (session.user.role !== "ADMIN" && paymentTransaction.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Forbidden: You can only view your own transactions" },
        { status: 403 }
      );
    }

    return NextResponse.json({ data: paymentTransaction });
  } catch (error) {
    console.error("Get refund info error:", error);
    return NextResponse.json(
      { error: "Failed to fetch refund information" },
      { status: 500 }
    );
  }
}
