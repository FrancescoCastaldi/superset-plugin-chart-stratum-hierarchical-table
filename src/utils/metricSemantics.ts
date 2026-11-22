import {
  ConfidenceMethod,
  MetricDefinition,
  MetricFormat,
  MetricPolarity,
  MetricType,
  RankMethod,
  SignalReference,
  TableCalculationScope,
  TableCalculationType,
  TreeNode,
} from '../types';
import { weightedMean } from './aggregations';

const METRIC_TYPES: readonly MetricType[] = ['sum', 'mean', 'distinct_count', 'ratio', 'delta_pct', 'diff', 'none'];
const METRIC_FORMATS: readonly MetricFormat[] = ['integer', 'decimal', 'percent', 'duration', 'days', 'currency'];
const POLARITIES: readonly MetricPolarity[] = ['higher_is_better', 'lower_is_better'];
const CI_METHODS: readonly ConfidenceMethod[] = ['none', 'wilson', 'poisson'];
const SIGNAL_REFERENCES: readonly SignalReference[] = ['parent', 'total', 'goal'];
const CI_LEVELS = [0.9, 0.95, 0.99, 0.998];
const CALCULATION_TYPES: readonly TableCalculationType[] = [
  'pct_of_total',
  'pct_of_parent',
  'running_total',
  'diff_from_previous',
  'diff_from_previous_pct',
  'rank',
];
const CALCULATION_SCOPES: readonly TableCalculationScope[] = ['hierarchy', 'periods'];
const RANK_METHODS: readonly RankMethod[] = ['competition', 'dense'];
const RANK_ORDERS: readonly ('desc' | 'asc')[] = ['desc', 'asc'];
const CALCULATION_DISPLAY_MODES: readonly ('replace' | 'companion_column')[] = ['replace', 'companion_column'];

const text = (raw: unknown): string => (typeof raw === 'string' ? raw.trim() : '');

function pick<T extends string>(allowed: readonly T[], raw: unknown): T | undefined {
  return allowed.includes(raw as T) ? (raw as T) : undefined;
}

