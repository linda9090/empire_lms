"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

interface GuardianConnection {
  id: string;
  guardian: {
    id: string;
    name: string;
    email: string;
  };
  createdAt: string;
}

export default function GuardianConnectPage() {
  const [connections, setConnections] = useState<GuardianConnection[]>([]);
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchConnections = async () => {
    // Fetch guardian-student relationships where current user is the student
    try {
      const res = await fetch("/api/guardians/my-guardians");
      if (res.ok) {
        const json: ApiResponse<GuardianConnection[]> = await res.json();
        if (json.data) setConnections(json.data);
      }
    } catch (err) {
      console.error("Failed to fetch connections:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!inviteCode.trim()) {
      setError("Please enter an invitation code");
      return;
    }

    if (inviteCode.length !== 6) {
      setError("Invalid code format. Code must be 6 characters.");
      return;
    }

    setLoading(true);

    try {
      // First verify the code
      const verifyRes = await fetch(`/api/invitations/${inviteCode}`);
      const verifyJson: ApiResponse<{
        type: string;
        canAccept: boolean;
        acceptReason: string | null;
      }> = await verifyRes.json();

      if (!verifyRes.ok || !verifyJson.data) {
        setError(verifyJson.error || "Invalid invitation code");
        setLoading(false);
        return;
      }

      const { type, canAccept, acceptReason } = verifyJson.data;

      if (type !== "GUARDIAN_TO_STUDENT") {
        setError("This is not a guardian invitation code");
        setLoading(false);
        return;
      }

      if (!canAccept) {
        setError(acceptReason || "You cannot accept this invitation");
        setLoading(false);
        return;
      }

      // Accept the invitation
      const acceptRes = await fetch(`/api/invitations/${inviteCode}/accept`, {
        method: "POST",
      });

      const acceptJson: ApiResponse<{
        type: string;
        connection: GuardianConnection;
      }> = await acceptRes.json();

      if (!acceptRes.ok) {
        setError(acceptJson.error || "Failed to accept invitation");
        setLoading(false);
        return;
      }

      setSuccess("Successfully connected to guardian!");
      setInviteCode("");
      fetchConnections();
    } catch (err) {
      setError("Failed to connect. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Connect with Guardian</h1>
      <p className="text-gray-600 mb-6">
        Enter the invitation code from your guardian to connect your account.
      </p>

      {/* Connect Form */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Enter Invitation Code</CardTitle>
          <CardDescription>
            Your guardian can generate a code from their dashboard
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Input
                type="text"
                placeholder="Enter 6-character code"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                maxLength={6}
                className="font-mono text-center text-lg tracking-widest uppercase"
                disabled={loading}
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Connecting..." : "Connect"}
            </Button>
          </form>

          {error && (
            <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            </div>
          )}

          {success && (
            <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
              <p className="text-green-700 dark:text-green-400 text-sm" role="status">
                {success}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Connected Guardians */}
      {connections.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Connected Guardians</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {connections.map((conn) => (
                <div
                  key={conn.id}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div>
                    <p className="font-medium">{conn.guardian.name}</p>
                    <p className="text-sm text-muted-foreground">{conn.guardian.email}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(conn.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      <Card className="mt-6 bg-muted/50">
        <CardContent className="pt-4">
          <h3 className="font-medium mb-2">How to get an invitation code?</h3>
          <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
            <li>Ask your guardian to log into their account</li>
            <li>They can generate an invitation code from their dashboard</li>
            <li>Enter the 6-character code above to connect</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
