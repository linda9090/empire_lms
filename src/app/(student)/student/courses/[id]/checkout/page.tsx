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
    redirect(`/student/courses/${courseId}`);
  }

  const isFree = !course.price || course.price === 0;

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Checkout</h1>
        <p className="text-gray-600 mt-2">Complete your enrollment</p>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        {/* Course Info */}
        <div className="flex gap-4 mb-6">
          {course.imageUrl && (
            <img
              src={course.imageUrl}
              alt={course.title}
              className="w-32 h-32 object-cover rounded"
            />
          )}
          <div className="flex-1">
            <h2 className="text-xl font-semibold">{course.title}</h2>
            {course.description && (
              <p className="text-gray-600 text-sm mt-1 line-clamp-2">
                {course.description}
              </p>
            )}
            {course.teacher && (
              <p className="text-sm text-gray-500 mt-2">
                Instructor: {course.teacher.name}
              </p>
            )}
          </div>
        </div>

        <hr className="my-4" />

        {/* Price Summary */}
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-600">Course Price</span>
            <span className="font-semibold">
              {isFree ? "Free" : `$${course.price?.toFixed(2)}`}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Discount</span>
            <span className="text-green-600">$0.00</span>
          </div>
          <hr className="my-2" />
          <div className="flex justify-between text-lg">
            <span className="font-bold">Total</span>
            <span className="font-bold">
              {isFree ? "Free" : `$${course.price?.toFixed(2)}`}
            </span>
          </div>
        </div>
      </div>

      {/* Payment Info */}
      {!isFree && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-3">
            <svg
              className="w-6 h-6 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div>
              <p className="font-medium text-blue-900">Secure Payment</p>
              <p className="text-sm text-blue-700">
                Powered by Stripe. Your payment information is secure.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Checkout Action */}
      <CheckoutButton
        courseId={courseId}
        courseTitle={course.title}
        isFree={isFree}
        price={course.price}
      />
    </div>
  );
}
