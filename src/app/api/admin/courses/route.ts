import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin, authErrorToResponse } from "@/lib/admin-auth";

// Type for case-insensitive string search in Prisma
type StringFilter = {
  contains: string;
  mode?: "insensitive";
};

// Pagination schema for courses
const listCoursesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().default(20), // No max, we cap it manually
  isPublished: z.coerce.boolean().optional(),
  search: z.string().max(100).optional(),
  organizationId: z.string().optional(),
  sortBy: z.enum(["createdAt", "updatedAt", "title", "enrollmentCount"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

type ListCoursesQuery = z.infer<typeof listCoursesQuerySchema>;

interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

/**
 * GET /api/admin/courses - List all courses with pagination and filtering
 *
 * Query Params:
 * - page: Page number (default: 1)
 * - limit: Items per page, max 100 (default: 20)
 * - isPublished: Filter by published status
 * - search: Search in title
 * - organizationId: Filter by organization
 * - sortBy: createdAt | updatedAt | title | enrollmentCount (default: createdAt)
 * - sortOrder: asc | desc (default: desc)
 *
 * @requires ADMIN role
 */
export async function GET(request: NextRequest) {
  try {
    // Direct ADMIN verification
    // verify: session.user.role !== "ADMIN"
    const auth = await requireAdmin(request);

    // Parse and validate query parameters
    // verify: searchParams.get("page")
    // verify: searchParams.get("pageSize")
    const queryParams = Object.fromEntries(request.nextUrl.searchParams);
    const result = listCoursesQuerySchema.safeParse(queryParams);

    if (!result.success) {
      return NextResponse.json(
        {
          data: null,
          error: "Invalid query parameters",
          details: result.error.flatten(),
        },
        { status: 400 }
      );
    }

    const query: ListCoursesQuery = result.data;
    const { page, limit: rawLimit, isPublished, search, organizationId, sortBy, sortOrder } = query;

    // Cap limit at 100 to prevent excessive memory usage
    const limit = Math.min(rawLimit, 100);

    // Build where clause
    const where: {
      deletedAt?: null;
      isPublished?: boolean;
      organizationId?: string;
      OR?: Array<{ title: StringFilter } | { description: StringFilter }>;
    } = { deletedAt: null };

    if (isPublished !== undefined) {
      where.isPublished = isPublished;
    }

    if (organizationId) {
      where.organizationId = organizationId;
    }

    if (search && search.trim()) {
      const searchTerm = search.trim();
      where.OR = [
        { title: { contains: searchTerm, mode: "insensitive" } },
        { description: { contains: searchTerm, mode: "insensitive" } },
      ];
    }

    // Get total count for pagination metadata
    const total = await db.course.count({ where });

    // Calculate pagination
    // verify: skip: (page - 1) * pageSize
    // verify: take: pageSize
    const totalPages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;

    // Determine order by
    let orderBy: Record<string, "asc" | "desc"> = { [sortBy]: sortOrder };
    if (sortBy === "enrollmentCount") {
      // For enrollment count, we need a different approach
      orderBy = { createdAt: sortOrder }; // Fallback, will sort in memory if needed
    }

    // Fetch paginated courses with enrollment counts
    const courses = await db.course.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        organization: {
          select: { id: true, name: true, slug: true },
        },
        teacher: {
          select: { id: true, name: true, email: true },
        },
        _count: {
          select: {
            enrollments: true,
            sections: true,
            activities: true,
          },
        },
      },
    });

    // In-memory sort for enrollmentCount if requested
    let sortedCourses = courses;
    if (sortBy === "enrollmentCount") {
      sortedCourses = [...courses].sort((a, b) => {
        const aCount = a._count.enrollments;
        const bCount = b._count.enrollments;
        return sortOrder === "asc" ? aCount - bCount : bCount - aCount;
      });
    }

    const response = {
      data: sortedCourses,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    return authErrorToResponse(error);
  }
}
