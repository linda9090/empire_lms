-- CreateEnum
CREATE TYPE "NotificationEventType" AS ENUM (
    'STUDENT_ENROLLMENT_COMPLETED',
    'STUDENT_PAYMENT_COMPLETED',
    'STUDENT_NEW_LESSON_REGISTERED',
    'TEACHER_NEW_STUDENT_REGISTERED',
    'TEACHER_STUDENT_LESSON_COMPLETED',
    'GUARDIAN_CHILD_LEARNING_COMPLETED',
    'GUARDIAN_NEW_COURSE_REGISTERED'
);

-- CreateEnum
CREATE TYPE "NotificationEmailStatus" AS ENUM ('PENDING', 'RETRY_PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "event_type" "NotificationEventType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link_url" TEXT,
    "metadata" TEXT,
    "idempotency_key" TEXT,
    "course_id" TEXT,
    "lesson_id" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "email_status" "NotificationEmailStatus" NOT NULL DEFAULT 'PENDING',
    "email_error" TEXT,
    "email_sent_at" TIMESTAMP(3),
    "email_retry_count" INTEGER NOT NULL DEFAULT 0,
    "next_email_retry_at" TIMESTAMP(3),
    "email_last_attempt_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_created_at_idx" ON "notifications"("user_id", "is_read", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_idempotency_key_key" ON "notifications"("idempotency_key");

-- CreateIndex
CREATE INDEX "notifications_event_type_created_at_idx" ON "notifications"("event_type", "created_at");

-- CreateIndex
CREATE INDEX "notifications_email_status_next_email_retry_at_idx" ON "notifications"("email_status", "next_email_retry_at");

-- CreateIndex
CREATE INDEX "notifications_course_id_idx" ON "notifications"("course_id");

-- CreateIndex
CREATE INDEX "notifications_lesson_id_idx" ON "notifications"("lesson_id");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
