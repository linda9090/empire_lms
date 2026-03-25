import { NextRequest, NextResponse } from "next/server";
import { NotificationEventType } from "@prisma/client";
import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import type { UserRole } from "@/types";
import {
  buildNotificationIdempotencyKey,
  createNotification,
} from "@/lib/notification";

// GET /api/enrollments - List enrollments for the current user
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return NextResponse.json(
        { data: null, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const userRole = session.user.role as UserRole;
    const searchParams = request.nextUrl.searchParams;
    const courseId = searchParams.get("courseId");

    // Admins can see all enrollments, others only their own
    const where = userRole === "ADMIN"
      ? { deletedAt: null, ...(courseId && { courseId }) }
      : { userId, deletedAt: null, ...(courseId && { courseId }) };

    const enrollments = await db.enrollment.findMany({
      where,
      include: {
        course: {
          include: {
            organization: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
      orderBy: { enrolledAt: "desc" },
    });

    return NextResponse.json({ data: enrollments, error: null });
  } catch (error) {
    console.error("Error fetching enrollments:", error);
    return NextResponse.json(
      { data: null, error: "Failed to fetch enrollments" },
      { status: 500 }
    );
  }
}

// POST /api/enrollments - Enroll in a course (STUDENT or ADMIN only)
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

    // Allow STUDENTS and ADMINs to enroll (TEACHERS and GUARDIANS generally don't enroll)
    if (userRole !== "STUDENT" && userRole !== "ADMIN") {
      return NextResponse.json(
        { data: null, error: "Forbidden: Only students and admins can enroll in courses" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { courseId } = body;

    // Validation
    if (!courseId || typeof courseId !== "string") {
      return NextResponse.json(
        { data: null, error: "courseId is required" },
        { status: 400 }
      );
    }

    // Check if course exists
    const course = await db.course.findFirst({
      where: { id: courseId, deletedAt: null },
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
    });

    if (!course) {
      return NextResponse.json(
        { data: null, error: "Course not found" },
        { status: 404 }
      );
    }

    const userId = session.user.id;

    // Check for duplicate enrollment
    const existingEnrollment = await db.enrollment.findFirst({
      where: {
        userId,
        courseId,
        deletedAt: null,
      },
    });

    if (existingEnrollment) {
      return NextResponse.json(
        { data: null, error: "Already enrolled in this course" },
        { status: 409 }
      );
    }

    // Create enrollment
    const enrollment = await db.enrollment.create({
      data: {
        userId,
        courseId,
      },
      include: {
        course: {
          include: {
            organization: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });

    const notificationTasks: Promise<unknown>[] = [];

    if (userRole === "STUDENT") {
      notificationTasks.push(
        createNotification({
          recipient: {
            userId,
            email: session.user.email,
            name: session.user.name,
          },
          eventType: NotificationEventType.STUDENT_ENROLLMENT_COMPLETED,
          title: "수강신청이 완료되었습니다",
          message: `${course.title} 강의 수강신청이 완료되었습니다.`,
          courseId: course.id,
          metadata: {
            enrollmentId: enrollment.id,
            courseId: course.id,
          },
          idempotencyKey: buildNotificationIdempotencyKey(
            "enrollment",
            "student",
            enrollment.id
          ),
        })
      );
    }

    if (
      course.teacherId &&
      course.teacherId !== userId &&
      course.teacher?.email
    ) {
      notificationTasks.push(
        createNotification({
          recipient: {
            userId: course.teacherId,
            email: course.teacher.email,
            name: course.teacher.name,
          },
          eventType: NotificationEventType.TEACHER_NEW_STUDENT_REGISTERED,
          title: "새 수강생이 등록되었습니다",
          message: `${session.user.name ?? "학생"}님이 ${course.title} 강의에 등록했습니다.`,
          courseId: course.id,
          metadata: {
            enrollmentId: enrollment.id,
            studentId: userId,
            courseId: course.id,
          },
          idempotencyKey: buildNotificationIdempotencyKey(
            "enrollment",
            "teacher",
            enrollment.id,
            course.teacherId
          ),
        })
      );
    }

    if (notificationTasks.length > 0) {
      await Promise.allSettled(notificationTasks);
    }

    return NextResponse.json(
      { data: enrollment, error: null },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating enrollment:", error);
    return NextResponse.json(
      { data: null, error: "Failed to create enrollment" },
      { status: 500 }
    );
  }
}
