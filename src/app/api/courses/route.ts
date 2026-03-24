import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import type { UserRole } from "@/types";

// GET /api/courses - List all courses (with optional filtering)
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    const searchParams = request.nextUrl.searchParams;
    const publishedOnly = searchParams.get("published") === "true";

    const where = publishedOnly ? { isPublished: true } : {};

    // If user is authenticated, we can show unpublished courses they own
    const courses = await db.course.findMany({
      where: {
        ...where,
        deletedAt: null,
      },
      include: {
        organization: {
          select: { id: true, name: true, slug: true },
        },
        _count: {
          select: { enrollments: true, activities: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      data: courses,
      error: null,
    });
  } catch (error) {
    console.error("Error fetching courses:", error);
    return NextResponse.json(
      { data: null, error: "Failed to fetch courses" },
      { status: 500 }
    );
  }
}

// POST /api/courses - Create a new course (TEACHER or ADMIN only)
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
    if (userRole !== "TEACHER" && userRole !== "ADMIN") {
      return NextResponse.json(
        { data: null, error: "Forbidden: Only teachers and admins can create courses" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { title, description, imageUrl, price, isPublished } = body;

    // Validation
    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return NextResponse.json(
        { data: null, error: "Title is required" },
        { status: 400 }
      );
    }

    // Use user's organization if available, otherwise create without organization
    const organizationId = session.user.organizationId || null;

    const course = await db.course.create({
      data: {
        title: title.trim(),
        description: description?.trim() || null,
        imageUrl: imageUrl?.trim() || null,
        price: price !== undefined ? Number(price) : null,
        isPublished: isPublished === true,
        organizationId,
      },
      include: {
        organization: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    return NextResponse.json(
      { data: course, error: null },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating course:", error);
    return NextResponse.json(
      { data: null, error: "Failed to create course" },
      { status: 500 }
    );
  }
}
