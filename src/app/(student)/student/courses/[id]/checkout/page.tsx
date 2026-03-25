import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/get-session";
import CheckoutButton from "./checkout-button";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CheckoutPage({ params }: PageProps) {
  const session = await getSession();

  if (!session?.user) {
    redirect("/login");
  }

  const { id: courseId } = await params;

  const response = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/payments/checkout?courseId=${courseId}`,
    {
      cache: "no-store",
      headers: {
        Cookie: `better-auth.session_token=${session.session.token}`,
      },
    }
  );

  if (!response.ok) {
    if (response.status === 404) {
      notFound();
    }
    throw new Error("Failed to fetch course information");
  }

  const { data } = await response.json();

  if (data.isEnrolled) {
    redirect(`/student/courses/${courseId}`);
  }

  const { course } = data;
  const isFree = !course.price || course.price === 0;

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="bg-card rounded-lg shadow-md p-8">
        <h1 className="text-2xl font-bold mb-6">Checkout</h1>

        <div className="mb-6">
          <img
            src={course.imageUrl ?? "/placeholder-course.png"}
            alt={course.title}
            className="w-full h-48 object-cover rounded-lg mb-4"
          />
          <h2 className="text-xl font-semibold">{course.title}</h2>
          {course.teacher && (
            <p className="text-sm text-muted-foreground mt-1">
              Instructor: {course.teacher.name}
            </p>
          )}
        </div>

        <div className="border-t pt-4 mb-6">
          <div className="flex justify-between items-center">
            <span className="text-foreground">Course Price</span>
            <span className="text-2xl font-bold">
              {isFree ? "Free" : `$${course.price?.toFixed(2) ?? "0.00"}`}
            </span>
          </div>
        </div>

        <CheckoutButton
          courseId={courseId}
          isFree={isFree}
          courseTitle={course.title}
        />
      </div>
    </div>
  );
}
