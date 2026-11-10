import { DataRecord } from '@superset-ui/core';
import {
  HierarchicalTableChartProps,
  HierarchicalTableTransformedProps,
  TableColumn,
} from '../types';
import { buildHierarchyColumn } from './columnBuilders';
import { createClearFilterHandler, createCrossFilterHandler } from './eventHandlers';
import { TransformOptions, resolveTransformOptions } from './formDataOptions';
import { buildGrandTotalNode } from './grandTotal';
import { buildMetricLayout, resolveTimeDeltaStrategy } from './metricLayout';
import { writePairedDeltas } from './pairedComparison';
import { buildTreeData } from './treeData';
import { applyConfidenceIntervals } from '../utils/significance';
import { applySuppression } from '../utils/suppression';
import {
  applyMetricDefinitions,
  findMetricDefinition,
  formatByDefinition,
} from '../utils/metricSemantics';
import { applyTableCalculations } from '../utils/tableCalculations';
import {
  applyPeriodLabels,
  detectComparisonOffset,
  resolvePeriodScope,
} from '../utils/periodLabels';
import { collectDistinctPivotKeys } from './pivotOrdering';
import {
  applyDynamicPeriodTitles,
  readChartPeriods,
  stripPeriodColumns,
} from '../utils/dynamicPeriodLabels';

/**
 * Column with the number format and the polarity of its metric definition. Delta columns keep
 * their own format and only borrow the polarity.
 */
function applyColumnDefinition(column: TableColumn, options: TransformOptions): TableColumn {
  if (!column.isMetric || options.metricDefinitions.length === 0) return column;
  const rawKey = column.baseMetric ?? column.key;
  const baseName = rawKey.split('___')[0].replace(/ (Delta|Δ%|Δ period|Δ% period)$/, '');
  const def =
    findMetricDefinition(rawKey, options.metricDefinitions) ||
    findMetricDefinition(baseName, options.metricDefinitions);
  if (!def) return column;
  const isDeltaColumn = /delta/i.test(column.key) || /delta/i.test(column.baseMetric ?? '');
  const baseFormatter = column.formatter;
  return {
    ...column,
    ...(def.polarity ? { polarity: def.polarity } : {}),
    ...(def.format && !isDeltaColumn
      ? {
          formatter: (val: any) =>
            formatByDefinition(val, def, options.currencySymbol) ??
            (baseFormatter ? baseFormatter(val) : String(val ?? '-')),
        }
      : {}),
  };
}

