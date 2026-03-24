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

export type InvitationType = "STUDENT_TO_COURSE" | "GUARDIAN_TO_STUDENT";

export type InvitationStatus = "PENDING" | "ACCEPTED" | "EXPIRED" | "CANCELLED";

export interface ApiResponse<T = unknown> {
  data: T | null;
  error: string | null;
  meta?: Record<string, unknown>;
}
