import { redirect } from "next/navigation";
import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import Link from "next/link";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ payment_id?: string; already?: string }>;
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
  const { payment_id: paymentId, already } = await searchParams;

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

  // Processing state - webhook might still be processing
  if (!enrollment) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4 flex items-center justify-center">
        <div className="max-w-md w-full text-center">
          {/* Loading Icon */}
          <div className="mb-8">
            <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-10 h-10 text-yellow-600 animate-spin"
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
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">
              Processing Your Enrollment
            </h1>
            <p className="text-gray-600 text-base sm:text-lg leading-relaxed">
              We're setting up your course access. This may take a few seconds.
            </p>
          </div>

          {/* Auto-refresh notice */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-left">
            <p className="text-sm text-blue-900 font-medium mb-1">Please wait</p>
            <p className="text-sm text-blue-700">
              This page will update automatically once your enrollment is confirmed.
            </p>
          </div>

          <Link
            href="/student/courses"
            className="inline-block w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            Go to My Courses
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-md mx-auto">
        {/* Success Icon */}
        <div className="mb-8 text-center">
          <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg
              className="w-12 h-12 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">
            {already ? "Already Enrolled!" : "Payment Successful!"}
          </h1>
          <p className="text-gray-600 text-base sm:text-lg leading-relaxed">
            You are now enrolled in{" "}
            <strong className="text-gray-900">{enrollment.course.title}</strong>
          </p>
        </div>

        {/* Course Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-6">
          <div className="flex gap-4">
            {enrollment.course.imageUrl && (
              <img
                src={enrollment.course.imageUrl}
                alt={enrollment.course.title}
                className="w-20 h-20 object-cover rounded-lg flex-shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900 truncate">
                {enrollment.course.title}
              </h3>
              <div className="flex items-center gap-2 mt-2">
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-800 text-sm font-medium rounded-full">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>Enrolled</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Receipt Info */}
        {paymentId && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6">
            <div className="flex items-start gap-3">
              <svg
                className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700">
                  <strong>Receipt:</strong> A confirmation email has been sent to{" "}
                  <span className="break-all">{session.user.email}</span>
                </p>
                {paymentId && (
                  <p className="text-xs text-gray-500 mt-2 font-mono bg-white px-2 py-1 rounded border border-gray-200 inline-block">
                    Payment ID: {paymentId}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-3">
          <Link
            href={`/student/courses/${courseId}`}
            className="block w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-4 px-6 rounded-xl transition-colors text-center text-base"
          >
            Start Learning
          </Link>
          <Link
            href="/student/courses"
            className="block w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 px-6 rounded-xl transition-colors text-center text-sm"
          >
            View All My Courses
          </Link>
        </div>
      </div>
    </div>
  );
}
