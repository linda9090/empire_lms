import { NextRequest, NextResponse } from "next/server";
import { NotificationEventType } from "@prisma/client";
import { db } from "@/lib/db";
import { getStripeProvider } from "@/lib/payment";
import { z } from "zod/v4";
import Stripe from "stripe";
import {
  buildNotificationIdempotencyKey,
  createNotification,
} from "@/lib/notification";

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
        const paymentIntentId = session.payment_intent as string;

        const [user, course] = await Promise.all([
          db.user.findUnique({
            where: { id: userId },
            select: {
              id: true,
              name: true,
              email: true,
            },
          }),
          db.course.findUnique({
            where: { id: courseId },
            select: {
              id: true,
              title: true,
              teacherId: true,
              teacher: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          }),
        ]);

        if (!user || !course) {
          return NextResponse.json(
            { error: "Invalid webhook metadata references" },
            { status: 400 }
          );
        }

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
              providerPaymentId: paymentIntentId,
              status: "pending",
            },
            data: {
              status: "succeeded",
            },
          });

          await Promise.allSettled([
            createNotification({
              recipient: {
                userId: user.id,
                email: user.email,
                name: user.name,
              },
              eventType: NotificationEventType.STUDENT_PAYMENT_COMPLETED,
              title: "결제가 완료되었습니다",
              message: `${course.title} 강의 결제가 완료되었습니다.`,
              courseId: course.id,
              metadata: {
                paymentIntentId,
                courseId: course.id,
                source: "stripe-webhook",
              },
              idempotencyKey: buildNotificationIdempotencyKey(
                "webhook",
                "student-payment",
                paymentIntentId
              ),
            }),
          ]);

          return NextResponse.json({ received: true });
        }

        const createdEnrollment = await db.$transaction(async (tx) => {
          const enrollment = await tx.enrollment.create({
            data: {
              userId,
              courseId,
              status: "ACTIVE",
            },
          });

          await tx.paymentTransaction.updateMany({
            where: {
              providerPaymentId: paymentIntentId,
              status: "pending",
            },
            data: {
              status: "succeeded",
              updatedAt: new Date(),
            },
          });

          return enrollment;
        });

        await Promise.allSettled([
          createNotification({
            recipient: {
              userId: user.id,
              email: user.email,
              name: user.name,
            },
            eventType: NotificationEventType.STUDENT_ENROLLMENT_COMPLETED,
            title: "수강신청이 완료되었습니다",
            message: `${course.title} 강의 수강신청이 완료되었습니다.`,
            courseId: course.id,
            metadata: {
              enrollmentId: createdEnrollment.id,
              courseId: course.id,
              source: "stripe-webhook",
            },
            idempotencyKey: buildNotificationIdempotencyKey(
              "webhook",
              "student-enrollment",
              createdEnrollment.id
            ),
          }),
          createNotification({
            recipient: {
              userId: user.id,
              email: user.email,
              name: user.name,
            },
            eventType: NotificationEventType.STUDENT_PAYMENT_COMPLETED,
            title: "결제가 완료되었습니다",
            message: `${course.title} 강의 결제가 완료되었습니다.`,
            courseId: course.id,
            metadata: {
              paymentIntentId,
              courseId: course.id,
              enrollmentId: createdEnrollment.id,
              source: "stripe-webhook",
            },
            idempotencyKey: buildNotificationIdempotencyKey(
              "webhook",
              "student-payment",
              paymentIntentId
            ),
          }),
          ...(course.teacherId &&
          course.teacherId !== user.id &&
          course.teacher?.email
            ? [
                createNotification({
                  recipient: {
                    userId: course.teacherId,
                    email: course.teacher.email,
                    name: course.teacher.name,
                  },
                  eventType: NotificationEventType.TEACHER_NEW_STUDENT_REGISTERED,
                  title: "새 수강생이 등록되었습니다",
                  message: `${user.name ?? "학생"}님이 ${course.title} 강의에 등록했습니다.`,
                  courseId: course.id,
                  metadata: {
                    studentId: user.id,
                    courseId: course.id,
                    enrollmentId: createdEnrollment.id,
                    source: "stripe-webhook",
                  },
                  idempotencyKey: buildNotificationIdempotencyKey(
                    "webhook",
                    "teacher-new-student",
                    createdEnrollment.id,
                    course.teacherId
                  ),
                }),
              ]
            : []),
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
