import type { ReactNode } from "react";
import { useMemo } from "react";
import {
  type ActiveDotProps,
  CartesianGrid,
  type DotItemDotProps,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from "recharts";

import type { TestParameter, TestResultView } from "@/api/types";
import { formatDate, formatDecimal } from "@/lib/format";

type Point = {
  date: string;
  value: number;
  sampleLabel: string;
  unit: string;
  inRange: boolean;
};

const MARGIN = { top: 12, right: 16, bottom: 4, left: 0 };
const Y_DOMAIN: [number | "auto", number | "auto"] = ["auto", "auto"];
const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 10 };
const GRID_STROKE = "var(--border)";
const THRESHOLD_STROKE = "var(--chart-4)";
const ACTIVE_DOT = { r: 5, strokeWidth: 1 } satisfies Partial<ActiveDotProps>;

function shortDate(date: string): string {
  return `${date.slice(8, 10)}.${date.slice(5, 7)}`;
}

function tickLabel(value: number): string {
  return formatDecimal(String(Number(value.toFixed(2))));
}

function isPoint(value: unknown): value is Point {
  return (
    typeof value === "object" &&
    value !== null &&
    "sampleLabel" in value &&
    "inRange" in value &&
    "unit" in value &&
    typeof value.sampleLabel === "string" &&
    typeof value.inRange === "boolean" &&
    typeof value.unit === "string"
  );
}

function renderDot(props: DotItemDotProps): ReactNode {
  if (typeof props.cx !== "number" || typeof props.cy !== "number") {
    return null;
  }
  const point = isPoint(props.payload) ? props.payload : null;
  return (
    <circle
      cx={props.cx}
      cy={props.cy}
      r={3.5}
      fill={point !== null && !point.inRange ? "var(--destructive)" : "var(--primary)"}
      stroke="var(--background)"
      strokeWidth={1}
    />
  );
}

function renderTooltip({ active, payload, label }: TooltipContentProps): ReactNode {
  if (!active || payload.length === 0) {
    return null;
  }
  const entry = payload[0];
  if (entry === undefined) {
    return null;
  }
  const point = isPoint(entry.payload) ? entry.payload : null;

  return (
    <div className="grid gap-1 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <span className="font-medium">{label === undefined ? "" : formatDate(String(label))}</span>
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span
            className={
              point !== null && !point.inRange
                ? "size-2 shrink-0 rounded-full bg-destructive"
                : "size-2 shrink-0 rounded-full bg-primary"
            }
            aria-hidden
          />
          {point?.sampleLabel ?? "Wynik"}
          {point !== null && !point.inRange && " · poza zakresem"}
        </span>
        <span className="font-mono font-medium tabular-nums">
          {formatDecimal(String(entry.value))} {point?.unit ?? ""}
        </span>
      </div>
    </div>
  );
}

export function TrendChart({
  parameter,
  results,
}: {
  parameter: TestParameter;
  results: TestResultView[];
}) {
  const points = useMemo<Point[]>(
    () =>
      results
        .filter((result) => result.parameterId === parameter.id)
        .map((result) => ({
          date: result.sampledAt,
          value: Number(result.value),
          sampleLabel: result.sampleLabel,
          unit: result.unit,
          inRange: result.inRange,
        }))
        .filter((point) => Number.isFinite(point.value))
        .toSorted((left, right) => left.date.localeCompare(right.date)),
    [results, parameter.id],
  );

  if (points.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Brak wyników dla tego parametru.
      </p>
    );
  }

  const minLimit = parameter.minValue === null ? null : Number(parameter.minValue);
  const maxLimit = parameter.maxValue === null ? null : Number(parameter.maxValue);
  const outOfRange = points.filter((point) => !point.inRange).length;
  const lastPoint = points[points.length - 1];

  return (
    <figure className="grid gap-2">
      <div className="h-64 w-full sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={MARGIN} accessibilityLayer>
            <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeOpacity={0.6} />
            {minLimit !== null && maxLimit !== null && (
              <ReferenceArea y1={minLimit} y2={maxLimit} fill="var(--primary)" fillOpacity={0.08} />
            )}
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={28}
              tick={AXIS_TICK}
              tickFormatter={(value: string) => shortDate(value)}
            />
            <YAxis
              width={52}
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              domain={Y_DOMAIN}
              tick={AXIS_TICK}
              tickFormatter={(value: number) => tickLabel(value)}
            />
            <Tooltip content={renderTooltip} />
            {maxLimit !== null && Number.isFinite(maxLimit) && (
              <ReferenceLine
                y={maxLimit}
                stroke={THRESHOLD_STROKE}
                strokeDasharray="4 3"
                ifOverflow="extendDomain"
              />
            )}
            {minLimit !== null && Number.isFinite(minLimit) && (
              <ReferenceLine
                y={minLimit}
                stroke={THRESHOLD_STROKE}
                strokeDasharray="4 3"
                ifOverflow="extendDomain"
              />
            )}
            <Line
              dataKey="value"
              type="monotone"
              stroke="var(--primary)"
              strokeWidth={2}
              dot={renderDot}
              activeDot={ACTIVE_DOT}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block size-2 rounded-full bg-primary" aria-hidden /> wynik w
          zakresie
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block size-2 rounded-full bg-destructive" aria-hidden /> wynik
          poza zakresem ({outOfRange})
        </span>
        <span>
          Zakres: {formatDecimal(parameter.minValue ?? "—")}–
          {formatDecimal(parameter.maxValue ?? "—")} {parameter.unit}
        </span>
        <span>{points.length} próbek</span>
        {lastPoint !== undefined && (
          <span className="ml-auto font-mono text-[10px] tracking-[0.06em] uppercase">
            Ostatni {formatDecimal(String(lastPoint.value))} {parameter.unit} ·{" "}
            {formatDate(lastPoint.date)}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
