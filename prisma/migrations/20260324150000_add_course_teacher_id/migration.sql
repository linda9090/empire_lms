-- Add teacher ownership tracking for courses
ALTER TABLE "courses"
ADD COLUMN "teacher_id" TEXT;

CREATE INDEX "courses_teacher_id_idx" ON "courses"("teacher_id");

ALTER TABLE "courses"
ADD CONSTRAINT "courses_teacher_id_fkey"
FOREIGN KEY ("teacher_id") REFERENCES "users"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
