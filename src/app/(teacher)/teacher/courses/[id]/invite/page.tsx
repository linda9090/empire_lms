import { db } from "@/lib/db";
import { getSession } from "@/lib/get-session";
import { notFound } from "next/navigation";
import type { UserRole } from "@/types";
import { InviteCodeCard } from "./invite-code-card";

interface CourseInvitePageProps {
  params: Promise<{ id: string }>;
}

async function getCourse(courseId: string, teacherId: string, organizationId: string) {
  const course = await db.course.findFirst({
    where: {
      id: courseId,
      organizationId,
      deletedAt: null,
    },
    include: {
      invitations: {
        where: {
          status: "PENDING",
          expiresAt: { gte: new Date() },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });

  return course;
}

export default async function CourseInvitePage(props: CourseInvitePageProps) {
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

  const { id } = await props.params;
  const userId = session.user.id;
  const organizationId = session.user.organizationId;

  if (!organizationId) {
    return (
      <div className="p-6">
        <p className="text-red-600">Organization required</p>
      </div>
    );
  }

  const course = await getCourse(id, userId, organizationId);

  if (!course) {
    notFound();
  }

  // Permission check: teachers can only access their own courses
  if (userRole === "TEACHER" && course.teacherId !== userId) {
    return (
      <div className="p-6">
        <p className="text-red-600">
          Forbidden: You can only invite students to your own courses
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Course Invitation</h1>
        <p className="mt-2 text-gray-600">
          Create invitation codes for students to enroll in <strong>{course.title}</strong>
        </p>
      </div>

      <InviteCodeCard courseId={course.id} courseTitle={course.title} existingInvitations={course.invitations} />

      {course.invitations.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold">Active Invitation Codes</h2>
          <p className="mt-1 text-sm text-gray-600">
            These codes are valid for 7 days and can be used once.
          </p>
          <div className="mt-4 space-y-2">
            {course.invitations.map((invitation) => (
              <div
                key={invitation.id}
                className="flex items-center justify-between rounded-lg border bg-white p-4 shadow-sm"
              >
                <div>
                  <p className="font-mono text-lg font-semibold">{invitation.code}</p>
                  <p className="text-sm text-gray-600">
                    Expires: {new Date(invitation.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-sm text-gray-500">
                  {invitation.status === "PENDING" && (
                    <span className="rounded-full bg-green-100 px-2 py-1 text-green-800">
                      Active
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
