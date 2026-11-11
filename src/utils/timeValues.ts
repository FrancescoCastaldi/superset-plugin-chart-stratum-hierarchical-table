import { DataRecord } from '@superset-ui/core';

/**
 * Time and duration metrics.
 *
 * A metric of type Time (SQL Server `time`, an average waiting time) reaches the table as text such as
 * "00:12:54.425000". The table works on seconds: the columns that hold times are converted to numbers
 * once, before the tree is built, and the cells are written back as durations at the end.
 */

export type TimeDetection = 'auto' | 'off';
export type TimeDisplayFormat = 'auto' | 'hms' | 'ms' | 'minutes' | 'hours' | 'seconds';
export type TimeRollup = 'mean' | 'general';

export interface TimeFormatOptions {
  format?: TimeDisplayFormat;
  /** Decimals of the seconds in clock formats and of the value in decimal formats */
  fractionDigits?: number;
  /** Largest value of the table in seconds: the automatic format shows hours when it reaches one */
  referenceSeconds?: number;
}

const CLOCK_RE =
  /^(-)?(?:(\d+)\s*(?:days?|d)\s*,?\s*)?(\d{1,4}):([0-5]\d):([0-5]\d)(?:[.,](\d{1,9}))?\s*(?:Z|[+-]\d{2}(?::?\d{2})?)?$/i;
const ISO_DURATION_RE = /^(-)?P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:[.,]\d+)?)S)?)?$/i;

/**
 * Seconds of a time or duration written as text, or null when the text is not one.
 * Accepted: `HH:MM:SS`, `H:MM:SS.ffffff`, `26:10:00` (more than 24 hours), `1 day, 2:03:04`,
 * `0 days 00:12:54.425000` and ISO 8601 durations (`PT12M54S`). Two-part values such as `12:54` are not
 * accepted: they could be hours and minutes or minutes and seconds.
 */
export function parseTimeToSeconds(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text) return null;

  const clock = CLOCK_RE.exec(text);
  if (clock) {
    const [, minus, days, hours, minutes, seconds, fraction] = clock;
    const total =
      Number(days || 0) * 86400 +
      Number(hours) * 3600 +
      Number(minutes) * 60 +
      Number(seconds) +
      (fraction ? Number(`0.${fraction}`) : 0);
    return minus ? -total : total;
  }

  const iso = ISO_DURATION_RE.exec(text);
  if (iso && /[0-9]/.test(text)) {
    const [, minus, days, hours, minutes, seconds] = iso;
    const total =
      Number(days || 0) * 86400 +
      Number(hours || 0) * 3600 +
      Number(minutes || 0) * 60 +
      Number((seconds || '0').replace(',', '.'));
    return minus ? -total : total;
  }

  return null;
}

/** True when every non-empty value of the column is a time and there is at least one */
export function isTimeColumn(rows: DataRecord[], key: string): boolean {
  let seen = 0;
  for (const row of rows) {
    const value = row[key];
    if (value === null || value === undefined || value === '') continue;
    if (parseTimeToSeconds(value) === null) return false;
    seen += 1;
  }
  return seen > 0;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

function clock(totalSeconds: number, withHours: boolean, digits: number): string {
  const sign = totalSeconds < 0 ? '-' : '';
  const factor = 10 ** digits;
  const rounded = Math.round(Math.abs(totalSeconds) * factor) / factor;
  const whole = Math.floor(rounded);
  const fraction = digits > 0 ? `.${String(Math.round((rounded - whole) * factor)).padStart(digits, '0')}` : '';
  const seconds = whole % 60;
  const minutesTotal = Math.floor(whole / 60);
  if (withHours) {
    return `${sign}${Math.floor(minutesTotal / 60)}:${pad2(minutesTotal % 60)}:${pad2(seconds)}${fraction}`;
  }
  return `${sign}${pad2(minutesTotal)}:${pad2(seconds)}${fraction}`;
}

function decimal(value: number, digits: number, unit: string): string {
  return `${Number(value.toFixed(digits)).toLocaleString('it-IT', { maximumFractionDigits: digits })} ${unit}`;
}

/** Text of a number of seconds in the chosen display format */
export function formatDuration(seconds: number, options: TimeFormatOptions = {}): string {
  if (typeof seconds !== 'number' || !isFinite(seconds)) return '';
  const { format = 'auto', fractionDigits = 0, referenceSeconds } = options;
  const digits = Math.min(3, Math.max(0, Math.round(fractionDigits)));
  switch (format) {
    case 'hms':
      return clock(seconds, true, digits);
    case 'ms':
      return clock(seconds, false, digits);
    case 'minutes':
      return decimal(seconds / 60, digits, 'min');
    case 'hours':
      return decimal(seconds / 3600, digits, 'h');
    case 'seconds':
      return decimal(seconds, digits, 's');
    default: {
      // Automatic: hours appear when the table has a value of an hour or more. The choice is made on
      // the rounded value: 3599.6 s is written 1:00:00, not 60:00
      const factor = 10 ** digits;
      const reference = Math.round(Math.max(Math.abs(seconds), referenceSeconds || 0) * factor) / factor;
      return clock(seconds, reference >= 3600, digits);
    }
  }
}

/** Difference between two durations: always with its sign, `+05:00` or `-00:30` */
export function formatSignedDuration(seconds: number, options: TimeFormatOptions = {}): string {
  if (typeof seconds !== 'number' || !isFinite(seconds)) return '';
  const text = formatDuration(Math.abs(seconds), options);
  return seconds > 0 ? `+${text}` : seconds < 0 ? `-${text}` : text;
}

/**
 * What a column key holds, for a time metric: `value` (cells, row totals, the comparison period),
 * `delta` (a difference of two durations, which is a duration) or `other` (a percentage, a ratio or
 * percentage points: plain numbers).
 */
export function timeColumnRole(key: string): 'value' | 'delta' | 'other' {
  const parts = key.split('___');
  const last = parts[parts.length - 1];
  if (parts.length > 1) {
    if (last === 'diff' || last === 'period_delta') return 'delta';
    if (parts[1] === 'delta' && parts.length > 2) return 'delta';
    if (['delta', 'pp', 'ratio', 'delta_pct', 'period_delta_pct'].includes(last) || parts[1] === 'delta_pct') {
      return 'other';
    }
  }
  return 'value';
}

/** Rows with the time columns among `candidates` converted to seconds, and the names of those columns */
export function convertTimeColumns(
  rows: DataRecord[],
  candidates: string[],
): { rows: DataRecord[]; timeKeys: string[] } {
  if (rows.length === 0 || candidates.length === 0) return { rows, timeKeys: [] };
  const present = new Set<string>();
  rows.forEach(row => Object.keys(row).forEach(k => present.add(k)));
  const wanted = new Set(candidates.map(c => c.toLowerCase()));
  const timeKeys = Array.from(present).filter(k => wanted.has(k.toLowerCase()) && isTimeColumn(rows, k));
  if (timeKeys.length === 0) return { rows, timeKeys: [] };
  const converted = rows.map(row => {
    const copy: DataRecord = { ...row };
    timeKeys.forEach(k => {
      const value = row[k];
      copy[k] = value === null || value === undefined || value === '' ? null : parseTimeToSeconds(value);
    });
    return copy;
  });
  return { rows: converted, timeKeys };
}
