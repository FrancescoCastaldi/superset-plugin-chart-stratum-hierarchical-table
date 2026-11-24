import {
  MetricDefinition,
  RankMethod,
  TableCalculationConfig,
  TableCalculationScope,
  TableCalculationType,
  TreeNode,
} from '../types';
import { formatMetricValue } from './formatters';
import { formatNumber } from '../utils/numberFormat';

export type {
  TableCalculationConfig,
  TableCalculationScope,
  TableCalculationType,
  RankMethod,
};

/**
 * Resolves default human-readable title for a table calculation column.
 */
export function defaultCalculationTitle(config: TableCalculationConfig): string {
  if (config.customTitle) return config.customTitle;
  switch (config.type) {
    case 'pct_of_total':
      return `% Total (${config.metric})`;
    case 'pct_of_parent':
      return `% Padre (${config.metric})`;
    case 'running_total':
      return `Cumulativo (${config.metric})`;
    case 'diff_from_previous':
      return `Δ Prec. (${config.metric})`;
    case 'diff_from_previous_pct':
      return `Δ% Prec. (${config.metric})`;
    case 'rank':
      return `Rank (${config.metric})`;
    default:
      return config.metric;
  }
}

/**
 * Returns a formatting function tailored to the calculation type.
 */
export function getCalculationFormatter(
  type: TableCalculationType,
  numberFormat?: string,
  currencySymbol?: string,
): (val: any) => string {
  switch (type) {
    case 'pct_of_total':
    case 'pct_of_parent':
      return (val: any) => (val == null || isNaN(val) ? '-' : `${formatNumber(Number(val), 1, 1)}%`);
    case 'diff_from_previous_pct':
      return (val: any) => (val == null || isNaN(val) ? '-' : `${val > 0 ? '+' : ''}${formatNumber(Number(val), 1, 1)}%`);
    case 'rank':
      return (val: any) => (val == null || isNaN(val) ? '-' : `#${val}`);
    case 'running_total':
    case 'diff_from_previous':
    default:
      return (val: any) => formatMetricValue(val, numberFormat, currencySymbol);
  }
}

/**
 * Computes percentage of a total value: (value / total) * 100.
 * Returns null when value or total is null, undefined, NaN, or total is zero.
 */
export function computePercentOfTotal(
  value: number | null | undefined,
  total: number | null | undefined,
): number | null {
  if (value == null || total == null || isNaN(value) || isNaN(total) || total === 0) {
    return null;
  }
  return (value / total) * 100;
}

/**
 * Computes percentage of a parent value: (value / parentValue) * 100.
 * Returns null when value or parentValue is null, undefined, NaN, or parentValue is zero.
 */
export function computePercentOfParent(
  value: number | null | undefined,
  parentValue: number | null | undefined,
): number | null {
  if (value == null || parentValue == null || isNaN(value) || isNaN(parentValue) || parentValue === 0) {
    return null;
  }
  return (value / parentValue) * 100;
}

/**
 * Computes absolute difference from previous value: current - previous.
 * Returns null when either operand is null, undefined, or NaN.
 */
export function computeDiffFromPrevious(
  current: number | null | undefined,
  previous: number | null | undefined,
): number | null {
  if (current == null || previous == null || isNaN(current) || isNaN(previous)) {
    return null;
  }
  return current - previous;
}

/**
 * Computes percentage difference from previous value: ((current - previous) / |previous|) * 100.
 * Returns null when either operand is null, undefined, NaN, or previous is zero.
 */
