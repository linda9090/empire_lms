export interface ChartColors {
  barFill: string;
  gridStroke: string;
  textFill: string;
}

const CHART_COLORS: ChartColors = {
  barFill: "var(--chart-bar-fill)",
  gridStroke: "var(--border)",
  textFill: "var(--muted-foreground)",
};

export function getChartColors(): ChartColors {
  return CHART_COLORS;
}
