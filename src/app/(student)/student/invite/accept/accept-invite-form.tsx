"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Loader2, AlertCircle, User, BookOpen } from "lucide-react";

interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

interface AcceptInviteFormProps {
  initialCode: string;
  initialType: string;
  studentEmail: string;
}

type InvitationType = "STUDENT_TO_COURSE" | "GUARDIAN_TO_STUDENT";

export function AcceptInviteForm({
  initialCode,
  initialType,
  studentEmail,
}: AcceptInviteFormProps) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode);
  const [isValidating, setIsValidating] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [invitationType, setInvitationType] = useState<InvitationType | null>(
    initialType as InvitationType | null
  );
  const [invitationDetails, setInvitationDetails] = useState<any>(null);
  const [rateLimit, setRateLimit] = useState<{ resetAt: string } | null>(null);

  // Auto-validate if initial code is provided
  useEffect(() => {
    if (initialCode && initialCode.length === 6) {
      validateCode(initialCode);
    }
  }, [initialCode]);

  const validateCode = async (codeToValidate: string) => {
    if (codeToValidate.length !== 6) {
      setError("Invitation code must be 6 characters");
      return;
    }

    setIsValidating(true);
    setError(null);
    setInvitationDetails(null);

    try {
      const response = await fetch(`/api/invitations/${codeToValidate}`);

      const result: ApiResponse<any> = await response.json();

      // Check for rate limit
      const resetAt = response.headers.get("X-RateLimit-Reset");
      if (response.status === 429 && resetAt) {
        setError(
          `Too many attempts. Try again after ${new Date(resetAt).toLocaleTimeString()}.`
        );
        setRateLimit({ resetAt });
        return;
      }

      if (!response.ok) {
        if (response.status === 404) {
          setError("Invitation code not found");
        } else if (response.status === 410) {
          setError(result.data?.status === "EXPIRED"
            ? "This invitation code has expired"
            : result.error || "Invitation no longer valid");
        } else if (response.status === 409) {
          setError("This invitation code has already been used");
        } else {
          setError(result.error || "Failed to validate invitation code");
        }
        return;
      }

      if (result.data) {
        setInvitationType(result.data.type);
        setInvitationDetails(result.data);
      }
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setIsValidating(false);
    }
  };

  const handleAcceptInvite = async () => {
    if (!code || code.length !== 6) {
      setError("Please enter a valid 6-character code");
      return;
    }

    setIsAccepting(true);
    setError(null);

    try {
      const response = await fetch(`/api/invitations/${code}`, {
        method: "POST",
      });

      const result: ApiResponse<any> = await response.json();

      // Check for rate limit
      const resetAt = response.headers.get("X-RateLimit-Reset");
      if (response.status === 429 && resetAt) {
        setError(
          `Too many attempts. Try again after ${new Date(resetAt).toLocaleTimeString()}.`
        );
        setRateLimit({ resetAt });
        return;
      }

      if (!response.ok) {
        if (response.status === 401) {
          setError("Please sign in to accept this invitation");
        } else if (response.status === 403) {
          setError(result.error || "You don&apos;t have permission to accept this invitation");
        } else if (response.status === 409) {
          setError(
            result.error ||
              "You are already enrolled or this invitation has already been used"
          );
        } else if (response.status === 410) {
          setError("This invitation code has expired");
        } else {
          setError(result.error || "Failed to accept invitation");
        }
        return;
      }

      if (result.data) {
        setSuccess(true);

        // Redirect after a short delay
        setTimeout(() => {
          if (result.data.type === "STUDENT_TO_COURSE") {
            router.push(`/student/courses/${result.data.course.id}`);
          } else if (result.data.type === "GUARDIAN_TO_STUDENT") {
            router.push("/student/dashboard");
          }
        }, 2000);
      }
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setIsAccepting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!invitationType) {
      validateCode(code);
    } else {
      handleAcceptInvite();
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enter Invitation Code</CardTitle>
        <CardDescription>
          Enter the 6-character code shared by your teacher or guardian
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="code">Invitation Code</Label>
            <Input
              id="code"
              type="text"
              placeholder="ABC123"
              value={code}
              onChange={(e) => {
                const value = e.target.value.toUpperCase().slice(0, 6);
                setCode(value);
                if (value.length === 6 && !invitationType) {
                  validateCode(value);
                } else if (value.length !== 6) {
                  setInvitationType(null);
                  setInvitationDetails(null);
                  setError(null);
                }
              }}
              maxLength={6}
              className="font-mono text-center text-lg tracking-wider"
              disabled={isAccepting || success}
              required
            />
            <p className="text-xs text-gray-500 text-center">
              Enter the 6-character code (case-insensitive)
            </p>
          </div>

          {isValidating && (
            <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Validating invitation code...
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {invitationType && invitationDetails && !success && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 space-y-3">
              <div className="flex items-center gap-2 text-green-800">
                <Check className="h-5 w-5" />
                <span className="font-medium">Valid Invitation Code</span>
              </div>

              {invitationType === "STUDENT_TO_COURSE" && (
                <div className="flex items-start gap-3 text-sm">
                  <BookOpen className="h-5 w-5 text-green-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-green-800">Course Invitation</p>
                    <p className="text-green-700">
                      You&apos;ve been invited to enroll in{" "}
                      <strong>{invitationDetails.course?.title || "a course"}</strong>
                    </p>
                    <p className="mt-1 text-xs text-green-600">
                      Expires: {new Date(invitationDetails.expiresAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              )}

              {invitationType === "GUARDIAN_TO_STUDENT" && (
                <div className="flex items-start gap-3 text-sm">
                  <User className="h-5 w-5 text-green-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-green-800">Guardian Connection Request</p>
                    <p className="text-green-700">
                      <strong>{invitationDetails.creator?.name || "Your guardian"}</strong> (
                      {invitationDetails.guardianEmail}) wants to connect their guardian account
                      with your student account.
                    </p>
                    <p className="mt-1 text-xs text-green-600">
                      Expires: {new Date(invitationDetails.expiresAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              )}

              <Button
                type="submit"
                disabled={isAccepting}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                {isAccepting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Accepting...
                  </>
                ) : invitationType === "STUDENT_TO_COURSE" ? (
                  "Enroll in Course"
                ) : (
                  "Connect with Guardian"
                )}
              </Button>
            </div>
          )}

          {success && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 space-y-3">
              <div className="flex items-center gap-2 text-green-800">
                <Check className="h-5 w-5" />
                <span className="font-medium">Invitation Accepted!</span>
              </div>
              <p className="text-sm text-green-700">
                {invitationType === "STUDENT_TO_COURSE"
                  ? "You have been enrolled in the course. Redirecting..."
                  : "You have been connected with your guardian. Redirecting..."}
              </p>
            </div>
          )}

          {!invitationType && !isValidating && !error && code.length === 6 && (
            <Button type="submit" className="w-full" disabled={isValidating}>
              Validate Code
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
