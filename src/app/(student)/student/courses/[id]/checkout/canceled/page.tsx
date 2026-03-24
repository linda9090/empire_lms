import { redirect } from "next/navigation";
import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import Link from "next/link";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ payment_id?: string }>;
}

export default async function CheckoutCanceledPage({
  params,
  searchParams,
}: PageProps) {
  const session = await getSession();

  if (!session?.user) {
    redirect("/login");
  }

  const { id: courseId } = await params;
  const { payment_id: paymentId } = await searchParams;

  // Get course details
  const course = await db.course.findFirst({
    where: { id: courseId, deletedAt: null },
    select: {
      id: true,
      title: true,
      price: true,
    },
  });

  if (!course) {
    redirect("/student/courses");
  }

  return (
    <div className="max-w-md mx-auto p-6 text-center">
      {/* Canceled Icon */}
      <div className="mb-8">
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-10 h-10 text-red-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>
        <h1 className="text-3xl font-bold mb-2">Payment Canceled</h1>
        <p className="text-gray-600">
          Your payment was canceled. You were not charged.
        </p>
      </div>

      {/* Course Info */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6 text-left">
        <h3 className="font-semibold text-lg">{course.title}</h3>
        <p className="text-gray-600 mt-1">
          Price: {course.price ? `$${course.price.toFixed(2)}` : "Free"}
        </p>
      </div>

      {/* Help Text */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-left">
        <p className="text-sm text-blue-900">
          <strong>Need help?</strong> If you experienced any issues during
          checkout, please contact our support team or try again.
        </p>
      </div>

      {/* Actions */}
      <div className="space-y-3">
        <Link
          href={`/student/courses/${courseId}/checkout`}
          className="block w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors text-center"
        >
          Try Again
        </Link>
        <Link
          href="/student/courses"
          className="block w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 px-6 rounded-lg transition-colors text-center"
        >
          Browse Other Courses
        </Link>
      </div>

      {paymentId && (
        <p className="text-xs text-gray-500 mt-4">
          Cancelled payment ID: {paymentId}
        </p>
      )}
    </div>
  );
}
