"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface CheckoutButtonProps {
  courseId: string;
  isFree: boolean;
  price: number | null;
}

export function CheckoutButton({
  courseId,
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
        router.push(checkoutUrl);
      } else {
        window.location.assign(checkoutUrl);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Error Display - Mobile Optimized */}
      {error && (
        <div
          role="alert"
          aria-live="polite"
          className="bg-red-50 border-l-4 border-red-500 rounded-r-lg p-4 sm:p-5 shadow-sm"
        >
          <div className="flex items-start gap-3">
            {/* Error Icon */}
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-red-100 flex items-center justify-center mt-0.5">
              <svg
                className="w-4 h-4 text-red-600"
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

            {/* Error Message */}
            <div className="flex-1 min-w-0">
              <p className="text-red-800 font-semibold text-sm sm:text-base mb-1">
                Checkout Error
              </p>
              <p className="text-red-700 text-sm leading-relaxed break-words">
                {error}
              </p>
            </div>

            {/* Dismiss Button */}
            <button
              onClick={() => setError(null)}
              className="flex-shrink-0 p-1 hover:bg-red-100 rounded-full transition-colors"
              aria-label="Dismiss error"
            >
              <svg
                className="w-4 h-4 text-red-600"
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
            </button>
          </div>

          {/* Suggested Actions */}
          <div className="mt-3 pt-3 border-t border-red-200">
            <p className="text-xs text-red-600">
              Please try again or contact support if the issue persists.
            </p>
          </div>
        </div>
      )}

      {/* Checkout Button */}
      <button
        onClick={handleCheckout}
        disabled={isLoading}
        className="w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:bg-gray-400 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-200 flex items-center justify-center gap-3 text-base sm:text-lg shadow-sm hover:shadow-md disabled:shadow-none min-h-[56px] touch-manipulation"
      >
        {isLoading ? (
          <>
            <svg
              className="animate-spin h-5 w-5 sm:h-6 sm:w-6"
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
            <span>Processing...</span>
          </>
        ) : isFree ? (
          <>
            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>Enroll for Free</span>
          </>
        ) : (
          <>
            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
            <span>Proceed to Payment - ${price?.toFixed(2)}</span>
          </>
        )}
      </button>

      {/* Terms Notice */}
      <p className="text-xs text-gray-500 text-center px-2 leading-relaxed">
        By proceeding, you agree to our{" "}
        <a href="/terms" className="underline hover:text-gray-700">
          Terms of Service
        </a>{" "}
        and{" "}
        <a href="/privacy" className="underline hover:text-gray-700">
          Privacy Policy
        </a>
        .
      </p>
    </div>
  );
}
