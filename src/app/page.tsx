import Link from "next/link";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background">
      <h1 className="mb-4 text-4xl font-bold">Empire LMS</h1>
      <p className="mb-8 text-muted-foreground">Global Learning Management System</p>
      <div className="flex gap-4">
        <Link
          href="/login"
          className="rounded bg-primary px-6 py-2 text-primary-foreground hover:bg-primary/90"
        >
          Log In
        </Link>
        <Link
          href="/register"
          className="rounded border border-primary px-6 py-2 text-primary hover:bg-primary/10"
        >
          Sign Up
        </Link>
      </div>
    </div>
  );
}
