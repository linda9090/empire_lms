import { NextRequest, NextResponse } from "next/server";
import { NotificationEventType } from "@prisma/client";
import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import type { UserRole } from "@/types";
import { createNotificationsForRecipients } from "@/lib/notification";

// GET /api/courses/[id]/sections/[sectionId]/lessons - List all lessons in a section
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  try {
    const { id: courseId, sectionId } = await params;

    // Verify section exists
    const section = await db.section.findFirst({
      where: { id: sectionId, courseId, deletedAt: null },
      select: { id: true },
    });

    if (!section) {
      return NextResponse.json(
        { data: null, error: "Section not found" },
        { status: 404 }
      );
    }

    const lessons = await db.lesson.findMany({
      where: { sectionId, deletedAt: null },
      orderBy: { position: "asc" },
    });

    return NextResponse.json({ data: lessons, error: null });
  } catch (error) {
    console.error("Error fetching lessons:", error);
    return NextResponse.json(
      { data: null, error: "Failed to fetch lessons" },
      { status: 500 }
    );
  }
}

// POST /api/courses/[id]/sections/[sectionId]/lessons - Create a lesson (TEACHER only)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return NextResponse.json(
        { data: null, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id: courseId, sectionId } = await params;
    const userRole = session.user.role as UserRole;
    const userId = session.user.id;

    // Authorization: Only TEACHER can create lessons
    if (userRole !== "TEACHER" && userRole !== "ADMIN") {
      return NextResponse.json(
        { data: null, error: "Forbidden: Only teachers can create lessons" },
        { status: 403 }
      );
    }

    // Verify course ownership (BLOCKER check)
    const course = await db.course.findFirst({
      where: { id: courseId, deletedAt: null },
      select: { id: true, title: true, teacherId: true },
    });

    if (!course) {
      return NextResponse.json(
        { data: null, error: "Course not found" },
        { status: 404 }
      );
    }

    // BLOCKER: teacherId ownership check
    if (userRole === "TEACHER" && course.teacherId !== userId) {
      return NextResponse.json(
        { data: null, error: "Forbidden: You can only modify your own courses" },
        { status: 403 }
      );
    }

    // Verify section exists
    const section = await db.section.findFirst({
      where: { id: sectionId, courseId, deletedAt: null },
    });

    if (!section) {
      return NextResponse.json(
        { data: null, error: "Section not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { title, description, type, contentUrl, contentText, duration, position, isPublished } = body;

    // Validation
    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return NextResponse.json(
        { data: null, error: "Title is required" },
        { status: 400 }
      );
    }

    if (!type || !["VIDEO", "PDF", "TEXT"].includes(type)) {
      return NextResponse.json(
        { data: null, error: "Type must be one of: VIDEO, PDF, TEXT" },
        { status: 400 }
      );
    }

    // Type-specific validation
    if (type === "VIDEO" || type === "PDF") {
      if (!contentUrl || typeof contentUrl !== "string") {
        return NextResponse.json(
          { data: null, error: "contentUrl is required for VIDEO and PDF lessons" },
          { status: 400 }
        );
      }
    }

    if (type === "TEXT") {
      if (!contentText || typeof contentText !== "string") {
        return NextResponse.json(
          { data: null, error: "contentText is required for TEXT lessons" },
          { status: 400 }
        );
      }
    }

    // Get next position if not provided
    let nextPosition = position;
    if (nextPosition === undefined) {
      const lastLesson = await db.lesson.findFirst({
        where: { sectionId, deletedAt: null },
        orderBy: { position: "desc" },
        select: { position: true },
      });
      nextPosition = (lastLesson?.position ?? -1) + 1;
    }

    const lesson = await db.lesson.create({
      data: {
        title: title.trim(),
        description: description?.trim() || null,
        type,
        contentUrl: contentUrl?.trim() || null,
        contentText: contentText?.trim() || null,
        duration: duration !== undefined ? Number(duration) : null,
        position: nextPosition,
        isPublished: isPublished !== undefined ? Boolean(isPublished) : false,
        sectionId,
      },
    });

    const enrolledStudents = await db.enrollment.findMany({
      where: {
        courseId,
        deletedAt: null,
        status: "ACTIVE",
        user: {
          deletedAt: null,
          role: "STUDENT",
        },
      },
      select: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });

    const recipients = enrolledStudents.map((enrollment) => ({
      userId: enrollment.user.id,
      email: enrollment.user.email,
      name: enrollment.user.name,
      role: enrollment.user.role,
    }));

    if (recipients.length > 0) {
      await createNotificationsForRecipients({
        recipients,
        eventType: NotificationEventType.STUDENT_NEW_LESSON_REGISTERED,
        title: "새 레슨이 등록되었습니다",
        message: `${course.title} 강의에 새 레슨 "${lesson.title}" 이(가) 등록되었습니다.`,
        courseId,
        lessonId: lesson.id,
        linkUrl: `/student/courses/${courseId}`,
        metadata: {
          courseId,
          lessonId: lesson.id,
          sectionId,
          source: "lesson-create",
        },
        idempotencyKeyPrefix: `lesson-create:${lesson.id}:student`,
      });
    }

    return NextResponse.json({ data: lesson, error: null }, { status: 201 });
  } catch (error) {
    console.error("Error creating lesson:", error);
    return NextResponse.json(
      { data: null, error: "Failed to create lesson" },
      { status: 500 }
    );
  }
}

// PUT /api/courses/[id]/sections/[sectionId]/lessons - Reorder lessons (TEACHER only)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return NextResponse.json(
        { data: null, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id: courseId, sectionId } = await params;
    const userRole = session.user.role as UserRole;
    const userId = session.user.id;

    // Authorization: Only TEACHER can reorder lessons
    if (userRole !== "TEACHER" && userRole !== "ADMIN") {
      return NextResponse.json(
        { data: null, error: "Forbidden: Only teachers can reorder lessons" },
        { status: 403 }
      );
    }

    // Verify course ownership (BLOCKER check)
    const course = await db.course.findFirst({
      where: { id: courseId, deletedAt: null },
      select: { id: true, teacherId: true },
    });

    if (!course) {
      return NextResponse.json(
        { data: null, error: "Course not found" },
        { status: 404 }
      );
    }

    // BLOCKER: teacherId ownership check
    if (userRole === "TEACHER" && course.teacherId !== userId) {
      return NextResponse.json(
        { data: null, error: "Forbidden: You can only modify your own courses" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { lessons } = body; // Array of { id, position }

    if (!Array.isArray(lessons)) {
      return NextResponse.json(
        { data: null, error: "Lessons must be an array" },
        { status: 400 }
      );
    }

    // Update positions in a transaction
    await db.$transaction(
      lessons.map(({ id, position }: { id: string; position: number }) =>
        db.lesson.updateMany({
          where: { id, sectionId, deletedAt: null },
          data: { position },
        })
      )
    );

    return NextResponse.json({ data: { success: true }, error: null });
  } catch (error) {
    console.error("Error reordering lessons:", error);
    return NextResponse.json(
      { data: null, error: "Failed to reorder lessons" },
      { status: 500 }
    );
  }
}
