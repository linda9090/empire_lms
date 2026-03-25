"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getChartHex } from "@/lib/chartColors";

export interface CompletionRateDatum {
  courseTitle: string;
  completionRate: number;
  enrollmentCount: number;
}

interface CompletionRateChartProps {
  data: CompletionRateDatum[];
}

function shortenTitle(title: string): string {
  return title.length > 18 ? `${title.slice(0, 18)}...` : title;
}

export default function CompletionRateChart({
  data,
}: CompletionRateChartProps) {
  const chartData = data.map((item) => ({
    ...item,
    shortTitle: shortenTitle(item.courseTitle),
  }));

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          margin={{ top: 12, right: 12, left: -12, bottom: 12 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
          <XAxis dataKey="shortTitle" fontSize={12} interval={0} angle={-20} height={60} className="text-muted-foreground" />
          <YAxis
            domain={[0, 100]}
            tickFormatter={(value) => `${value}%`}
            width={44}
            fontSize={12}
            className="text-muted-foreground"
          />
          <Tooltip
            formatter={(value: number, _name, payload) => [
              `${value}%`,
              `${payload.payload.courseTitle} (수강생 ${payload.payload.enrollmentCount}명)`,
            ]}
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '0.5rem',
            }}
          />
          <Bar dataKey="completionRate" fill={getChartHex('accent')} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
