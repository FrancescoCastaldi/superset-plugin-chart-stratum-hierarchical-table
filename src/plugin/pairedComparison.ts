import { TableColumn, TreeNode } from '../types';
import { isDerivedMetric, isDistinctEntityMetric } from '../utils/aggregations';
import { formatMetricValue } from '../utils/formatters';
import { COMPARISON_SUFFIX } from '../utils/timeComparison';
import type { ColumnLayout, ValueFormat } from './columnBuilders';

/**
 * Paired comparison: next to every value cell, the same cell computed on the comparison period
 * (T2 of the calendar filter, which Superset sends as a time offset) and its delta, in the formats
 * the user picks. It works on any metric and on any layout (flat, single pivot, two-way pivot):
 * the comparison of a cell is the offset of the metric on the same row and the same pivot values.
 */
export type ComparisonFormat = 'abs' | 'pct' | 'pp' | 'ratio';

export { COMPARISON_SUFFIX };

/** Suffix of each delta of a cell, which is also the key of the column that shows it. */
export const DELTA_SUFFIX: Record<ComparisonFormat, string> = {
  abs: '___diff',
  pct: '___delta',
  pp: '___pp',
  ratio: '___ratio',
};

/** Order of the delta columns, whatever the order of the selection. */
const FORMAT_ORDER: ComparisonFormat[] = ['abs', 'pct', 'pp', 'ratio'];

/** What the flat layout always showed before the formats were selectable. */
export const LEGACY_FLAT_FORMATS: ComparisonFormat[] = ['pct'];
export const DEFAULT_PIVOT_FORMATS: ComparisonFormat[] = ['pct'];

export type CalendarComparisonMode = 'paired' | 'row_total';

/** Maps each base metric to its SQL time-offset column (`${metric}__${offset}`), ignoring synthetic `___` keys. */
export function flatComparisonColumns(
  records: Record<string, any>[] | undefined,
  metrics: string[],
): Record<string, string> {
  const compMap: Record<string, string> = {};
  if (!records || records.length === 0) return compMap;
  const keys = Object.keys(records[0]);
  for (const m of metrics) {
    const k = keys.find(key => key.startsWith(`${m}__`) && !key.startsWith(`${m}___`));
    if (k) compMap[m] = k;
  }
  return compMap;
}

/**
 * Formats of the selection, in column order and without duplicates. Anything that is not a list
 * (a chart saved before the control existed) gives the fallback; an empty list is a valid choice
 * and shows the pair of values with no delta.
 */
export function resolveComparisonFormats(
  raw: unknown,
  fallback: ComparisonFormat[],
): ComparisonFormat[] {
  if (!Array.isArray(raw)) return fallback;
  return FORMAT_ORDER.filter(format => raw.includes(format));
}

function toNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw))) {
    return Number(raw);
  }
  return null;
}

export interface PairedDeltas {
  abs: number | null;
  pct: number | string | null;
  pp: number | null;
  ratio: number | null;
}

/**
 * Deltas of a current value against its comparison. A missing value on either side gives no
 * delta; a zero comparison gives no percentage and no ratio, except `Nuovo` for a positive value.
 */
export function computePairedDeltas(current: unknown, comparison: unknown): PairedDeltas {
  const cur = toNumber(current);
  const comp = toNumber(comparison);
  if (cur === null || comp === null) return { abs: null, pct: null, pp: null, ratio: null };
  const diff = cur - comp;
  let pct: number | string | null;
  if (comp !== 0) pct = Math.round((diff / Math.abs(comp)) * 1000) / 10;
  else if (cur === 0) pct = 0;
  else pct = cur > 0 ? 'Nuovo' : null;
  return {
    abs: Math.round(diff * 100) / 100,
    pct,
    pp: Math.round(diff * 100) / 100,
    ratio: comp !== 0 ? Math.round((cur / comp) * 100) / 100 : null,
  };
}

/** Keys of the cells (without the suffix) that have a comparison value on at least one row. */
export function collectComparisonKeys(nodes: TreeNode[]): Set<string> {
  const found = new Set<string>();
  const visit = (node: TreeNode) => {
    for (const key of Object.keys(node.metrics ?? {})) {
      if (key.endsWith(COMPARISON_SUFFIX)) found.add(key.slice(0, -COMPARISON_SUFFIX.length));
    }
    node.children?.forEach(visit);
  };
  nodes.forEach(visit);
  return found;
}

/**
 * Writes the deltas of every listed cell on every node, from its current value and its
 * comparison. Run it on the tree and, separately, on the grand total.
 */
export function writePairedDeltas(
  nodes: TreeNode[],
  cellKeys: string[],
  formats: ComparisonFormat[],
): void {
  if (formats.length === 0 || cellKeys.length === 0) return;
  const visit = (node: TreeNode) => {
    for (const key of cellKeys) {
      const comparison = node.metrics?.[`${key}${COMPARISON_SUFFIX}`];
      if (comparison === undefined) continue;
      const deltas = computePairedDeltas(node.metrics?.[key] ?? node.subtotals?.[key], comparison);
      for (const format of formats) {
        node.metrics[`${key}${DELTA_SUFFIX[format]}`] = deltas[format];
        if (node.subtotals) node.subtotals[`${key}${DELTA_SUFFIX[format]}`] = deltas[format];
      }
    }
    node.children?.forEach(visit);
  };
  nodes.forEach(visit);
}

