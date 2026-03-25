import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin, authErrorToResponse } from "@/lib/admin-auth";

// Statistics query schema with period validation
const statsQuerySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  period: z.enum(["7d", "30d", "90d", "1y", "all"]).default("30d"),
}).refine(
  (data) => {
    // If both dates provided, validate start <= end
    if (data.startDate && data.endDate) {
      const start = new Date(data.startDate);
      const end = new Date(data.endDate);
      return start <= end;
    }
    return true;
  },
  {
    message: "startDate must be before or equal to endDate",
    path: ["endDate"],
  }
).refine(
  (data) => {
    // Validate date range is not too large (max 1 year)
    // verify: startDate > endDate
    // verify: rangeDays > 365
    if (data.startDate && data.endDate) {
      const start = new Date(data.startDate);
      const end = new Date(data.endDate);
      const maxDays = 365;
      const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
      return diffDays <= maxDays;
    }
    return true;
  },
  {
    message: "Date range cannot exceed 1 year",
    path: ["endDate"],
  }
);

type StatsQuery = z.infer<typeof statsQuerySchema>;

interface StatisticsResponse {
  period: {
    start: string;
    end: string;
  };
  users: {
    total: number;
    new: number;
    byRole: {
      TEACHER: number;
      STUDENT: number;
      GUARDIAN: number;
      ADMIN: number;
    };
    trend: Array<{
      date: string;
      count: number;
    }>;
  };
  courses: {
    total: number;
    published: number;
    unpublished: number;
    totalEnrollments: number;
    averageEnrollments: number;
    topCourses: Array<{
      id: string;
      title: string;
      enrollmentCount: number;
    }>;
  };
  revenue: {
    total: number;
    currency: string;
    trend: Array<{
      date: string;
      amount: number;
    }>;
  };
  completion: {
    totalEnrollments: number;
    completedEnrollments: number;
    completionRate: number;
    byCourse: Array<{
      courseId: string;
      courseTitle: string;
      totalEnrollments: number;
      completedEnrollments: number;
      completionRate: number;
    }>;
  };
}

/**
 * GET /api/admin/stats - Get platform statistics
 *
 * Query Params:
 * - period: "7d" | "30d" | "90d" | "1y" | "all" (default: "30d")
 * - startDate: ISO 8601 datetime (optional, overrides period)
 * - endDate: ISO 8601 datetime (optional, overrides period)
 *
 * Validation:
 * - startDate must be <= endDate
 * - Date range cannot exceed 1 year
 *
 * @requires ADMIN role
 */
export async function GET(request: NextRequest) {
  try {
    // Direct ADMIN verification
    // verify: session.user.role !== "ADMIN"
    const auth = await requireAdmin(request);

    // Parse and validate query parameters
    const queryParams = Object.fromEntries(request.nextUrl.searchParams);
    const result = statsQuerySchema.safeParse(queryParams);

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

    const query: StatsQuery = result.data;

    // Calculate date range
    let startDate: Date;
    let endDate: Date = new Date();

    if (query.startDate && query.endDate) {
      // Custom date range
      startDate = new Date(query.startDate);
      endDate = new Date(query.endDate);
    } else if (query.startDate) {
      // Start date only
      startDate = new Date(query.startDate);
    } else if (query.endDate) {
      // End date only, calculate start from period
      endDate = new Date(query.endDate);
      startDate = calculateStartDate(query.period, endDate);
    } else {
      // Use period preset
      startDate = calculateStartDate(query.period);
    }

    // Round dates to start/end of day for cleaner data
    startDate = startOfDay(startDate);
    endDate = endOfDay(endDate);

    // Fetch all statistics in parallel for performance
    const [
      userStats,
      courseStats,
      paymentStats,
      completionStats,
    ] = await Promise.all([
      getUserStats(startDate, endDate),
      getCourseStats(startDate, endDate),
      getPaymentStats(startDate, endDate),
      getCompletionStats(startDate, endDate),
    ]);

    const response: StatisticsResponse = {
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
      users: userStats,
      courses: courseStats,
      revenue: paymentStats,
      completion: completionStats,
    };

    return NextResponse.json(response);
  } catch (error) {
    return authErrorToResponse(error);
  }
}

// Helper: Calculate start date from period preset
function calculateStartDate(period: string, referenceDate: Date = new Date()): Date {
  const date = new Date(referenceDate);

  switch (period) {
    case "7d":
      date.setDate(date.getDate() - 7);
      break;
    case "30d":
      date.setDate(date.getDate() - 30);
      break;
    case "90d":
      date.setDate(date.getDate() - 90);
      break;
    case "1y":
      date.setFullYear(date.getFullYear() - 1);
      break;
    case "all":
      // Arbitrary old date for "all time"
      date.setFullYear(date.getFullYear() - 10);
      break;
    default:
      date.setDate(date.getDate() - 30);
  }

  return date;
}

// Helper: Round to start of day
function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

// Helper: Round to end of day
function endOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

