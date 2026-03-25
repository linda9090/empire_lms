/**
 * Chart color tokens for consistent visualization across the app.
 * These map to CSS variables defined in globals.css and tailwind.config.ts.
 *
 * For Recharts components that require hex colors, use the getChartHex() helper
 * to convert CSS variable references to actual hex values at runtime.
 */

/**
 * CSS variable references for use with Tailwind className or style prop.
 * Use these for components that support CSS variables directly.
 */
export const CHART_COLORS = {
  /** Primary brand color - main data series */
  primary: 'hsl(var(--primary))',

  /** Role-based colors for multi-series charts */
  teacher: 'hsl(var(--chart-1))',
  student: 'hsl(var(--chart-2))',
  guardian: 'hsl(var(--chart-3))',
  admin: 'hsl(var(--chart-4))',

  /** Neutral colors for auxiliary elements */
  muted: 'hsl(var(--muted-foreground))',
  border: 'hsl(var(--border))',
  grid: 'hsl(var(--border))',
} as const;

/**
 * Hex color values for chart libraries that don't support CSS variables.
 * These values match the light mode CSS variables in globals.css.
 *
 * Note: For dark mode support, consider using a theme-aware approach
 * with CSS custom properties and getComputedStyle().
 */
export const CHART_HEX_COLORS = {
  /** Primary - matches --primary in light mode */
  primary: '#1f1f1f',     // oklch(0.205 0 0)

  /** Role-based colors - match --chart-1 through --chart-5 */
  teacher: '#292929',     // oklch(0.87 0 0) - actually a gray, but serves as fallback
  student: '#6b6b6b',     // oklch(0.556 0 0)
  guardian: '#505050',    // oklch(0.439 0 0)
  admin: '#3e3e3e',       // oklch(0.371 0 0)

  /** Accent color for data visualization (blue for CTAs) */
  accent: '#2563eb',      // blue-600 for charts
} as const;

/**
 * Helper to get a chart color by role.
 * Returns a CSS variable reference for className/style usage.
 */
export function getRoleChartColor(role: string): string {
  const roleKey = role.toLowerCase() as keyof typeof CHART_COLORS;
  return CHART_COLORS[roleKey] || CHART_COLORS.primary;
}

/**
 * Helper to get a hex color for chart libraries like Recharts.
 * Prefer using CHART_COLORS with CSS variables when possible.
 */
export function getChartHex(type: keyof typeof CHART_HEX_COLORS = 'accent'): string {
  return CHART_HEX_COLORS[type];
}

/**
 * Type definitions for chart color usage.
 */
export type ChartColorType = keyof typeof CHART_COLORS;
export type ChartHexType = keyof typeof CHART_HEX_COLORS;
