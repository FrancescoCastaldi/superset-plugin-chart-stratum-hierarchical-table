import { ComparisonTimeGrain, TableColumn } from '../types';
import {
  TimeDeltaStrategyConfig,
  detectNaturalGrain,
  parsePeriodKey,
} from './timeComparison';

const MONTHS_IT = [
  'gen', 'feb', 'mar', 'apr', 'mag', 'giu',
  'lug', 'ago', 'set', 'ott', 'nov', 'dic',
];

const GRAIN_NAMES_IT: Record<Exclude<ComparisonTimeGrain, 'auto'>, string> = {
  day: 'giorno',
  week: 'settimana',
  month: 'mese',
  quarter: 'trimestre',
  year: 'anno',
};

const UNITS_IT: Record<string, [string, string]> = {
  second: ['secondo', 'secondi'],
  minute: ['minuto', 'minuti'],
  hour: ['ora', 'ore'],
  day: ['giorno', 'giorni'],
  week: ['settimana', 'settimane'],
  month: ['mese', 'mesi'],
  quarter: ['trimestre', 'trimestri'],
  year: ['anno', 'anni'],
};

const pad = (n: number): string => String(n).padStart(2, '0');

const dmy = (date: Date): string =>
  `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;

/** Human label of one period key at the grain: `ott 2026`, `Q3 2026`, `2026`, `12/10/2026`. */
export function formatPeriodLabel(
  key: unknown,
  grain: Exclude<ComparisonTimeGrain, 'auto'>,
): string | null {
  const date = parsePeriodKey(key);
  if (!date) return null;
  switch (grain) {
    case 'year':
      return String(date.getUTCFullYear());
    case 'quarter':
      return `Q${Math.floor(date.getUTCMonth() / 3) + 1} ${date.getUTCFullYear()}`;
    case 'month':
      return `${MONTHS_IT[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
    default:
      return dmy(date);
  }
}

/**
 * Span covered by the period keys: one label when they all fall in the same period,
 * `first – last` otherwise. Null when no key is a period.
 */
export function periodRangeLabel(
  keys: unknown[],
  grain: ComparisonTimeGrain = 'auto',
): string | null {
  const dated = (keys || [])
    .map(key => ({ key, date: parsePeriodKey(key) }))
    .filter((entry): entry is { key: unknown; date: Date } => entry.date !== null);
  if (dated.length === 0) return null;

  const effectiveGrain =
    grain === 'auto' ? detectNaturalGrain(dated.map(entry => entry.key)) : grain;
  const sorted = [...dated].sort((a, b) => a.date.getTime() - b.date.getTime());
  const first = formatPeriodLabel(sorted[0].key, effectiveGrain);
  const last = formatPeriodLabel(sorted[sorted.length - 1].key, effectiveGrain);
  if (!first || !last) return null;
  return first === last ? first : `${first} – ${last}`;
}

/** `dd/mm/yyyy – dd/mm/yyyy` of the time range applied to the query; null when unknown. */
export function formatTimeRange(range?: {
  from?: unknown;
  to?: unknown;
} | null): string | null {
  const toDate = (value: unknown): Date | null => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return new Date(value);
    // Dates without a zone come from the query as UTC: parsePeriodKey reads them as such,
    // where the Date constructor would shift them by the local offset.
    const date = parsePeriodKey(value) ?? new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const from = toDate(range?.from);
  const to = toDate(range?.to);
  if (!from && !to) return null;
  if (from && to) return `${dmy(from)} – ${dmy(to)}`;
  return dmy((from ?? to) as Date);
}

/** Italian reading of a Superset time offset: `1 month ago` becomes `1 mese fa`. */
export function comparisonOffsetLabel(offset: unknown): string | null {
  if (offset === null || offset === undefined) return null;
  const raw = String(offset).trim();
  if (!raw) return null;
  if (raw.toLowerCase() === 'inherited') return 'periodo precedente';
  const match = /^(\d+)\s+([a-z]+?)s?\s+ago$/i.exec(raw);
  if (match) {
    const unit = UNITS_IT[match[2].toLowerCase()];
    if (unit) {
      const amount = Number(match[1]);
      return `${amount} ${amount === 1 ? unit[0] : unit[1]} fa`;
    }
  }
  return raw;
}

