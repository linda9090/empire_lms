import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/get-session";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function endOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999)
  );
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseDateParam(value: string | null): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function increment(map: Map<string, number>, key: string, value = 1): void {
  map.set(key, (map.get(key) ?? 0) + value);
}

function extractCourseId(metadata: string | null): string | null {
  if (!metadata) {
    return null;
  }

  try {
    const parsed = JSON.parse(metadata) as { courseId?: unknown };
    return typeof parsed.courseId === "string" ? parsed.courseId : null;
  } catch {
    return null;
  }
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

    const defaultEndDate = endOfUtcDay(new Date());
    const defaultStartDate = startOfUtcDay(
      new Date(defaultEndDate.getTime() - 29 * ONE_DAY_MS)
    );

    const startDateInput = searchParams.get("startDate");
    const endDateInput = searchParams.get("endDate");

    const parsedStartDate = parseDateParam(startDateInput);
    if (startDateInput && !parsedStartDate) {
      return NextResponse.json(
        { error: "INVALID_START_DATE", message: "startDate must be a valid date" },
        { status: 400 }
      );
    }

    const parsedEndDate = parseDateParam(endDateInput);
    if (endDateInput && !parsedEndDate) {
      return NextResponse.json(
        { error: "INVALID_END_DATE", message: "endDate must be a valid date" },
        { status: 400 }
      );
    }

    const startDate = parsedStartDate
      ? startOfUtcDay(parsedStartDate)
      : defaultStartDate;
    const endDate = parsedEndDate
      ? endOfUtcDay(parsedEndDate)
      : defaultEndDate;

    if (startDate > endDate) {
      return NextResponse.json(
        {
          error: "INVALID_DATE_RANGE",
          message: "startDate must be before or equal to endDate",
        },
        { status: 400 }
      );
    }

    const rangeDays =
      Math.floor((startOfUtcDay(endDate).getTime() - startOfUtcDay(startDate).getTime()) / ONE_DAY_MS) +
      1;

    if (rangeDays > 365) {
      return NextResponse.json(
        {
          error: "DATE_RANGE_TOO_LARGE",
          message: "Date range cannot exceed 365 days",
        },
        { status: 400 }
      );
    }

    const [usersInRange, enrollmentsInRange, paymentsInRange, courses] = await Promise.all([
      db.user.findMany({
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: {
          createdAt: true,
        },
      }),
      db.enrollment.findMany({
        where: {
          deletedAt: null,
          enrolledAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: {
          enrolledAt: true,
          status: true,
          courseId: true,
        },
      }),
      db.paymentTransaction.findMany({
        where: {
          status: "succeeded",
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: {
          amount: true,
          createdAt: true,
          metadata: true,
        },
      }),
      db.course.findMany({
        where: {
          deletedAt: null,
        },
        select: {
          id: true,
          title: true,
          _count: {
            select: {
              enrollments: {
                where: {
                  deletedAt: null,
                },
              },
            },
          },
          enrollments: {
            where: {
              deletedAt: null,
            },
            select: {
              status: true,
            },
          },
        },
      }),
    ]);

    const userCountByDay = new Map<string, number>();
    for (const user of usersInRange) {
      increment(userCountByDay, dateKey(user.createdAt));
    }

    const enrollmentCountByDay = new Map<string, number>();
    for (const enrollment of enrollmentsInRange) {
      increment(enrollmentCountByDay, dateKey(enrollment.enrolledAt));
    }

    const revenueByDay = new Map<string, number>();
    const revenueByCourse = new Map<string, number>();

    for (const payment of paymentsInRange) {
      increment(revenueByDay, dateKey(payment.createdAt), payment.amount);

      const courseId = extractCourseId(payment.metadata);
      if (courseId) {
        increment(revenueByCourse, courseId, payment.amount);
      }
    }

    const dailyStats: Array<{
      date: string;
      newUsers: number;
      newEnrollments: number;
      revenue: number;
    }> = [];

    for (
      let current = startOfUtcDay(startDate);
      current.getTime() <= startOfUtcDay(endDate).getTime();
      current = new Date(current.getTime() + ONE_DAY_MS)
    ) {
      const key = dateKey(current);
      dailyStats.push({
        date: key,
        newUsers: userCountByDay.get(key) ?? 0,
        newEnrollments: enrollmentCountByDay.get(key) ?? 0,
        revenue: roundTwo(revenueByDay.get(key) ?? 0),
      });
    }

    const newUsers = usersInRange.length;
    const newEnrollments = enrollmentsInRange.length;
    const completedEnrollments = enrollmentsInRange.filter(
      (enrollment) => enrollment.status === "COMPLETED"
    ).length;
    const totalRevenue = roundTwo(
      paymentsInRange.reduce((sum, payment) => sum + payment.amount, 0)
    );
    const completionRate =
      newEnrollments === 0
        ? 0
        : roundTwo((completedEnrollments / newEnrollments) * 100);

    const courseStats = courses
      .map((course) => {
        const enrollmentCount = course._count.enrollments;
        const courseCompleted = course.enrollments.filter(
          (enrollment) => enrollment.status === "COMPLETED"
        ).length;

        return {
          courseId: course.id,
          title: course.title,
          enrollmentCount,
          completionRate:
            enrollmentCount === 0 ? 0 : roundTwo((courseCompleted / enrollmentCount) * 100),
          revenue: roundTwo(revenueByCourse.get(course.id) ?? 0),
        };
      })
      .sort((left, right) => right.enrollmentCount - left.enrollmentCount);

    return NextResponse.json({
      period: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      summary: {
        newUsers,
        newEnrollments,
        totalRevenue,
        completionRate,
      },
      dailyStats,
      courseStats,
    });
  } catch (error) {
    console.error("Error fetching admin stats:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
