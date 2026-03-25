"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import RoleBadge from "@/components/shared/RoleBadge";
import { signOut } from "@/lib/auth-client";
import { getRoleToken } from "@/lib/tokens";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types";

interface NavItem {
  label: string;
  href: string;
}

interface ShellLayoutProps {
  children: React.ReactNode;
  role: UserRole;
  userName?: string | null;
  navItems: NavItem[];
}

export default function ShellLayout({
  children,
  role,
  userName,
  navItems,
}: ShellLayoutProps) {
  const pathname = usePathname();
  const roleToken = getRoleToken(role);

  return (
    <div className="flex min-h-screen bg-background">
      <aside
        className={cn(
          "flex w-64 flex-col border-r border-border bg-muted/40 p-4",
          roleToken.sidebarAccent
        )}
      >
        <div className="mb-6">
          <h2 className="text-lg font-bold">Empire LMS</h2>
          <div className="mt-2">
            <RoleBadge role={role} />
          </div>
        </div>

        <nav className="space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "block rounded px-3 py-2 text-sm transition-colors",
                pathname === item.href ? roleToken.navActive : roleToken.navInactive
              )}
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
            onClick={() =>
              signOut({
                fetchOptions: {
                  onSuccess: () => {
                    window.location.href = "/login";
                  },
                },
              })
            }
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Sign Out
          </button>
        </div>
      </aside>

      <main className="flex-1">{children}</main>
    </div>
  );
}
