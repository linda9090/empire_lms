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
      <aside className="w-64 border-r bg-gray-50 p-4">
        <div className="mb-6">
          <h2 className="text-lg font-bold">Empire LMS</h2>
          <p className="text-sm text-gray-500">{role}</p>
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded px-3 py-2 text-sm ${
                pathname === item.href
                  ? "bg-blue-100 font-medium text-blue-700"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto pt-6">
          {userName && (
            <p className="mb-2 truncate text-sm text-gray-600">{userName}</p>
          )}
          <button
            onClick={() => signOut({ fetchOptions: { onSuccess: () => { window.location.href = "/login"; } } })}
            className="w-full rounded border px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            Sign Out
          </button>
        </div>
      </aside>
      <main className="flex-1">{children}</main>
    </div>
  );
}
