/**
 * Notification Library
 *
 * 설계 원칙:
 * 1. 이메일 발송 실패해도 DB에 알림은 저장됨 (내성 설계)
 * 2. emailStatus 필드로 이메일 발송 상태 추적 (PENDING -> SENT or FAILED)
 * 3. 나중에 백그라운드 잡으로 FAILED 상태 재시도 가능
 */

import { db } from "@/lib/db";
import type { NotificationType, NotificationStatus } from "@prisma/client";

// ─── Type Definitions ─────────────────────────────────────────────────────

export type CreateNotificationParams = {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  courseId?: string | null;
  lessonId?: string | null;
  enrollmentId?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
};

export type NotificationResult = {
  id: string;
  userId: string;
  emailStatus: NotificationStatus;
  emailError?: string;
};

// ─── Email Service (Resend) ───────────────────────────────────────────────

/**
 * Resend API를 사용하여 이메일 발송
 * 실패 시 에러를 throw하지 않고 결과를 반환하여 호출자가 처리하도록 함
 */
async function sendEmail({ to, subject, html }: SendEmailParams): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;

  // Resend API가 설정되지 않은 경우 → 실패로 처리하지만 에러는 throw하지 않음
  if (!apiKey) {
    console.warn("[Notification] RESEND_API_KEY not configured, skipping email send");
    return { success: false, error: "RESEND_API_KEY not configured" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || "noreply@empirelms.com",
        to,
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      return { success: false, error: `Resend API error: ${response.status} ${errorText}` };
    }

    const data = await response.json();
    console.log("[Notification] Email sent successfully:", data.id);
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[Notification] Email send error:", errorMessage);
    return { success: false, error: errorMessage };
  }
}

// ─── Notification HTML Template ───────────────────────────────────────────

