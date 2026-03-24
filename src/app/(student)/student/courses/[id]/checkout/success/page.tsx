import { redirect } from "next/navigation";
import Link from "next/link";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ session_id?: string }>;
}

export default async function CheckoutSuccessPage({
  params,
  searchParams,
}: PageProps) {
  const { id: courseId } = await params;
  const { session_id } = await searchParams;

  if (!session_id) {
    redirect(`/student/courses/${courseId}`);
  }

  return (
    <div className="max-w-lg mx-auto p-6">
      <div className="bg-white rounded-lg shadow-md p-8 text-center">
        <div className="mb-6">
          <svg
            className="mx-auto h-16 w-16 text-green-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-bold mb-4">Payment Successful!</h1>

        <p className="text-gray-600 mb-6">
          Thank you for your purchase. You are now enrolled in the course.
        </p>

        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <p className="text-sm text-gray-500">
            Transaction ID: <span className="font-mono">{session_id}</span>
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href={`/student/courses/${courseId}`}
            className="inline-flex justify-center items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
          >
            Go to Course
          </Link>
          <Link
            href="/student/dashboard"
            className="inline-flex justify-center items-center px-6 py-3 border border-gray-300 text-base font-medium rounded-md text-gray-700 hover:bg-gray-50"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