/**
 * Comparison of the single pivot row total: the sum of the comparison of its pivot values, like
 * the row total of the current values. Rates and entity counts have no sum, so they get none.
 */
export function writeRowTotalComparison(
  nodes: TreeNode[],
  metrics: string[],
  pivotValues: string[],
): void {
  const summable = metrics.filter(m => !isDerivedMetric(m) && !isDistinctEntityMetric(m));
  if (summable.length === 0 || pivotValues.length === 0) return;
  const visit = (node: TreeNode) => {
    for (const m of summable) {
      let total: number | null = null;
      for (const pv of pivotValues) {
        const value = toNumber(node.metrics?.[`${m}___${pv}${COMPARISON_SUFFIX}`]);
        if (value !== null) total = (total ?? 0) + value;
      }
      if (total !== null) {
        node.metrics[`${m}___ROW_TOTAL${COMPARISON_SUFFIX}`] = total;
        if (node.subtotals) node.subtotals[`${m}___ROW_TOTAL${COMPARISON_SUFFIX}`] = total;
      }
    }
    node.children?.forEach(visit);
  };
  nodes.forEach(visit);
}

const signed = (value: number, text: string): string => `${value > 0 ? '+' : ''}${text}`;

function deltaFormatter(format: ComparisonFormat, value: ValueFormat, metric: string) {
  switch (format) {
    case 'pct':
      return (val: any) =>
        typeof val === 'string'
          ? val
          : val === null || val === undefined
          ? '-'
          : signed(val, `${val}%`);
    case 'pp':
      return (val: any) =>
        val === null || val === undefined ? '-' : signed(val, `${val.toFixed(1)} pp`);
    case 'ratio':
      return (val: any) => (val === null || val === undefined ? '-' : `${val.toFixed(2)}×`);
    default:
      return (val: any) =>
        formatMetricValue(val, value.numberFormat, value.currencySymbol, `${metric}___delta`);
  }
}

const DELTA_TITLE: Record<ComparisonFormat, string> = {
  abs: 'Δ',
  pct: 'Δ%',
  pp: 'Δ pp',
  ratio: 'Δ×',
};

/**
 * Delta columns of a value column, in the order of the formats. The title of the value column
 * names the cell (the metric, or the pivot value), so the deltas read `Δ% Lunedì`.
 */
export function buildDeltaColumns(
  current: Pick<TableColumn, 'key' | 'title' | 'pivotValue' | 'width'>,
  formats: ComparisonFormat[],
  value: ValueFormat,
): TableColumn[] {
  const metric = current.key.split('___')[0];
  return formats.map(format => ({
    key: `${current.key}${DELTA_SUFFIX[format]}`,
    title: `${DELTA_TITLE[format]} ${current.title}`,
    dataIndex: `${current.key}${DELTA_SUFFIX[format]}`,
    isMetric: true,
    ...(current.pivotValue !== undefined ? { pivotValue: current.pivotValue } : {}),
    // The base metric lets the polarity of the metric definition reach the delta.
    baseMetric: format === 'pct' ? `${metric} Δ%` : `${metric} Delta`,
    align: 'right' as const,
    width: format === 'pct' ? 105 : 115,
    ...(format === 'ratio' ? { deltaBaseline: 1 } : {}),
    formatter: deltaFormatter(format, value, metric),
  }));
}

/** The comparison column of a value column, with the formatter and the place of the original. */
export function buildComparisonColumn(current: TableColumn, label: string): TableColumn {
  return {
    ...current,
    key: `${current.key}${COMPARISON_SUFFIX}`,
    title: `${current.title} (${label})`,
    dataIndex: `${current.key}${COMPARISON_SUFFIX}`,
  };
}

/**
 * Puts, after every value column that has a comparison, the comparison column and its deltas,
 * and widens the header groups over them. The deltas of the cells are written on the tree.
 * Returns the cell keys that were paired, none when the data carries no comparison.
 */
export function insertPairedColumns(
  layout: ColumnLayout,
  treeData: TreeNode[],
  formats: ComparisonFormat[],
  label: string,
  value: ValueFormat,
): string[] {
  const available = collectComparisonKeys(treeData);
  if (available.size === 0) return [];

  const columns: TableColumn[] = [];
  const addedAfter: number[] = [];
  const paired: string[] = [];
  layout.columns.forEach((column, index) => {
    columns.push(column);
    addedAfter[index] = 0;
    if (!column.isMetric || column.sparkline || !available.has(column.key)) return;
    const added = [buildComparisonColumn(column, label), ...buildDeltaColumns(column, formats, value)];
    columns.push(...added);
    addedAfter[index] = added.length;
    paired.push(column.key);
    for (const extra of added) layout.metricKeys.push(extra.key);
  });
  if (paired.length === 0) return [];

  // The header groups cover the columns in order: each one grows by what was added under it.
  let cursor = 0;
  layout.pivotHeaderGroups = layout.pivotHeaderGroups.map(group => {
    let extra = 0;
    for (let i = cursor; i < cursor + group.colSpan; i++) extra += addedAfter[i] ?? 0;
    cursor += group.colSpan;
    return extra > 0 ? { ...group, colSpan: group.colSpan + extra } : group;
  });
  layout.columns = columns;
  layout.pairedKeys = paired;
  layout.pairedFormats = formats;

  writePairedDeltas(treeData, paired, formats);
  return paired;
}
