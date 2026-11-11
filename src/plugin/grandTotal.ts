import { DataRecord } from '@superset-ui/core';
import { AggregationFunction, PivotTimeDeltaMode, TreeNode } from '../types';
import { computeGrandTotal, rollupFunction } from '../utils/aggregations';
import {
  NATIVE_COMPARISON_SUFFIX,
  TimeDeltaStrategyConfig,
  computeNativeTimeDelta,
  computePivotTimeDelta,
  computeTreeTimeDeltaByStrategy,
  hasNativeComparison,
} from '../utils/timeComparison';
import { chronologicalOrder, collectDistinctPivotKeys } from './pivotOrdering';

export interface GrandTotalParams {
  treeData: TreeNode[];
  records: DataRecord[];
  metrics: string[];
  metricKeys: string[];
  showGrandTotal: boolean;
  isPivotMode: boolean;
  pivotDimensions: string[];
  pivotTimeDeltaMode: PivotTimeDeltaMode;
  pivotTimeDeltaLag: number;
  timeDeltaStrategy?: TimeDeltaStrategyConfig | null;
  weightColumn?: string;
  aggregationMode?: AggregationFunction;
  showVarianceDelta?: boolean;
  showCalendarComparison?: boolean;
  timeMetrics?: ReadonlySet<string>;
}

/**
 * Grand total row over all root nodes, including the pivot time deltas and the time comparison
 * deltas computed on the totals themselves (never summed from the children).
 */
export function buildGrandTotalNode({
  treeData,
  records,
  metrics,
  metricKeys,
  showGrandTotal,
  isPivotMode,
  pivotDimensions,
  pivotTimeDeltaMode,
  pivotTimeDeltaLag,
  timeDeltaStrategy,
  weightColumn = '',
  aggregationMode = 'sum',
  showVarianceDelta = false,
  showCalendarComparison = true,
  timeMetrics,
}: GrandTotalParams): TreeNode | undefined {
  if (!showGrandTotal || treeData.length === 0) {
    return undefined;
  }

  const grandTotalNode = computeGrandTotal(
    treeData,
    metricKeys,
    rollupFunction(weightColumn, aggregationMode),
    weightColumn,
    timeMetrics,
  );
  const periodKeys = (): string[] =>
    chronologicalOrder(collectDistinctPivotKeys(records, pivotDimensions));

  const effectivePivotDeltaMode =
    pivotTimeDeltaMode && pivotTimeDeltaMode !== 'none'
      ? pivotTimeDeltaMode
      : showVarianceDelta
      ? 'percentage'
      : 'none';

  if (isPivotMode && effectivePivotDeltaMode !== 'none') {
    computePivotTimeDelta(
      [grandTotalNode],
      metrics,
      periodKeys(),
      effectivePivotDeltaMode,
      pivotTimeDeltaLag,
    );
  }

  if (isPivotMode && showCalendarComparison && hasNativeComparison(treeData, metrics)) {
    // The grand total baseline is the sum of the root rows' baselines (the rows carry them).
    for (const m of metrics) {
      const key = `${m}${NATIVE_COMPARISON_SUFFIX}`;
      let total: number | null = null;
      for (const root of treeData) {
        const value = root.metrics?.[key];
        if (typeof value === 'number') total = (total ?? 0) + value;
      }
      if (total !== null) grandTotalNode.metrics[key] = total;
    }
    computeNativeTimeDelta([grandTotalNode], metrics, periodKeys(), timeMetrics);
  } else if (isPivotMode && timeDeltaStrategy) {
    computeTreeTimeDeltaByStrategy([grandTotalNode], metrics, periodKeys(), timeDeltaStrategy);
  }

  for (const k of Object.keys(grandTotalNode.metrics || {})) {
    if (k.endsWith('___comp')) {
      const bK = k.replace('___comp', '');
      const curVal = grandTotalNode.metrics[bK];
      const compVal = grandTotalNode.metrics[k];
      if (typeof curVal === 'number' && typeof compVal === 'number') {
        const diff = curVal - compVal;
        const delta = compVal !== 0 ? (diff / compVal) * 100 : (curVal === 0 ? 0 : 'Nuovo');
        grandTotalNode.metrics[`${bK}___diff`] = diff;
        grandTotalNode.metrics[`${bK}___delta`] = delta;
        if (grandTotalNode.subtotals) {
          grandTotalNode.subtotals[`${bK}___diff`] = diff;
          grandTotalNode.subtotals[`${bK}___delta`] = delta;
        }
      }
    }
  }

  // 2. Generic comparative pair recomputation for Grand Total
  const allKeys = metricKeys || Object.keys(grandTotalNode.metrics || {});
  for (const key of allKeys) {
    const kLow = key.toLowerCase();
    const isDeltaPct = kLow.includes('delta') && (kLow.includes('pct') || kLow.includes('%'));
    const isDiff = (kLow.includes('diff') || kLow.startsWith('delta_')) && !isDeltaPct;

    if (isDeltaPct || isDiff) {
      // Match base metric name: e.g. delta_richieste_pct -> richieste
      const baseMatch = kLow.replace(/^delta_/, '').replace(/_pct$/, '').replace(/%$/, '').replace(/___delta$/, '');
      const corrKey = allKeys.find(
        m => m.toLowerCase() === `${baseMatch}_corr` || m.toLowerCase() === baseMatch || m.toLowerCase() === `${baseMatch}_attuale`,
      );
      const confKey = allKeys.find(
        m => m.toLowerCase() === `${baseMatch}_conf` || m.toLowerCase() === `${baseMatch}_confronto`,
      );

      if (corrKey && confKey) {
        const curVal = grandTotalNode.metrics?.[corrKey];
        const compVal = grandTotalNode.metrics?.[confKey];

        if (typeof curVal === 'number' && typeof compVal === 'number') {
          if (isDiff) {
            const diff = curVal - compVal;
            grandTotalNode.metrics[key] = diff;
            if (grandTotalNode.subtotals) grandTotalNode.subtotals[key] = diff;
          } else if (isDeltaPct) {
            let deltaPct: number | string | null = null;
            if (compVal > 0) {
              deltaPct = Math.round(((curVal - compVal) * 1000.0) / compVal) / 10;
            } else if (compVal === 0 && curVal > 0) {
              deltaPct = 'Nuovo';
            } else if (compVal === 0 && curVal === 0) {
              deltaPct = 0;
            }
            grandTotalNode.metrics[key] = deltaPct;
            if (grandTotalNode.subtotals) grandTotalNode.subtotals[key] = deltaPct;
          }
        }
      }
    }
  }

  return grandTotalNode;
}
