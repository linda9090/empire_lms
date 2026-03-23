import { redirect } from "next/navigation";
import { getSession } from "@/lib/get-session";
import ShellLayout from "@/components/shared/ShellLayout";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/student/dashboard" },
  { label: "Courses", href: "/student/courses" },
];

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  if (session.user.role !== "STUDENT" && session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  return (
    <ShellLayout
      role="Student"
      userName={session.user.name}
      navItems={NAV_ITEMS}
    >
      {children}
    </ShellLayout>
  );
}
