import { redirect } from "next/navigation";
import { getSession } from "@/lib/get-session";

export default async function DashboardRedirectPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const role = session.user.role as string;

  switch (role) {
    case "TEACHER":
      redirect("/teacher/dashboard");
    case "STUDENT":
      redirect("/student/dashboard");
    case "GUARDIAN":
      redirect("/guardian/dashboard");
    case "ADMIN":
      redirect("/admin/dashboard");
    default:
      redirect("/student/dashboard");
  }
}
