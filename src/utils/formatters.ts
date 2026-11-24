import { getNumberFormatter } from '@superset-ui/core';
import { MinMaxBound } from '../types';
import { isDistinctEntityMetric } from './aggregations';
import { hasDiffToken } from './nameHeuristics';
import { formatNumber, italianNumber } from '../utils/numberFormat';


interface MetricNameInfo {
  lower: string;
  isDistinctEntity: boolean;
}

const nameInfoCache = new Map<string, MetricNameInfo>();
const NAME_CACHE_LIMIT = 5000;

/** Lowercase name and entity-count flag of a metric, computed once per distinct name. */
function getMetricNameInfo(metricName: string): MetricNameInfo {
  let info = nameInfoCache.get(metricName);
  if (!info) {
    if (nameInfoCache.size >= NAME_CACHE_LIMIT) nameInfoCache.clear();
    info = { lower: metricName.toLowerCase(), isDistinctEntity: isDistinctEntityMetric(metricName) };
    nameInfoCache.set(metricName, info);
  }
  return info;
}

export function formatMetricValue(
  value: number | string | null | undefined,
  formatterString?: string,
  currencySymbol?: string,
  metricName?: string,
): string {
  if (value === null || value === undefined) {
    return '-';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' && isNaN(value)) {
    return '-';
  }

  // 0. Distinct physical entity counts (e.g. Sportelli Attivi, Sedi Attive, Stanze Attive)
  // must always be formatted as integer counts, never as durations or float days
  const nameInfo = getMetricNameInfo(metricName || '');
  if (nameInfo.isDistinctEntity) {
    return formatNumber(value, 0, 0);
  }

  const mName = nameInfo.lower;

  // 1. Delta Acceptance / Percentage Points in p.p.
  if (
    (mName.includes('delta') || (mName.includes('variazione') || mName.includes('change')) || hasDiffToken(mName) || mName.includes('punti %') || mName.includes('p.p.')) &&
    (mName.includes('accettazione') || mName.includes('p.p.') || mName.includes('punti') || /\bacc\b/.test(mName) || mName.includes('acc_')) &&
    !mName.includes('accesso')
  ) {
    const sign = value > 0 ? '+' : '';
    return `${sign}${formatNumber(value, 1, 1)} p.p.`;
  }

  // 2. Acceptance rate (percentage) — exclude volume counts like 'Accettazione Totale'
  if (
    mName.includes('acc_corr') ||
    mName.includes('acc_conf') ||
    (mName.includes('accettazione') &&
      !(mName.includes('totale') || mName.includes('total')) &&
      !mName.includes('numero') &&
      !mName.includes('conteggio'))
  ) {
    return `${formatNumber(value, 1, 1)}%`;
  }

  // 3. Delta Lead Time in days (gg)
  if (
    !formatterString?.startsWith('DURATION') &&
    (mName.includes('delta') || (mName.includes('variazione') || mName.includes('change')) || hasDiffToken(mName)) &&
    (mName.includes('lt_off') || mName.includes('lead') || (mName.includes('giorni') && !mName.includes('settimana')) || /\blt\b/.test(mName) || mName.includes(' gg') || mName.includes('_gg'))
  ) {
    const sign = value > 0 ? '+' : '';
    return `${sign}${formatNumber(value, 1, 1)} gg`;
  }

  // 4. Lead Time in days (gg)
  if (
    !formatterString?.startsWith('DURATION') &&
    (mName.includes('lt_off') || (mName.includes('giorni') && !mName.includes('settimana')) || mName.includes(' gg') || mName.includes('_gg') || mName.endsWith('(gg)'))
  ) {
    return `${formatNumber(value, 1, 1)} gg`;
  }

  // 5. Percentage Variation / Delta with sign (+/- X.X%)
  if (
    mName.includes('___delta') ||
    mName.includes('δ') ||
    (metricName || '').includes('Δ') ||
    mName.includes('delta %') ||
    ((mName.includes('delta') || (mName.includes('variazione') || mName.includes('change')) || hasDiffToken(mName)) &&
      (mName.includes('%') || mName.includes('pct') || mName.includes('percent')))
  ) {
    const sign = value > 0 ? '+' : '';
    return `${sign}${formatNumber(value, 1, 1)}%`;
  }

  // 6. General percentage metrics (rate, ratio, share)
  if (mName.includes('%') || mName.includes('pct') || mName.includes('percent') || mName.includes('tasso')) {
    return `${formatNumber(value, 1, 1)}%`;
  }

  // 7. General delta with sign
  if (mName.startsWith('delta') || mName.includes('delta_') || (mName.includes('variazione') || mName.includes('change')) || hasDiffToken(mName)) {
    const sign = value > 0 ? '+' : '';
    return `${sign}${formatNumber(value, 1, 0)}`;
  }

  let formatted = '';
  try {
    if (formatterString && formatterString !== 'SMART_NUMBER') {
      const formatter = getNumberFormatter(formatterString);
      formatted = italianNumber(formatter(value));
    } else {
      // Italian localized thousands separator (e.g. 1.250)
      formatted = formatNumber(value, 2, 0);
    }
  } catch {
    formatted = String(value);
  }

  if (currencySymbol) {
    return `${currencySymbol} ${formatted}`;
  }

  return formatted;
}

/**
 * Calculates normalized value between 0 and 1 given a value and min/max bounds.
 * Returns 0 if zero range (min === max), null/undefined, or non-numeric.
 */
export function getNormalizedMetricValue(val: any, bound?: MinMaxBound): number {
  if (val === null || val === undefined || !bound) return 0;
  const num =
    typeof val === 'number'
      ? val
      : typeof val === 'string' && val.trim() !== ''
      ? Number(val)
      : NaN;
  if (!Number.isFinite(num)) return 0;
  const range = bound.max - bound.min;
  if (!Number.isFinite(range) || range <= 0) return 0;
  const normalized = (num - bound.min) / range;
  if (!Number.isFinite(normalized)) return 0;
  return Math.max(0, Math.min(1, normalized));
}

/**
 * Generates an RGBA background color for heatmap gradient based on normalized value and color theme.
 */
export function getHeatmapBgColor(
  normalized: number,
  theme: string = 'stratum',
): string {
  if (normalized <= 0) return 'transparent';
  const alpha = (0.06 + Math.min(1, Math.max(0, normalized)) * 0.36).toFixed(3);
  switch (theme) {
    case 'emerald':
      return `rgba(16, 185, 129, ${alpha})`;
    case 'ocean':
      return `rgba(37, 99, 235, ${alpha})`;
    case 'sunset':
      return `rgba(239, 68, 68, ${alpha})`;
    case 'stratum':
    default:
      return `rgba(13, 148, 136, ${alpha})`;
  }
}

