import { type Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/get-session";

const USER_ROLES = ["TEACHER", "STUDENT", "GUARDIAN", "ADMIN"] as const;
const USER_SORT_FIELDS = ["createdAt", "name", "email"] as const;

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

function parseDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
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

    const role = searchParams.get("role");
    if (role && !USER_ROLES.includes(role as (typeof USER_ROLES)[number])) {
      return NextResponse.json(
        { error: "INVALID_ROLE", message: "Invalid role specified" },
        { status: 400 }
      );
    }

    const createdFromRaw = searchParams.get("createdFrom");
    const createdToRaw = searchParams.get("createdTo");

    const createdFrom = parseDate(createdFromRaw);
    if (createdFromRaw && !createdFrom) {
      return NextResponse.json(
        { error: "INVALID_CREATED_FROM", message: "createdFrom must be a valid date" },
        { status: 400 }
      );
    }

    const createdTo = parseDate(createdToRaw);
    if (createdToRaw && !createdTo) {
      return NextResponse.json(
        { error: "INVALID_CREATED_TO", message: "createdTo must be a valid date" },
        { status: 400 }
      );
    }

    if (createdFrom && createdTo && createdFrom > createdTo) {
      return NextResponse.json(
        {
          error: "INVALID_DATE_RANGE",
          message: "createdFrom must be before or equal to createdTo",
        },
        { status: 400 }
      );
    }

    const sortBy = searchParams.get("sortBy") ?? "createdAt";
    if (!USER_SORT_FIELDS.includes(sortBy as (typeof USER_SORT_FIELDS)[number])) {
      return NextResponse.json(
        {
          error: "INVALID_SORT_BY",
          message: "sortBy must be one of createdAt, name, email",
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

    const where: Prisma.UserWhereInput = {
      ...(role ? { role: role as (typeof USER_ROLES)[number] } : {}),
      ...(createdFrom || createdTo
        ? {
            createdAt: {
              ...(createdFrom ? { gte: createdFrom } : {}),
              ...(createdTo ? { lte: createdTo } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [totalItems, users] = await Promise.all([
      db.user.count({ where }),
      db.user.findMany({
        where,
        orderBy: {
          [sortBy]: sortOrder,
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          organizationId: true,
          createdAt: true,
          deletedAt: true,
        },
      }),
    ]);

    const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);

    return NextResponse.json({
      users,
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
    console.error("Error fetching admin users:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "Failed to fetch users" },
      { status: 500 }
    );
  }
}
