import Link from "next/link";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CheckoutCanceledPage({ params }: PageProps) {
  const { id: courseId } = await params;

  return (
    <div className="max-w-lg mx-auto p-6">
      <div className="bg-card rounded-lg shadow-md p-8 text-center">
        <div className="mb-6">
          <svg
            className="mx-auto h-16 w-16 text-destructive"
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

        <p className="text-muted-foreground mb-6">
          You canceled the payment process. You haven&apos;t been charged.
        </p>

        <div className="bg-amber-500/10 border border-amber-500/50 dark:bg-amber-500/20 rounded-lg p-4 mb-6">
          <p className="text-sm text-amber-700 dark:text-amber-400">
            If you changed your mind, you can return to the checkout page
            anytime to complete your enrollment.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href={`/student/courses/${courseId}/checkout`}
            className="inline-flex justify-center items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-primary-foreground bg-primary hover:bg-primary/90"
          >
            Try Again
          </Link>
          <Link
            href="/student/courses"
            className="inline-flex justify-center items-center px-6 py-3 border border-input text-base font-medium rounded-md text-foreground hover:bg-accent"
          >
            Browse Courses
          </Link>
        </div>
      </div>
    </div>
  );
}