export function computeDiffFromPreviousPct(
  current: number | null | undefined,
  previous: number | null | undefined,
): number | null {
  if (current == null || previous == null || isNaN(current) || isNaN(previous) || previous === 0) {
    return null;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
}

/**
 * Computes ranks among sibling nodes for a specific metric.
 * Supports competition ranking (1, 2, 2, 4) and dense ranking (1, 2, 2, 3),
 * in either descending (highest = 1) or ascending (lowest = 1) order.
 */
export function computeSiblingRanks(
  siblings: TreeNode[],
  metricKey: string,
  method: RankMethod = 'competition',
  order: 'desc' | 'asc' = 'desc',
): Map<string, number | null> {
  const result = new Map<string, number | null>();

  const validEntries: { node: TreeNode; value: number }[] = [];
  for (const node of siblings) {
    const rawVal = node.metrics?.[metricKey];
    if (typeof rawVal === 'number' && !isNaN(rawVal)) {
      validEntries.push({ node, value: rawVal });
    } else {
      result.set(node.key ?? node.id, null);
    }
  }

  validEntries.sort((a, b) => (order === 'asc' ? a.value - b.value : b.value - a.value));

  let currentRank = 1;
  for (let i = 0; i < validEntries.length; i++) {
    const entry = validEntries[i];
    if (i === 0) {
      currentRank = 1;
    } else {
      const prevEntry = validEntries[i - 1];
      if (entry.value === prevEntry.value) {
        // Tie: keep the same rank
      } else if (method === 'competition') {
        currentRank = i + 1;
      } else {
        currentRank += 1;
      }
    }
    result.set(entry.node.key ?? entry.node.id, currentRank);
  }

  return result;
}

/**
 * Computes cumulative running sum across ordered pivot periods for a node's metrics.
 */
export function computeRunningTotalOnPeriods(
  metrics: Record<string, any>,
  baseMetric: string,
  periodKeys: string[],
): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  let accumulator = 0;
  let hasValue = false;

  for (const period of periodKeys) {
    const key = `${baseMetric}___${period}`;
    const val = metrics[key];
    if (typeof val === 'number' && !isNaN(val)) {
      accumulator += val;
      hasValue = true;
      result[key] = accumulator;
    } else {
      result[key] = hasValue ? accumulator : null;
    }
  }

  return result;
}

/**
 * Computes cumulative running sum across sibling nodes in their displayed order.
 */
export function computeRunningTotalOnSiblings(
  siblings: TreeNode[],
  metricKey: string,
): Map<string, number | null> {
  const result = new Map<string, number | null>();
  let accumulator = 0;
  let hasValue = false;

  for (const sibling of siblings) {
    const val = sibling.metrics?.[metricKey];
    const key = sibling.key ?? sibling.id;
    if (typeof val === 'number' && !isNaN(val)) {
      accumulator += val;
      hasValue = true;
      result.set(key, accumulator);
    } else {
      result.set(key, hasValue ? accumulator : null);
    }
  }

  return result;
}

const ALLOWED_CALCULATION_TYPES: readonly TableCalculationType[] = [
  'none',
  'pct_of_total',
  'pct_of_parent',
  'running_total',
  'diff_from_previous',
  'diff_from_previous_pct',
  'rank',
];

/**
 * Safely parses and normalizes table calculations from formData and metric definitions.
 */
