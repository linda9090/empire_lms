import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import type { UserRole } from "@/types";

// GET /api/courses/[id]/sections/[sectionId] - Get a single section
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  try {
    const { id: courseId, sectionId } = await params;

    const section = await db.section.findFirst({
      where: { id: sectionId, courseId, deletedAt: null },
      include: {
        lessons: {
          where: { deletedAt: null },
          orderBy: { position: "asc" },
        },
      },
    });

    if (!section) {
      return NextResponse.json(
        { data: null, error: "Section not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: section, error: null });
  } catch (error) {
    console.error("Error fetching section:", error);
    return NextResponse.json(
      { data: null, error: "Failed to fetch section" },
      { status: 500 }
    );
  }
}

// PATCH /api/courses/[id]/sections/[sectionId] - Update a section (TEACHER only)
export async function PATCH(
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

    // Authorization: Only TEACHER can update sections
    if (userRole !== "TEACHER" && userRole !== "ADMIN") {
      return NextResponse.json(
        { data: null, error: "Forbidden: Only teachers can update sections" },
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

    // Verify section exists
    const existingSection = await db.section.findFirst({
      where: { id: sectionId, courseId, deletedAt: null },
    });

    if (!existingSection) {
      return NextResponse.json(
        { data: null, error: "Section not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { title, description, position } = body;

    const section = await db.section.update({
      where: { id: sectionId },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(description !== undefined && {
          description: description?.trim() || null,
        }),
        ...(position !== undefined && { position }),
      },
    });

    return NextResponse.json({ data: section, error: null });
  } catch (error) {
    console.error("Error updating section:", error);
    return NextResponse.json(
      { data: null, error: "Failed to update section" },
      { status: 500 }
    );
  }
}

// DELETE /api/courses/[id]/sections/[sectionId] - Delete a section (TEACHER only)
export async function DELETE(
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

    // Authorization: Only TEACHER can delete sections
    if (userRole !== "TEACHER" && userRole !== "ADMIN") {
      return NextResponse.json(
        { data: null, error: "Forbidden: Only teachers can delete sections" },
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

    // Verify section exists
    const existingSection = await db.section.findFirst({
      where: { id: sectionId, courseId, deletedAt: null },
    });

    if (!existingSection) {
      return NextResponse.json(
        { data: null, error: "Section not found" },
        { status: 404 }
      );
    }

    // Soft delete
    await db.section.update({
      where: { id: sectionId },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({ data: { success: true }, error: null });
  } catch (error) {
    console.error("Error deleting section:", error);
    return NextResponse.json(
      { data: null, error: "Failed to delete section" },
      { status: 500 }
    );
  }
}
