import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import type { UserRole } from "@/types";

// GET /api/courses/[id]/sections - List all sections for a course
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: courseId } = await params;

    // Verify course exists
    const course = await db.course.findFirst({
      where: { id: courseId, deletedAt: null },
      select: { id: true },
    });

    if (!course) {
      return NextResponse.json(
        { data: null, error: "Course not found" },
        { status: 404 }
      );
    }

    const sections = await db.section.findMany({
      where: { courseId, deletedAt: null },
      orderBy: { position: "asc" },
      include: {
        lessons: {
          where: { deletedAt: null },
          orderBy: { position: "asc" },
          select: {
            id: true,
            title: true,
            description: true,
            type: true,
            duration: true,
            position: true,
            isPublished: true,
          },
        },
      },
    });

    return NextResponse.json({ data: sections, error: null });
  } catch (error) {
    console.error("Error fetching sections:", error);
    return NextResponse.json(
      { data: null, error: "Failed to fetch sections" },
      { status: 500 }
    );
  }
}

// POST /api/courses/[id]/sections - Create a new section (TEACHER only)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return NextResponse.json(
        { data: null, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id: courseId } = await params;
    const userRole = session.user.role as UserRole;
    const userId = session.user.id;

    // Authorization: Only TEACHER can create sections
    if (userRole !== "TEACHER" && userRole !== "ADMIN") {
      return NextResponse.json(
        { data: null, error: "Forbidden: Only teachers can create sections" },
        { status: 403 }
      );
    }

    // Verify course exists and check ownership (for TEACHER)
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

    // BLOCKER: teacherId ownership check - TEACHER can only modify their own courses
    if (userRole === "TEACHER" && course.teacherId !== userId) {
      return NextResponse.json(
        { data: null, error: "Forbidden: You can only modify your own courses" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { title, description, position } = body;

    // Validation
    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return NextResponse.json(
        { data: null, error: "Title is required" },
        { status: 400 }
      );
    }

    // Get next position if not provided
    let nextPosition = position;
    if (nextPosition === undefined) {
      const lastSection = await db.section.findFirst({
        where: { courseId, deletedAt: null },
        orderBy: { position: "desc" },
        select: { position: true },
      });
      nextPosition = (lastSection?.position ?? -1) + 1;
    }

    const section = await db.section.create({
      data: {
        title: title.trim(),
        description: description?.trim() || null,
        courseId,
        position: nextPosition,
      },
    });

    return NextResponse.json({ data: section, error: null }, { status: 201 });
  } catch (error) {
    console.error("Error creating section:", error);
    return NextResponse.json(
      { data: null, error: "Failed to create section" },
      { status: 500 }
    );
  }
}

// PUT /api/courses/[id]/sections - Reorder sections (TEACHER only)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return NextResponse.json(
        { data: null, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id: courseId } = await params;
    const userRole = session.user.role as UserRole;
    const userId = session.user.id;

    // Authorization: Only TEACHER can reorder sections
    if (userRole !== "TEACHER" && userRole !== "ADMIN") {
      return NextResponse.json(
        { data: null, error: "Forbidden: Only teachers can reorder sections" },
        { status: 403 }
      );
    }

    // Verify course ownership
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
    const { sections } = body; // Array of { id, position }

    if (!Array.isArray(sections)) {
      return NextResponse.json(
        { data: null, error: "Sections must be an array" },
        { status: 400 }
      );
    }

    // Update positions in a transaction
    await db.$transaction(
      sections.map(({ id, position }: { id: string; position: number }) =>
        db.section.updateMany({
          where: { id, courseId, deletedAt: null },
          data: { position },
        })
      )
    );

    return NextResponse.json({ data: { success: true }, error: null });
  } catch (error) {
    console.error("Error reordering sections:", error);
    return NextResponse.json(
      { data: null, error: "Failed to reorder sections" },
      { status: 500 }
    );
  }
}
