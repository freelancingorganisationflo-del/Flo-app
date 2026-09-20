import type { ChartSpec, ChartDataset } from "@/lib/rich/parse";

const PALETTE = [
  "#2EE6FF",
  "#3D8BFF",
  "#A78BFA",
  "#34D399",
  "#FFB86C",
  "#FF8C42",
  "#F87171",
  "#8B5CF6",
];

function colorFor(dataset: ChartDataset, index: number): string {
  return dataset.color && /^#[0-9a-f]{3,8}$/i.test(dataset.color)
    ? dataset.color
    : PALETTE[index % PALETTE.length];
}

const WIDTH = 640;
const HEIGHT = 280;
const PAD = { top: 22, right: 20, bottom: 46, left: 52 };

function fmt(value: number): string {
  if (Math.abs(value) >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return String(Math.round(value * 100) / 100);
}

export function Chart({ spec }: { spec: ChartSpec }) {
  const datasets = spec.datasets.filter((dataset) => dataset.values.length > 0);
  if (datasets.length === 0) return null;

  const categoryCount = Math.max(
    spec.labels?.length ?? 0,
    ...datasets.map((dataset) => dataset.values.length)
  );
  const labels = Array.from(
    { length: categoryCount },
    (_, index) => spec.labels?.[index] ?? String(index + 1)
  );

  const isPie = spec.type === "pie";
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;

  return (
    <figure className="my-2 rounded-xl border border-line bg-navy2/60 p-3">
      {spec.title && (
        <figcaption className="mb-2 text-xs font-semibold text-ink flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan" />
          {spec.title}
        </figcaption>
      )}
      <div className="w-full overflow-x-auto scrollbar-slim">
        {isPie ? (
          <PieChart spec={spec} datasets={datasets} labels={labels} />
        ) : (
          <CartesianChart
            spec={spec}
            datasets={datasets}
            labels={labels}
            plotW={plotW}
            plotH={plotH}
          />
        )}
      </div>
      <Legend spec={spec} datasets={datasets} labels={labels} />
    </figure>
  );
}

interface ChartProps {
  spec: ChartSpec;
  datasets: ChartDataset[];
  labels: string[];
}

function CartesianChart({
  spec,
  datasets,
  labels,
  plotW,
  plotH,
}: ChartProps & { plotW: number; plotH: number }) {
  const values = datasets.flatMap((dataset) => dataset.values);
  let min = Math.min(0, ...values);
  let max = Math.max(0, ...values);
  if (min === max) max = min + 1;
  min -= (max - min) * 0.05;
  max += (max - min) * 0.05;

  const y = (value: number) => PAD.top + plotH * (1 - (value - min) / (max - min));
  const band = plotW / Math.max(labels.length, 1);
  const groupWidth = band * 0.68;
  const barWidth = groupWidth / Math.max(datasets.length, 1);
  const baseline = y(Math.min(Math.max(0, min), max));

  const ticks = Array.from({ length: 5 }, (_, index) => min + ((max - min) * index) / 4);
  const dense = labels.length > 6;
  const isScatter = spec.type === "scatter";
  const isLine = spec.type === "line";
  const isBar = spec.type === "bar";

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="h-auto w-full min-w-[420px]"
      role="img"
      aria-label={spec.title ? `${spec.title} chart` : "Chart"}
    >
      {ticks.map((tick, index) => {
        const ty = y(tick);
        return (
          <g key={`tick-${index}`}>
            <line
              x1={PAD.left}
              x2={PAD.left + plotW}
              y1={ty}
              y2={ty}
              stroke="#1C2940"
              strokeWidth="1"
              strokeDasharray={index === 0 ? "0" : "3 5"}
            />
            <text x={PAD.left - 8} y={ty + 3.5} textAnchor="end" fontSize="10" fill="#55617A">
              {fmt(tick)}
            </text>
          </g>
        );
      })}

      {labels.map((label, index) => {
        const cx = PAD.left + band * index + band / 2;
        return (
          <text
            key={`x-${index}`}
            x={cx}
            y={HEIGHT - PAD.bottom + 16}
            textAnchor={dense ? "end" : "middle"}
            fontSize="10"
            fill="#8A9BB8"
            transform={dense ? `rotate(-32 ${cx} ${HEIGHT - PAD.bottom + 16})` : undefined}
          >
            {label.length > 14 ? `${label.slice(0, 13)}…` : label}
          </text>
        );
      })}

      {isBar &&
        datasets.map((dataset, di) =>
          dataset.values.map((value, vi) => {
            const bx = PAD.left + band * vi + (band - groupWidth) / 2 + barWidth * di;
            const top = Math.min(y(value), baseline);
            const height = Math.max(Math.abs(y(value) - baseline), value === 0 ? 1 : 0);
            return (
              <rect
                key={`bar-${di}-${vi}`}
                x={bx}
                y={top}
                width={Math.max(barWidth - 2, 1)}
                height={height}
                rx="3"
                fill={colorFor(dataset, di)}
                opacity="0.9"
              />
            );
          })
        )}

      {(isLine || isScatter) &&
        datasets.map((dataset, di) => {
          const points = dataset.values.map((value, vi) => ({
            x: PAD.left + band * vi + band / 2,
            y: y(value),
          }));
          return (
            <g key={`series-${di}`}>
              {isLine && (
                <polyline
                  points={points.map((point) => `${point.x},${point.y}`).join(" ")}
                  fill="none"
                  stroke={colorFor(dataset, di)}
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {points.map((point, vi) => (
                <circle
                  key={`pt-${di}-${vi}`}
                  cx={point.x}
                  cy={point.y}
                  r={isScatter ? 3.4 : 2.8}
                  fill="#05070D"
                  stroke={colorFor(dataset, di)}
                  strokeWidth="2"
                />
              ))}
            </g>
          );
        })}

      <line
        x1={PAD.left}
        x2={PAD.left + plotW}
        y1={PAD.top + plotH}
        y2={PAD.top + plotH}
        stroke="#1C2940"
      />

      {spec.yLabel && (
        <text
          x={14}
          y={PAD.top + plotH / 2}
          fontSize="10"
          fill="#55617A"
          textAnchor="middle"
          transform={`rotate(-90 14 ${PAD.top + plotH / 2})`}
        >
          {spec.yLabel}
        </text>
      )}
      {spec.xLabel && (
        <text x={PAD.left + plotW / 2} y={HEIGHT - 6} fontSize="10" fill="#55617A" textAnchor="middle">
          {spec.xLabel}
        </text>
      )}
    </svg>
  );
}

function PieChart({ datasets }: ChartProps) {
  const values = datasets[0].values;
  const positive = values.map((value) => Math.max(value, 0));
  const total = positive.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return null;

  const cx = WIDTH / 2;
  const cy = HEIGHT / 2 + 4;
  const radius = Math.min(plotRadius(), 110);
  let angle = -Math.PI / 2;

  const slices = positive.map((value, index) => {
    const sweep = (value / total) * Math.PI * 2;
    const start = angle;
    const end = angle + sweep;
    angle = end;
    const large = sweep > Math.PI ? 1 : 0;
    const x1 = cx + radius * Math.cos(start);
    const y1 = cy + radius * Math.sin(start);
    const x2 = cx + radius * Math.cos(end);
    const y2 = cy + radius * Math.sin(end);
    const mid = start + sweep / 2;
    const labelX = cx + radius * 0.62 * Math.cos(mid);
    const labelY = cy + radius * 0.62 * Math.sin(mid);
    const percent = Math.round((value / total) * 100);
    return { x1, y1, x2, y2, large, labelX, labelY, percent, index, value };
  });

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="h-auto w-full min-w-[320px]"
      role="img"
      aria-label="Pie chart"
    >
      <g>
        {slices.map((slice) => (
          <path
            key={`slice-${slice.index}`}
            d={`M ${cx} ${cy} L ${slice.x1} ${slice.y1} A ${radius} ${radius} 0 ${slice.large} 1 ${slice.x2} ${slice.y2} Z`}
            fill={colorFor(datasets[0], slice.index)}
            opacity="0.9"
            stroke="#05070D"
            strokeWidth="1.5"
          />
        ))}
        {slices.map((slice) =>
          slice.percent >= 7 ? (
            <text
              key={`pct-${slice.index}`}
              x={slice.labelX}
              y={slice.labelY}
              textAnchor="middle"
              fontSize="11"
              fontWeight="600"
              fill="#05070D"
            >
              {slice.percent}%
            </text>
          ) : null
        )}
      </g>
    </svg>
  );
}

function plotRadius(): number {
  return (HEIGHT - PAD.top - PAD.bottom) / 2;
}

function Legend({ spec, datasets, labels }: ChartProps) {
  const isPie = spec.type === "pie";
  if (!isPie && datasets.length <= 1 && !spec.unit) {
    return spec.unit ? (
      <div className="mt-1 text-[10px] text-faint">Unit: {spec.unit}</div>
    ) : null;
  }
  const entries = isPie
    ? labels.map((label, index) => ({ label, color: colorFor(datasets[0], index) }))
    : datasets.map((dataset, index) => ({
        label: dataset.label ?? `Series ${index + 1}`,
        color: colorFor(dataset, index),
      }));

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      {entries.map((entry) => (
        <span key={entry.label} className="flex items-center gap-1.5 text-[10px] text-grey">
          <span className="h-2 w-2 rounded-sm" style={{ background: entry.color }} />
          {entry.label}
        </span>
      ))}
      {spec.unit && <span className="text-[10px] text-faint">Unit: {spec.unit}</span>}
    </div>
  );
}
