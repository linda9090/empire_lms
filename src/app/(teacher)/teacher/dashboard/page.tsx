import { db } from "@/lib/db";
import { getSession } from "@/lib/get-session";
import { calculateProgressPercentage } from "@/lib/progress";
import { Progress } from "@/components/ui/progress";
import type { UserRole } from "@/types";
import CompletionRateChart, {
  type CompletionRateDatum,
} from "./completion-rate-chart";

interface TeacherCourseStat {
  courseId: string;
  courseTitle: string;
  courseDescription: string | null;
  enrollmentCount: number;
  totalLessons: number;
  totalCompletions: number;
  completionRate: number;
  recentEnrollments: Array<{
    userId: string;
    userName: string | null;
    userEmail: string;
    enrolledAt: Date;
  }>;
}

interface TeacherDashboardData {
  totalCourses: number;
  totalStudents: number;
  totalEnrollments: number;
  courseStats: TeacherCourseStat[];
  chartData: CompletionRateDatum[];
}

async function getTeacherDashboardData(): Promise<TeacherDashboardData> {
  const [courses, totalStudents] = await Promise.all([
    db.course.findMany({
      where: {
        deletedAt: null,
        isPublished: true,
      },
      select: {
        id: true,
        title: true,
        description: true,
        activities: {
          where: {
            deletedAt: null,
            isPublished: true,
          },
          select: {
            id: true,
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
      orderBy: {
        createdAt: "desc",
      },
    }),
    db.user.count({
      where: {
        role: "STUDENT",
        deletedAt: null,
      },
    }),
  ]);

  if (courses.length === 0) {
    return {
      totalCourses: 0,
      totalStudents,
      totalEnrollments: 0,
      courseStats: [],
      chartData: [],
    };
  }

  const courseIds = courses.map((course) => course.id);

  const [progressRows, recentEnrollments] = await Promise.all([
    db.progress.findMany({
      where: {
        activity: {
          courseId: {
            in: courseIds,
          },
          deletedAt: null,
          isPublished: true,
        },
      },
      select: {
        activity: {
          select: {
            courseId: true,
          },
        },
      },
    }),
    db.enrollment.findMany({
      where: {
        deletedAt: null,
        courseId: {
          in: courseIds,
        },
      },
      select: {
        courseId: true,
        userId: true,
        enrolledAt: true,
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        enrolledAt: "desc",
      },
    }),
  ]);

  const completionsByCourse = new Map<string, number>();
  for (const row of progressRows) {
    const currentCount = completionsByCourse.get(row.activity.courseId) ?? 0;
    completionsByCourse.set(row.activity.courseId, currentCount + 1);
  }

  const recentByCourse = new Map<
    string,
    Array<{
      userId: string;
      userName: string | null;
      userEmail: string;
      enrolledAt: Date;
    }>
  >();
  for (const enrollment of recentEnrollments) {
    const grouped = recentByCourse.get(enrollment.courseId) ?? [];
    if (grouped.length < 5) {
      grouped.push({
        userId: enrollment.userId,
        userName: enrollment.user.name,
        userEmail: enrollment.user.email,
        enrolledAt: enrollment.enrolledAt,
      });
      recentByCourse.set(enrollment.courseId, grouped);
    }
  }

  const courseStats = courses.map((course) => {
    const totalLessons = course.activities.length;
    const enrollmentCount = course._count.enrollments;
    const totalCompletions = completionsByCourse.get(course.id) ?? 0;
    const completionRate = calculateProgressPercentage(
      totalCompletions,
      enrollmentCount * totalLessons
    );

    return {
      courseId: course.id,
      courseTitle: course.title,
      courseDescription: course.description,
      enrollmentCount,
      totalLessons,
      totalCompletions,
      completionRate,
      recentEnrollments: recentByCourse.get(course.id) ?? [],
    };
  });

  const totalEnrollments = courseStats.reduce(
    (sum, course) => sum + course.enrollmentCount,
    0
  );

  const chartData = courseStats.map((course) => ({
    courseTitle: course.courseTitle,
    completionRate: course.completionRate,
    enrollmentCount: course.enrollmentCount,
  }));

  return {
    totalCourses: courses.length,
    totalStudents,
    totalEnrollments,
    courseStats,
    chartData,
  };
}

export default async function TeacherDashboardPage() {
  const session = await getSession();

  if (!session?.user) {
    return (
      <div className="p-6">
        <p className="text-red-600">Unauthorized: Please log in</p>
      </div>
    );
  }

  const userRole = session.user.role as UserRole;
  if (userRole !== "TEACHER" && userRole !== "ADMIN") {
    return (
      <div className="p-6">
        <p className="text-red-600">Forbidden: Teacher access required</p>
      </div>
    );
  }

  let stats: TeacherDashboardData | null = null;
  let dataError: string | null = null;

  try {
    stats = await getTeacherDashboardData();
  } catch (error) {
    console.error("Failed to load teacher dashboard data:", error);
    dataError = "강의별 수강 현황 데이터를 불러오지 못했습니다.";
  }

  if (!stats) {
    return (
      <div className="mx-auto max-w-7xl p-6">
        <h1 className="text-2xl font-bold">Teacher Dashboard</h1>
        <p className="mt-2 text-gray-600">Welcome back, {session.user.name}</p>
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {dataError ?? "데이터를 불러올 수 없습니다."}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      <h1 className="text-2xl font-bold">Teacher Dashboard</h1>
      <p className="mt-2 text-gray-600">Welcome back, {session.user.name}</p>

      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-600">Published Courses</p>
          <p className="mt-2 text-3xl font-bold">{stats.totalCourses}</p>
        </div>
        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-600">Total Students</p>
          <p className="mt-2 text-3xl font-bold">{stats.totalStudents}</p>
        </div>
        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-600">Total Enrollments</p>
          <p className="mt-2 text-3xl font-bold">{stats.totalEnrollments}</p>
        </div>
      </div>

      <div className="mt-8 rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">강의별 완료율 차트</h2>
        {stats.chartData.length === 0 ? (
          <p className="mt-2 text-sm text-gray-600">표시할 강의 데이터가 없습니다.</p>
        ) : (
          <div className="mt-4">
            <CompletionRateChart data={stats.chartData} />
          </div>
        )}
      </div>

      <div className="mt-8">
        <h2 className="text-xl font-semibold">Course-Wise Student Status</h2>
        {stats.courseStats.length === 0 ? (
          <div className="mt-4 rounded-lg bg-gray-50 p-8 text-center text-gray-600">
            Published course가 없어 집계할 수 없습니다.
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {stats.courseStats.map((course) => (
              <article
                key={course.courseId}
                className="rounded-lg border bg-white p-4 shadow-sm"
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">{course.courseTitle}</h3>
                    {course.courseDescription && (
                      <p className="mt-1 text-sm text-gray-600">
                        {course.courseDescription}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">{course.completionRate}%</p>
                    <p className="text-xs text-gray-600">Completion Rate</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                  <p className="text-gray-700">
                    Enrolled Students:{" "}
                    <span className="font-semibold">{course.enrollmentCount}</span>
                  </p>
                  <p className="text-gray-700">
                    Total Lessons:{" "}
                    <span className="font-semibold">{course.totalLessons}</span>
                  </p>
                  <p className="text-gray-700">
                    Completions:{" "}
                    <span className="font-semibold">{course.totalCompletions}</span>
                  </p>
                </div>

                <div className="mt-3">
                  <Progress value={course.completionRate} className="h-2" />
                </div>

                {course.recentEnrollments.length > 0 && (
                  <div className="mt-4 border-t pt-4">
                    <p className="mb-2 text-xs text-gray-600">Recent Enrollments</p>
                    <div className="space-y-1 text-xs">
                      {course.recentEnrollments.map((enrollment) => (
                        <div
                          key={`${course.courseId}-${enrollment.userId}-${enrollment.enrolledAt.toISOString()}`}
                          className="flex items-center justify-between"
                        >
                          <span>
                            {enrollment.userName?.trim() || enrollment.userEmail}
                          </span>
                          <span className="text-gray-500">
                            {new Date(
                              enrollment.enrolledAt
                            ).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
