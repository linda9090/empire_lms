import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <section className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wider text-red-600">
          401 Unauthorized
        </p>
        <h1 className="mt-3 text-2xl font-bold text-gray-900">Access denied</h1>
        <p className="mt-3 text-sm text-gray-600">
          Your account does not have permission to view this page.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/dashboard"
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Go to dashboard
          </Link>
          <Link
            href="/login"
            className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Log in again
          </Link>
        </div>
      </section>
    </main>
  );
}
