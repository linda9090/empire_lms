import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { CheckoutButton } from "./checkout-button";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CheckoutPage({ params }: PageProps) {
  const session = await getSession();

  if (!session?.user) {
    redirect("/login");
  }

  const { id: courseId } = await params;

  // Get course details
  const course = await db.course.findFirst({
    where: { id: courseId, deletedAt: null },
    select: {
      id: true,
      title: true,
      description: true,
      imageUrl: true,
      price: true,
      teacher: {
        select: { name: true },
      },
    },
  });

  if (!course) {
    notFound();
  }

  // Check if already enrolled
  const existingEnrollment = await db.enrollment.findFirst({
    where: {
      userId: session.user.id,
      courseId,
      deletedAt: null,
    },
  });

  if (existingEnrollment) {
    redirect(`/student/courses/${courseId}/checkout/success?already=1`);
  }

  const isFree = !course.price || course.price === 0;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Checkout</h1>
          <p className="text-gray-600 mt-2 text-base sm:text-lg">Complete your enrollment</p>
        </div>

        {/* Course Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 mb-6">
          {/* Course Info */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            {course.imageUrl && (
              <img
                src={course.imageUrl}
                alt={course.title}
                className="w-full sm:w-32 h-48 sm:h-32 object-cover rounded-lg"
              />
            )}
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-gray-900 line-clamp-2">{course.title}</h2>
              {course.description && (
                <p className="text-gray-600 text-sm mt-2 line-clamp-2">
                  {course.description}
                </p>
              )}
              {course.teacher && (
                <p className="text-sm text-gray-500 mt-3 flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span>Instructor: {course.teacher.name}</span>
                </p>
              )}
            </div>
          </div>

          <hr className="my-4 border-gray-200" />

          {/* Price Summary */}
          <div className="space-y-3">
            <div className="flex justify-between items-baseline">
              <span className="text-gray-600 text-sm sm:text-base">Course Price</span>
              <span className="font-semibold text-gray-900 text-base sm:text-lg">
                {isFree ? "Free" : `$${course.price?.toFixed(2)}`}
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-gray-600 text-sm sm:text-base">Discount</span>
              <span className="text-green-600 font-medium text-sm sm:text-base">$0.00</span>
            </div>
            <hr className="my-3 border-gray-200" />
            <div className="flex justify-between items-baseline text-lg sm:text-xl">
              <span className="font-bold text-gray-900">Total</span>
              <span className="font-bold text-indigo-600">
                {isFree ? "Free" : `$${course.price?.toFixed(2)}`}
              </span>
            </div>
          </div>
        </div>

        {/* Payment Info */}
        {!isFree && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 sm:p-5 mb-6">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-blue-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-blue-900 text-sm sm:text-base">Secure Payment</p>
                <p className="text-sm text-blue-700 mt-1 leading-relaxed">
                  Powered by Stripe. Your payment information is secure and encrypted.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Checkout Action */}
        <CheckoutButton
          courseId={courseId}
          isFree={isFree}
          price={course.price}
        />
      </div>
    </div>
  );
}