function finite(raw: unknown): number | undefined {
  const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

/**
 * Definitions from the JSON control (text or array). Malformed entries are dropped: an entry
 * needs a metric, a known type and the operands its type requires, and the first entry wins
 * when a metric is defined twice.
 */
export function normalizeMetricDefinitions(raw: unknown): MetricDefinition[] {
  let entries: unknown = raw;
  if (typeof raw === 'string') {
    if (raw.trim() === '') return [];
    try {
      entries = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(entries)) return [];

  const seen = new Set<string>();
  const definitions: MetricDefinition[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const metric = text(e.metric);
    const type = pick(METRIC_TYPES, e.type);
    if (!metric || !type || seen.has(metric)) continue;

    const def: MetricDefinition = { metric, type };
    if (type === 'ratio') {
      def.numerator = text(e.numerator);
      def.denominator = text(e.denominator);
      if (!def.numerator || !def.denominator) continue;
      def.scale = finite(e.scale) ?? 1;
    } else if (type === 'delta_pct' || type === 'diff') {
      def.current = text(e.current);
      def.baseline = text(e.baseline);
      if (!def.current || !def.baseline) continue;
    } else if (type === 'mean' && text(e.weight)) {
      def.weight = text(e.weight);
    } else if (type === 'distinct_count' && text(e.entityDimension)) {
      def.entityDimension = text(e.entityDimension);
    }

    const format = pick(METRIC_FORMATS, e.format);
    if (format) def.format = format;
    const decimals = finite(e.decimals);
    if (decimals !== undefined && decimals >= 0 && decimals <= 6) def.decimals = Math.floor(decimals);
    const polarity = pick(POLARITIES, e.polarity);
    if (polarity) def.polarity = polarity;
    // Calcolo di tabella dichiarato nella definizione: lo legge normalizeTableCalculations.
    const calculation = pick(CALCULATION_TYPES, e.calculation);
    if (calculation) {
      def.calculation = calculation;
      const scope = pick(CALCULATION_SCOPES, e.calculationScope);
      if (scope) def.calculationScope = scope;
      const rankMethod = pick(RANK_METHODS, e.rankMethod);
      if (rankMethod) def.rankMethod = rankMethod;
      const rankOrder = pick(RANK_ORDERS, e.rankOrder);
      if (rankOrder) def.rankOrder = rankOrder;
      const displayMode = pick(CALCULATION_DISPLAY_MODES, e.calculationDisplayMode);
      if (displayMode) def.calculationDisplayMode = displayMode;
    }
    if (type === 'ratio') {
      const ci = pick(CI_METHODS, e.ci);
      if (ci && ci !== 'none') {
        def.ci = ci;
        const level = finite(e.ciLevel);
        def.ciLevel = level !== undefined && CI_LEVELS.includes(level) ? level : 0.95;
        def.compareTo = pick(SIGNAL_REFERENCES, e.compareTo) ?? 'parent';
      }
    }
    seen.add(metric);
    definitions.push(def);
  }
  return definitions;
}

/** Metric key without pivot suffixes: 'rate___2024___SSN' -> 'rate'. */
export const baseMetricOf = (key: string): string => {
  const idx = key.indexOf('___');
  return idx < 0 ? key : key.slice(0, idx);
};

const suffixOf = (key: string): string => key.slice(baseMetricOf(key).length);

/**
 * Definition governing a metric key. Pivot cells match on their base metric; delta columns
 * ('delta_x_pct', 'x___period_delta') borrow the definition of the metric they compare.
 */
export function findMetricDefinition(
  key: string,
  definitions: MetricDefinition[],
): MetricDefinition | undefined {
  if (definitions.length === 0) return undefined;
  const base = baseMetricOf(key);
  const direct = definitions.find(d => d.metric === base);
  if (direct) return direct;
  const stripped = base.replace(/^delta_/, '').replace(/_pct$/, '');
  return stripped !== base ? definitions.find(d => d.metric === stripped) : undefined;
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function fixed(value: number, decimals: number): string {
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Seconds as mm:ss, or h:mm:ss from one hour. */
function formatDuration(totalSeconds: number): string {
  const sign = totalSeconds < 0 ? '-' : '';
  const secs = Math.round(Math.abs(totalSeconds));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${sign}${h}:${pad(m)}:${pad(s)}` : `${sign}${pad(m)}:${pad(s)}`;
}

/** Explicit number format of a definition; null when the definition does not set one. */
export function formatByDefinition(
  value: number | string | null | undefined,
  def: MetricDefinition,
  currencySymbol = '',
): string | null {
  if (!def.format) return null;
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string') return value;
  if (!Number.isFinite(value)) return '-';
  switch (def.format) {
    case 'integer':
      return fixed(value, 0);
    case 'decimal':
      return fixed(value, def.decimals ?? 1);
    case 'percent':
      return `${fixed(value, def.decimals ?? 1)}%`;
    case 'days':
      return `${fixed(value, def.decimals ?? 1)} gg`;
    case 'duration':
      return formatDuration(value);
    case 'currency': {
      const formatted = fixed(value, def.decimals ?? 2);
      return currencySymbol ? `${currencySymbol} ${formatted}` : formatted;
    }
    default:
      return null;
  }
}

function setValue(node: TreeNode, key: string, value: number | null): void {
  node.metrics[key] = value;
  if (node.subtotals) node.subtotals[key] = value;
}

/** Keys of each defined metric (all pivot variants) found anywhere in the tree or grand total. */
function collectKeys(
  nodes: TreeNode[],
  grandTotal: TreeNode | undefined,
  bases: Set<string>,
): Map<string, string[]> {
  const keysByBase = new Map<string, Set<string>>();
  const visit = (node: TreeNode) => {
    for (const key of Object.keys(node.metrics)) {
      const base = baseMetricOf(key);
      if (!bases.has(base)) continue;
      let set = keysByBase.get(base);
      if (!set) keysByBase.set(base, (set = new Set()));
      set.add(key);
    }
    node.children?.forEach(visit);
  };
  nodes.forEach(visit);
  if (grandTotal) visit(grandTotal);
  const result = new Map<string, string[]>();
  keysByBase.forEach((set, base) => result.set(base, Array.from(set)));
  return result;
}

function childValues(children: TreeNode[], key: string): number[] {
  const values: number[] = [];
  for (const child of children) {
    const v = child.metrics[key];
    if (isNumber(v)) values.push(v);
  }
  return values;
}

function rollupFromChildren(
  def: MetricDefinition,
  key: string,
  children: TreeNode[],
  parentDepth: number,
  dimensions: string[],
): number | null {
  if (def.type === 'none') return null;
  const values = childValues(children, key);
  if (values.length === 0) return null;
  if (def.type === 'mean') {
    if (!def.weight) return values.reduce((a, b) => a + b, 0) / values.length;
    return weightedMean(children, key, def.weight + suffixOf(key));
  }
  if (def.type === 'distinct_count') {
    const entityDepth = def.entityDimension ? dimensions.indexOf(def.entityDimension) : -1;
    return entityDepth >= 0 && parentDepth >= entityDepth
      ? values.reduce((a, b) => Math.max(a, b), -Infinity)
      : values.reduce((a, b) => a + b, 0);
  }
  return values.reduce((a, b) => a + b, 0);
}

const ROLLUP_TYPES: readonly MetricType[] = ['sum', 'mean', 'distinct_count', 'none'];

/**
 * Applies explicit metric definitions on top of the heuristic roll-up: parent rows and the grand
 * total of 'sum', 'mean', 'distinct_count' and 'none' metrics are rebuilt from their children,
 * and every row (leaves included) of a 'ratio', 'delta_pct' or 'diff' metric is recomputed from its
 * operands, so a ratio of totals is never an average of ratios and a diff of ratios is the exact
 * node-level difference, never a sum or average of child diffs. Ratios and delta percentages are
 * computed before diffs, so a diff may safely reference them as operands in any order. Mutates the tree.
 */
export function applyMetricDefinitions(
  tree: TreeNode[],
  grandTotal: TreeNode | undefined,
  definitions: MetricDefinition[],
  dimensions: string[] = [],
): void {
  if (definitions.length === 0 || tree.length === 0) return;
  const keys = collectKeys(tree, grandTotal, new Set(definitions.map(d => d.metric)));
  const rollupDefs = definitions.filter(d => ROLLUP_TYPES.includes(d.type));
  // Ratios and delta percentages first: a diff may use them as operands regardless of declaration order.
  const computedDefs = [
    ...definitions.filter(d => d.type === 'ratio' || d.type === 'delta_pct'),
    ...definitions.filter(d => d.type === 'diff'),
  ];

  const rollup = (node: TreeNode) => {
    if (!node.children || node.children.length === 0) return;
    node.children.forEach(rollup);
    for (const def of rollupDefs) {
      for (const key of keys.get(def.metric) ?? []) {
        setValue(node, key, rollupFromChildren(def, key, node.children, node.depth, dimensions));
      }
    }
  };
  tree.forEach(rollup);

  if (grandTotal) {
    for (const def of rollupDefs) {
      // Roots are disjoint entities: a distinct count always sums at the grand total.
      const totalDef = def.type === 'distinct_count' ? { ...def, entityDimension: undefined } : def;
      for (const key of keys.get(def.metric) ?? []) {
        setValue(grandTotal, key, rollupFromChildren(totalDef, key, tree, 0, dimensions));
      }
    }
  }

  const compute = (node: TreeNode) => {
    for (const def of computedDefs) {
      for (const key of keys.get(def.metric) ?? []) {
        const suffix = suffixOf(key);
        if (def.type === 'ratio') {
          const num = node.metrics[def.numerator! + suffix];
          const den = node.metrics[def.denominator! + suffix];
          if (isNumber(num) && isNumber(den)) {
            setValue(node, key, den > 0 ? (num / den) * (def.scale ?? 1) : null);
          }
        } else if (def.type === 'diff') {
          const cur = node.metrics[def.current! + suffix];
          const base = node.metrics[def.baseline! + suffix];
          if (isNumber(cur) && isNumber(base)) {
            setValue(node, key, Math.round((cur - base) * 10) / 10);
          }
        } else {
          const cur = node.metrics[def.current! + suffix];
          const base = node.metrics[def.baseline! + suffix];
          if (isNumber(cur) && isNumber(base)) {
            setValue(node, key, base > 0 ? Math.round(((cur - base) / base) * 1000) / 10 : null);
          }
        }
      }
    }
    node.children?.forEach(compute);
  };
  tree.forEach(compute);
  if (grandTotal) compute(grandTotal);
}
