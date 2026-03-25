import { redirect } from "next/navigation";
import { getSession } from "@/lib/get-session";
import ShellLayout from "@/components/shared/ShellLayout";
import type { UserRole } from "@/types";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/teacher/dashboard" },
  { label: "My Courses", href: "/teacher/courses" },
];

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

  return (
    <ShellLayout
      role={session.user.role as UserRole}
      userName={session.user.name}
      navItems={NAV_ITEMS}
    >
      {children}
    </ShellLayout>
  );
}
