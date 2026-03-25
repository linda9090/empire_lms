import { cn } from "@/lib/utils";
import { getRoleToken } from "@/lib/tokens";

interface RoleBadgeProps {
  role: string;
  className?: string;
}

function getRoleLabel(role: string): string {
  const normalized = role.trim().toUpperCase();

  if (normalized === "TEACHER") {
    return "Teacher";
  }

  if (normalized === "GUARDIAN") {
    return "Guardian";
  }

  if (normalized === "ADMIN") {
    return "Admin";
  }

  if (normalized === "STUDENT") {
    return "Student";
  }

  return role;
}

export default function RoleBadge({ role, className }: RoleBadgeProps) {
  const token = getRoleToken(role);

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-1 text-xs font-medium",
        token.badgeClass,
        className
      )}
    >
      {getRoleLabel(role)}
    </span>
  );
}
