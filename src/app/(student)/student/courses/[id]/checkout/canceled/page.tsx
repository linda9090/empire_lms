import Link from "next/link";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CheckoutCanceledPage({ params }: PageProps) {
  const { id: courseId } = await params;

  return (
    <div className="max-w-lg mx-auto p-6">
      <div className="bg-white rounded-lg shadow-md p-8 text-center">
        <div className="mb-6">
          <svg
            className="mx-auto h-16 w-16 text-red-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-bold mb-4">Payment Canceled</h1>

        <p className="text-gray-600 mb-6">
          You canceled the payment process. You haven&apos;t been charged.
        </p>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-amber-800">
            If you changed your mind, you can return to the checkout page
            anytime to complete your enrollment.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href={`/student/courses/${courseId}/checkout`}
            className="inline-flex justify-center items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
          >
            Try Again
          </Link>
          <Link
            href="/student/courses"
            className="inline-flex justify-center items-center px-6 py-3 border border-gray-300 text-base font-medium rounded-md text-gray-700 hover:bg-gray-50"
          >
            Browse Courses
          </Link>
        </div>
      </div>
    </div>
  );
}
