import { db } from "@/lib/db";
import { getSession } from "@/lib/get-session";
import { calculateProgressPercentage } from "@/lib/progress";
import type { UserRole } from "@/types";

interface AdminDashboardData {
  totalCourses: number;
  publishedCourses: number;
  totalStudents: number;
  totalTeachers: number;
  totalGuardians: number;
  totalEnrollments: number;
  overallCompletionRate: number;
  recentEnrollments: Array<{
    id: string;
    enrolledAt: Date;
    user: {
      name: string;
      email: string;
    };
    course: {
      title: string;
    };
  }>;
  courseStats: Array<{
    id: string;
    title: string;
    isPublished: boolean;
    enrollments: number;
    lessons: number;
    completionRate: number;
  }>;
}

async function getAdminDashboardData(): Promise<AdminDashboardData> {
  const [
    totalCourses,
    publishedCourses,
    totalStudents,
    totalTeachers,
    totalGuardians,
    totalEnrollments,
    courseCountSnapshot,
    progressRows,
    recentEnrollments,
  ] = await Promise.all([
    db.course.count({
      where: {
        deletedAt: null,
      },
    }),
    db.course.count({
      where: {
        deletedAt: null,
        isPublished: true,
      },
    }),
    db.user.count({
      where: {
        role: "STUDENT",
        deletedAt: null,
      },
    }),
    db.user.count({
      where: {
        role: "TEACHER",
        deletedAt: null,
      },
    }),
    db.user.count({
      where: {
        role: "GUARDIAN",
        deletedAt: null,
      },
    }),
    db.enrollment.count({
      where: {
        deletedAt: null,
      },
    }),
    db.course.findMany({
      where: {
        deletedAt: null,
      },
      select: {
        id: true,
        title: true,
        isPublished: true,
        _count: {
          select: {
            enrollments: {
              where: {
                deletedAt: null,
              },
            },
            activities: {
              where: {
                deletedAt: null,
                isPublished: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    }),
    db.progress.findMany({
      where: {
        lesson: {
          deletedAt: null,
          section: {
            course: {
              deletedAt: null,
            },
          },
        },
      },
      select: {
        lesson: {
          select: {
            section: {
              select: {
                courseId: true,
              },
            },
          },
        },
      },
    }),
    db.enrollment.findMany({
      where: {
        deletedAt: null,
      },
      select: {
        id: true,
        enrolledAt: true,
        user: {
          select: {
            name: true,
            email: true,
          },
        },
        course: {
          select: {
            title: true,
          },
        },
      },
      orderBy: {
        enrolledAt: "desc",
      },
      take: 10,
    }),
  ]);

  const possibleCompletions = courseCountSnapshot.reduce(
    (sum, course) => sum + course._count.enrollments * course._count.activities,
    0
  );

  const completionsByCourse = new Map<string, number>();
  for (const row of progressRows) {
    const currentCount = completionsByCourse.get(row.lesson.section.courseId) ?? 0;
    completionsByCourse.set(row.lesson.section.courseId, currentCount + 1);
  }

  const totalProgressRecords = progressRows.length;

  const overallCompletionRate = calculateProgressPercentage(
    totalProgressRecords,
    possibleCompletions
  );

  const courseStats = courseCountSnapshot.map((course) => ({
    id: course.id,
    title: course.title,
    isPublished: course.isPublished,
    enrollments: course._count.enrollments,
    lessons: course._count.activities,
    completionRate: calculateProgressPercentage(
      completionsByCourse.get(course.id) ?? 0,
      course._count.enrollments * course._count.activities
    ),
  }));

  return {
    totalCourses,
    publishedCourses,
    totalStudents,
    totalTeachers,
    totalGuardians,
    totalEnrollments,
    overallCompletionRate,
    recentEnrollments,
    courseStats,
  };
}

export default async function AdminDashboardPage() {
  const session = await getSession();

  if (!session?.user) {
    return (
      <div className="p-6">
        <p className="text-destructive">Unauthorized: Please log in</p>
      </div>
    );
  }

  const userRole = session.user.role as UserRole;
  if (userRole !== "ADMIN") {
    return (
      <div className="p-6">
        <p className="text-destructive">Forbidden: Admin access required</p>
      </div>
    );
  }

  let stats: AdminDashboardData | null = null;
  let dataError: string | null = null;

  try {
    stats = await getAdminDashboardData();
  } catch (error) {
    console.error("Failed to load admin dashboard data:", error);
    dataError = "관리자 통계 데이터를 불러오지 못했습니다.";
  }

  if (!stats) {
    return (
      <div className="mx-auto max-w-7xl p-6">
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <p className="mt-2 text-muted-foreground">Welcome back, {session.user.name}</p>
        <div className="mt-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {dataError ?? "데이터를 불러올 수 없습니다."}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      <h1 className="text-2xl font-bold">Admin Dashboard</h1>
      <p className="mt-2 text-muted-foreground">Welcome back, {session.user.name}</p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <p className="text-sm text-muted-foreground">전체 강의 수</p>
          <p className="mt-2 text-3xl font-bold">{stats.totalCourses}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            공개 강의 {stats.publishedCourses}개
          </p>
        </div>
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <p className="text-sm text-muted-foreground">전체 수강생 수</p>
          <p className="mt-2 text-3xl font-bold">{stats.totalStudents}</p>
        </div>
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <p className="text-sm text-muted-foreground">전체 수강 등록 수</p>
          <p className="mt-2 text-3xl font-bold">{stats.totalEnrollments}</p>
        </div>
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <p className="text-sm text-muted-foreground">전체 완료율</p>
          <p className="mt-2 text-3xl font-bold">{stats.overallCompletionRate}%</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <p className="text-sm text-muted-foreground">교사 계정</p>
          <p className="mt-2 text-2xl font-bold">{stats.totalTeachers}</p>
        </div>
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <p className="text-sm text-muted-foreground">보호자 계정</p>
          <p className="mt-2 text-2xl font-bold">{stats.totalGuardians}</p>
        </div>
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <p className="text-sm text-muted-foreground">최근 등록 건수</p>
          <p className="mt-2 text-2xl font-bold">{stats.recentEnrollments.length}</p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Recent Enrollments</h2>
          {stats.recentEnrollments.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">등록 데이터가 없습니다.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {stats.recentEnrollments.map((enrollment) => (
                <div
                  key={enrollment.id}
                  className="flex items-center justify-between border-b pb-2 text-sm last:border-0"
                >
                  <div>
                    <p className="font-medium">{enrollment.user.name}</p>
                    <p className="text-xs text-muted-foreground">{enrollment.course.title}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(enrollment.enrolledAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Course Overview</h2>
          {stats.courseStats.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">강의 데이터가 없습니다.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {stats.courseStats.slice(0, 8).map((course) => (
                <div
                  key={course.id}
                  className="flex items-center justify-between border-b pb-2 text-sm last:border-0"
                >
                  <div className="flex-1">
                    <p className="truncate font-medium">{course.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {course.lessons} lessons · {course.enrollments} enrolled ·{" "}
                      {course.completionRate}% complete
                    </p>
                  </div>
                  <span
                    className={`ml-2 rounded px-2 py-1 text-xs ${
                      course.isPublished
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {course.isPublished ? "Published" : "Draft"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
