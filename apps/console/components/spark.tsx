export function availabilitySeries(severity: string): number[] {
  const points = 48;
  return Array.from({ length: points }, (_, index) => {
    if (severity === "sev4") return 99.95 + Math.sin(index / 6) * 0.04;
    const dropAt = 34;
    if (index < dropAt) return 99.92 - (index % 5) * 0.01;
    const t = (index - dropAt) / (points - dropAt);
    return 99.9 - t * 19.6;
  });
}

export function Spark({
  values,
  width = 168,
  height = 42,
  tone = "var(--color-amber)",
}: {
  values: number[];
  width?: number;
  height?: number;
  tone?: string;
}) {
  const min = 78;
  const max = 100;
  const coords = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = 4 + ((max - Math.min(max, Math.max(min, value))) / (max - min)) * (height - 8);
    return [x, y] as const;
  });
  const line = coords.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = coords[coords.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <path d={line} fill="none" stroke={tone} strokeWidth={1.5} />
      {last ? <circle cx={last[0]} cy={last[1]} r={2.2} fill={tone} /> : null}
    </svg>
  );
}

export function SliChart({ values, markerAt = 34 }: { values: number[]; markerAt?: number }) {
  const width = 640;
  const height = 220;
  const min = 78;
  const max = 100;
  const yOf = (value: number) => 16 + ((max - value) / (max - min)) * (height - 36);
  const xOf = (index: number) => (index / (values.length - 1)) * (width - 28) + 8;
  const line = values
    .map((value, index) => `${index === 0 ? "M" : "L"}${xOf(index).toFixed(1)},${yOf(value).toFixed(1)}`)
    .join(" ");
  const sloY = yOf(99.9);
  const markX = xOf(markerAt);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Availability over the last hour">
      {[80, 90, 99.9].map((tick) => (
        <g key={tick}>
          <line x1={8} x2={width - 8} y1={yOf(tick)} y2={yOf(tick)} stroke="var(--color-line)" strokeDasharray="3 4" />
          <text x={width - 6} y={yOf(tick) - 4} textAnchor="end" fill="var(--color-faint)" fontSize={10} fontFamily="var(--font-mono)">
            {tick}%
          </text>
        </g>
      ))}
      <line x1={8} x2={width - 8} y1={sloY} y2={sloY} stroke="var(--color-ok)" strokeWidth={1} />
      <line x1={markX} x2={markX} y1={12} y2={height - 16} stroke="var(--color-sev1)" strokeDasharray="2 3" />
      <text x={markX + 6} y={22} fill="var(--color-sev1)" fontSize={10} fontFamily="var(--font-mono)">
        deploy
      </text>
      <path d={line} fill="none" stroke="var(--color-amber)" strokeWidth={1.6} />
    </svg>
  );
}
