import { MetricPolarity } from '../types';
import { msg } from '../i18n';

export interface SparklineGeometry {
  /** SVG polyline points of the consecutive runs of values, one string per run. */
  runs: string[];
  /** Position of the last value. */
  last: { x: number; y: number } | null;
}

/**
 * Pure geometry of a sparkline: values are scaled between their min and max, gaps (null) split
 * the line, and a flat series is drawn in the middle. Deterministic, no DOM, no random ids.
 */
export function computeSparkline(
  values: Array<number | null>,
  width: number,
  height: number,
  padding = 2,
): SparklineGeometry {
  const numeric = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (numeric.length === 0) return { runs: [], last: null };
  const min = Math.min(...numeric);
  const max = Math.max(...numeric);
  const span = max - min;
  const stepX = values.length > 1 ? (width - 2 * padding) / (values.length - 1) : 0;
  const toPoint = (v: number, i: number) => {
    const x = values.length > 1 ? padding + i * stepX : width / 2;
    const y = span === 0 ? height / 2 : padding + (1 - (v - min) / span) * (height - 2 * padding);
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  };

  const runs: string[] = [];
  let current: string[] = [];
  let last: { x: number; y: number } | null = null;
  values.forEach((v, i) => {
    if (typeof v === 'number' && Number.isFinite(v)) {
      const p = toPoint(v, i);
      current.push(`${p.x},${p.y}`);
      last = p;
    } else if (current.length > 0) {
      runs.push(current.join(' '));
      current = [];
    }
  });
  if (current.length > 0) runs.push(current.join(' '));
  return { runs, last };
}

/** Direction of the series for the colour: last value against the first one. */
export function sparklineTrend(values: Array<number | null>): 'up' | 'down' | 'flat' {
  const numeric = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (numeric.length < 2) return 'flat';
  const diff = numeric[numeric.length - 1] - numeric[0];
  return diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
}

export default function Sparkline({
  values,
  polarity,
  width = 96,
  height = 24,
  label,
}: {
  values: Array<number | null>;
  polarity?: MetricPolarity;
  width?: number;
  height?: number;
  label?: string;
}) {
  const { runs, last } = computeSparkline(values, width, height);
  if (runs.length === 0) return <span className="sparkline-empty">-</span>;
  const trend = sparklineTrend(values);
  const good = trend === 'flat' ? null : (trend === 'up') === (polarity !== 'lower_is_better');
  const tone = good === null ? 'sparkline-flat' : good ? 'sparkline-good' : 'sparkline-bad';
  return (
    <svg
      className={`sparkline ${tone}`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label ?? msg('sparkline.label')}
    >
      {label ? <title>{label}</title> : null}
      {runs.map((points, i) => (
        <polyline key={i} points={points} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      ))}
      {last ? <circle cx={last.x} cy={last.y} r={2.2} fill="currentColor" /> : null}
    </svg>
  );
}
