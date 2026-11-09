import {
  ComparisonReferencePeriod,
  ComparisonStrategy,
  ComparisonTimeGrain,
  MetricGoal,
  TreeNode,
  PivotTimeDeltaMode,
} from '../types';

export const PERIOD_DELTA_SUFFIX = '___period_delta';
export const PERIOD_DELTA_PCT_SUFFIX = '___period_delta_pct';

const DAY_MS = 86400000;

export interface PeriodComparison {
  current: number | null;
  baseline: number | null;
  delta: number | null;
  deltaPct: number | null;
}

export interface TimeDeltaStrategyConfig {
  timeGrain: ComparisonTimeGrain;
  referencePeriod: ComparisonReferencePeriod;
  strategy: ComparisonStrategy;
  /** Read by budget_target only: the target of the entry whose metricKey matches. */
  goals?: MetricGoal[];
}

function utcDate(year: number, month: number, day: number): Date | null {
  const date = new Date(Date.UTC(year, month, day));
  // Rejects overflowing days such as 2026-02-30 instead of rolling them into March.
  return date.getUTCMonth() === month && date.getUTCDate() === day ? date : null;
}

const MONTH_NAMES_MAP: Record<string, number> = {
  gennaio: 0, gen: 0, january: 0, jan: 0,
  febbraio: 1, feb: 1, february: 1,
  marzo: 2, mar: 2, march: 2,
  aprile: 3, apr: 3, april: 3,
  maggio: 4, mag: 4, may: 4,
  giugno: 5, giu: 5, june: 5, jun: 5,
  luglio: 6, lug: 6, july: 6, jul: 6,
  agosto: 7, ago: 7, august: 7, aug: 7,
  settembre: 8, set: 8, september: 8, sep: 8,
  ottobre: 9, ott: 9, october: 9, oct: 9,
  novembre: 10, nov: 10, november: 10,
  dicembre: 11, dic: 11, december: 11, dec: 11,
};

/**
 * UTC start of the period named by a pivot key: `YYYY`, `YYYY-Qn`, `YYYY-MM`,
 * `YYYY-MM-DD` (any time part is dropped), slashes, Italian/English month names,
 * quarter only (Q1-Q4), or epoch timestamps. Other keys are not periods.
 */
