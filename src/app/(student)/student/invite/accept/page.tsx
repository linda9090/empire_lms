import { getSession } from "@/lib/get-session";
import type { UserRole } from "@/types";
import { AcceptInviteForm } from "./accept-invite-form";
import { redirect } from "next/navigation";

export default async function StudentAcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; type?: string }>;
}) {
  const session = await getSession();

  if (!session?.user) {
    redirect("/auth/signin?callbackUrl=/student/invite/accept");
  }

  const userRole = session.user.role as UserRole;
  if (userRole !== "STUDENT" && userRole !== "ADMIN") {
    return (
      <div className="p-6">
        <p className="text-red-600">Forbidden: Student access required</p>
      </div>
    );
  }

  const params = await searchParams;
  const initialCode = params.code || "";
  const initialType = params.type || "";

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold">Accept Invitation</h1>
        <p className="mt-2 text-gray-600">
          Enter the invitation code you received to enroll in a course or connect with your
          guardian
        </p>
      </div>

      <AcceptInviteForm
        initialCode={initialCode}
        initialType={initialType}
        studentEmail={session.user.email}
      />
    </div>
  );
}
