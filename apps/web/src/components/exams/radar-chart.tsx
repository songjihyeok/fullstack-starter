"use client";

import type { RadarDataPoint } from "@/lib/api/exams/types";

interface RadarChartProps {
  data: RadarDataPoint[];
  size?: number;
}

/**
 * Pure SVG radar chart — no chart library dependency.
 * Renders 0-1 values on polygonal axes.
 */
export function RadarChart({ data, size = 280 }: RadarChartProps) {
  if (data.length < 3) return null;

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 40;
  const levels = 5;
  const angleSlice = (2 * Math.PI) / data.length;

  // Grid circles
  const gridCircles = Array.from({ length: levels }, (_, i) => {
    const level = i + 1;
    const levelR = (r / levels) * level;
    const points = data
      .map((_, j) => {
        const angle = angleSlice * j - Math.PI / 2;
        return `${cx + levelR * Math.cos(angle)},${cy + levelR * Math.sin(angle)}`;
      })
      .join(" ");
    return (
      <polygon
        key={`grid-${level}`}
        points={points}
        fill="none"
        stroke="currentColor"
        className="text-border"
        strokeWidth={0.5}
      />
    );
  });

  // Axis lines
  const axisLines = data.map((d) => {
    const i = data.indexOf(d);
    const angle = angleSlice * i - Math.PI / 2;
    return (
      <line
        key={`axis-${d.axis}`}
        x1={cx}
        y1={cy}
        x2={cx + r * Math.cos(angle)}
        y2={cy + r * Math.sin(angle)}
        stroke="currentColor"
        className="text-border"
        strokeWidth={0.5}
      />
    );
  });

  // Data polygon
  const dataPoints = data.map((d, i) => {
    const angle = angleSlice * i - Math.PI / 2;
    const dr = r * d.value;
    return `${cx + dr * Math.cos(angle)},${cy + dr * Math.sin(angle)}`;
  });
  const dataPolygon = dataPoints.join(" ");

  // Labels
  const labels = data.map((d) => {
    const i = data.indexOf(d);
    const angle = angleSlice * i - Math.PI / 2;
    const lr = r + 24;
    const x = cx + lr * Math.cos(angle);
    const y = cy + lr * Math.sin(angle);
    return (
      <text
        key={`label-${d.axis}`}
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-foreground text-[10px]"
      >
        {d.axis}
      </text>
    );
  });

  // Data dots
  const dots = data.map((d) => {
    const i = data.indexOf(d);
    const angle = angleSlice * i - Math.PI / 2;
    const dr = r * d.value;
    return (
      <circle
        key={`dot-${d.axis}`}
        cx={cx + dr * Math.cos(angle)}
        cy={cy + dr * Math.sin(angle)}
        r={3}
        className="fill-primary"
      />
    );
  });

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className="mx-auto"
      role="img"
      aria-labelledby="radar-chart-title"
    >
      <title id="radar-chart-title">Radar chart</title>
      {gridCircles}
      {axisLines}
      <polygon points={dataPolygon} className="fill-primary/20 stroke-primary" strokeWidth={2} />
      {dots}
      {labels}
    </svg>
  );
}
