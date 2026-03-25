import { NotificationEventType, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/get-session";
import { calculateProgressPercentage } from "@/lib/progress";
import type { UserRole } from "@/types";
import {
  buildNotificationIdempotencyKey,
  createNotification,
  createNotificationsForRecipients,
} from "@/lib/notification";

function isUniqueConstraintError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2002";
  }

  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
  );
}

// POST /api/progress - Mark a lesson(activity) as completed.
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
    if (userRole !== "STUDENT" && userRole !== "ADMIN") {
      return NextResponse.json(
        {
          data: null,
          error: "Forbidden: Only students and admins can mark lesson progress",
        },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => null);
    const lessonId = body?.lessonId;

    if (!lessonId || typeof lessonId !== "string") {
      return NextResponse.json(
        { data: null, error: "lessonId is required" },
        { status: 400 }
      );
    }

    const userId = session.user.id;

    const lesson = await db.lesson.findFirst({
      where: {
        id: lessonId,
        section: {
          deletedAt: null,
        },
        isPublished: true,
      },
      select: {
        id: true,
        title: true,
        section: {
          select: {
            courseId: true,
            course: {
              select: {
                id: true,
                title: true,
                teacherId: true,
                organizationId: true,
              },
            },
          },
        },
      },
    });

    if (!lesson) {
      return NextResponse.json(
        { data: null, error: "Lesson not found" },
        { status: 404 }
      );
    }

    const enrollment = await db.enrollment.findFirst({
      where: {
        userId,
        courseId: lesson.section.courseId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!enrollment) {
      return NextResponse.json(
        { data: null, error: "Forbidden: You are not enrolled in this course" },
        { status: 403 }
      );
    }

    const existingProgress = await db.progress.findUnique({
      where: {
        userId_lessonId: {
          userId,
          lessonId,
        },
      },
      select: {
        id: true,
      },
    });

    if (existingProgress) {
      return NextResponse.json(
        { data: null, error: "Activity already completed" },
        { status: 409 }
      );
    }

    try {
      await db.progress.create({
        data: {
          userId,
          lessonId,
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return NextResponse.json(
          { data: null, error: "Activity already completed" },
          { status: 409 }
        );
      }

      throw error;
    }

    const [totalLessons, completedLessons] = await Promise.all([
      db.lesson.count({
        where: {
          section: {
            courseId: lesson.section.courseId,
            deletedAt: null,
          },
          isPublished: true,
        },
      }),
      db.progress.count({
        where: {
          userId,
          lesson: {
            section: {
              courseId: lesson.section.courseId,
              deletedAt: null,
            },
            isPublished: true,
          },
        },
      }),
    ]);

    const progressPercentage = calculateProgressPercentage(
      completedLessons,
      totalLessons
    );

    const notificationTasks: Promise<unknown>[] = [];

    if (
      lesson.section.course.teacherId &&
      lesson.section.course.teacherId !== userId
    ) {
      const teacher = await db.user.findUnique({
        where: {
          id: lesson.section.course.teacherId,
        },
        select: {
          id: true,
          name: true,
          email: true,
        },
      });

      if (teacher?.email) {
        notificationTasks.push(
          createNotification({
            recipient: {
              userId: teacher.id,
              email: teacher.email,
              name: teacher.name,
            },
            eventType: NotificationEventType.TEACHER_STUDENT_LESSON_COMPLETED,
            title: "수강생이 레슨을 완료했습니다",
            message: `${session.user.name ?? "수강생"}님이 "${lesson.title}" 레슨을 완료했습니다.`,
            courseId: lesson.section.course.id,
            lessonId: lesson.id,
            metadata: {
              studentId: userId,
              lessonId: lesson.id,
              courseId: lesson.section.course.id,
              source: "progress",
            },
            idempotencyKey: buildNotificationIdempotencyKey(
              "progress",
              "teacher",
              userId,
              lesson.id
            ),
          })
        );
      }
    }

    if (lesson.section.course.organizationId) {
      const guardians = await db.user.findMany({
        where: {
          organizationId: lesson.section.course.organizationId,
          role: "GUARDIAN",
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      });

      const guardianRecipients = guardians.map((guardian) => ({
        userId: guardian.id,
        email: guardian.email,
        name: guardian.name,
        role: guardian.role,
      }));

      if (guardianRecipients.length > 0) {
        notificationTasks.push(
          createNotificationsForRecipients({
            recipients: guardianRecipients,
            eventType: NotificationEventType.GUARDIAN_CHILD_LEARNING_COMPLETED,
            title: "자녀 수강 완료 알림",
            message: `${session.user.name ?? "학생"}님이 "${lesson.title}" 레슨을 완료했습니다.`,
            courseId: lesson.section.course.id,
            lessonId: lesson.id,
            metadata: {
              studentId: userId,
              lessonId: lesson.id,
              courseId: lesson.section.course.id,
              source: "progress",
            },
            idempotencyKeyPrefix: buildNotificationIdempotencyKey(
              "progress",
              "guardian",
              userId,
              lesson.id
            ),
          })
        );
      }
    }

    if (notificationTasks.length > 0) {
      await Promise.allSettled(notificationTasks);
    }

    return NextResponse.json(
      {
        data: {
          lesson: {
            id: lesson.id,
            title: lesson.title,
          },
          courseProgress: {
            courseId: lesson.section.courseId,
            courseTitle: lesson.section.course.title,
            totalLessons,
            completedLessons,
            progressPercentage,
          },
        },
        error: null,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating progress:", error);
    return NextResponse.json(
      { data: null, error: "Failed to mark progress" },
      { status: 500 }
    );
  }
}
