/**
 * Names of the metrics that hold times (seconds) in the table being built.
 *
 * The roll-up, the row totals and the comparison need to know that a metric is a duration: a sum of
 * waiting times means nothing, their average does. The set is written once per transform, before the tree
 * is built, and read by the aggregation code. Keys with suffixes (`attesa___2026___Lunedì`,
 * `attesa___comp`) are matched on their metric, the part before the first `___`.
 */
let timeMetrics = new Set<string>();

export function setTimeMetricNames(names: Iterable<string>): void {
  timeMetrics = new Set(Array.from(names, n => n.toLowerCase()));
}

/** True when the metric (or the key of one of its cells) holds times */
export function isTimeMetricName(key: string): boolean {
  if (timeMetrics.size === 0) return false;
  const idx = key.indexOf('___');
  return timeMetrics.has((idx < 0 ? key : key.slice(0, idx)).toLowerCase());
}