export function normalizeTableCalculations(
  raw: unknown,
  metricDefinitions?: MetricDefinition[],
): TableCalculationConfig[] {
  const configs: TableCalculationConfig[] = [];
  const registered = new Set<string>();

  const addConfig = (cfg: Partial<TableCalculationConfig>) => {
    if (!cfg || typeof cfg.metric !== 'string' || !cfg.metric.trim()) return;
    const type = cfg.type && ALLOWED_CALCULATION_TYPES.includes(cfg.type) ? cfg.type : 'none';
    if (type === 'none') return;

    const signature = `${cfg.metric}::${type}`;
    if (registered.has(signature)) return;
    registered.add(signature);

    configs.push({
      metric: cfg.metric.trim(),
      type,
      scope: cfg.scope === 'periods' ? 'periods' : 'hierarchy',
      rankMethod: cfg.rankMethod === 'dense' ? 'dense' : 'competition',
      rankOrder: cfg.rankOrder === 'asc' ? 'asc' : 'desc',
      displayMode: cfg.displayMode === 'replace' ? 'replace' : 'companion_column',
      // Un titolo vuoto o di soli spazi equivale a nessun titolo: vale quello predefinito.
      customTitle:
        typeof cfg.customTitle === 'string' && cfg.customTitle.trim() !== ''
          ? cfg.customTitle.trim()
          : undefined,
    });
  };

  // 1. Process raw formData tableCalculations
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) addConfig(item);
      }
    } catch {
      // Malformed JSON ignored safely
    }
  } else if (Array.isArray(raw)) {
    for (const item of raw) addConfig(item);
  }

  // 2. Process calculations declared inside metricDefinitions
  if (Array.isArray(metricDefinitions)) {
    for (const def of metricDefinitions) {
      if (def && typeof def.metric === 'string' && def.calculation && def.calculation !== 'none') {
        addConfig({
          metric: def.metric,
          type: def.calculation,
          scope: def.calculationScope,
          rankMethod: def.rankMethod,
          rankOrder: def.rankOrder,
          displayMode: def.calculationDisplayMode,
        });
      }
    }
  }

  return configs;
}

/**
 * Resolves the target key on node.metrics for a table calculation.
 */
export function resolveCalculationKey(config: TableCalculationConfig, baseMetricKey?: string): string {
  const metric = baseMetricKey ?? config.metric;
  if (config.displayMode === 'replace') {
    return metric;
  }
  return `${metric}___calc_${config.type}`;
}

/**
 * Enriches the tree data and grand total in place with the configured table calculations.
 */
