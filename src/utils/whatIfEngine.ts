import {
  TreeNode,
  WhatIfAdjustment,
  WhatIfBaseline,
  WhatIfResult,
  WhatIfScenario,
  MetricDefinition,
  AggregationFunction,
} from '../types';
import {
  rollupTreeMetrics,
  computeGrandTotal,
  isDerivedMetric,
} from './aggregations';
import { applyMetricDefinitions, normalizeMetricDefinitions } from './metricSemantics';

/**
 * Creates a structural deep clone of an array of TreeNodes.
 * Ensures the simulation never mutates the original table nodes.
 */
export function deepCloneTree(nodes: TreeNode[]): TreeNode[] {
  if (!nodes || nodes.length === 0) return [];
  return nodes.map(node => {
    const cloned: TreeNode = {
      ...node,
      path: node.path ? [...node.path] : [],
      rawPath: node.rawPath ? [...node.rawPath] : undefined,
      metrics: { ...(node.metrics || {}) },
      subtotals: node.subtotals ? { ...node.subtotals } : undefined,
      intervals: node.intervals ? { ...node.intervals } : undefined,
      suppressed: node.suppressed ? { ...node.suppressed } : undefined,
      children: node.children ? deepCloneTree(node.children) : undefined,
    };
    return cloned;
  });
}

/**
 * Captures the original metric values of all nodes in a Map.
 * Used for delta calculations and baseline tooltips.
 */
export function snapshotBaseline(
  nodes: TreeNode[],
  grandTotal?: TreeNode,
): WhatIfBaseline {
  const nodeBaselines = new Map<string, Record<string, number | null>>();

  function capture(nodeList: TreeNode[]) {
    for (const node of nodeList) {
      const vals: Record<string, number | null> = {};
      if (node.metrics) {
        for (const [k, v] of Object.entries(node.metrics)) {
          vals[k] = typeof v === 'number' ? v : null;
        }
      }
      if (node.subtotals) {
        for (const [k, v] of Object.entries(node.subtotals)) {
          if (vals[k] === undefined) {
            vals[k] = typeof v === 'number' ? v : null;
          }
        }
      }
      nodeBaselines.set(node.key, vals);
      if (node.children && node.children.length > 0) {
        capture(node.children);
      }
    }
  }

  capture(nodes);

  if (grandTotal) {
    const gtVals: Record<string, number | null> = {};
    if (grandTotal.metrics) {
      for (const [k, v] of Object.entries(grandTotal.metrics)) {
        gtVals[k] = typeof v === 'number' ? v : null;
      }
    }
    if (grandTotal.subtotals) {
      for (const [k, v] of Object.entries(grandTotal.subtotals)) {
        if (gtVals[k] === undefined) {
          gtVals[k] = typeof v === 'number' ? v : null;
        }
      }
    }
    nodeBaselines.set(grandTotal.key, gtVals);
  }

  return { nodeBaselines };
}

/**
 * Checks whether a metric can be multiplied directly at the leaf level.
 * Metrics with type 'ratio', 'delta_pct', 'diff', or 'none' cannot be multiplied directly;
 * they must be recomputed from their base operands.
 */
export function isSimulatableMetric(
  metricName: string,
  metricDefs?: MetricDefinition[],
): boolean {
  if (isDerivedMetric(metricName)) return false;
  if (metricDefs && metricDefs.length > 0) {
    const def = metricDefs.find(d => d.metric === metricName);
    if (def) {
      if (def.type === 'none' || def.type === 'ratio' || def.type === 'delta_pct' || def.type === 'diff') {
        return false;
      }
    }
  }
  return true;
}

/**
 * Recursively applies multiplicative factors strictly to leaf nodes.
 * Parent nodes are preserved for re-aggregation via rollupTreeMetrics.
 */
