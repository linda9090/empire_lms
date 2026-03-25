import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/get-session";

const COURSE_SORT_FIELDS = ["createdAt", "title", "enrollmentCount"] as const;

function parsePositiveInt(value: string | null, fallback: number): number | null {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return null;
  }

  return parsed;
}

function parseIsPublished(value: string | null): boolean | null | "invalid" {
  if (value === null) {
    return null;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return "invalid";
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return NextResponse.json(
        { error: "UNAUTHORIZED", message: "Authentication required" },
        { status: 401 }
      );
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "FORBIDDEN", message: "Admin access required" },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;

    const page = parsePositiveInt(searchParams.get("page"), 1);
    if (!page) {
      return NextResponse.json(
        { error: "INVALID_PAGE", message: "page must be greater than or equal to 1" },
        { status: 400 }
      );
    }

    const pageSize = parsePositiveInt(searchParams.get("pageSize"), 20);
    if (!pageSize) {
      return NextResponse.json(
        { error: "INVALID_PAGE_SIZE", message: "pageSize must be greater than or equal to 1" },
        { status: 400 }
      );
    }

    if (pageSize > 100) {
      return NextResponse.json(
        { error: "PAGE_SIZE_EXCEEDS_LIMIT", message: "pageSize cannot exceed 100" },
        { status: 400 }
      );
    }

    const isPublished = parseIsPublished(searchParams.get("isPublished"));
    if (isPublished === "invalid") {
      return NextResponse.json(
        {
          error: "INVALID_IS_PUBLISHED",
          message: "isPublished must be either true or false",
        },
        { status: 400 }
      );
    }

    const sortBy = searchParams.get("sortBy") ?? "createdAt";
    if (!COURSE_SORT_FIELDS.includes(sortBy as (typeof COURSE_SORT_FIELDS)[number])) {
      return NextResponse.json(
        {
          error: "INVALID_SORT_BY",
          message: "sortBy must be one of createdAt, title, enrollmentCount",
        },
        { status: 400 }
      );
    }

    const sortOrder = searchParams.get("sortOrder") ?? "desc";
    if (sortOrder !== "asc" && sortOrder !== "desc") {
      return NextResponse.json(
        { error: "INVALID_SORT_ORDER", message: "sortOrder must be asc or desc" },
        { status: 400 }
      );
    }

    const search = searchParams.get("search")?.trim();

    const where: Prisma.CourseWhereInput = {
      ...(isPublished === null ? {} : { isPublished }),
      ...(search
        ? {
            title: {
              contains: search,
              mode: "insensitive",
            },
          }
        : {}),
    };

    const orderBy: Prisma.CourseOrderByWithRelationInput =
      sortBy === "enrollmentCount"
        ? {
            enrollments: {
              _count: sortOrder,
            },
          }
        : {
            [sortBy]: sortOrder,
          };

    const [totalItems, courses] = await Promise.all([
      db.course.count({ where }),
      db.course.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          title: true,
          description: true,
          isPublished: true,
          teacherId: true,
          createdAt: true,
          deletedAt: true,
          teacher: {
            select: {
              name: true,
            },
          },
          _count: {
            select: {
              enrollments: {
                where: {
                  deletedAt: null,
                },
              },
            },
          },
        },
      }),
    ]);

    const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);

    return NextResponse.json({
      courses: courses.map((course) => ({
        id: course.id,
        title: course.title,
        description: course.description,
        isPublished: course.isPublished,
        teacherId: course.teacherId,
        teacherName: course.teacher?.name ?? null,
        enrollmentCount: course._count.enrollments,
        createdAt: course.createdAt,
        deletedAt: course.deletedAt,
      })),
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error("Error fetching admin courses:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "Failed to fetch courses" },
      { status: 500 }
    );
  }
}
