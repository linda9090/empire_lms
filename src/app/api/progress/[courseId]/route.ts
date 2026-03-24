import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/get-session";
import { calculateProgressPercentage } from "@/lib/progress";
import type { UserRole } from "@/types";

// GET /api/progress/[courseId] - Get progress percentage for a course.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return NextResponse.json(
        { data: null, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { courseId } = await params;

    if (!courseId) {
      return NextResponse.json(
        { data: null, error: "courseId is required" },
        { status: 400 }
      );
    }

    const userId = session.user.id;
    const userRole = session.user.role as UserRole;

    const course = await db.course.findFirst({
      where: {
        id: courseId,
        deletedAt: null,
      },
      select: {
        id: true,
        title: true,
      },
    });

    if (!course) {
      return NextResponse.json(
        { data: null, error: "Course not found" },
        { status: 404 }
      );
    }

    const enrollment = await db.enrollment.findFirst({
      where: {
        userId,
        courseId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    const canView = userRole === "ADMIN" || userRole === "TEACHER" || Boolean(enrollment);

    if (!canView) {
      return NextResponse.json(
        { data: null, error: "Forbidden: You are not enrolled in this course" },
        { status: 403 }
      );
    }

    const [totalLessons, completedLessons] = await Promise.all([
      db.lesson.count({
        where: {
          section: {
            courseId,
          },
          deletedAt: null,
        },
      }),
      db.progress.count({
        where: {
          userId,
          lesson: {
            section: {
              courseId,
            },
            deletedAt: null,
          },
        },
      }),
    ]);

    const progressPercentage = calculateProgressPercentage(
      completedLessons,
      totalLessons
    );

    return NextResponse.json({
      data: {
        courseId,
        courseTitle: course.title,
        totalLessons,
        completedLessons,
        progressPercentage,
      },
      error: null,
    });
  } catch (error) {
    console.error("Error fetching course progress:", error);
    return NextResponse.json(
      { data: null, error: "Failed to fetch course progress" },
      { status: 500 }
    );
  }
}
