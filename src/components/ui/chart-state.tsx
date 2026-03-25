import * as React from "react";
import { Loader2, BarChart2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChartStateProps extends React.HTMLAttributes<HTMLDivElement> {
  state: "loading" | "empty" | "error";
  message?: string;
}

export function ChartState({
  state,
  message,
  className,
  ...props
}: ChartStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-[300px] w-full flex-col items-center justify-center rounded-md border border-dashed border-border bg-muted/40 p-8 text-center animate-in fade-in duration-300",
        className
      )}
      {...props}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-background shadow-sm ring-1 ring-border mb-4">
        {state === "loading" && (
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        )}
        {state === "empty" && (
          <BarChart2 className="h-6 w-6 text-muted-foreground" />
        )}
        {state === "error" && (
          <AlertCircle className="h-6 w-6 text-destructive" />
        )}
      </div>
      <h3 className="text-sm font-semibold text-foreground">
        {state === "loading" && "데이터를 불러오는 중입니다"}
        {state === "empty" && "표시할 데이터가 없습니다"}
        {state === "error" && "데이터를 불러오지 못했습니다"}
      </h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {message ||
          (state === "loading"
            ? "잠시만 기다려주세요. 통계 데이터를 분석하고 있습니다."
            : state === "empty"
            ? "선택한 기간에 해당하는 통계 데이터가 존재하지 않습니다. 다른 기간을 선택해 보세요."
            : "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.")}
      </p>
    </div>
  );
}