export function parsePeriodKey(key: unknown): Date | null {
  if (key === null || key === undefined) return null;
  const k = String(key).trim();
  if (!k) return null;
  let m: RegExpExecArray | null = null;

  // 1. Year only (YYYY)
  m = /^(\d{4})$/.exec(k);
  if (m) return utcDate(+m[1], 0, 1);

  // 2. Year and Quarter (YYYY-Qn, YYYY Qn)
  m = /^(\d{4})[-\s]?Q([1-4])$/i.exec(k);
  if (m) return utcDate(+m[1], (+m[2] - 1) * 3, 1);

  // 3. Quarter only (Q1 - Q4, default to 2026 anchor year)
  m = /^Q([1-4])$/i.exec(k);
  if (m) return utcDate(2026, (+m[1] - 1) * 3, 1);

  // 4. Year and Month with dash or slash (YYYY-MM or YYYY/MM)
  m = /^(\d{4})[-/](\d{1,2})$/.exec(k);
  if (m) return +m[2] >= 1 && +m[2] <= 12 ? utcDate(+m[1], +m[2] - 1, 1) : null;

  // 5. Month and Year (MM/YYYY or MM-YYYY)
  m = /^(\d{1,2})[-/](\d{4})$/.exec(k);
  if (m) return +m[1] >= 1 && +m[1] <= 12 ? utcDate(+m[2], +m[1] - 1, 1) : null;

  // 6. Year-Month-Day (YYYY-MM-DD or YYYY/MM/DD with optional time part)
  m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s].*)?$/.exec(k);
  if (m) return +m[2] >= 1 && +m[2] <= 12 ? utcDate(+m[1], +m[2] - 1, +m[3]) : null;

  // 7. Day-Month-Year (DD/MM/YYYY or DD-MM-YYYY)
  m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[T\s].*)?$/.exec(k);
  if (m) return +m[2] >= 1 && +m[2] <= 12 ? utcDate(+m[3], +m[2] - 1, +m[1]) : null;

  // 8. Month name with year (e.g. Gennaio 2026, Gen 2026, Jan 2026)
  m = /^([a-zA-Z]+)[\s\-_/]+(\d{4})$/.exec(k);
  if (m) {
    const monthIdx = MONTH_NAMES_MAP[m[1].toLowerCase()];
    if (monthIdx !== undefined) return utcDate(+m[2], monthIdx, 1);
  }
  m = /^(\d{4})[\s\-_/]+([a-zA-Z]+)$/.exec(k);
  if (m) {
    const monthIdx = MONTH_NAMES_MAP[m[2].toLowerCase()];
    if (monthIdx !== undefined) return utcDate(+m[1], monthIdx, 1);
  }

  // 9. Month name only (e.g. Gennaio, Feb, March, default to 2026 anchor year)
  m = /^([a-zA-Z]+)$/.exec(k);
  if (m) {
    const monthIdx = MONTH_NAMES_MAP[m[1].toLowerCase()];
    if (monthIdx !== undefined) return utcDate(2026, monthIdx, 1);
  }

  // 10. Epoch timestamps: milliseconds (11-13 digits) or seconds (10 digits)
  if (/^\d{11,13}$/.test(k)) {
    const d = new Date(Number(k));
    return utcDate(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  if (/^\d{10}$/.test(k)) {
    const d = new Date(Number(k) * 1000);
    return utcDate(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }

  return null;
}

/**
 * Automatically detects the natural time grain from a list of pivot period keys.
 * Handles YYYY (year), Q1..Q4 / YYYY-Qn (quarter), YYYY-MM / month names (month),
 * YYYY-MM-DD / DD-MM-YYYY (day or week), and epoch timestamps.
 */
export function detectNaturalGrain(
  periodKeys: (string | number | unknown)[],
): Exclude<ComparisonTimeGrain, 'auto'> {
  if (!periodKeys || periodKeys.length === 0) return 'month';

  const strings = periodKeys
    .map(k => (k === null || k === undefined ? '' : String(k).trim()))
    .filter(Boolean);

  if (strings.length === 0) return 'month';

  // 1. Year pattern: 4 digits (e.g. 2023, 2024, 2025)
  if (strings.every(s => /^\d{4}$/.test(s))) {
    return 'year';
  }

  // 2. Quarter pattern: Q1..Q4 or YYYY-Qn / YYYY Qn
  if (strings.every(s => /^(\d{4}[-\s]?)?Q[1-4]$/i.test(s))) {
    return 'quarter';
  }

  // 3. Month pattern: YYYY-MM, MM-YYYY, YYYY/MM, MM/YYYY, or Month name
  const isMonthLike = (s: string) =>
    /^\d{4}[-/]\d{1,2}$/.test(s) ||
    /^\d{1,2}[-/]\d{4}$/.test(s) ||
    /^[a-zA-Z]+[\s\-_/]+\d{4}$/.test(s) ||
    /^\d{4}[\s\-_/]+[a-zA-Z]+$/.test(s) ||
    /^[a-zA-Z]+$/.test(s);

  if (strings.every(isMonthLike)) {
    return 'month';
  }

  // 4. Day / Week pattern: YYYY-MM-DD or DD/MM/YYYY
  const isDayLike = (s: string) =>
    /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(s) ||
    /^\d{1,2}[-/]\d{1,2}[-/]\d{4}/.test(s);

  if (strings.every(isDayLike)) {
    const dates = strings
      .map(parsePeriodKey)
      .filter((d): d is Date => d !== null)
      .sort((a, b) => a.getTime() - b.getTime());

    if (dates.length >= 2) {
      let isWeekly = true;
      for (let i = 1; i < dates.length; i++) {
        const diffDays = Math.round((dates[i].getTime() - dates[i - 1].getTime()) / DAY_MS);
        if (diffDays % 7 !== 0 || diffDays === 0) {
          isWeekly = false;
          break;
        }
      }
      if (isWeekly) return 'week';
    }
    return 'day';
  }

  // Fallback: analyze parsed dates intervals
  const dates = strings
    .map(parsePeriodKey)
    .filter((d): d is Date => d !== null);

  if (dates.length >= 2) {
    dates.sort((a, b) => a.getTime() - b.getTime());
    const minDiffDays = Math.round((dates[1].getTime() - dates[0].getTime()) / DAY_MS);
    if (minDiffDays >= 350) return 'year';
    if (minDiffDays >= 80 && minDiffDays <= 100) return 'quarter';
    if (minDiffDays >= 25 && minDiffDays <= 32) return 'month';
    if (minDiffDays === 7) return 'week';
    if (minDiffDays === 1) return 'day';
  }

  return 'month';
}

/** Ordinal of the period containing `date`, so that the preceding period is `ordinal - 1`. */
function periodOrdinal(date: Date, grain: ComparisonTimeGrain): number {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = Math.floor(date.getTime() / DAY_MS);
  switch (grain) {
    case 'year':
      return year;
    case 'quarter':
      return year * 4 + Math.floor(month / 3);
    case 'month':
      return year * 12 + month;
    case 'week':
      // Day 0 (1970-01-01) is a Thursday: the +3 shift starts weeks on Monday.
      return Math.floor((day + 3) / 7);
    default:
      return day;
  }
}

export interface PeriodIndex {
  keysByPeriod: Map<number, string[]>;
  latest: number;
  yearAgo: number;
  ytd: number[];
  effectiveGrain: Exclude<ComparisonTimeGrain, 'auto'>;
}

/**
 * Groups the pivot keys into periods of the grain. The latest key anchors the current period;
 * the same period of the previous year is the anchor shifted by 12 months.
 */
export function buildPeriodIndex(periodKeys: string[], grain: ComparisonTimeGrain): PeriodIndex | null {
  const effectiveGrain = grain === 'auto' ? detectNaturalGrain(periodKeys) : grain;
  const dated: { key: string; date: Date }[] = [];
  for (const key of periodKeys) {
    const date = parsePeriodKey(key);
    if (date) dated.push({ key, date });
  }
  if (dated.length === 0) return null;

  const anchor = dated.reduce((a, b) => (b.date > a.date ? b : a)).date;
  const anchorYear = anchor.getUTCFullYear();
  const anchorMonth = anchor.getUTCMonth();
  const lastDayYearAgo = new Date(Date.UTC(anchorYear - 1, anchorMonth + 1, 0)).getUTCDate();
  const yearAgoDate = new Date(
    Date.UTC(anchorYear - 1, anchorMonth, Math.min(anchor.getUTCDate(), lastDayYearAgo)),
  );

  const keysByPeriod = new Map<number, string[]>();
  const ytd = new Set<number>();
  for (const { key, date } of dated) {
    const ordinal = periodOrdinal(date, effectiveGrain);
    const keys = keysByPeriod.get(ordinal);
    if (keys) keys.push(key);
    else keysByPeriod.set(ordinal, [key]);
    if (date.getUTCFullYear() === anchorYear) ytd.add(ordinal);
  }

  return {
    keysByPeriod,
    latest: periodOrdinal(anchor, effectiveGrain),
    yearAgo: periodOrdinal(yearAgoDate, effectiveGrain),
    ytd: Array.from(ytd),
    effectiveGrain,
  };
}

function toFiniteNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw))) {
    return Number(raw);
  }
  return null;
}

