import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <section className="w-full max-w-md rounded-lg border border-border bg-card p-8 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wider text-destructive">
          401 Unauthorized
        </p>
        <h1 className="mt-3 text-2xl font-bold text-foreground">Access denied</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Your account does not have permission to view this page.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/dashboard"
            className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Go to dashboard
          </Link>
          <Link
            href="/login"
            className="rounded border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            Log in again
          </Link>
        </div>
      </section>
    </main>
  );
}