function getNotificationHtml(type: NotificationType, title: string, message: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const typeLabels: Record<NotificationType, string> = {
    ENROLLMENT_COMPLETED: "수강신청 완료",
    PAYMENT_SUCCEEDED: "결제 완료",
    LESSON_CREATED: "새 레슨 등록",
    STUDENT_ENROLLED: "새 수강생 등록",
    LESSON_COMPLETED: "레슨 완료",
    COURSE_PUBLISHED: "새 강의 게시",
    INVITE_SENT: "초대장 발송",
    INVITE_ACCEPTED: "초대 수락",
  };

  const typeLabel = typeLabels[type] || type;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
    .header h1 { color: white; margin: 0; font-size: 24px; }
    .badge { display: inline-block; background: rgba(255,255,255,0.2); color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; margin-top: 10px; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
    .title { font-size: 20px; font-weight: 600; margin-bottom: 10px; color: #111827; }
    .message { color: #4b5563; margin-bottom: 20px; }
    .button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; }
    .footer { text-align: center; padding: 20px; color: #9ca3af; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Empire LMS</h1>
      <span class="badge">${typeLabel}</span>
    </div>
    <div class="content">
      <h2 class="title">${title}</h2>
      <p class="message">${message}</p>
      <a href="${appUrl}" class="button">대시보드로 이동</a>
    </div>
    <div class="footer">
      <p>이 알림을 원하지 않으시다면 무시하셔도 됩니다.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

// ─── Core Notification Functions ───────────────────────────────────────────

/**
 * 알림 생성 + 이메일 발송 (원자적이지 않음 - 이메일 실패해도 DB 저장)
 *
 * 설계 의사결정:
 * - DB 저장과 이메일 발송을 별도 트랜잭션으로 처리
 * - 이메일 실패 시에도 알림은 DB에 저장됨 (emailStatus: FAILED)
 * - 나중에 백그라운드 잡으로 FAILED 상태 재시도 가능
 */
export async function createNotification(
  params: CreateNotificationParams
): Promise<NotificationResult> {
  const {
    userId,
    type,
    title,
    message,
    courseId = null,
    lessonId = null,
    enrollmentId = null,
    metadata = null,
  } = params;

  // 1. 먼저 DB에 알림 저장 (항상 성공해야 함)
  const notification = await db.notification.create({
    data: {
      userId,
      type,
      title,
      message,
      courseId,
      lessonId,
      enrollmentId,
      metadata: metadata ? JSON.stringify(metadata) : null,
      emailStatus: "PENDING",
    },
  });

  // 2. 사용자 정보 조회하여 이메일 발송 시도
  let emailStatus: NotificationStatus = "FAILED";
  let emailError: string | undefined;

  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });

    if (user?.email) {
      const html = getNotificationHtml(type, title, message);
      const emailResult = await sendEmail({
        to: user.email,
        subject: `[Empire LMS] ${title}`,
        html,
      });

      if (emailResult.success) {
        emailStatus = "SENT";
      } else {
        emailError = emailResult.error;
      }
    } else {
      emailError = "User email not found";
    }
  } catch (error) {
    emailError = error instanceof Error ? error.message : "Unknown email error";
    console.error("[Notification] Error sending email:", emailError);
  }

  // 3. 이메일 발송 결과 업데이트
  const updatedNotification = await db.notification.update({
    where: { id: notification.id },
    data: {
      emailStatus,
      // 실패 시 에러 메시지를 metadata에 저장
      ...(emailError && {
        metadata: JSON.stringify({
          ...(metadata || {}),
          emailError,
          emailFailedAt: new Date().toISOString(),
        }),
      }),
    },
  });

  return {
    id: updatedNotification.id,
    userId: updatedNotification.userId,
    emailStatus: updatedNotification.emailStatus,
    emailError,
  };
}

/**
 * 대량 알림 생성 (배치 처리)
 * 각 알림은 독립적으로 처리되어 하나의 실패가 전체를 막지 않음
 */
export async function createBulkNotifications(
  paramsArray: CreateNotificationParams[]
): Promise<NotificationResult[]> {
  // 병렬 처리로 성능 최적화
  const results = await Promise.allSettled(
    paramsArray.map((params) => createNotification(params))
  );

  return results.map((result, index) => {
    if (result.status === "fulfilled") {
      return result.value;
    }
    // rejected인 경우 (DB 저장 자체가 실패한罕见 케이스)
    console.error(`[Notification] Failed to create notification for user ${paramsArray[index].userId}:`, result.reason);
    return {
      id: "",
      userId: paramsArray[index].userId,
      emailStatus: "FAILED",
      emailError: "Failed to create notification in DB",
    };
  });
}

// ─── Notification Trigger Functions (비즈니스 로직) ───────────────────────

/**
 * 수강신청 완료 알림 (학생에게)
 */
export async function notifyEnrollmentCompleted(params: {
  userId: string;
  courseTitle: string;
  courseId: string;
  enrollmentId: string;
}): Promise<NotificationResult> {
  return createNotification({
    userId: params.userId,
    type: "ENROLLMENT_COMPLETED",
    title: "수강신청이 완료되었습니다",
    message: `${params.courseTitle} 강의의 수강신청이 완료되었습니다. 바로 학습을 시작할 수 있습니다.`,
    courseId: params.courseId,
    enrollmentId: params.enrollmentId,
  });
}

/**
 * 결제 완료 알림 (학생에게)
 */
export async function notifyPaymentSucceeded(params: {
  userId: string;
  courseTitle: string;
  amount: number;
  currency: string;
  courseId: string;
}): Promise<NotificationResult> {
  return createNotification({
    userId: params.userId,
    type: "PAYMENT_SUCCEEDED",
    title: "결제가 완료되었습니다",
    message: `${params.courseTitle} 강의 결제 ${params.amount} ${params.currency}이(가) 완료되었습니다.`,
    courseId: params.courseId,
  });
}

/**
 * 새 레슨 등록 알림 (수강생들에게)
 */
export async function notifyLessonCreated(params: {
  courseTitle: string;
  lessonTitle: string;
  courseId: string;
  lessonId: string;
  studentIds: string[];
}): Promise<NotificationResult[]> {
  const notifications = params.studentIds.map((userId) => ({
    userId,
    type: "LESSON_CREATED" as const,
    title: "새로운 레슨이 등록되었습니다",
    message: `${params.courseTitle} 강의에 "${params.lessonTitle}" 레슨이新增되었습니다.`,
    courseId: params.courseId,
    lessonId: params.lessonId,
  }));

  return createBulkNotifications(notifications);
}

/**
 * 새 수강생 등록 알림 (강사에게)
 */
export async function notifyStudentEnrolled(params: {
  teacherId: string;
  studentName: string;
  courseTitle: string;
  courseId: string;
  enrollmentId: string;
}): Promise<NotificationResult> {
  return createNotification({
    userId: params.teacherId,
    type: "STUDENT_ENROLLED",
    title: "새로운 수강생이 등록되었습니다",
    message: `${params.studentName} 님이 "${params.courseTitle}" 강의에 수강신청했습니다.`,
    courseId: params.courseId,
    enrollmentId: params.enrollmentId,
  });
}

/**
 * 레슨 완료 알림 (학생/학부모/강사)
 */
export async function notifyLessonCompleted(params: {
  userIds: string[];
  studentName: string;
  lessonTitle: string;
  courseTitle: string;
  courseId: string;
  lessonId: string;
}): Promise<NotificationResult[]> {
  const notifications = params.userIds.map((userId) => ({
    userId,
    type: "LESSON_COMPLETED" as const,
    title: "레슨을 완료했습니다",
    message: `${params.studentName} 님이 "${params.courseTitle}" 강의의 "${params.lessonTitle}" 레슨을 완료했습니다.`,
    courseId: params.courseId,
    lessonId: params.lessonId,
  }));

  return createBulkNotifications(notifications);
}

/**
 * 강의 게시 알림 (학생들에게)
 */
export async function notifyCoursePublished(params: {
  courseTitle: string;
  courseId: string;
  studentIds: string[];
}): Promise<NotificationResult[]> {
  const notifications = params.studentIds.map((userId) => ({
    userId,
    type: "COURSE_PUBLISHED" as const,
    title: "새로운 강의가 게시되었습니다",
    message: `"${params.courseTitle}" 강의가 새로 게시되었습니다. 지금 바로 확인해보세요!`,
    courseId: params.courseId,
  }));

  return createBulkNotifications(notifications);
}

// ─── Types for export ───────────────────────────────────────────────────────

export type { NotificationType, NotificationStatus };
