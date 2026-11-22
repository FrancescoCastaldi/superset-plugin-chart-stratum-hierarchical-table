import { AggregationFunction, DimensionLimitMode, DimensionLimitRule, TreeNode } from '../types';
import { rollupFunction, rollupTreeMetrics } from './aggregations';

export type { DimensionLimitMode, DimensionLimitRule };

/**
 * Normalizes user-configured or raw JSON dimension limit rules.
 */
export function normalizeDimensionLimits(raw: unknown): DimensionLimitRule[] {
  if (!raw) return [];

  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(parsed)) return [];

  const results: DimensionLimitRule[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const limit = Number((item as any).limit);
    if (!Number.isFinite(limit) || limit <= 0) continue;

    const level = (item as any).level !== undefined && Number.isFinite(Number((item as any).level))
      ? Number((item as any).level)
      : undefined;
    const dimension = typeof (item as any).dimension === 'string' && (item as any).dimension.trim()
      ? (item as any).dimension.trim()
      : undefined;
    const metric = typeof (item as any).metric === 'string' && (item as any).metric.trim()
      ? (item as any).metric.trim()
      : undefined;
    const mode: DimensionLimitMode = (item as any).mode === 'bottom' ? 'bottom' : 'top';
    const othersLabel = typeof (item as any).othersLabel === 'string' && (item as any).othersLabel.trim()
      ? (item as any).othersLabel.trim()
      : 'Altri ({k})';

    results.push({
      limit: Math.floor(limit),
      level,
      dimension,
      metric,
      mode,
      othersLabel,
    });
  }

  return results;
}

/**
 * Replaces placeholders like {k} or {count} with the count of collapsed items.
 */
export function formatOthersLabel(template?: string, count: number = 0): string {
  const tpl = template && template.trim() ? template : 'Altri ({k})';
  return tpl.replace(/\{k\}/gi, String(count)).replace(/\{count\}/gi, String(count));
}

/**
 * Finds the first applicable limit rule matching the current depth or dimension name.
 */
export function findMatchingLimitRule(
  rules: DimensionLimitRule[],
  depth: number,
  dimension?: string,
): DimensionLimitRule | undefined {
  if (!rules || rules.length === 0) return undefined;

  for (const rule of rules) {
    if (rule.level !== undefined && rule.level === depth) {
      return rule;
    }
  }

  if (dimension) {
    for (const rule of rules) {
      if (rule.dimension && rule.dimension === dimension) {
        return rule;
      }
    }
  }

  return undefined;
}

/**
 * Extracts a numeric metric value from a node or null if non-numeric.
 */
