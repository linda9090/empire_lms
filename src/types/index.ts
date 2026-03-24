export type UserRole = "TEACHER" | "STUDENT" | "GUARDIAN" | "ADMIN";

export type ActivityType =
  | "VIDEO"
  | "QUIZ"
  | "TEXT"
  | "FILE"
  | "DISCUSSION"
  | "PDF"
  | "HTML"
  | "LTI";

export type LessonType = "VIDEO" | "PDF" | "TEXT";

export type XApiVerb =
  | "started"
  | "completed"
  | "scored"
  | "watched"
  | "attempted";

export type PaymentProvider = "mock" | "stripe" | "paypal";

export type PaymentStatus =
  | "pending"
  | "succeeded"
  | "failed"
  | "canceled";

export type NotificationType =
  | "ENROLLMENT_COMPLETED"
  | "PAYMENT_SUCCEEDED"
  | "LESSON_CREATED"
  | "STUDENT_ENROLLED"
  | "LESSON_COMPLETED"
  | "COURSE_PUBLISHED"
  | "INVITE_SENT"
  | "INVITE_ACCEPTED";

export type NotificationStatus = "PENDING" | "SENT" | "FAILED";

export interface ApiResponse<T = unknown> {
  data: T | null;
  error: string | null;
  meta?: Record<string, unknown>;
}
