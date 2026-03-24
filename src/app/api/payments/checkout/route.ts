import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { getPaymentProvider } from "@/lib/payment";

const checkoutSchema = z.object({
  courseId: z.string().min(1, "courseId is required"),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = checkoutSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { courseId } = parsed.data;

    const course = await db.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        title: true,
        price: true,
        isPublished: true,
      },
    });

    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    if (!course.isPublished) {
      return NextResponse.json({ error: "Course is not available" }, { status: 400 });
    }

    const existingEnrollment = await db.enrollment.findUnique({
      where: {
        userId_courseId: {
          userId: session.user.id,
          courseId,
        },
      },
    });

    if (existingEnrollment) {
      return NextResponse.json(
        { error: "Already enrolled in this course" },
        { status: 409 }
      );
    }

    const price = course.price ?? 0;

    if (price === 0) {
      const enrollment = await db.enrollment.create({
        data: {
          userId: session.user.id,
          courseId,
          status: "ACTIVE",
        },
      });

      return NextResponse.json(
        {
          data: {
            enrollment,
            checkoutUrl: null,
            message: "Free course enrolled successfully",
          },
        },
        { status: 201 }
      );
    }

    const provider = getPaymentProvider();

    const paymentIntent = await provider.createPayment({
      amount: price,
      currency: "usd",
      userId: session.user.id,
      courseId,
      courseTitle: course.title,
    });

    if (paymentIntent.status === "succeeded" && paymentIntent.provider === "mock") {
      const enrollment = await db.enrollment.create({
        data: {
          userId: session.user.id,
          courseId,
          status: "ACTIVE",
        },
      });

      await db.paymentTransaction.create({
        data: {
          userId: session.user.id,
          organizationId: session.user.organizationId ?? "",
          amount: price,
          currency: paymentIntent.currency,
          provider: paymentIntent.provider,
          providerPaymentId: paymentIntent.id,
          status: "succeeded",
          metadata: JSON.stringify({ courseId }),
        },
      });

      return NextResponse.json(
        {
          data: {
            enrollment,
            checkoutUrl: null,
            message: "Mock payment succeeded",
          },
        },
        { status: 201 }
      );
    }

    await db.paymentTransaction.create({
      data: {
        userId: session.user.id,
        organizationId: session.user.organizationId ?? "",
        amount: price,
        currency: paymentIntent.currency,
        provider: paymentIntent.provider,
        providerPaymentId: paymentIntent.id,
        status: "pending",
        metadata: JSON.stringify({ courseId }),
      },
    });

    return NextResponse.json(
      {
        data: {
          paymentId: paymentIntent.id,
          checkoutUrl: paymentIntent.checkoutUrl,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
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
    const courseId = searchParams.get("courseId");

    if (!courseId) {
      return NextResponse.json(
        { error: "courseId query parameter is required" },
        { status: 400 }
      );
    }

    const course = await db.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        title: true,
        description: true,
        imageUrl: true,
        price: true,
        isPublished: true,
        teacher: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    const existingEnrollment = await db.enrollment.findUnique({
      where: {
        userId_courseId: {
          userId: session.user.id,
          courseId,
        },
      },
    });

    return NextResponse.json({
      data: {
        course,
        isEnrolled: !!existingEnrollment,
      },
    });
  } catch (error) {
    console.error("Get course checkout info error:", error);
    return NextResponse.json(
      { error: "Failed to fetch course information" },
      { status: 500 }
    );
  }
}
