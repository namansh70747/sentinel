"use client";

import { useMemo } from "react";
import type { SliPoint } from "../lib/live";

export function LiveChart({ points, height = 220, slo = 99.9 }: { points: SliPoint[]; height?: number; slo?: number }) {
  const width = 760;
  const shape = useMemo(() => {
    if (points.length < 2) return null;
    const values = points.map((point) => point.availability);
    const dataMin = Math.min(...values);
    const dataMax = Math.max(...values);
    const mid = (dataMin + dataMax) / 2;
    const half = Math.max(0.8, ((dataMax - dataMin) / 2) * 2);
    const low = mid - half;
    const top = mid + half;
    const y = (value: number) => 10 + ((top - value) / (top - low)) * (height - 30);
    const x = (index: number) => (index / (points.length - 1)) * (width - 52);
    const line = values.map((value, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
    const area = `${line} L${x(values.length - 1)},${height - 20} L0,${height - 20} Z`;
    const last = values[values.length - 1] ?? slo;
    return { line, area, sloY: y(slo), lastX: x(values.length - 1), lastY: y(last), last, lowY: y(low), low };
  }, [points, height, slo]);

  if (!shape) {
    return (
      <div className="grid place-items-center font-mono text-[12px] text-faint" style={{ height }}>
        waiting for the SLI stream
      </div>
    );
  }

  const breach = shape.last < slo;
  const stroke = breach ? "var(--color-sev1)" : "var(--color-ink)";
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Live availability, last two minutes">
      <line x1={0} x2={width - 52} y1={shape.sloY} y2={shape.sloY} stroke="var(--color-line)" />
      <text x={width - 4} y={shape.sloY + 3} textAnchor="end" fill="var(--color-muted)" fontSize={12} fontFamily="var(--font-sans)">
        {slo}%
      </text>
      <path d={shape.line} fill="none" stroke={stroke} strokeWidth={1.75} strokeLinejoin="round" />
      <circle cx={shape.lastX} cy={shape.lastY} r={3} fill={stroke} />
      <text x={0} y={height - 4} fill="var(--color-faint)" fontSize={10} fontFamily="var(--font-mono)">
        −{points.length}s
      </text>
      <text x={width - 52} y={height - 4} textAnchor="end" fill="var(--color-faint)" fontSize={10} fontFamily="var(--font-mono)">
        now
      </text>
    </svg>
  );
}