export default function transformProps(
  chartProps: HierarchicalTableChartProps,
): HierarchicalTableTransformedProps {
  const { width, height, formData = {} as any, rawFormData = {} as any, queriesData, hooks, filterState } = chartProps as any;
  const { onAddFilter, setDataMask, onContextMenu, onReorderMetrics, onWhatIfChange } = hooks || {};

  const options = resolveTransformOptions({ ...rawFormData, ...formData });
  const fetchedRecords: DataRecord[] = queriesData?.[0]?.data || [];
  // The periods the query ran on come with the data, and are not data of the table.
  const periods = options.periodLabelsFromFilters ? readChartPeriods(fetchedRecords) : null;
  const dataRecords: DataRecord[] = options.periodLabelsFromFilters
    ? stripPeriodColumns(fetchedRecords)
    : fetchedRecords;

  const { treeData, metrics } = buildTreeData(dataRecords, options);
  // Explicit metric definitions first, so that the deltas computed by the layout read the right values.
  applyMetricDefinitions(treeData, undefined, options.metricDefinitions, options.dimensions);
  const layout = buildMetricLayout(treeData, dataRecords, options, metrics);

  const definedColumns = layout.columns.map(column => applyColumnDefinition(column, options));
  const metricColumns = applyDynamicPeriodTitles(definedColumns, periods);
  const columns: TableColumn[] = [
    buildHierarchyColumn(options.hierarchyType, options.dimensions),
    ...(options.showPeriodInMetricLabel && !periods
      ? applyPeriodLabels(
          metricColumns,
          resolvePeriodScope({
            periodKeys: options.isPivotMode
              ? collectDistinctPivotKeys(dataRecords, options.pivotDimensions)
              : treeData.map(node => node.name),
            comparisonOffset: detectComparisonOffset(
              dataRecords as Record<string, unknown>[],
              options.metrics,
              { ...rawFormData, ...formData },
            ),
            timeRange: {
              from: queriesData?.[0]?.from_dttm,
              to: queriesData?.[0]?.to_dttm,
            },
            strategy: resolveTimeDeltaStrategy(options),
            // Outside the pivot comparison the grain is read from the data: the control default
            // (year) would label monthly rows as a year.
            grain: resolveTimeDeltaStrategy(options) ? options.comparisonTimeGrain : 'auto',
          }),
        )
      : metricColumns),
  ];

  const grandTotalNode = buildGrandTotalNode({
    treeData,
    records: dataRecords,
    metrics,
    metricKeys: layout.metricKeys,
    showGrandTotal: options.showGrandTotal,
    isPivotMode: options.isPivotMode,
    pivotDimensions: options.pivotDimensions,
    pivotTimeDeltaMode: options.pivotTimeDeltaMode,
    pivotTimeDeltaLag: options.pivotTimeDeltaLag,
    timeDeltaStrategy: resolveTimeDeltaStrategy(options),
    weightColumn: options.weightColumn,
    aggregationMode: options.aggregationMode,
    showVarianceDelta: options.showVarianceDelta,
    showCalendarComparison: options.showCalendarComparison,
  });
  // The deltas of the paired comparison on the grand total, from its own current and comparison values.
  if (grandTotalNode && layout.pairedKeys && layout.pairedFormats) {
    writePairedDeltas([grandTotalNode], layout.pairedKeys, layout.pairedFormats);
  }
  // Again with the grand total and the row totals, which only exist after the layout.
  applyMetricDefinitions(treeData, grandTotalNode, options.metricDefinitions, options.dimensions);
  applyTableCalculations(treeData, grandTotalNode, options.tableCalculations);
  applyConfidenceIntervals(treeData, grandTotalNode, options.metricDefinitions, options.goals);
  // Last, so that nothing downstream (sorting, colours, export) ever sees a hidden value.
  applySuppression(treeData, options.suppression, options.metricDefinitions);

  return {
    width,
    height,
    data: treeData,
    rawRecords: dataRecords,
    columns,
    pivotHeaderGroups: layout.pivotHeaderGroups,
    isPivotMode: options.isPivotMode,
    combineMetric: Boolean(options.combineMetric),
    pivotSortOrder: options.pivotSortOrder,
    pivotRowTotalsPosition: options.pivotRowTotalsPosition,
    pivotRowTotalsLabel: options.pivotRowTotalsLabel,
    showPivotColumnSubtotals: options.showPivotColumnSubtotals,
    pivotColumnSubtotalLabel: options.pivotColumnSubtotalLabel,
    pivotTimeDeltaMode: options.pivotTimeDeltaMode,
    formData,
    hierarchyType: options.hierarchyType,
    dimensions: options.dimensions,
    pivotColumns: options.pivotDimensions,
    metrics,
    displayMetrics: layout.metricKeys,
    initialExpandDepth: options.initialExpandDepth,
    valueDisplayMode: options.valueDisplayMode,
    showSubtotals: options.showSubtotals,
    showGrandTotal: options.showGrandTotal,
    grandTotalPosition: options.grandTotalPosition,
    grandTotalNode,
    stickyHeader: options.stickyHeader,
    enableSearch: options.enableSearch,
    enableHierarchicalSort: options.enableHierarchicalSort,
    defaultSortColumn: options.defaultSortColumn,
    defaultSortOrder: options.defaultSortOrder,
    minMaxDisplayMode: options.minMaxDisplayMode,
    minMaxScope: options.minMaxScope,
    ...(options.heatmapPalette && options.heatmapPalette !== 'red_white_green'
      ? { heatmapPalette: options.heatmapPalette }
      : {}),
    ...(options.divergingMidpoint !== undefined
      ? { divergingMidpoint: options.divergingMidpoint }
      : {}),
    ...(options.dataBarZeroAxis ? { dataBarZeroAxis: options.dataBarZeroAxis } : {}),
    enableExport: options.enableExport,
    compactMode: options.compactMode,
    stripedRows: options.stripedRows,
    emitFilter: options.isCrossFilterActive,
    enableContextMenu: options.enableContextMenu,
    onContextMenu,
    ...(onReorderMetrics ? { onReorderMetrics } : {}),
    ...(options.enableWhatIf ? { enableWhatIf: true } : {}),
    ...(onWhatIfChange ? { onWhatIfChange } : {}),
    ...(options.showVarianceDelta ? { showVarianceDelta: true } : {}),
    // Omitted when on (the default) so existing charts keep their props shape.
    ...(options.showVarianceDelta && !options.showVarianceBadges ? { showVarianceBadges: false } : {}),
    // Layout flags, omitted when off so that charts keep their previous props shape.
    ...(options.resizableColumns ? { resizableColumns: true } : {}),
    ...(options.wrapHeaderLabels ? { wrapHeaderLabels: true } : {}),
    ...(options.reorderColumnsByDrag ? { reorderColumnsByDrag: true } : {}),
    // Omitted when unset so charts without goals keep their previous props shape.
    ...(options.goals.length > 0 ? { goals: options.goals } : {}),
    ...(options.conditionalFormatting.length > 0
      ? { conditionalFormatting: options.conditionalFormatting }
      : {}),
    ...(options.theme.name !== 'standard' ? { theme: options.theme } : {}),
    filterState,
    onCrossFilter: createCrossFilterHandler({
      isCrossFilterActive: options.isCrossFilterActive,
      columnSpecs: options.dimensionColumns,
      setDataMask,
      onAddFilter,
      applyToSelf: options.crossFilterAppliesToSelf,
    }),
    onClearFilter: createClearFilterHandler(setDataMask, options.crossFilterAppliesToSelf),
  };
}