type PeriodValueReader = (pivotKey: string) => number | null;

/** Sum of the values of the pivot keys falling in the period; null when none is numeric. */
function periodValue(index: PeriodIndex, ordinal: number, read: PeriodValueReader): number | null {
  let sum = 0;
  let found = false;
  for (const key of index.keysByPeriod.get(ordinal) ?? []) {
    const value = read(key);
    if (value !== null) {
      sum += value;
      found = true;
    }
  }
  return found ? sum : null;
}

function referenceBaseline(
  index: PeriodIndex,
  referencePeriod: ComparisonReferencePeriod,
  read: PeriodValueReader,
): number | null {
  if (referencePeriod === 'previous') return periodValue(index, index.latest - 1, read);
  if (referencePeriod === 'ytd') {
    const values = index.ytd
      .map(ordinal => periodValue(index, ordinal, read))
      .filter((v): v is number => v !== null);
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
  }
  return periodValue(index, index.latest, read);
}

function toComparison(current: number | null, baseline: number | null): PeriodComparison {
  if (current === null || baseline === null) {
    return { current, baseline, delta: null, deltaPct: null };
  }
  const diff = current - baseline;
  return {
    current,
    baseline,
    delta: Math.round(diff * 100) / 100,
    deltaPct: baseline !== 0 ? Math.round((diff / Math.abs(baseline)) * 1000) / 10 : null,
  };
}

