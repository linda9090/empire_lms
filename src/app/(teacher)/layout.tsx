import { redirect } from "next/navigation";
import { getSession } from "@/lib/get-session";

export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  if (session.user.role !== "TEACHER" && session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
