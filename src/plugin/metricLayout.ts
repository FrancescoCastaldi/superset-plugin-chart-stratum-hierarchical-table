import { DataRecord } from '@superset-ui/core';
import { TreeNode } from '../types';
import { computeHorizontalRowTotals } from '../utils/aggregations';
import {
  TimeDeltaStrategyConfig,
  computeNativeTimeDelta,
  computePivotTimeDelta,
  computeTreeTimeDeltaByStrategy,
  detectNaturalGrain,
} from '../utils/timeComparison';
import {
  CALENDAR_COMPARISON_TITLE,
  ColumnLayout,
  appendPeriodComparisonColumns,
  appendSparklineColumns,
  appendTableCalculationColumns,
  buildFlatColumns,
  buildMultiPivotColumns,
  buildSinglePivotColumns,
} from './columnBuilders';
import { TransformOptions } from './formDataOptions';
import {
  chronologicalOrder,
  collectDistinctPivotKeys,
  collectDistinctValues,
  displayOrder,
} from './pivotOrdering';

/**
 * Time comparison of the single pivot layout, whose pivot keys are the periods. Null when it
 * cannot apply or adds nothing: the default current/prev_period pair always yields 0, and
 * budget_target needs at least one goal.
 */
export function resolveTimeDeltaStrategy(
  options: Pick<
    TransformOptions,
    | 'isPivotMode'
    | 'pivotDimensions'
    | 'comparisonTimeGrain'
    | 'comparisonReferencePeriod'
    | 'comparisonStrategy'
    | 'goals'
  >,
): TimeDeltaStrategyConfig | null {
  const { comparisonStrategy: strategy, comparisonReferencePeriod: referencePeriod } = options;
  if (!options.isPivotMode || options.pivotDimensions.length !== 1) return null;
  if (strategy === 'prev_period' && referencePeriod === 'current') return null;
  if (strategy === 'budget_target' && options.goals.length === 0) return null;
  return { timeGrain: options.comparisonTimeGrain, referencePeriod, strategy, goals: options.goals };
}

/**
 * Builds the metric columns for the active layout (flat, single pivot, two-way pivot).
 * In pivot mode it also enriches `treeData` in place with the pivot time deltas, the time
 * comparison deltas and the horizontal row totals, which must exist before the grand total is
 * computed.
 */
export function buildMetricLayout(
  treeData: TreeNode[],
  records: DataRecord[],
  options: TransformOptions,
  metrics: string[],
): ColumnLayout {
  const format = { numberFormat: options.numberFormat, currencySymbol: options.currencySymbol };
  const { pivotDimensions, pivotRowTotalsPosition, pivotTimeDeltaMode } = options;

  if (!options.isPivotMode) {
    const flatLayout = buildFlatColumns(metrics, format, records, treeData);
    appendTableCalculationColumns(flatLayout, options.tableCalculations, format, false);
    return flatLayout;
  }

  if (pivotDimensions.length >= 2) {
    const displayDim1Values = displayOrder(
      collectDistinctValues(records, pivotDimensions[0]),
      options.pivotSortOrder,
    );
    const dim2Values = collectDistinctValues(records, pivotDimensions[1]);

    if (pivotRowTotalsPosition !== 'none') {
      computeHorizontalRowTotals(treeData, metrics, displayDim1Values, 'sum', options.dimensions);
    }

    const twoWayLayout = buildMultiPivotColumns({
      metrics,
      displayDim1Values,
      dim2Values,
      rowTotalsPosition: pivotRowTotalsPosition,
      rowTotalsLabel: options.pivotRowTotalsLabel,
      showColumnSubtotals: options.showPivotColumnSubtotals,
      columnSubtotalLabel: options.pivotColumnSubtotalLabel,
      format,
    });
    appendTableCalculationColumns(twoWayLayout, options.tableCalculations, format, true);
    return twoWayLayout;
  }

  const pivotKeys = collectDistinctPivotKeys(records, pivotDimensions);
  const chronologicalPivotValues = chronologicalOrder(pivotKeys);

  const effectivePivotDeltaMode =
    pivotTimeDeltaMode !== 'none'
      ? pivotTimeDeltaMode
      : options.showVarianceDelta
      ? 'percentage'
      : 'none';

  if (effectivePivotDeltaMode !== 'none') {
    computePivotTimeDelta(
      treeData,
      metrics,
      chronologicalPivotValues,
      effectivePivotDeltaMode,
      options.pivotTimeDeltaLag,
    );
  }

  if (pivotRowTotalsPosition !== 'none') {
    computeHorizontalRowTotals(
      treeData,
      metrics,
      chronologicalPivotValues,
      'sum',
      options.dimensions,
    );
  }

  const layout = buildSinglePivotColumns({
    metrics,
    displayPivotValues: displayOrder(pivotKeys, options.pivotSortOrder),
    combineMetric: options.combineMetric,
    rowTotalsPosition: pivotRowTotalsPosition,
    rowTotalsLabel: options.pivotRowTotalsLabel,
    deltaMode: pivotTimeDeltaMode,
    format,
  });

  const timeDeltaStrategy = resolveTimeDeltaStrategy(options);
  // The calendar filter's comparison period (T2), when the dashboard sends one, takes precedence
  // over the delta between pivot values.
  if (options.showCalendarComparison && computeNativeTimeDelta(treeData, metrics, chronologicalPivotValues)) {
    appendPeriodComparisonColumns(
      layout,
      metrics,
      { strategy: 'prev_period', referencePeriod: 'previous', timeGrain: 'auto', goals: [] },
      format,
      CALENDAR_COMPARISON_TITLE,
    );
  } else if (
    timeDeltaStrategy &&
    computeTreeTimeDeltaByStrategy(treeData, metrics, chronologicalPivotValues, timeDeltaStrategy)
  ) {
    const effectiveTimeGrain =
      timeDeltaStrategy.timeGrain === 'auto'
        ? detectNaturalGrain(chronologicalPivotValues)
        : timeDeltaStrategy.timeGrain;
    appendPeriodComparisonColumns(
      layout,
      metrics,
      { ...timeDeltaStrategy, timeGrain: effectiveTimeGrain },
      format,
    );
  }

  if (options.showSparklines) {
    appendSparklineColumns(layout, metrics, chronologicalPivotValues, options.sparklineMetrics);
  }

  appendTableCalculationColumns(
    layout,
    options.tableCalculations,
    format,
    true,
    chronologicalPivotValues,
  );

  return layout;
}