/**
 * Compares the current period (the latest pivot key, grouped by the grain) with the baseline
 * selected by the reference period: `current` is the period itself (delta 0), `previous` the
 * immediately preceding period of the same grain, `ytd` the average period of the current
 * year to date.
 */
export function applyReferencePeriodDelta(
  values: Record<string, unknown>,
  periodKeys: string[],
  timeGrain: ComparisonTimeGrain,
  referencePeriod: ComparisonReferencePeriod,
): PeriodComparison {
  const index = buildPeriodIndex(periodKeys, timeGrain);
  if (!index) return toComparison(null, null);
  const read: PeriodValueReader = key => toFiniteNumber(values[key]);
  return toComparison(
    periodValue(index, index.latest, read),
    referenceBaseline(index, referencePeriod, read),
  );
}

/**
 * Writes `${metric}___period_delta` and `${metric}___period_delta_pct` on every node, comparing
 * the current period with the baseline of the strategy: `prev_period` follows the reference
 * period, `prev_year_same_period` uses the period 12 months earlier, `budget_target` the
 * target of the matching goal. Periods come from the pivot keys (`${metric}___${key}` cells).
 * Returns false, leaving the tree untouched, when no pivot key is a period.
 */
export function computeTreeTimeDeltaByStrategy(
  treeData: TreeNode[],
  metrics: string[],
  periodKeys: string[],
  config: TimeDeltaStrategyConfig,
): boolean {
  const index = buildPeriodIndex(periodKeys, config.timeGrain);
  if (!index) return false;
  const baseMetrics = metrics.filter(
    m => !m.toLowerCase().includes('delta') && !(m.toLowerCase().includes('variazione') || m.toLowerCase().includes('change')),
  );

  const visit = (node: TreeNode) => {
    for (const m of baseMetrics) {
      const read: PeriodValueReader = key =>
        toFiniteNumber(node.metrics?.[`${m}___${key}`] ?? node.subtotals?.[`${m}___${key}`]);
      let baseline: number | null;
      if (config.strategy === 'budget_target') {
        baseline = config.goals?.find(goal => goal.metricKey === m)?.target ?? null;
      } else if (config.strategy === 'prev_year_same_period') {
        baseline = periodValue(index, index.yearAgo, read);
      } else {
        baseline = referenceBaseline(index, config.referencePeriod, read);
      }

      const { delta, deltaPct } = toComparison(periodValue(index, index.latest, read), baseline);
      node.metrics[`${m}${PERIOD_DELTA_SUFFIX}`] = delta;
      node.metrics[`${m}${PERIOD_DELTA_PCT_SUFFIX}`] = deltaPct;
      if (node.subtotals) {
        node.subtotals[`${m}${PERIOD_DELTA_SUFFIX}`] = delta;
        node.subtotals[`${m}${PERIOD_DELTA_PCT_SUFFIX}`] = deltaPct;
      }
    }
    node.children?.forEach(visit);
  };

  treeData.forEach(visit);
  return true;
}

