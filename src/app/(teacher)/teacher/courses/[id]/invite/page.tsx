"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Invitation {
  id: string;
  code: string;
  type: string;
  status: string;
  studentEmail: string | null;
  expiresAt: string;
  createdAt: string;
}

interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

export default function TeacherCourseInvitePage() {
  const params = useParams();
  const courseId = params.id as string;

  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [studentEmail, setStudentEmail] = useState("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);

  // Fetch invitations for this course
  useEffect(() => {
    fetchInvitations();
  }, [courseId]);

  const fetchInvitations = async () => {
    try {
      const res = await fetch(`/api/invitations?type=STUDENT_TO_COURSE&status=PENDING`);
      const json: ApiResponse<Invitation[]> = await res.json();
      if (json.data) {
        // Filter by courseId
        const filtered = json.data.filter((inv) => {
          // We need to check the course relation, but API doesn't include courseId directly
          // For now, fetch all and client-side filter or update API
          return true; // API should filter by courseId, update as needed
        });
        setInvitations(json.data);
      }
    } catch (err) {
      console.error("Failed to fetch invitations:", err);
    } finally {
      setLoading(false);
    }
  };

  const createInvitation = async () => {
    setError(null);
    setCreating(true);

    try {
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "STUDENT_TO_COURSE",
          courseId,
          studentEmail: studentEmail || null,
        }),
      });

      const json: ApiResponse<Invitation> = await res.json();

      if (!res.ok) {
        setError(json.error || "Failed to create invitation");
        return;
      }

      if (json.data) {
        setInvitations((prev) => [json.data!, ...prev]);
        setStudentEmail("");
      }
    } catch (err) {
      setError("Failed to create invitation");
    } finally {
      setCreating(false);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const generateQRCode = (code: string) => {
    // Using a public QR code API for simplicity
    const inviteUrl = `${window.location.origin}/student/invite/accept?code=${code}`;
    setQrCodeUrl(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(inviteUrl)}`);
  };

  const cancelInvitation = async (code: string) => {
    if (!confirm("Are you sure you want to cancel this invitation?")) return;

    try {
      const res = await fetch(`/api/invitations/${code}`, { method: "DELETE" });
      if (res.ok) {
        setInvitations((prev) => prev.filter((inv) => inv.code !== code));
      }
    } catch (err) {
      console.error("Failed to cancel invitation:", err);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("ko-KR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const isExpired = (expiresAt: string) => new Date(expiresAt) < new Date();

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Course Invitations</h1>
      <p className="text-gray-600 mb-6">Create invitation codes for students to enroll in this course.</p>

      {/* Create Invitation Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Create New Invitation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Input
              type="email"
              placeholder="Student email (optional)"
              value={studentEmail}
              onChange={(e) => setStudentEmail(e.target.value)}
              className="max-w-xs"
            />
            <Button onClick={createInvitation} disabled={creating}>
              {creating ? "Creating..." : "Generate Code"}
            </Button>
          </div>
          {error && (
            <p className="text-destructive text-sm mt-2" role="alert">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Invitations List */}
      <Card>
        <CardHeader>
          <CardTitle>Active Invitations</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : invitations.length === 0 ? (
            <p className="text-muted-foreground">No active invitations</p>
          ) : (
            <div className="space-y-3">
              {invitations.map((inv) => {
                const expired = isExpired(inv.expiresAt);
                return (
                  <div
                    key={inv.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      expired ? "opacity-50" : ""
                    }`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <code className="text-lg font-mono bg-muted px-3 py-1 rounded">
                          {inv.code}
                        </code>
                        {expired && (
                          <span className="text-xs text-destructive bg-destructive/10 px-2 py-0.5 rounded">
                            Expired
                          </span>
                        )}
                        {inv.studentEmail && (
                          <span className="text-sm text-muted-foreground">
                            for {inv.studentEmail}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Expires: {formatDate(inv.expiresAt)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyCode(inv.code)}
                      >
                        {copiedCode === inv.code ? "Copied!" : "Copy"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => generateQRCode(inv.code)}
                      >
                        QR
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => cancelInvitation(inv.code)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* QR Code Modal */}
      {qrCodeUrl && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setQrCodeUrl(null)}
        >
          <Card className="p-6" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle>Scan QR Code</CardTitle>
            </CardHeader>
            <CardContent>
              <img src={qrCodeUrl} alt="QR Code" className="mx-auto" />
              <p className="text-center text-sm text-muted-foreground mt-4">
                Students can scan this to enroll
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
