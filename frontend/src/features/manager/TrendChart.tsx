import type { TestParameter, TestResultView } from "@/api/types";
import { formatDate, formatDecimal } from "@/lib/format";

const WIDTH = 640;
const HEIGHT = 240;
const MARGIN = { top: 16, right: 18, bottom: 30, left: 56 };
const PLOT_WIDTH = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom;

function shortDate(date: string): string {
  return `${date.slice(8, 10)}.${date.slice(5, 7)}`;
}

function tickLabel(value: number): string {
  const magnitude = Math.abs(value);
  if (magnitude >= 1000) {
    return String(Math.round(value));
  }
  return formatDecimal(String(Number(value.toFixed(2))));
}

export function TrendChart({
  parameter,
  results,
}: {
  parameter: TestParameter;
  results: TestResultView[];
}) {
  const points = results
    .filter((result) => result.parameterId === parameter.id)
    .map((result) => ({ result, numeric: Number(result.value) }))
    .filter((point) => Number.isFinite(point.numeric))
    .toSorted((left, right) => left.result.sampledAt.localeCompare(right.result.sampledAt));

  if (points.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Brak wyników dla tego parametru.
      </p>
    );
  }

  const limitValues = [parameter.minValue, parameter.maxValue]
    .filter((value): value is string => value !== null)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  const values = [...points.map((point) => point.numeric), ...limitValues];
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const padding = (dataMax - dataMin) * 0.12 || Math.max(Math.abs(dataMax) * 0.05, 0.1);
  const yMin = dataMin >= 0 ? Math.max(0, dataMin - padding) : dataMin - padding;
  const yMax = dataMax + padding;

  const x = (index: number): number =>
    points.length === 1
      ? MARGIN.left + PLOT_WIDTH / 2
      : MARGIN.left + (index / (points.length - 1)) * PLOT_WIDTH;
  const y = (value: number): number => MARGIN.top + ((yMax - value) / (yMax - yMin)) * PLOT_HEIGHT;

  const polyline = points
    .map((point, index) => `${x(index).toFixed(1)},${y(point.numeric).toFixed(1)}`)
    .join(" ");

  const gridValues = [0, 1, 2, 3, 4].map((step) => yMin + ((yMax - yMin) * step) / 4);
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const middlePoint = points[Math.floor(points.length / 2)];
  const minLimit = parameter.minValue === null ? null : Number(parameter.minValue);
  const maxLimit = parameter.maxValue === null ? null : Number(parameter.maxValue);

  return (
    <figure className="grid gap-2">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full">
        <title>{`${parameter.name}: wyniki w czasie z zakresem ${parameter.minValue ?? "—"}–${parameter.maxValue ?? "—"} ${parameter.unit}`}</title>
        <g className="text-muted-foreground" fill="currentColor">
          {gridValues.map((value) => (
            <g key={value}>
              <line
                x1={MARGIN.left}
                x2={WIDTH - MARGIN.right}
                y1={y(value)}
                y2={y(value)}
                stroke="currentColor"
                strokeOpacity={0.15}
              />
              <text
                x={MARGIN.left - 8}
                y={y(value) + 3}
                textAnchor="end"
                fontSize={10}
                fill="currentColor"
              >
                {tickLabel(value)}
              </text>
            </g>
          ))}
          {firstPoint !== undefined && (
            <text x={x(0)} y={HEIGHT - 8} textAnchor="start" fontSize={10} fill="currentColor">
              {shortDate(firstPoint.result.sampledAt)}
            </text>
          )}
          {middlePoint !== undefined && middlePoint !== firstPoint && (
            <text
              x={x(Math.floor(points.length / 2))}
              y={HEIGHT - 8}
              textAnchor="middle"
              fontSize={10}
              fill="currentColor"
            >
              {shortDate(middlePoint.result.sampledAt)}
            </text>
          )}
          {lastPoint !== undefined && lastPoint !== firstPoint && (
            <text
              x={x(points.length - 1)}
              y={HEIGHT - 8}
              textAnchor="end"
              fontSize={10}
              fill="currentColor"
            >
              {shortDate(lastPoint.result.sampledAt)}
            </text>
          )}
        </g>

        {minLimit !== null &&
          maxLimit !== null &&
          Number.isFinite(minLimit) &&
          Number.isFinite(maxLimit) && (
            <rect
              x={MARGIN.left}
              y={y(maxLimit)}
              width={PLOT_WIDTH}
              height={Math.max(0, y(minLimit) - y(maxLimit))}
              fill="currentColor"
              opacity={0.14}
              className="text-chart-2"
            />
          )}

        <g className="text-primary" fill="currentColor">
          {maxLimit !== null && Number.isFinite(maxLimit) && (
            <line
              x1={MARGIN.left}
              x2={WIDTH - MARGIN.right}
              y1={y(maxLimit)}
              y2={y(maxLimit)}
              stroke="currentColor"
              strokeDasharray="4 3"
              strokeOpacity={0.8}
              className="text-chart-4"
            />
          )}
          {minLimit !== null && Number.isFinite(minLimit) && (
            <line
              x1={MARGIN.left}
              x2={WIDTH - MARGIN.right}
              y1={y(minLimit)}
              y2={y(minLimit)}
              stroke="currentColor"
              strokeDasharray="4 3"
              strokeOpacity={0.8}
              className="text-chart-4"
            />
          )}
          <polyline
            points={polyline}
            fill="none"
            stroke="currentColor"
            strokeWidth={2.25}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {points.map((point, index) => (
            <circle
              key={point.result.id}
              cx={x(index)}
              cy={y(point.numeric)}
              r={4}
              fill="currentColor"
              className={point.result.inRange ? "text-primary" : "text-red-600"}
            >
              <title>
                {point.result.sampleLabel}: {formatDecimal(point.result.value)} {parameter.unit} ·{" "}
                {point.result.sampledAt}
              </title>
            </circle>
          ))}
        </g>
      </svg>

      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block size-2 rounded-full bg-primary" aria-hidden /> wynik w
          zakresie
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block size-2 rounded-full bg-red-600" aria-hidden /> wynik poza
          zakresem
        </span>
        <span>
          Zakres: {formatDecimal(parameter.minValue ?? "—")}–
          {formatDecimal(parameter.maxValue ?? "—")} {parameter.unit}
        </span>
        <span>{points.length} próbek</span>
        {lastPoint !== undefined && (
          <span className="ml-auto font-mono text-[10px] tracking-[0.06em] uppercase">
            Ostatni {formatDecimal(lastPoint.result.value)} {parameter.unit} ·{" "}
            {formatDate(lastPoint.result.sampledAt)}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