export function applyTableCalculations(
  treeData: TreeNode[],
  grandTotalNode?: TreeNode | null,
  configs: TableCalculationConfig[] = [],
  pivotPeriods?: string[],
): void {
  if (!configs || configs.length === 0 || !treeData || treeData.length === 0) {
    return;
  }

  for (const config of configs) {
    const { metric, type, displayMode, scope, rankMethod, rankOrder } = config;
    const calcKey = resolveCalculationKey(config);

    if (type === 'pct_of_total') {
      const totalRaw = grandTotalNode?.metrics?.[metric];
      const totalVal = typeof totalRaw === 'number' && !isNaN(totalRaw) ? totalRaw : null;

      if (grandTotalNode) {
        grandTotalNode.metrics[calcKey] = totalVal != null && totalVal !== 0 ? 100 : null;
      }

      const traverse = (node: TreeNode) => {
        const valRaw = node.metrics?.[metric];
        const val = typeof valRaw === 'number' && !isNaN(valRaw) ? valRaw : null;
        node.metrics[calcKey] = computePercentOfTotal(val, totalVal);

        if (node.children && node.children.length > 0) {
          for (const child of node.children) {
            traverse(child);
          }
        }
      };

      for (const root of treeData) {
        traverse(root);
      }
    } else if (type === 'pct_of_parent') {
      if (grandTotalNode) {
        grandTotalNode.metrics[calcKey] = 100;
      }

      const rootParentValRaw = grandTotalNode?.metrics?.[metric];
      const rootParentVal =
        typeof rootParentValRaw === 'number' && !isNaN(rootParentValRaw) ? rootParentValRaw : null;

      const traverse = (node: TreeNode, parentVal: number | null) => {
        const valRaw = node.metrics?.[metric];
        const val = typeof valRaw === 'number' && !isNaN(valRaw) ? valRaw : null;
        node.metrics[calcKey] = computePercentOfParent(val, parentVal);

        if (node.children && node.children.length > 0) {
          for (const child of node.children) {
            traverse(child, val);
          }
        }
      };

      for (const root of treeData) {
        traverse(root, rootParentVal);
      }
    } else if (type === 'rank') {
      const applyRankToSiblings = (siblings: TreeNode[]) => {
        const ranks = computeSiblingRanks(siblings, metric, rankMethod, rankOrder);
        for (const sibling of siblings) {
          const key = sibling.key ?? sibling.id;
          sibling.metrics[calcKey] = ranks.get(key) ?? null;

          if (sibling.children && sibling.children.length > 0) {
            applyRankToSiblings(sibling.children);
          }
        }
      };

      applyRankToSiblings(treeData);
    } else if (type === 'running_total') {
      if (scope === 'periods' && pivotPeriods && pivotPeriods.length > 0) {
        const applyPeriodsRunning = (node: TreeNode) => {
          const running = computeRunningTotalOnPeriods(node.metrics, metric, pivotPeriods);
          for (const period of pivotPeriods) {
            const srcKey = `${metric}___${period}`;
            const dstKey = displayMode === 'replace' ? srcKey : `${srcKey}___calc_running_total`;
            node.metrics[dstKey] = running[srcKey] ?? null;
          }
          if (node.children && node.children.length > 0) {
            for (const child of node.children) {
              applyPeriodsRunning(child);
            }
          }
        };

        for (const root of treeData) applyPeriodsRunning(root);
        if (grandTotalNode) applyPeriodsRunning(grandTotalNode);
      } else {
        const applySiblingsRunning = (siblings: TreeNode[]) => {
          const running = computeRunningTotalOnSiblings(siblings, metric);
          for (const sibling of siblings) {
            const key = sibling.key ?? sibling.id;
            sibling.metrics[calcKey] = running.get(key) ?? null;

            if (sibling.children && sibling.children.length > 0) {
              applySiblingsRunning(sibling.children);
            }
          }
        };

        applySiblingsRunning(treeData);
      }
    } else if (type === 'diff_from_previous' || type === 'diff_from_previous_pct') {
      if (scope === 'periods' && pivotPeriods && pivotPeriods.length > 0) {
        const applyPeriodsDiff = (node: TreeNode) => {
          for (let i = 0; i < pivotPeriods.length; i++) {
            const currKey = `${metric}___${pivotPeriods[i]}`;
            const prevKey = i > 0 ? `${metric}___${pivotPeriods[i - 1]}` : null;
            const dstKey = displayMode === 'replace' ? currKey : `${currKey}___calc_${type}`;

            const currVal = typeof node.metrics[currKey] === 'number' ? (node.metrics[currKey] as number) : null;
            const prevVal =
              prevKey && typeof node.metrics[prevKey] === 'number' ? (node.metrics[prevKey] as number) : null;

            node.metrics[dstKey] =
              type === 'diff_from_previous'
                ? computeDiffFromPrevious(currVal, prevVal)
                : computeDiffFromPreviousPct(currVal, prevVal);
          }
          if (node.children && node.children.length > 0) {
            for (const child of node.children) applyPeriodsDiff(child);
          }
        };

        for (const root of treeData) applyPeriodsDiff(root);
        if (grandTotalNode) applyPeriodsDiff(grandTotalNode);
      } else {
        const applySiblingsDiff = (siblings: TreeNode[]) => {
          for (let i = 0; i < siblings.length; i++) {
            const currNode = siblings[i];
            const prevNode = i > 0 ? siblings[i - 1] : null;

            const currVal = typeof currNode.metrics[metric] === 'number' ? (currNode.metrics[metric] as number) : null;
            const prevVal =
              prevNode && typeof prevNode.metrics[metric] === 'number' ? (prevNode.metrics[metric] as number) : null;

            currNode.metrics[calcKey] =
              type === 'diff_from_previous'
                ? computeDiffFromPrevious(currVal, prevVal)
                : computeDiffFromPreviousPct(currVal, prevVal);

            if (currNode.children && currNode.children.length > 0) {
              applySiblingsDiff(currNode.children);
            }
          }
        };

        applySiblingsDiff(treeData);
      }
    }
  }
}