function getNumericMetric(node: TreeNode, metricKey?: string): number | null {
  if (!metricKey) {
    // Pick the first numeric metric available on the node
    for (const key of Object.keys(node.metrics || {})) {
      const v = node.metrics[key];
      if (typeof v === 'number' && Number.isFinite(v)) return v;
    }
    return null;
  }
  const v = node.metrics?.[metricKey];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Come si aggregano i nodi esclusi nella riga "Altri": stessa regola dei nodi padre. */
export interface OthersRollupOptions {
  metricNames: string[];
  aggregationMode?: AggregationFunction;
  weightColumn?: string;
  dimensions?: string[];
  timeMetrics?: ReadonlySet<string>;
}

/** Somma semplice, usata quando non si conosce la regola di aggregazione del grafico. */
function sumExcludedMetrics(nodes: TreeNode[]): Record<string, number | string | null> {
  const result: Record<string, number | string | null> = {};
  const metricKeys = new Set<string>();

  for (const n of nodes) {
    if (n.metrics) {
      for (const k of Object.keys(n.metrics)) {
        metricKeys.add(k);
      }
    }
  }

  for (const key of metricKeys) {
    let sum = 0;
    let hasNumeric = false;

    for (const n of nodes) {
      const val = n.metrics?.[key];
      if (typeof val === 'number' && Number.isFinite(val)) {
        sum += val;
        hasNumeric = true;
      }
    }

    result[key] = hasNumeric ? sum : null;
  }

  return result;
}

/**
 * Metriche della riga "Altri". Con le opzioni di roll-up usa la stessa funzione dei nodi padre
 * (somma, media, minimo, massimo, media ponderata, tassi), su copie dei nodi esclusi per non
 * toccare quelli originali; senza opzioni somma.
 */
function aggregateExcludedMetrics(
  nodes: TreeNode[],
  rollup?: OthersRollupOptions,
): Record<string, number | string | null> {
  if (!rollup || rollup.metricNames.length === 0) return sumExcludedMetrics(nodes);

  const children: TreeNode[] = nodes.map(n => ({
    ...n,
    children: undefined,
    metrics: { ...n.metrics },
    subtotals: n.subtotals ? { ...n.subtotals } : undefined,
  }));
  const probe: TreeNode = {
    key: '__others_probe__',
    id: '__others_probe__',
    name: '',
    dimension: nodes[0]?.dimension ?? '',
    depth: Math.max(0, (nodes[0]?.depth ?? 1) - 1),
    path: [],
    isLeaf: false,
    metrics: {},
    children,
  };
  const weightColumn = rollup.weightColumn ?? '';
  const aggFunc = rollupFunction(weightColumn, rollup.aggregationMode);
  rollupTreeMetrics([probe], rollup.metricNames, aggFunc, weightColumn, rollup.dimensions, rollup.timeMetrics);

  const result: Record<string, number | string | null> = {};
  for (const key of Object.keys(probe.metrics)) result[key] = probe.metrics[key] ?? null;
  // Colonne non coperte dai nomi di metrica (per esempio confronti): somma come prima.
  const fallback = sumExcludedMetrics(nodes);
  for (const key of Object.keys(fallback)) {
    if (!(key in result)) result[key] = fallback[key];
  }
  return result;
}

/**
 * Recursively applies dimension limits (Top N + Others) to a tree structure.
 */
export function applyDimensionLimits(
  treeData: TreeNode[],
  rules: DimensionLimitRule[],
  defaultMetric?: string,
  rollup?: OthersRollupOptions,
): TreeNode[] {
  if (!treeData || treeData.length === 0 || !rules || rules.length === 0) {
    return treeData;
  }

  function processGroup(
    siblings: TreeNode[],
    depth: number,
    parentPath: string[] = [],
    parentKey: string = '',
  ): TreeNode[] {
    if (!siblings || siblings.length === 0) return siblings;

    const sample = siblings[0];
    const rule = findMatchingLimitRule(rules, depth, sample.dimension);

    let currentSiblings = siblings;

    if (rule && rule.limit > 0 && siblings.length > rule.limit) {
      const targetMetric = rule.metric || defaultMetric;
      const mode = rule.mode || 'top';

      // Sort a copy of siblings
      const sorted = [...siblings].sort((a, b) => {
        const valA = getNumericMetric(a, targetMetric);
        const valB = getNumericMetric(b, targetMetric);

        if (valA == null && valB == null) return 0;
        if (valA == null) return 1; // nulls at the end
        if (valB == null) return -1;

        return mode === 'bottom' ? valA - valB : valB - valA;
      });

      const kept = sorted.slice(0, rule.limit);
      const excluded = sorted.slice(rule.limit);

      if (excluded.length > 0) {
        const othersLabel = formatOthersLabel(rule.othersLabel, excluded.length);
        const othersKey = `__others__${parentKey || 'root'}_d${depth}`;
        const othersPath = [...parentPath, othersLabel];

        const othersNode: TreeNode = {
          key: othersKey,
          id: othersKey,
          name: othersLabel,
          dimension: sample.dimension,
          depth,
          path: othersPath,
          isLeaf: true,
          isOthers: true,
          othersCount: excluded.length,
          metrics: aggregateExcludedMetrics(excluded, rollup),
        };

        currentSiblings = [...kept, othersNode];
      }
    }

    // Process nested children recursively
    return currentSiblings.map(node => {
      if (node.children && node.children.length > 0) {
        return {
          ...node,
          children: processGroup(node.children, depth + 1, node.path, node.key),
        };
      }
      return node;
    });
  }

  return processGroup(treeData, 0);
}
