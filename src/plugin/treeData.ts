import { DataRecord } from '@superset-ui/core';
import { TreeNode } from '../types';
import { buildMultiDimensionTree, buildParentChildTree } from '../utils/treeBuilder';
import { computeTreeTimeComparison } from '../utils/timeComparison';
import { applyDimensionLimits } from '../utils/dimensionLimits';
import { TransformOptions } from './formDataOptions';
import { flatComparisonColumns } from './pairedComparison';

export type TreeDataOptions = Pick<
  TransformOptions,
  | 'hierarchyType'
  | 'dimensions'
  | 'pivotDimensions'
  | 'metrics'
  | 'idColumn'
  | 'parentIdColumn'
  | 'labelColumn'
  | 'showVarianceDelta'
  | 'showCalendarComparison'
  | 'weightColumn'
  | 'aggregationMode'
  | 'dimensionLimits'
>;

/**
 * Appends the `${metric}___delta` keys produced by the period-over-period comparison
 * between chronological root nodes (existing delta/variazione metrics are skipped).
 */
export function applyVarianceDelta(treeData: TreeNode[], metrics: string[]): string[] {
  computeTreeTimeComparison(treeData, metrics);
  const withDeltas = [...metrics];
  for (const m of metrics) {
    if (!m.toLowerCase().includes('delta') && !(m.toLowerCase().includes('variazione') || m.toLowerCase().includes('change'))) {
      withDeltas.push(`${m}___delta`);
    }
  }
  return withDeltas;
}

/**
 * Builds the hierarchical tree for the configured hierarchy type and returns it together with
 * the list of metric keys to render (base metrics plus optional variance deltas).
 */
export function buildTreeData(
  records: DataRecord[],
  options: TreeDataOptions,
  timeMetrics?: ReadonlySet<string>,
): { treeData: TreeNode[]; metrics: string[] } {
  const { hierarchyType, dimensions, pivotDimensions } = options;
  let metrics = [...options.metrics];

  let treeData =
    hierarchyType === 'multi_dimension'
      ? buildMultiDimensionTree(
          records,
          dimensions,
          metrics,
          pivotDimensions,
          options.weightColumn,
          options.aggregationMode,
          timeMetrics,
        )
      : buildParentChildTree(
          records,
          options.idColumn,
          options.parentIdColumn,
          options.labelColumn,
          metrics,
          options.weightColumn,
          options.aggregationMode,
          timeMetrics,
        );

  if (options.dimensionLimits && options.dimensionLimits.length > 0) {
    treeData = applyDimensionLimits(treeData, options.dimensionLimits, metrics[0]);
  }

  const isFlat = !pivotDimensions || pivotDimensions.length === 0;
  const hasFlatCalendar =
    isFlat &&
    options.showCalendarComparison !== false &&
    Object.keys(flatComparisonColumns(records, metrics)).length > 0;

  // Calendar Filter comparison (T2) takes precedence over adjacent-row variance deltas on flat ___delta keys.
  if (
    options.showVarianceDelta &&
    hierarchyType === 'multi_dimension' &&
    dimensions.length > 0 &&
    isFlat &&
    !hasFlatCalendar
  ) {
    metrics = applyVarianceDelta(treeData, metrics);
  }

  return { treeData, metrics };
}
