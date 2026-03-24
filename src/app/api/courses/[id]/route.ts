import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import type { UserRole } from "@/types";

// GET /api/courses/[id] - Get a single course by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const course = await db.course.findFirst({
      where: { id, deletedAt: null },
      include: {
        organization: {
          select: { id: true, name: true, slug: true },
        },
        _count: {
          select: { enrollments: true, activities: true },
        },
      },
    });

    if (!course) {
      return NextResponse.json(
        { data: null, error: "Course not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: course, error: null });
  } catch (error) {
    console.error("Error fetching course:", error);
    return NextResponse.json(
      { data: null, error: "Failed to fetch course" },
      { status: 500 }
    );
  }
}

// PUT /api/courses/[id] - Update a course (owner or ADMIN only)
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

    const { id } = await params;
    const userRole = session.user.role as UserRole;

    // Check if course exists and get ownership info
    const existingCourse = await db.course.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, teacherId: true },
    });

    if (!existingCourse) {
      return NextResponse.json(
        { data: null, error: "Course not found" },
        { status: 404 }
      );
    }

    if (userRole !== "TEACHER" && userRole !== "ADMIN") {
      return NextResponse.json(
        { data: null, error: "Forbidden: Only teachers and admins can update courses" },
        { status: 403 }
      );
    }

    if (userRole === "TEACHER" && existingCourse.teacherId !== session.user.id) {
      return NextResponse.json(
        { data: null, error: "Forbidden: You can only update your own courses" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { title, description, imageUrl, price, isPublished } = body;

    // Validation
    if (title !== undefined && (typeof title !== "string" || title.trim().length === 0)) {
      return NextResponse.json(
        { data: null, error: "Title must be a non-empty string" },
        { status: 400 }
      );
    }

    const course = await db.course.update({
      where: { id },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(imageUrl !== undefined && { imageUrl: imageUrl?.trim() || null }),
        ...(price !== undefined && { price: price !== null ? Number(price) : null }),
        ...(isPublished !== undefined && { isPublished: Boolean(isPublished) }),
      },
      include: {
        organization: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    return NextResponse.json({ data: course, error: null });
  } catch (error) {
    console.error("Error updating course:", error);
    return NextResponse.json(
      { data: null, error: "Failed to update course" },
      { status: 500 }
    );
  }
}

// PATCH /api/courses/[id] - Partial update (alias for PUT)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return PUT(request, { params });
}

// DELETE /api/courses/[id] - Soft delete a course (owner or ADMIN only)
export async function DELETE(
  _request: NextRequest,
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

    const { id } = await params;
    const userRole = session.user.role as UserRole;

    // Check if course exists and get ownership info
    const existingCourse = await db.course.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, teacherId: true },
    });

    if (!existingCourse) {
      return NextResponse.json(
        { data: null, error: "Course not found" },
        { status: 404 }
      );
    }

    if (userRole !== "TEACHER" && userRole !== "ADMIN") {
      return NextResponse.json(
        { data: null, error: "Forbidden: Only teachers and admins can delete courses" },
        { status: 403 }
      );
    }

    if (userRole === "TEACHER" && existingCourse.teacherId !== session.user.id) {
      return NextResponse.json(
        { data: null, error: "Forbidden: You can only delete your own courses" },
        { status: 403 }
      );
    }

    // Soft delete
    await db.course.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({ data: { success: true }, error: null });
  } catch (error) {
    console.error("Error deleting course:", error);
    return NextResponse.json(
      { data: null, error: "Failed to delete course" },
      { status: 500 }
    );
  }
}
