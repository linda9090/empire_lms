import { getSession } from "@/lib/get-session";

export default async function AdminDashboardPage() {
  const session = await getSession();

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Admin Dashboard</h1>
      <p className="mt-2 text-gray-600">
        Welcome back, {session?.user.name}
      </p>
    </div>
  );
}