export function applyLeafMultipliers(
  nodes: TreeNode[],
  adjustments: WhatIfAdjustment[],
  metricDefs?: MetricDefinition[],
): void {
  if (!nodes || nodes.length === 0 || !adjustments || adjustments.length === 0) return;

  const validAdjustments = adjustments.filter(
    a => a.factor !== 1 && isSimulatableMetric(a.metric, metricDefs),
  );
  if (validAdjustments.length === 0) return;

  const factorMap = new Map<string, number>();
  for (const adj of validAdjustments) {
    factorMap.set(adj.metric, adj.factor);
  }

  function traverse(nodeList: TreeNode[]) {
    for (const node of nodeList) {
      if (node.isLeaf) {
        if (node.metrics) {
          for (const [metric, factor] of factorMap.entries()) {
            const currentVal = node.metrics[metric];
            if (typeof currentVal === 'number') {
              node.metrics[metric] = currentVal * factor;
            }
          }
        }
      } else if (node.children && node.children.length > 0) {
        traverse(node.children);
      }
    }
  }

  traverse(nodes);
}

/**
 * Computes absolute and percentage delta between simulated value and baseline.
 */
export function computeWhatIfDelta(
  current: number | null | undefined,
  baseline: number | null | undefined,
): { absolute: number; pct: number | null } {
  if (
    current === null ||
    current === undefined ||
    baseline === null ||
    baseline === undefined ||
    isNaN(current) ||
    isNaN(baseline)
  ) {
    return { absolute: 0, pct: null };
  }

  const absolute = current - baseline;
  if (baseline === 0) {
    return { absolute, pct: null };
  }

  const pct = (absolute / Math.abs(baseline)) * 100;
  return { absolute, pct };
}

/**
 * Converts a multiplicative factor to an integer percentage (e.g. 1.15 -> 15, 0.85 -> -15).
 */
export function factorToPercentage(factor: number): number {
  return Math.round((factor - 1) * 100);
}

/**
 * Converts an integer percentage to a multiplicative factor (e.g. 15 -> 1.15, -15 -> 0.85).
 */
export function percentageToFactor(percentage: number): number {
  return Number((1 + percentage / 100).toFixed(4));
}

/**
 * Returns the list of metrics from the dataset that can be simulated.
 */
export function getSimulatableMetrics(
  metrics: string[],
  metricDefs?: MetricDefinition[],
): string[] {
  if (!metrics || metrics.length === 0) return [];
  return metrics.filter(m => isSimulatableMetric(m, metricDefs));
}

/**
 * Executes a full What-If simulation pass on a hierarchical tree.
 * 1. Snapshots baseline
 * 2. Deep clones tree
 * 3. Multiplies leaf values
 * 4. Rolls up parents
 * 5. Recomputes metric definitions (weighted averages, ratios)
 * 6. Computes simulated Grand Total
 */
export function applyWhatIfScenario(
  baseTree: TreeNode[],
  baseGrandTotal: TreeNode | undefined,
  adjustments: WhatIfAdjustment[],
  metricNames: string[],
  aggFunc: AggregationFunction = 'sum',
  weightColumn?: string,
  dimensions: string[] = [],
  metricDefs?: MetricDefinition[],
  scenarioMetadata?: { id: string; name: string },
  timeMetrics?: ReadonlySet<string>,
): WhatIfResult {
  const baseline = snapshotBaseline(baseTree, baseGrandTotal);
  const simulatedTree = deepCloneTree(baseTree);
  const safeDefs = normalizeMetricDefinitions(metricDefs);

  applyLeafMultipliers(simulatedTree, adjustments, safeDefs);

  rollupTreeMetrics(
    simulatedTree,
    metricNames,
    aggFunc,
    weightColumn,
    dimensions,
    timeMetrics,
  );

  if (safeDefs.length > 0) {
    applyMetricDefinitions(simulatedTree, undefined, safeDefs, dimensions);
  }

  let simulatedGrandTotal: TreeNode | undefined;
  if (baseGrandTotal) {
    simulatedGrandTotal = computeGrandTotal(
      simulatedTree,
      metricNames,
      aggFunc,
      weightColumn,
      timeMetrics,
    );
    if (safeDefs.length > 0) {
      applyMetricDefinitions(simulatedTree, simulatedGrandTotal, safeDefs, dimensions);
    }
  }

  const activeScenario: WhatIfScenario | undefined = scenarioMetadata
    ? {
        id: scenarioMetadata.id,
        name: scenarioMetadata.name,
        adjustments,
        createdAt: Date.now(),
      }
    : undefined;

  return {
    simulatedTree,
    simulatedGrandTotal,
    baseline,
    activeScenario,
  };
}
