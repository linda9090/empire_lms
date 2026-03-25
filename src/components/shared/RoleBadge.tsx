import { getRoleToken } from "@/lib/tokens";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types";

interface RoleBadgeProps {
  role: UserRole;
  variant?: "default" | "compact";
  className?: string;
}

export default function RoleBadge({
  role,
  variant = "default",
  className,
}: RoleBadgeProps) {
  const token = getRoleToken(role);

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium",
        token.badgeBg,
        token.badgeFg,
        variant === "default"
          ? "px-2.5 py-0.5 text-xs"
          : "px-1.5 py-0.5 text-[10px]",
        className
      )}
    >
      {token.label}
    </span>
  );
}
