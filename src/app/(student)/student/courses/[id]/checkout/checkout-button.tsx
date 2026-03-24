"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface CheckoutButtonProps {
  courseId: string;
  courseTitle: string;
  isFree: boolean;
  price: number | null;
}

export function CheckoutButton({
  courseId,
  courseTitle,
  isFree,
  price,
}: CheckoutButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCheckout = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ courseId }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to create checkout session");
      }

      const { checkoutUrl, freeCourse, mockMode } = result.data;

      if (freeCourse || mockMode) {
        // Free course or mock mode: redirect directly to course
        router.push(checkoutUrl);
      } else {
        // Paid course: redirect to Stripe Checkout
        window.location.href = checkoutUrl;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      )}

      <button
        onClick={handleCheckout}
        disabled={isLoading}
        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-semibold py-4 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
      >
        {isLoading ? (
          <>
            <svg
              className="animate-spin h-5 w-5"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Processing...
          </>
        ) : isFree ? (
          "Enroll for Free"
        ) : (
          `Proceed to Payment - $${price?.toFixed(2)}`
        )}
      </button>

      <p className="text-xs text-gray-500 text-center">
        By proceeding, you agree to our Terms of Service and Privacy Policy.
      </p>
    </div>
  );
}
