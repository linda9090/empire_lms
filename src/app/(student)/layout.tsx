import { redirect } from "next/navigation";
import { getSession } from "@/lib/get-session";

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

  return <>{children}</>;
}
