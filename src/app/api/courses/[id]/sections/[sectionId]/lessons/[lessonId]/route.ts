import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import type { UserRole } from "@/types";

// GET /api/courses/[id]/sections/[sectionId]/lessons/[lessonId] - Get a single lesson
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string; lessonId: string }> }
) {
  try {
    const { id: courseId, sectionId, lessonId } = await params;

    const lesson = await db.lesson.findFirst({
      where: { id: lessonId, sectionId, deletedAt: null },
      include: {
        section: {
          select: { id: true, courseId: true },
        },
      },
    });

    if (!lesson) {
      return NextResponse.json(
        { data: null, error: "Lesson not found" },
        { status: 404 }
      );
    }

    // For STUDENT, check enrollment before returning content
    const session = await getSession();
    if (session?.user) {
      const userRole = session.user.role as UserRole;

      if (userRole === "STUDENT") {
        // Verify enrollment
        const enrollment = await db.enrollment.findFirst({
          where: {
            userId: session.user.id,
            courseId: lesson.section.courseId,
            deletedAt: null,
          },
        });

        if (!enrollment) {
          return NextResponse.json(
            { data: null, error: "Forbidden: You must enroll in this course to access lessons" },
            { status: 403 }
          );
        }
      }
    }

    return NextResponse.json({ data: lesson, error: null });
  } catch (error) {
    console.error("Error fetching lesson:", error);
    return NextResponse.json(
      { data: null, error: "Failed to fetch lesson" },
      { status: 500 }
    );
  }
}

// PATCH /api/courses/[id]/sections/[sectionId]/lessons/[lessonId] - Update a lesson (TEACHER only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string; lessonId: string }> }
) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return NextResponse.json(
        { data: null, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id: courseId, sectionId, lessonId } = await params;
    const userRole = session.user.role as UserRole;
    const userId = session.user.id;

    // Authorization: Only TEACHER can update lessons
    if (userRole !== "TEACHER" && userRole !== "ADMIN") {
      return NextResponse.json(
        { data: null, error: "Forbidden: Only teachers can update lessons" },
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

    // Verify lesson exists
    const existingLesson = await db.lesson.findFirst({
      where: { id: lessonId, sectionId, deletedAt: null },
    });

    if (!existingLesson) {
      return NextResponse.json(
        { data: null, error: "Lesson not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { title, description, type, contentUrl, contentText, duration, position, isPublished } = body;

    const lesson = await db.lesson.update({
      where: { id: lessonId },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(type !== undefined && { type }),
        ...(contentUrl !== undefined && { contentUrl: contentUrl?.trim() || null }),
        ...(contentText !== undefined && { contentText: contentText?.trim() || null }),
        ...(duration !== undefined && { duration: duration !== null ? Number(duration) : null }),
        ...(position !== undefined && { position }),
        ...(isPublished !== undefined && { isPublished: Boolean(isPublished) }),
      },
    });

    return NextResponse.json({ data: lesson, error: null });
  } catch (error) {
    console.error("Error updating lesson:", error);
    return NextResponse.json(
      { data: null, error: "Failed to update lesson" },
      { status: 500 }
    );
  }
}

// DELETE /api/courses/[id]/sections/[sectionId]/lessons/[lessonId] - Delete a lesson (TEACHER only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string; lessonId: string }> }
) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return NextResponse.json(
        { data: null, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id: courseId, sectionId, lessonId } = await params;
    const userRole = session.user.role as UserRole;
    const userId = session.user.id;

    // Authorization: Only TEACHER can delete lessons
    if (userRole !== "TEACHER" && userRole !== "ADMIN") {
      return NextResponse.json(
        { data: null, error: "Forbidden: Only teachers can delete lessons" },
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

    // Verify lesson exists
    const existingLesson = await db.lesson.findFirst({
      where: { id: lessonId, sectionId, deletedAt: null },
    });

    if (!existingLesson) {
      return NextResponse.json(
        { data: null, error: "Lesson not found" },
        { status: 404 }
      );
    }

    // Soft delete
    await db.lesson.update({
      where: { id: lessonId },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({ data: { success: true }, error: null });
  } catch (error) {
    console.error("Error deleting lesson:", error);
    return NextResponse.json(
      { data: null, error: "Failed to delete lesson" },
      { status: 500 }
    );
  }
}
