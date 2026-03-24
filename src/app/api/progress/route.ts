import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/get-session";
import { calculateProgressPercentage } from "@/lib/progress";
import type { UserRole } from "@/types";

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
    const activityId = body?.activityId;

    if (!activityId || typeof activityId !== "string") {
      return NextResponse.json(
        { data: null, error: "activityId is required" },
        { status: 400 }
      );
    }

    const userId = session.user.id;

    const activity = await db.activity.findFirst({
      where: {
        id: activityId,
        deletedAt: null,
        isPublished: true,
      },
      select: {
        id: true,
        title: true,
        courseId: true,
        course: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    if (!activity) {
      return NextResponse.json(
        { data: null, error: "Activity not found" },
        { status: 404 }
      );
    }

    const enrollment = await db.enrollment.findFirst({
      where: {
        userId,
        courseId: activity.courseId,
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
        userId_activityId: {
          userId,
          activityId,
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
          activityId,
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
      db.activity.count({
        where: {
          courseId: activity.courseId,
          deletedAt: null,
          isPublished: true,
        },
      }),
      db.progress.count({
        where: {
          userId,
          activity: {
            courseId: activity.courseId,
            deletedAt: null,
            isPublished: true,
          },
        },
      }),
    ]);

    const progressPercentage = calculateProgressPercentage(
      completedLessons,
      totalLessons
    );

    return NextResponse.json(
      {
        data: {
          activity: {
            id: activity.id,
            title: activity.title,
          },
          courseProgress: {
            courseId: activity.courseId,
            courseTitle: activity.course.title,
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
