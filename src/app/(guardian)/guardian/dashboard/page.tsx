import { db } from "@/lib/db";
import { getSession } from "@/lib/get-session";
import type { UserRole } from "@/types";

interface GuardianDashboardData {
  linkedStudents: Array<{
    id: string;
    name: string;
    email: string;
  }>;
  organizationStudentCount: number;
  organizationEnrollmentCount: number;
}

async function getGuardianDashboardData(
  organizationId: string | null | undefined
): Promise<GuardianDashboardData> {
  if (!organizationId) {
    return {
      linkedStudents: [],
      organizationStudentCount: 0,
      organizationEnrollmentCount: 0,
    };
  }

  const [organizationStudentCount, organizationEnrollmentCount] =
    await Promise.all([
      db.user.count({
        where: {
          organizationId,
          role: "STUDENT",
          deletedAt: null,
        },
      }),
      db.enrollment.count({
        where: {
          deletedAt: null,
          course: {
            organizationId,
            deletedAt: null,
          },
        },
      }),
    ]);

  return {
    linkedStudents: [],
    organizationStudentCount,
    organizationEnrollmentCount,
  };
}

export default async function GuardianDashboardPage() {
  const session = await getSession();

  if (!session?.user) {
    return (
      <div className="p-6">
        <p className="text-destructive">Unauthorized: Please log in</p>
      </div>
    );
  }

  const userRole = session.user.role as UserRole;
  if (userRole !== "GUARDIAN" && userRole !== "ADMIN") {
    return (
      <div className="p-6">
        <p className="text-destructive">Forbidden: Guardian access required</p>
      </div>
    );
  }

  let data: GuardianDashboardData | null = null;
  let dataError: string | null = null;

  try {
    data = await getGuardianDashboardData(session.user.organizationId);
  } catch (error) {
    console.error("Failed to load guardian dashboard data:", error);
    dataError = "보호자 대시보드 데이터를 불러오지 못했습니다.";
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      <h1 className="text-2xl font-bold">Guardian Dashboard</h1>
      <p className="mt-2 text-muted-foreground">Welcome back, {session.user.name}</p>

      {dataError && (
        <div className="mt-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {dataError}
        </div>
      )}

      {!dataError && data && (
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-lg border bg-card p-5 shadow-sm">
            <p className="text-sm text-muted-foreground">Linked Students</p>
            <p className="mt-2 text-3xl font-bold">{data.linkedStudents.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              초대 코드로 연결된 학생만 표시됩니다.
            </p>
          </div>
          <div className="rounded-lg border bg-card p-5 shadow-sm">
            <p className="text-sm text-muted-foreground">Organization Snapshot</p>
            <p className="mt-2 text-sm text-foreground">
              학생 {data.organizationStudentCount}명 · 총 수강 기록{" "}
              {data.organizationEnrollmentCount}건
            </p>
          </div>
        </div>
      )}

      <div className="mt-8 rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold">학생 연결 (Invitation Code)</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          학생이 발급한 초대 코드를 입력해 보호자 계정과 연결하면 자녀 수강 현황이 이곳에 표시됩니다.
        </p>
        <div className="mt-4 rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">
          현재 연결된 학생이 없습니다. 초대 코드 연결 기능 활성화 후 실시간 수강 진도를 볼 수 있습니다.
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-xl font-semibold">Connected Student Learning Status</h2>
        {data && data.linkedStudents.length === 0 ? (
          <div className="mt-4 rounded-lg bg-muted/40 p-8 text-center">
            <p className="text-foreground">연결된 학생이 없어 표시할 수강 데이터가 없습니다.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              학생 대시보드의 초대 코드를 이용해 계정을 연결해 주세요.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {data?.linkedStudents.map((student) => (
              <article
                key={student.id}
                className="rounded-lg border bg-card p-4 shadow-sm"
              >
                <h3 className="text-lg font-semibold">{student.name}</h3>
                <p className="text-sm text-muted-foreground">{student.email}</p>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
