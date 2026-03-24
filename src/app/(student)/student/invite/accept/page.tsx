"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

interface InvitationDetails {
  id: string;
  type: string;
  status: string;
  canAccept: boolean;
  acceptReason: string | null;
  course: {
    id: string;
    title: string;
  } | null;
  createdBy: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  expiresAt: string;
}

export default function StudentInviteAcceptPage() {
  const searchParams = useSearchParams();
  const codeParam = searchParams.get("code");

  const [inviteCode, setInviteCode] = useState(codeParam || "");
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (codeParam) {
      verifyCode(codeParam);
    }
  }, [codeParam]);

  const verifyCode = async (code: string) => {
    if (!code || code.length !== 6) {
      setError("Please enter a valid 6-character code");
      return;
    }

    setLoading(true);
    setError(null);
    setInvitation(null);

    try {
      const res = await fetch(`/api/invitations/${code}`);
      const json: ApiResponse<InvitationDetails> = await res.json();

      if (!res.ok) {
        setError(json.error || "Invalid invitation code");
        return;
      }

      setInvitation(json.data!);
    } catch (err) {
      setError("Failed to verify invitation code");
    } finally {
      setLoading(false);
    }
  };

  const acceptInvitation = async () => {
    if (!invitation) return;

    setAccepting(true);
    setError(null);

    try {
      const res = await fetch(`/api/invitations/${inviteCode}/accept`, {
        method: "POST",
      });

      const json: ApiResponse<{
        type: string;
        enrollment?: {
          course: { id: string; title: string };
        };
        connection?: unknown;
      }> = await res.json();

      if (!res.ok) {
        setError(json.error || "Failed to accept invitation");
        setAccepting(false);
        return;
      }

      setSuccess(true);
    } catch (err) {
      setError("Failed to accept invitation");
      setAccepting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    verifyCode(inviteCode);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("ko-KR", {
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Accept Invitation</h1>
      <p className="text-gray-600 mb-6">
        Enter your invitation code to enroll in a course or connect with your guardian.
      </p>

      {success ? (
        <Card className="border-green-500/50 bg-green-500/5">
          <CardContent className="pt-6 text-center">
            <div className="text-4xl mb-4">🎉</div>
            <h2 className="text-xl font-bold text-green-700 dark:text-green-400 mb-2">
              Invitation Accepted!
            </h2>
            <p className="text-muted-foreground mb-4">
              {invitation?.type === "STUDENT_TO_COURSE"
                ? `You are now enrolled in ${invitation?.course?.title}`
                : "You are now connected with your guardian"}
            </p>
            <Button onClick={() => (window.location.href = "/student/dashboard")}>
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Code Input Form */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Enter Invitation Code</CardTitle>
              <CardDescription>
                Enter the 6-character code provided by your teacher or guardian
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Input
                    type="text"
                    placeholder="ABC123"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    maxLength={6}
                    className="font-mono text-center text-lg tracking-widest uppercase"
                    disabled={loading}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={loading || !inviteCode}
                  className="w-full"
                >
                  {loading ? "Verifying..." : "Verify Code"}
                </Button>
              </form>

              {error && (
                <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <p className="text-destructive text-sm" role="alert">
                    {error}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Invitation Details */}
          {invitation && (
            <Card>
              <CardHeader>
                <CardTitle>
                  {invitation.type === "STUDENT_TO_COURSE" ? "Course Invitation" : "Guardian Invitation"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {invitation.type === "STUDENT_TO_COURSE" && invitation.course && (
                  <div>
                    <p className="text-sm text-muted-foreground">Course</p>
                    <p className="font-medium text-lg">{invitation.course.title}</p>
                  </div>
                )}

                {invitation.type === "GUARDIAN_TO_STUDENT" && (
                  <div>
                    <p className="text-sm text-muted-foreground">Invited by</p>
                    <p className="font-medium text-lg">{invitation.createdBy.name}</p>
                    <p className="text-sm text-muted-foreground">{invitation.createdBy.email}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Expires</p>
                    <p>{formatDate(invitation.expiresAt)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Status</p>
                    <p className="capitalize">{invitation.status.toLowerCase()}</p>
                  </div>
                </div>

                {!invitation.canAccept && (
                  <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                    <p className="text-destructive text-sm">{invitation.acceptReason}</p>
                  </div>
                )}

                {invitation.canAccept && (
                  <Button
                    onClick={acceptInvitation}
                    disabled={accepting}
                    className="w-full"
                    size="lg"
                  >
                    {accepting
                      ? "Accepting..."
                      : invitation.type === "STUDENT_TO_COURSE"
                        ? "Enroll in Course"
                        : "Connect with Guardian"}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Help Section */}
          <Card className="mt-6 bg-muted/50">
            <CardContent className="pt-4">
              <h3 className="font-medium mb-2">Need help?</h3>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                <li>Make sure you entered the code correctly</li>
                <li>Check that the invitation hasn't expired</li>
                <li>Contact your teacher or guardian if the code doesn't work</li>
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
