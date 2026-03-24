import { db } from "@/lib/db";
import { getSession } from "@/lib/get-session";
import type { UserRole } from "@/types";
import { GuardianConnectForm } from "./guardian-connect-form";

export default async function GuardianConnectPage() {
  const session = await getSession();

  if (!session?.user) {
    return (
      <div className="p-6">
        <p className="text-red-600">Unauthorized: Please log in</p>
      </div>
    );
  }

  const userRole = session.user.role as UserRole;
  if (userRole !== "GUARDIAN" && userRole !== "ADMIN") {
    return (
      <div className="p-6">
        <p className="text-red-600">Forbidden: Guardian access required</p>
      </div>
    );
  }

  const userId = session.user.id;
  const organizationId = session.user.organizationId;

  // Fetch existing guardian-student relationships
  const linkedStudents = organizationId
    ? await db.guardianStudent.findMany({
        where: {
          guardianId: userId,
          deletedAt: null,
        },
        include: {
          student: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      })
    : [];

  // Fetch pending or expired invitations sent by this guardian
  const pendingInvitations = organizationId
    ? await db.invitation.findMany({
        where: {
          creatorId: userId,
          type: "GUARDIAN_TO_STUDENT",
          status: { in: ["PENDING", "EXPIRED"] },
        },
        orderBy: { createdAt: "desc" },
      })
    : [];

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Connect with Student</h1>
        <p className="mt-2 text-gray-600">
          Generate an invitation code for your child to connect their student account with your
          guardian account.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="md:col-span-2">
          <GuardianConnectForm
            guardianEmail={session.user.email}
            existingLinks={linkedStudents.length}
          />
        </div>

        <div className="md:col-span-2">
          <h2 className="text-lg font-semibold">Connected Students & Invitations</h2>
          <p className="mt-1 text-sm text-gray-600">
            Students who have accepted your invitation, and your recent invitation codes.
          </p>
          {linkedStudents.length === 0 && pendingInvitations.length === 0 ? (
            <div className="mt-4 rounded-lg bg-gray-50 p-8 text-center">
              <p className="text-gray-700">No students connected yet.</p>
              <p className="mt-1 text-sm text-gray-500">
                Create an invitation code and share it with your child.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {linkedStudents.map((link) => (
                <div
                  key={link.id}
                  className="flex items-center justify-between rounded-lg border bg-white p-4 shadow-sm"
                >
                  <div>
                    <p className="font-semibold">{link.student.name}</p>
                    <p className="text-sm text-gray-600">{link.student.email}</p>
                  </div>
                  <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800">
                    Connected
                  </span>
                </div>
              ))}
              {pendingInvitations.map((inv) => {
                const isExpired = new Date(inv.expiresAt) < new Date() || inv.status === "EXPIRED";
                return (
                  <div
                    key={inv.id}
                    className={`flex items-center justify-between rounded-lg border bg-white p-4 shadow-sm ${isExpired ? 'opacity-60' : ''}`}
                  >
                    <div>
                      <p className="font-semibold">{inv.studentEmail || "Unknown Student"}</p>
                      <p className="text-sm text-gray-600">
                        Code: <span className="font-mono">{inv.code}</span>
                      </p>
                    </div>
                    {isExpired ? (
                      <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-800">
                        Expired
                      </span>
                    ) : (
                      <span className="rounded-full bg-yellow-100 px-3 py-1 text-sm font-medium text-yellow-800">
                        Pending
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
