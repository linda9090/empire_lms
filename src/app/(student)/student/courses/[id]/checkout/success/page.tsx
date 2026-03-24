import { redirect } from "next/navigation";
import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import Link from "next/link";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ session_id?: string; payment_id?: string }>;
}

export default async function CheckoutSuccessPage({
  params,
  searchParams,
}: PageProps) {
  const session = await getSession();

  if (!session?.user) {
    redirect("/login");
  }

  const { id: courseId } = await params;
  const { session_id: sessionId, payment_id: paymentId } = await searchParams;

  // Verify enrollment exists
  const enrollment = await db.enrollment.findFirst({
    where: {
      userId: session.user.id,
      courseId,
      deletedAt: null,
    },
    include: {
      course: {
        select: {
          id: true,
          title: true,
          imageUrl: true,
        },
      },
    },
  });

  if (!enrollment) {
    // If no enrollment yet, webhook might still be processing
    // Show a loading state or redirect to course page
    return (
      <div className="max-w-md mx-auto p-6 text-center">
        <div className="mb-8">
          <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-yellow-600 animate-spin"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold mb-2">Processing Your Enrollment</h1>
          <p className="text-gray-600">
            We're setting up your course access. This may take a few seconds.
          </p>
        </div>
        <Link
          href={`/student/courses/${courseId}`}
          className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
        >
          Go to Course
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto p-6 text-center">
      {/* Success Icon */}
      <div className="mb-8">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-10 h-10 text-green-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h1 className="text-3xl font-bold mb-2">Payment Successful!</h1>
        <p className="text-gray-600">
          You are now enrolled in <strong>{enrollment.course.title}</strong>
        </p>
      </div>

      {/* Course Card */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6 text-left">
        <div className="flex gap-4">
          {enrollment.course.imageUrl && (
            <img
              src={enrollment.course.imageUrl}
              alt={enrollment.course.title}
              className="w-20 h-20 object-cover rounded"
            />
          )}
          <div className="flex-1">
            <h3 className="font-semibold">{enrollment.course.title}</h3>
            <p className="text-sm text-green-600 font-medium mt-1">
              ✓ Enrolled
            </p>
          </div>
        </div>
      </div>

      {/* Receipt Info */}
      {paymentId && (
        <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
          <p className="text-sm text-gray-600">
            <strong>Receipt:</strong> A confirmation email has been sent to{" "}
            {session.user.email}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Payment ID: {paymentId}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="space-y-3">
        <Link
          href={`/student/courses/${courseId}`}
          className="block w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors text-center"
        >
          Start Learning
        </Link>
        <Link
          href="/student/dashboard"
          className="block w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 px-6 rounded-lg transition-colors text-center"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
