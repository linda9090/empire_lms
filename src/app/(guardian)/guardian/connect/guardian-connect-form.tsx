"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Copy, Check, Loader2 } from "lucide-react";

interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

interface GuardianConnectFormProps {
  guardianEmail: string;
  existingLinks: number;
}

export function GuardianConnectForm({ guardianEmail, existingLinks }: GuardianConnectFormProps) {
  const [studentEmail, setStudentEmail] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [newCode, setNewCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [rateLimit, setRateLimit] = useState<{ remaining: number; resetAt: string } | null>(null);

  const handleCreateCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    setError(null);
    setSuccess(false);
    setNewCode(null);

    try {
      const response = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "GUARDIAN_TO_STUDENT",
          studentEmail,
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
        } else if (response.status === 409) {
          setError("Guardian-student relationship already exists.");
        } else {
          setError(result.error || "Failed to create invitation code");
        }
        return;
      }

      if (result.data) {
        setNewCode(result.data.code);
        setSuccess(true);
        setCopied(false);
        setStudentEmail("");
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Invitation Code</CardTitle>
        <CardDescription>
          Enter your child&apos;s student email to generate a connection code
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleCreateCode} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="studentEmail">Student Email</Label>
            <Input
              id="studentEmail"
              type="email"
              placeholder="student@example.com"
              value={studentEmail}
              onChange={(e) => setStudentEmail(e.target.value)}
              required
              disabled={isCreating || success}
            />
            <p className="text-xs text-gray-500">
              The invitation will be sent to this email address.
            </p>
          </div>

          <Button
            type="submit"
            disabled={isCreating || !studentEmail || success}
            className="w-full"
          >
            {isCreating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              "Generate Connection Code"
            )}
          </Button>
        </form>

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

        {success && newCode && (
          <div className="space-y-4 rounded-lg border border-green-200 bg-green-50 p-4">
            <p className="text-sm font-medium text-green-800">
              ✓ Invitation code created successfully!
            </p>

            <div className="rounded-lg border-2 border-dashed border-green-300 bg-white p-4">
              <p className="font-mono text-3xl font-bold tracking-wider text-center">
                {newCode}
              </p>
            </div>

            <Button onClick={handleCopy} variant="outline" className="w-full">
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

            <div className="text-sm text-gray-700">
              <p className="font-medium">Next steps:</p>
              <ol className="mt-2 list-inside list-decimal space-y-1">
                <li>Share this code with your child</li>
                <li>
                  Your child should enter it on their student dashboard under &quot;Accept
                  Invitation&quot;
                </li>
                <li>Once accepted, you&apos;ll see their learning progress here</li>
              </ol>
              <p className="mt-2 text-xs text-gray-500">
                This code expires in 7 days and can only be used once.
              </p>
            </div>

            <Button
              onClick={() => {
                setSuccess(false);
                setNewCode(null);
              }}
              variant="ghost"
              size="sm"
              className="w-full"
            >
              Create Another Code
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
