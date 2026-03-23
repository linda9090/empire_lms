import { redirect } from "next/navigation";
import { getSession } from "@/lib/get-session";
import ShellLayout from "@/components/shared/ShellLayout";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/guardian/dashboard" },
];

export default async function GuardianLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  if (session.user.role !== "GUARDIAN" && session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  return (
    <ShellLayout
      role="Guardian"
      userName={session.user.name}
      navItems={NAV_ITEMS}
    >
      {children}
    </ShellLayout>
  );
}
