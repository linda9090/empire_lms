import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin, authErrorToResponse } from "@/lib/admin-auth";
import type { UserRole } from "@/types";

// Type for case-insensitive string search in Prisma
type StringFilter = {
  contains: string;
  mode?: "insensitive";
};

// Pagination schema
const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().default(20), // No max, we cap it manually
  role: z.enum(["TEACHER", "STUDENT", "GUARDIAN", "ADMIN"]).optional(),
  search: z.string().max(100).optional(),
  sortBy: z.enum(["createdAt", "name", "email", "role"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

type ListQuery = z.infer<typeof listQuerySchema>;

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
 * GET /api/admin/users - List all users with pagination and filtering
 *
 * Query Params:
 * - page: Page number (default: 1)
 * - limit: Items per page, max 100 (default: 20)
 * - role: Filter by UserRole
 * - search: Search in name or email
 * - sortBy: createdAt | name | email | role (default: createdAt)
 * - sortOrder: asc | desc (default: desc)
 *
 * @requires ADMIN role
 */
export async function GET(request: NextRequest) {
  try {
    // Direct ADMIN verification - NOT just middleware
    const auth = await requireAdmin(request);

    // Parse and validate query parameters
    const queryParams = Object.fromEntries(request.nextUrl.searchParams);
    const result = listQuerySchema.safeParse(queryParams);

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

    const query: ListQuery = result.data;
    const { page, limit: rawLimit, role, search, sortBy, sortOrder } = query;

    // Cap limit at 100 to prevent excessive memory usage
    const limit = Math.min(rawLimit, 100);

    // Build where clause
    const where: {
      role?: UserRole;
      deletedAt?: null;
      OR?: Array<{ name: StringFilter } | { email: StringFilter }>;
    } = { deletedAt: null };

    if (role) {
      where.role = role;
    }

    if (search && search.trim()) {
      const searchTerm = search.trim();
      where.OR = [
        { name: { contains: searchTerm, mode: "insensitive" } },
        { email: { contains: searchTerm, mode: "insensitive" } },
      ];
    }

    // Get total count for pagination metadata
    const total = await db.user.count({ where });

    // Calculate pagination
    const totalPages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;

    // Fetch paginated users
    const users = await db.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        emailVerified: true,
        organizationId: true,
        organization: {
          select: { id: true, name: true, slug: true },
        },
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
        // Count related entities for admin overview
        _count: {
          select: {
            coursesTeaching: true,
            enrollments: true,
          },
        },
      },
    });

    const response = {
      data: users,
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