export function computePivotTimeDelta(
  treeData: TreeNode[],
  baseMetrics: string[],
  pivotValues: string[],
  mode: PivotTimeDeltaMode,
  lag: number = 1,
): void {
  if (!mode || mode === 'none' || !pivotValues || pivotValues.length === 0) return;
  const safeLag = Math.max(1, lag || 1);

  function processNode(node: TreeNode) {
    for (const m of baseMetrics) {
      if (m.toLowerCase().includes('delta') || (m.toLowerCase().includes('variazione') || m.toLowerCase().includes('change'))) {
        continue;
      }

      for (let i = 0; i < pivotValues.length; i++) {
        const currentPVal = pivotValues[i];
        const currentKey = `${m}___${currentPVal}`;
        const deltaKey = `${m}___delta___${currentPVal}`;
        const deltaPctKey = `${m}___delta_pct___${currentPVal}`;

        const rawCurrent = node.metrics?.[currentKey] ?? node.subtotals?.[currentKey];
        const currentVal =
          typeof rawCurrent === 'number' && Number.isFinite(rawCurrent)
            ? rawCurrent
            : typeof rawCurrent === 'string' && rawCurrent.trim() !== '' && Number.isFinite(Number(rawCurrent))
            ? Number(rawCurrent)
            : null;

        if (i < safeLag) {
          // No preceding period available within lag range
          if (mode === 'absolute' || mode === 'both') {
            node.metrics[deltaKey] = null;
            if (node.subtotals) node.subtotals[deltaKey] = null;
          }
          if (mode === 'percentage' || mode === 'both') {
            node.metrics[deltaPctKey] = null;
            if (node.subtotals) node.subtotals[deltaPctKey] = null;
          }
          continue;
        }

        const prevPVal = pivotValues[i - safeLag];
        const prevKey = `${m}___${prevPVal}`;
        const rawPrev = node.metrics?.[prevKey] ?? node.subtotals?.[prevKey];
        const prevVal =
          typeof rawPrev === 'number' && Number.isFinite(rawPrev)
            ? rawPrev
            : typeof rawPrev === 'string' && rawPrev.trim() !== '' && Number.isFinite(Number(rawPrev))
            ? Number(rawPrev)
            : null;

        // Compute Absolute Delta
        if (mode === 'absolute' || mode === 'both') {
          if (currentVal !== null && prevVal !== null) {
            const delta = Math.round((currentVal - prevVal) * 100) / 100;
            node.metrics[deltaKey] = delta;
            if (node.subtotals) node.subtotals[deltaKey] = delta;
          } else {
            node.metrics[deltaKey] = null;
            if (node.subtotals) node.subtotals[deltaKey] = null;
          }
        }

        // Compute Percentage Delta
        if (mode === 'percentage' || mode === 'both') {
          if (currentVal !== null && prevVal !== null && prevVal !== 0) {
            const deltaPct = Math.round(((currentVal - prevVal) / prevVal) * 1000) / 10;
            node.metrics[deltaPctKey] = deltaPct;
            if (node.subtotals) node.subtotals[deltaPctKey] = deltaPct;
          } else {
            node.metrics[deltaPctKey] = null;
            if (node.subtotals) node.subtotals[deltaPctKey] = null;
          }
        }
      }
    }

    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        processNode(child);
      }
    }
  }

  for (const root of treeData) {
    processNode(root);
  }
}


/**
 * Chiave della base di confronto nativa, cioè del periodo di confronto (T2) del filtro Calendar.
 * Per ogni riga contiene la somma dell'offset nativo di Superset (`${metrica}__${offset}`) su tutti
 * i valori della colonna pivot, quindi il totale del periodo di confronto della riga.
 */
export const NATIVE_COMPARISON_SUFFIX = '___native_cmp';

/**
 * Valore dell'offset nativo di una metrica in un record (`Tot__1 year ago`).
 * `undefined` se il record non ha la colonna di confronto, `null` se la colonna c'è ma è vuota.
 */
export function nativeOffsetValue(record: Record<string, unknown>, metric: string): number | null | undefined {
  const prefix = `${metric}__`;
  for (const key of Object.keys(record)) {
    if (key.length > prefix.length && key.startsWith(prefix)) {
      return toFiniteNumber(record[key]);
    }
  }
  return undefined;
}

/** True when the tree carries a native comparison baseline for at least one base metric */
export function hasNativeComparison(nodes: TreeNode[], metrics: string[]): boolean {
  const keys = metrics.map(m => `${m}${NATIVE_COMPARISON_SUFFIX}`);
  const visit = (node: TreeNode): boolean =>
    keys.some(k => node.metrics?.[k] !== undefined) || (node.children ?? []).some(visit);
  return nodes.some(visit);
}