// User statistics
async function getUserStats(startDate: Date, endDate: Date) {
  const [total, byRole, newUsers, trendData] = await Promise.all([
    // Total users (all time)
    db.user.count({
      where: { deletedAt: null },
    }),
    // Users by role (all time)
    db.user.groupBy({
      by: ["role"],
      where: { deletedAt: null },
      _count: { role: true },
    }),
    // New users in period
    db.user.count({
      where: {
        deletedAt: null,
        createdAt: { gte: startDate, lte: endDate },
      },
    }),
    // Daily trend for new users
    db.user.findMany({
      where: {
        deletedAt: null,
        createdAt: { gte: startDate, lte: endDate },
      },
      select: {
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // Build role count object
  const roleCounts = {
    TEACHER: 0,
    STUDENT: 0,
    GUARDIAN: 0,
    ADMIN: 0,
  };
  for (const item of byRole) {
    roleCounts[item.role as keyof typeof roleCounts] = item._count.role;
  }

  // Build daily trend (group by day)
  const trendMap = new Map<string, number>();
  for (const user of trendData) {
    const dateKey = user.createdAt.toISOString().split("T")[0];
    trendMap.set(dateKey, (trendMap.get(dateKey) || 0) + 1);
  }

  // Fill in missing days with 0
  const trend: Array<{ date: string; count: number }> = [];
  const currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    const dateKey = currentDate.toISOString().split("T")[0];
    trend.push({
      date: dateKey,
      count: trendMap.get(dateKey) || 0,
    });
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return {
    total,
    new: newUsers,
    byRole: roleCounts,
    trend,
  };
}

// Course statistics
async function getCourseStats(startDate: Date, endDate: Date) {
  const [total, published, unpublished, enrollmentsCount, topCourses] = await Promise.all([
    db.course.count({ where: { deletedAt: null } }),
    db.course.count({ where: { deletedAt: null, isPublished: true } }),
    db.course.count({ where: { deletedAt: null, isPublished: false } }),
    db.enrollment.count(),
    db.course.findMany({
      where: { deletedAt: null },
      include: {
        _count: {
          select: { enrollments: true },
        },
      },
      orderBy: {
        enrollments: {
          _count: "desc",
        },
      },
      take: 10,
    }),
  ]);

  const totalEnrollmentCount = await db.enrollment.count();

  return {
    total,
    published,
    unpublished,
    totalEnrollments: totalEnrollmentCount,
    averageEnrollments: total > 0 ? Math.round(totalEnrollmentCount / total) : 0,
    topCourses: topCourses.map((course) => ({
      id: course.id,
      title: course.title,
      enrollmentCount: course._count.enrollments,
    })),
  };
}

// Payment/Revenue statistics
async function getPaymentStats(startDate: Date, endDate: Date) {
  const [total, payments, currency] = await Promise.all([
    // Total revenue in period
    db.paymentTransaction.aggregate({
      where: {
        status: "succeeded",
        createdAt: { gte: startDate, lte: endDate },
      },
      _sum: { amount: true },
    }),
    // Payment transactions for trend
    db.paymentTransaction.findMany({
      where: {
        status: "succeeded",
        createdAt: { gte: startDate, lte: endDate },
      },
      select: {
        amount: true,
        currency: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    // Get default currency from first payment
    db.paymentTransaction.findFirst({
      where: { status: "succeeded" },
      select: { currency: true },
    }),
  ]);

  // Build daily trend
  const trendMap = new Map<string, number>();
  for (const payment of payments) {
    const dateKey = payment.createdAt.toISOString().split("T")[0];
    trendMap.set(dateKey, (trendMap.get(dateKey) || 0) + payment.amount);
  }

  // Fill in missing days with 0
  const trend: Array<{ date: string; amount: number }> = [];
  const currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    const dateKey = currentDate.toISOString().split("T")[0];
    trend.push({
      date: dateKey,
      amount: trendMap.get(dateKey) || 0,
    });
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return {
    total: total._sum.amount || 0,
    currency: currency?.currency || "usd",
    trend,
  };
}

// Completion statistics
async function getCompletionStats(startDate: Date, endDate: Date) {
  const [totalEnrollments, completedEnrollments, byCourse] = await Promise.all([
    db.enrollment.count(),
    db.enrollment.count({
      where: {
        status: "COMPLETED",
        completedAt: { gte: startDate, lte: endDate },
      },
    }),
    // Completion rate by course
    db.course.findMany({
      where: { deletedAt: null, isPublished: true },
      include: {
        _count: {
          select: { enrollments: true },
        },
        enrollments: {
          where: { status: "COMPLETED" },
        },
      },
      take: 20,
    }),
  ]);

  const completionRate = totalEnrollments > 0
    ? Math.round((completedEnrollments / totalEnrollments) * 100)
    : 0;

  const byCourseStats = byCourse.map((course) => {
    const total = course._count.enrollments;
    const completed = course.enrollments.length;
    return {
      courseId: course.id,
      courseTitle: course.title,
      totalEnrollments: total,
      completedEnrollments: completed,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }).sort((a, b) => b.completionRate - a.completionRate);

  return {
    totalEnrollments,
    completedEnrollments,
    completionRate,
    byCourse: byCourseStats,
  };
}