const toUtcDate = (value: unknown): Date | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return new Date(value);
  const date = parsePeriodKey(value) ?? new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
};

/** The date moved back by a Superset offset (`1 year ago`); null for an offset it cannot read. */
function shiftBack(date: Date, offset: string): Date | null {
  const match = /^(\d+)\s+(year|quarter|month|week|day)s?\s+ago$/i.exec(offset.trim());
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const shifted = new Date(date.getTime());
  if (unit === 'year') shifted.setUTCFullYear(shifted.getUTCFullYear() - amount);
  else if (unit === 'quarter') shifted.setUTCMonth(shifted.getUTCMonth() - 3 * amount);
  else if (unit === 'month') shifted.setUTCMonth(shifted.getUTCMonth() - amount);
  else shifted.setUTCDate(shifted.getUTCDate() - (unit === 'week' ? 7 : 1) * amount);
  return shifted;
}

/** Month and year of a range, `ott 2025`, `ott 2025 – dic 2025`, or the year of a whole year. */
function monthRangeLabel(start: Date, end: Date): string {
  const label = (date: Date) => `${MONTHS_IT[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
  const wholeYear =
    start.getUTCMonth() === 0 &&
    end.getUTCMonth() === 11 &&
    start.getUTCFullYear() === end.getUTCFullYear();
  if (wholeYear) return String(start.getUTCFullYear());
  const first = label(start);
  const last = label(end);
  return first === last ? first : `${first} – ${last}`;
}

/**
 * Period of the comparison (T2) as month and year: the time range of the query moved back by the
 * offset of the calendar filter. The end of the range is exclusive in Superset, so it is read one
 * millisecond earlier. Null when the range or the offset is unknown.
 */
export function comparisonPeriodLabel(
  timeRange: { from?: unknown; to?: unknown } | null | undefined,
  offset: unknown,
): string | null {
  const from = toUtcDate(timeRange?.from);
  const to = toUtcDate(timeRange?.to);
  if (!from || !offset) return null;
  const raw = String(offset).trim();
  let start: Date | null;
  let end: Date | null;
  if (raw.toLowerCase() === 'inherited') {
    // The same span, immediately before the current one.
    if (!to) return null;
    const span = to.getTime() - from.getTime();
    start = new Date(from.getTime() - span);
    end = new Date(from.getTime() - 1);
  } else {
    start = shiftBack(from, raw);
    const shiftedTo = to ? shiftBack(to, raw) : null;
    end = shiftedTo ? new Date(shiftedTo.getTime() - 1) : start;
  }
  return start && end ? monthRangeLabel(start, end) : null;
}

/**
 * Text of the comparison columns from the template of the control. `{periodo}` is the comparison
 * period (`ott 2025`), `{corrente}` the current one and `{offset}` the offset (`1 anno fa`).
 * An empty template is `{periodo}`; a token that cannot be known falls back to the offset and,
 * without it, to `Confronto`.
 */
export function resolveComparisonLabel(
  template: string,
  scope: { timeRange?: { from?: unknown; to?: unknown } | null; offset?: unknown },
): string {
  const offsetText = comparisonOffsetLabel(scope.offset);
  const from = toUtcDate(scope.timeRange?.from);
  const to = toUtcDate(scope.timeRange?.to);
  const current = from ? monthRangeLabel(from, to ? new Date(to.getTime() - 1) : from) : null;
  const comparison = comparisonPeriodLabel(scope.timeRange, scope.offset);
  const text = (template.trim() || '{periodo}')
    .replace(/\{periodo\}/g, comparison ?? offsetText ?? 'Confronto')
    .replace(/\{corrente\}/g, current ?? 'corrente')
    .replace(/\{offset\}/g, offsetText ?? 'periodo di confronto');
  return text;
}

export interface PeriodScope {
  /** What the reference columns cover. */
  reference: string | null;
  /** What the comparison and delta columns are measured against. */
  comparison: string | null;
}

export interface PeriodScopeInput {
  /** Period keys of the chart: the pivot values, or the names of the root nodes. */
  periodKeys?: unknown[];
  /** Offset of the native time comparison, e.g. `1 month ago`. */
  comparisonOffset?: unknown;
  /** Time range applied to the query (`from_dttm` / `to_dttm`). */
  timeRange?: { from?: unknown; to?: unknown } | null;
  /** Comparison strategy of the single pivot layout, when one applies. */
  strategy?: TimeDeltaStrategyConfig | null;
  grain?: ComparisonTimeGrain;
}

/** The two spans to write next to the metrics: what is shown, and what it is compared with. */
export function resolvePeriodScope({
  periodKeys = [],
  comparisonOffset,
  timeRange,
  strategy,
  grain = 'auto',
}: PeriodScopeInput): PeriodScope {
  const reference = periodRangeLabel(periodKeys, grain) ?? formatTimeRange(timeRange);
  const effectiveGrain =
    grain === 'auto' ? detectNaturalGrain(periodKeys as string[]) : grain;
  const previousLabel = `${GRAIN_NAMES_IT[effectiveGrain]} precedente`;

  const offsetLabel = comparisonOffsetLabel(comparisonOffset);
  if (offsetLabel) return { reference, comparison: offsetLabel };

  if (strategy) {
    if (strategy.strategy === 'budget_target') return { reference, comparison: 'obiettivo' };
    if (strategy.strategy === 'prev_year_same_period') {
      return { reference, comparison: 'stesso periodo anno precedente' };
    }
    if (strategy.referencePeriod === 'ytd') {
      return { reference, comparison: 'media da inizio anno' };
    }
    if (strategy.referencePeriod === 'previous') {
      return { reference, comparison: previousLabel };
    }
    return { reference, comparison: null };
  }

  const periodCount = (periodKeys || []).filter(key => parsePeriodKey(key) !== null).length;
  return { reference, comparison: periodCount >= 2 ? previousLabel : null };
}

const isDeltaColumn = (column: TableColumn): boolean =>
  /___delta|___diff|___period_delta/.test(column.key) ||
  (typeof column.title === 'string' && column.title.trim().startsWith('Δ'));

/**
 * Writes the span of each metric column next to its name: the reference span on the value
 * columns, the comparison span on the comparison ones, both on the deltas. Pivot columns are
 * left alone, their header already names the period.
 */
export function applyPeriodLabels(columns: TableColumn[], scope: PeriodScope): TableColumn[] {
  const { reference, comparison } = scope;
  if (!reference && !comparison) return columns;

  return columns.map(column => {
    if (!column.isMetric || column.pivotValue !== undefined) return column;

    let suffix: string | null = null;
    if (column.key.endsWith('___comp')) {
      suffix = comparison;
    } else if (isDeltaColumn(column)) {
      suffix = reference && comparison ? `${reference} vs ${comparison}` : comparison;
    } else {
      suffix = reference;
    }

    const title = typeof column.title === 'string' ? column.title : '';
    if (!suffix || title.includes(suffix)) return column;
    return { ...column, title: `${title} (${suffix})` };
  });
}

/**
 * Offset of the native time comparison: read from the fetched columns (`metrica__1 month ago`)
 * and, when the data says nothing, from the form data.
 */
export function detectComparisonOffset(
  records: Record<string, unknown>[] | undefined,
  metrics: string[],
  formData?: Record<string, any>,
): string | null {
  const first = records?.[0];
  if (first) {
    for (const key of Object.keys(first)) {
      const metric = metrics.find(m => key.startsWith(`${m}__`) && key !== m);
      if (metric) {
        const offset = key.slice(metric.length + 2);
        if (offset) return offset;
      }
    }
  }
  const fromFormData =
    formData?.extra_form_data?.time_compare ?? formData?.time_compare ?? null;
  const offset = Array.isArray(fromFormData) ? fromFormData[0] : fromFormData;
  return offset ? String(offset) : null;
}
