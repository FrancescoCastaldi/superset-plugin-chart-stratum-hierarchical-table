/**
 * Pure stateless helper to match a metric name (or composite cell key like `attesa___2026___Lun`)
 * against an explicit set of Time metric names (lowercase).
 */
export function isTimeMetricName(
  key: string,
  timeMetrics?: ReadonlySet<string>,
): boolean {
  if (!timeMetrics || timeMetrics.size === 0) return false;
  const idx = key.indexOf('___');
  return timeMetrics.has((idx < 0 ? key : key.slice(0, idx)).toLowerCase());
}