/**
 * Writes `${metric}___period_delta` and `___period_delta_pct` on every node: the current value is
 * the sum over the pivot values, the baseline is the native comparison (T2 of the calendar filter).
 * Returns false, leaving the tree untouched, when no node has a native baseline.
 */
export function computeNativeTimeDelta(
  nodes: TreeNode[],
  metrics: string[],
  pivotValues: string[],
): boolean {
  if (!hasNativeComparison(nodes, metrics)) return false;
  const baseMetrics = metrics.filter(
    m => !m.toLowerCase().includes('delta') && !(m.toLowerCase().includes('variazione') || m.toLowerCase().includes('change')),
  );

  const visit = (node: TreeNode) => {
    for (const m of baseMetrics) {
      const rawBaseline = node.metrics?.[`${m}${NATIVE_COMPARISON_SUFFIX}`];
      let delta: number | null = null;
      let deltaPct: number | null = null;
      if (rawBaseline !== undefined) {
        const current = pivotValues.reduce<number | null>((sum, pv) => {
          const value = toFiniteNumber(node.metrics?.[`${m}___${pv}`]);
          return value === null ? sum : (sum ?? 0) + value;
        }, null);
        ({ delta, deltaPct } = toComparison(current, toFiniteNumber(rawBaseline)));
      }
      node.metrics[`${m}${PERIOD_DELTA_SUFFIX}`] = delta;
      node.metrics[`${m}${PERIOD_DELTA_PCT_SUFFIX}`] = deltaPct;
      if (node.subtotals) {
        node.subtotals[`${m}${PERIOD_DELTA_SUFFIX}`] = delta;
        node.subtotals[`${m}${PERIOD_DELTA_PCT_SUFFIX}`] = deltaPct;
      }
    }
    node.children?.forEach(visit);
  };

  nodes.forEach(visit);
  return true;
}

export function computeTreeTimeComparison(
  treeData: TreeNode[],
  baseMetrics: string[]
): void {
  if (treeData.length < 2) return;

  // Sort root nodes chronologically (assuming their names are sortable like YYYY-MM)
  const sortedRoots = [...treeData].sort((a, b) => a.name.localeCompare(b.name));

  for (let i = 1; i < sortedRoots.length; i++) {
    const currentRoot = sortedRoots[i];
    const prevRoot = sortedRoots[i - 1];

    compareNodes(currentRoot, prevRoot, baseMetrics);
  }
}

function compareNodes(currentNode: TreeNode, prevNode: TreeNode | undefined, baseMetrics: string[]) {
  // Compute deltas for this node
  for (const m of baseMetrics) {
    // Skip if it's already a delta metric or non-numeric
    if (m.toLowerCase().includes('delta') || (m.toLowerCase().includes('variazione') || m.toLowerCase().includes('change'))) {
      continue;
    }
    
    const currentVal = currentNode.metrics[m];
    const prevVal = prevNode ? prevNode.metrics[m] : null;
    
    const deltaKey = `${m}___delta`;
    
    if (typeof currentVal === 'number' && typeof prevVal === 'number' && prevVal !== 0) {
      const deltaPct = ((currentVal - prevVal) / prevVal) * 100;
      currentNode.metrics[deltaKey] = Math.round(deltaPct * 10) / 10;
      if (currentNode.subtotals) {
        currentNode.subtotals[deltaKey] = currentNode.metrics[deltaKey];
      }
    } else if (typeof currentVal === 'number' && (prevVal === null || prevVal === 0)) {
      // New item, no previous value
      currentNode.metrics[deltaKey] = null; // or could be +Infinity, but null renders as empty or -
      if (currentNode.subtotals) {
        currentNode.subtotals[deltaKey] = null;
      }
    } else {
      currentNode.metrics[deltaKey] = null;
    }
  }

  // Recurse into children
  if (currentNode.children && currentNode.children.length > 0) {
    for (const child of currentNode.children) {
      // Find matching child in prevNode
      const matchingPrevChild = prevNode?.children?.find(c => c.name === child.name);
      compareNodes(child, matchingPrevChild, baseMetrics);
    }
  }
}
