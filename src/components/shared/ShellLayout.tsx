"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/lib/auth-client";

interface NavItem {
  label: string;
  href: string;
}

interface ShellLayoutProps {
  children: React.ReactNode;
  role: string;
  userName?: string;
  navItems: NavItem[];
}

export default function ShellLayout({
  children,
  role,
  userName,
  navItems,
}: ShellLayoutProps) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen">
      <aside className="w-sidebar border-r bg-muted p-4">
        <div className="mb-6">
          <h2 className="text-lg font-bold">Empire LMS</h2>
          <p className="text-sm text-muted-foreground">{role}</p>
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded px-3 py-2 text-sm ${
                pathname === item.href
                  ? "bg-accent font-medium text-accent-foreground"
                  : "text-foreground hover:bg-muted"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto pt-6">
          {userName && (
            <p className="mb-2 truncate text-sm text-muted-foreground">{userName}</p>
          )}
          <button
            onClick={() => signOut({ fetchOptions: { onSuccess: () => { window.location.href = "/login"; } } })}
            className="w-full rounded border px-3 py-2 text-sm text-foreground hover:bg-muted"
          >
            Sign Out
          </button>
        </div>
      </aside>
      <main className="flex-1">{children}</main>
    </div>
  );
}
