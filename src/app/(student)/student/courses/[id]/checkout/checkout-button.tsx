"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface CheckoutButtonProps {
  courseId: string;
  isFree: boolean;
  courseTitle: string;
}

export default function CheckoutButton({
  courseId,
  isFree,
  courseTitle,
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

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Checkout failed");
      }

      if (data.data.checkoutUrl) {
        window.location.href = data.data.checkoutUrl;
      } else if (data.data.message) {
        router.push(`/student/courses/${courseId}/checkout/success`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <button
        onClick={handleCheckout}
        disabled={isLoading}
        className="w-full bg-primary hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground text-primary-foreground font-semibold py-3 px-6 rounded-lg transition-colors"
      >
        {isLoading ? "Processing..." : isFree ? "Enroll Now" : "Proceed to Payment"}
      </button>

      <p className="text-center text-sm text-muted-foreground mt-4">
        {isFree
          ? "Enroll in this free course instantly"
          : "You will be redirected to complete your payment securely"}
      </p>
    </div>
  );
}
