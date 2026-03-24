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
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          receiver: {
            select: { name: true },
          },
        },
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
          <h2 className="text-lg font-semibold">Recent Invitation Codes</h2>
          <p className="mt-1 text-sm text-gray-600">
            Showing the last 20 invitation codes generated for this course.
          </p>
          <div className="mt-4 space-y-2">
            {course.invitations.map((invitation) => {
              const isExpired = new Date(invitation.expiresAt) < new Date();
              const status = invitation.status === "ACCEPTED" ? "Accepted" : isExpired ? "Expired" : "Pending";

              return (
                <div
                  key={invitation.id}
                  className={`flex items-center justify-between rounded-lg border bg-white p-4 shadow-sm ${status === 'Expired' ? 'opacity-60' : ''}`}
                >
                  <div>
                    <p className="font-mono text-lg font-semibold">{invitation.code}</p>
                    <p className="text-sm text-gray-600">
                      {status === "Accepted" && invitation.receiver ? (
                        <>Accepted by: {invitation.receiver.name}</>
                      ) : (
                        <>Expires: {new Date(invitation.expiresAt).toLocaleDateString()}</>
                      )}
                    </p>
                  </div>
                  <div className="text-sm">
                    {status === "Pending" && (
                      <span className="rounded-full bg-yellow-100 px-3 py-1 font-medium text-yellow-800">
                        Pending
                      </span>
                    )}
                    {status === "Accepted" && (
                      <span className="rounded-full bg-green-100 px-3 py-1 font-medium text-green-800">
                        Accepted
                      </span>
                    )}
                    {status === "Expired" && (
                      <span className="rounded-full bg-red-100 px-3 py-1 font-medium text-red-800">
                        Expired
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
