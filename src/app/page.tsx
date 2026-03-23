import Link from "next/link";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="mb-4 text-4xl font-bold">Empire LMS</h1>
      <p className="mb-8 text-gray-600">Global Learning Management System</p>
      <div className="flex gap-4">
        <Link
          href="/login"
          className="rounded bg-blue-600 px-6 py-2 text-white hover:bg-blue-700"
        >
          Log In
        </Link>
        <Link
          href="/register"
          className="rounded border border-blue-600 px-6 py-2 text-blue-600 hover:bg-blue-50"
        >
          Sign Up
        </Link>
      </div>
    </div>
  );
}
