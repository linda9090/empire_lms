export const CHART_COLORS = {
  primary: "hsl(var(--primary))",
  teacher: "hsl(var(--role-teacher))",
  student: "hsl(var(--role-student))",
  guardian: "hsl(var(--role-guardian))",
  admin: "hsl(var(--role-admin))",
  muted: "hsl(var(--muted-foreground))",
} as const;

export type ChartColorKey = keyof typeof CHART_COLORS;
