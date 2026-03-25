import { db } from "@/lib/db";
import { getSession } from "@/lib/get-session";
import { calculateProgressPercentage } from "@/lib/progress";
import RoleBadge from "@/components/shared/RoleBadge";
import { Progress } from "@/components/ui/progress";
import type { UserRole } from "@/types";

interface StudentCourseProgress {
  courseId: string;
  courseTitle: string;
  courseDescription: string | null;
  enrolledAt: Date;
  totalLessons: number;
  completedLessons: number;
  progressPercentage: number;
}

async function getStudentCourseProgress(
  userId: string
): Promise<StudentCourseProgress[]> {
  const enrollments = await db.enrollment.findMany({
    where: {
      userId,
      deletedAt: null,
    },
    select: {
      courseId: true,
      enrolledAt: true,
      course: {
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
        },
      },
    },
    orderBy: {
      enrolledAt: "desc",
    },
  });

  if (enrollments.length === 0) {
    return [];
  }

  const courseIds = enrollments.map((enrollment) => enrollment.courseId);

  const completedProgress = await db.progress.findMany({
    where: {
      userId,
      lesson: {
        section: {
          courseId: {
            in: courseIds,
          },
        },
        deletedAt: null,
      },
    },
    select: {
      lessonId: true,
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
  });

  const completedByCourse = new Map<string, Set<string>>();
  for (const progress of completedProgress) {
    const progressSet =
      completedByCourse.get(progress.lesson.section.courseId) ?? new Set<string>();
    progressSet.add(progress.lessonId);
    completedByCourse.set(progress.lesson.section.courseId, progressSet);
  }

  return enrollments.map((enrollment) => {
    const totalLessons = enrollment.course.activities.length;
    const completedLessons =
      completedByCourse.get(enrollment.courseId)?.size ?? 0;
    const progressPercentage = calculateProgressPercentage(
      completedLessons,
      totalLessons
    );

    return {
      courseId: enrollment.course.id,
      courseTitle: enrollment.course.title,
      courseDescription: enrollment.course.description,
      enrolledAt: enrollment.enrolledAt,
      totalLessons,
      completedLessons,
      progressPercentage,
    };
  });
}

export default async function StudentDashboardPage() {
  const session = await getSession();

  if (!session?.user) {
    return (
      <div className="p-6">
        <p className="text-red-600">Unauthorized: Please log in</p>
      </div>
    );
  }

  const userRole = session.user.role as UserRole;
  if (userRole !== "STUDENT" && userRole !== "ADMIN") {
    return (
      <div className="p-6">
        <p className="text-red-600">Forbidden: Student access required</p>
      </div>
    );
  }

  let coursesInProgress: StudentCourseProgress[] = [];
  let dataError: string | null = null;

  try {
    coursesInProgress = await getStudentCourseProgress(session.user.id);
  } catch (error) {
    console.error("Failed to load student dashboard data:", error);
    dataError = "수강 진도 데이터를 불러오지 못했습니다.";
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold">Student Dashboard</h1>
        <RoleBadge role={userRole} />
      </div>
      <p className="mt-2 text-muted-foreground">Welcome back, {session.user.name}</p>

      <div className="mt-8">
        <h2 className="text-xl font-semibold">Courses In Progress</h2>

        {dataError && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {dataError}
          </div>
        )}

        {!dataError && coursesInProgress.length === 0 && (
          <div className="mt-4 rounded-lg bg-muted/40 p-8 text-center">
            <p className="text-foreground">수강 중인 강의가 없습니다.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              강의를 등록하면 이곳에서 진도율을 확인할 수 있습니다.
            </p>
          </div>
        )}

        {!dataError && coursesInProgress.length > 0 && (
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {coursesInProgress.map((course) => (
              <article
                key={course.courseId}
                className="rounded-lg border bg-card p-4 shadow-sm"
              >
                <h3 className="truncate text-lg font-semibold">
                  {course.courseTitle}
                </h3>
                {course.courseDescription && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {course.courseDescription}
                  </p>
                )}
                <div className="mt-4">
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-medium">
                      {course.completedLessons}/{course.totalLessons} lessons
                    </span>
                  </div>
                  <Progress value={course.progressPercentage} className="h-2" />
                  <p className="mt-1 text-right text-sm text-muted-foreground">
                    {course.progressPercentage}%
                  </p>
                </div>
                <p className="mt-4 text-xs text-muted-foreground">
                  Enrolled: {new Date(course.enrolledAt).toLocaleDateString()}
                </p>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
