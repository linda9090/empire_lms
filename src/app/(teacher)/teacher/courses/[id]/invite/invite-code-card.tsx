"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Copy, Check, QrCode, Loader2 } from "lucide-react";

interface Invitation {
  id: string;
  code: string;
  expiresAt: Date;
  status: string;
}

interface InviteCodeCardProps {
  courseId: string;
  courseTitle: string;
  existingInvitations: Invitation[];
}

interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

export function InviteCodeCard({ courseId, courseTitle, existingInvitations }: InviteCodeCardProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newCode, setNewCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimit, setRateLimit] = useState<{ remaining: number; resetAt: string } | null>(null);

  const handleCreateCode = async () => {
    setIsCreating(true);
    setError(null);
    setNewCode(null);
    setShowQr(false);

    try {
      const response = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "STUDENT_TO_COURSE",
          courseId,
        }),
      });

      const result: ApiResponse<{ code: string; expiresAt: string }> = await response.json();

      // Check for rate limit headers
      const remaining = response.headers.get("X-RateLimit-Remaining");
      const resetAt = response.headers.get("X-RateLimit-Reset");
      if (remaining && resetAt) {
        setRateLimit({ remaining: parseInt(remaining, 10), resetAt });
      }

      if (!response.ok) {
        if (response.status === 429) {
          setError(
            `Too many codes created. Try again after ${new Date(resetAt || "").toLocaleTimeString()}.`
          );
        } else {
          setError(result.error || "Failed to create invitation code");
        }
        return;
      }

      if (result.data) {
        setNewCode(result.data.code);
        setCopied(false);
      }
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopy = async () => {
    if (newCode) {
      await navigator.clipboard.writeText(newCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getQrCodeUrl = (code: string) => {
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(code)}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Invitation Code</CardTitle>
        <CardDescription>
          Generate a 6-character code that students can use to enroll in this course
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          onClick={handleCreateCode}
          disabled={isCreating || (rateLimit ? rateLimit.remaining === 0 : false)}
          size="lg"
        >
          {isCreating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            "Generate New Code"
          )}
        </Button>

        {rateLimit && rateLimit.remaining < 5 && (
          <p className="text-sm text-orange-600">
            {rateLimit.remaining} codes remaining this hour. Resets at{" "}
            {new Date(rateLimit.resetAt).toLocaleTimeString()}
          </p>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {newCode && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-lg border bg-gray-50 p-4">
                <p className="font-mono text-3xl font-bold tracking-wider text-center">
                  {newCode}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleCopy} variant="outline" className="flex-1">
                {copied ? (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy Code
                  </>
                )}
              </Button>
              <Button
                onClick={() => setShowQr(!showQr)}
                variant="outline"
                className="flex-1"
              >
                <QrCode className="mr-2 h-4 w-4" />
                {showQr ? "Hide QR" : "Show QR"}
              </Button>
            </div>

            {showQr && (
              <div className="flex justify-center p-4 bg-white rounded-lg border">
                <img
                  src={getQrCodeUrl(newCode)}
                  alt="QR Code"
                  className="w-48 h-48"
                />
              </div>
            )}

            <p className="text-sm text-gray-600">
              This code expires in 7 days and can only be used once. Share it with your students
              to enroll them in <strong>{courseTitle}</strong>.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
