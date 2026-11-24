import { ensureIsArray } from '@superset-ui/core';
import {
  CalendarComparisonMode,
  ComparisonFormat,
  resolveComparisonFormats,
} from './pairedComparison';
import {
  DimensionColumn,
  AggregationFunction,
  ComparisonReferencePeriod,
  ComparisonStrategy,
  ComparisonTimeGrain,
  ConditionalFormattingRule,
  HierarchyType,
  HierarchyValueDisplayMode,
  MetricDefinition,
  MetricGoal,
  MinMaxDisplayMode,
  MinMaxScope,
  HeatmapDivergingPalette,
  PivotRowTotalsPosition,
  PivotSortOrder,
  PivotTimeDeltaMode,
  SortOrder,
} from '../types';
import { baselineToStrategy, colorToHex, resolveEndOfSeriesBaseline } from './legacyMigration';
import { normalizeConditionalFormatting } from '../utils/conditionalFormatting';
import { normalizeDimensionLimits, DimensionLimitRule } from '../utils/dimensionLimits';
import { normalizeGoals } from '../utils/goalBenchmark';
import { normalizeMetricDefinitions } from '../utils/metricSemantics';
import { parseList } from './controls/listModel';
import { normalizeTableCalculations, TableCalculationConfig } from '../utils/tableCalculations';
import { DEFAULT_SUPPRESSION_LABEL, SuppressionOptions, parseSuppressionMetrics } from '../utils/suppression';
import { getTheme, ResolvedTheme } from '../utils/themes';
import { msg } from '../i18n';

/**
 * Normalized chart options. Every camelCase control has a legacy snake_case alias:
 * the resolution order below is part of the plugin contract with saved charts.
 */
/**
 * Livello delle metriche sulle righe: 'last' dopo l'ultima dimensione, 'top' prima della prima,
 * 'after_N' dopo la dimensione N (1, 2 o 3).
 */
export const METRICS_ROW_LEVELS = ['last', 'top', 'after_1', 'after_2', 'after_3'] as const;
export type MetricsRowLevel = (typeof METRICS_ROW_LEVELS)[number];

/** Quante dimensioni stanno sopra il livello metrica, data la scelta e il numero di dimensioni. */
export function metricsRowPosition(level: MetricsRowLevel, dimensionCount: number): number {
  if (level === 'top') return 0;
  if (level === 'last') return dimensionCount;
  return Math.min(Number(level.slice('after_'.length)), dimensionCount);
}

export interface TransformOptions {
  hierarchyType: HierarchyType;
  dimensions: string[];
  /** Real column of each dimension, only where it differs from the label (custom SQL columns). */
  dimensionColumns: Record<string, DimensionColumn>;
  pivotDimensions: string[];
  metrics: string[];
  idColumn: string;
  parentIdColumn: string;
  labelColumn: string;
  isPivotMode: boolean;
  initialExpandDepth: number;
  valueDisplayMode: HierarchyValueDisplayMode;
  showSubtotals: boolean;
  showGrandTotal: boolean;
  grandTotalPosition: 'top' | 'bottom';
  /** Metriche citate dalle formule e non scelte nel grafico: aggregate nell'albero, mai colonne. */
  hiddenMetrics: string[];
  /** Metriche sulle righe: le metriche diventano un livello dell'albero. */
  metricsOnRows: boolean;
  metricsRowLevel: MetricsRowLevel;
  metricsRowSubtotals: boolean;
  stickyHeader: boolean;
  enableSearch: boolean;
  compactMode: boolean;
  stripedRows: boolean;
  numberFormat: string;
  currencySymbol: string;
  isCrossFilterActive: boolean;
  enableContextMenu: boolean;
  enableHierarchicalSort: boolean;
  defaultSortColumn: string;
  defaultSortOrder: SortOrder;
  minMaxDisplayMode: MinMaxDisplayMode;
  minMaxScope: MinMaxScope;
  heatmapPalette?: HeatmapDivergingPalette;
  divergingMidpoint?: number;
  dataBarZeroAxis?: boolean;
  enableExport: boolean;
  showVarianceDelta: boolean;
  /** Delta against the comparison period (T2) sent by the dashboard's calendar filter */
  showCalendarComparison: boolean;
  /** Calendar comparison shown as a pair of cells per value (paired) or as a Δ of the row total */
  calendarComparisonMode: CalendarComparisonMode;
  /** Deltas shown next to the comparison value; null when the chart never chose them */
  comparisonFormats: ComparisonFormat[] | null;
  /** Word in the title of the comparison columns, e.g. `Confronto` */
  comparisonLabel: string;
  showVarianceBadges: boolean;
  resizableColumns: boolean;
  wrapHeaderLabels: boolean;
  reorderColumnsByDrag: boolean;
  showPeriodInMetricLabel: boolean;
  /** Titles carry the reference and comparison periods the query really used. */
  periodLabelsFromFilters: boolean;
  /** The chart's own cross-filter narrows its own query as well. */
  crossFilterAppliesToSelf: boolean;
  combineMetric: any;
  pivotSortOrder: PivotSortOrder;
  pivotRowTotalsPosition: PivotRowTotalsPosition;
  pivotRowTotalsLabel: string;
  showPivotColumnSubtotals: boolean;
  pivotColumnSubtotalLabel: string;
  pivotTimeDeltaMode: PivotTimeDeltaMode;
  pivotTimeDeltaLag: number;
  comparisonTimeGrain: ComparisonTimeGrain;
  comparisonReferencePeriod: ComparisonReferencePeriod;
  comparisonStrategy: ComparisonStrategy;
  goals: MetricGoal[];
  metricDefinitions: MetricDefinition[];
  tableCalculations: TableCalculationConfig[];
  dimensionLimits: DimensionLimitRule[];
  suppression: SuppressionOptions;
  showSparklines: boolean;
  sparklineMetrics: string[];
  aggregationMode: AggregationFunction;
  conditionalFormatting: ConditionalFormattingRule[];
  /** Weight metric of the weighted_avg roll-up; empty for every other aggregation mode. */
  weightColumn: string;
  /** Metrics of type Time: read as durations (`auto`) or left as text (`off`) */
  timeDetection: 'auto' | 'off';
  timeDisplayFormat: 'auto' | 'hms' | 'ms' | 'minutes' | 'hours' | 'seconds';
  timeFractionDigits: number;
  /** Parents, totals and row totals of Time metrics: their average (`mean`) or the table's roll-up (`general`) */
  timeRollup: 'mean' | 'general';
  theme: ResolvedTheme;
  enableWhatIf: boolean;
}

const TIME_GRAINS: readonly ComparisonTimeGrain[] = ['auto', 'day', 'week', 'month', 'quarter', 'year'];
const AGGREGATION_MODES: readonly AggregationFunction[] = ['sum', 'avg', 'min', 'max', 'count', 'weighted_avg'];
function mapSupersetTimeGrain(sqlaGrain: unknown): ComparisonTimeGrain | undefined {
  if (typeof sqlaGrain !== 'string') return undefined;
  const upper = sqlaGrain.toUpperCase().trim();
  switch (upper) {
    case 'P1D':
      return 'day';
    case 'P1W':
      return 'week';
    case 'P1M':
      return 'month';
    case 'P3M':
    case 'QUARTER':
      return 'quarter';
    case 'P1Y':
    case 'YEAR':
      return 'year';
    default:
      return undefined;
  }
}

/** First candidate that is one of the allowed choices, otherwise the fallback. */
function pickChoice<T extends string>(allowed: readonly T[], fallback: T, ...candidates: unknown[]): T {
  const match = candidates.find(c => allowed.includes(c as T));
  return match === undefined ? fallback : (match as T);
}

export function getMetricNames(rawMetrics: any): string[] {
  return ensureIsArray(rawMetrics).map((m: any) =>
    typeof m === 'string' ? m : m?.label || m?.metric_name || String(m),
  );
}

export function getColumnNames(rawColumns: any): string[] {
  return ensureIsArray(rawColumns).map((d: any) =>
    typeof d === 'string'
      ? d
      : d?.column_name || d?.label || d?.sqlExpression || String(d),
  );
}

const SIMPLE_COLUMN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * A custom SQL column is shown under its label, which is not a column of the dataset: a filter on
 * the label reaches nobody. Where the expression is just a column the filter names that column,
 * otherwise it carries the expression itself.
 */
export function getDimensionColumns(rawColumns: any): Record<string, DimensionColumn> {
  const specs: Record<string, DimensionColumn> = {};
  for (const raw of ensureIsArray(rawColumns)) {
    if (!raw || typeof raw !== 'object') continue;
    const label: string = raw.label || raw.column_name || raw.sqlExpression;
    if (!label) continue;
    let spec: DimensionColumn | null = null;
    if (raw.column_name) {
      spec = raw.column_name;
    } else if (typeof raw.sqlExpression === 'string' && raw.sqlExpression.trim()) {
      const expression = raw.sqlExpression.trim();
      spec = SIMPLE_COLUMN.test(expression)
        ? expression
        : { expressionType: 'SQL', sqlExpression: expression, label };
    }
    if (spec !== null && spec !== label) specs[label] = spec;
  }
  return specs;
}

export function getColumnName(column: any): string {
  return typeof column === 'string' ? column : column?.column_name || column?.label || '';
}

/**
 * Metriche salvate del dataset che le formule citano ma il grafico non mostra: la query le chiede
 * e l'albero le aggrega, senza farne colonne. Il controllo "Metriche calcolate" le registra in `operands`.
 */
export function resolveHiddenMetrics(formData: any, selectedMetrics: string[]): string[] {
  const rows = parseList(formData.calculatedMetrics ?? formData.calculated_metrics).rows;
  const hidden: string[] = [];
  for (const row of rows) {
    const operands = Array.isArray(row.operands) ? row.operands : [];
    for (const name of operands) {
      if (typeof name === 'string' && name && !selectedMetrics.includes(name) && !hidden.includes(name)) hidden.push(name);
    }
  }
  return hidden;
}

/**
 * Definizioni di metrica del grafico: il JSON delle definizioni, più le metriche calcolate del
 * controllo "Metriche calcolate" (sempre di tipo formula). A parità di nome vince il JSON.
 */
export function resolveMetricDefinitions(formData: any): MetricDefinition[] {
  const base = normalizeMetricDefinitions(
    formData.metricDefinitions ??
      formData.metric_definitions ??
      formData.metricDefinitionsJson ??
      formData.metric_definitions_json,
  );
  const known = new Set(base.map(def => def.metric));
  const calculated = parseList(formData.calculatedMetrics ?? formData.calculated_metrics).rows.map(row => ({
    ...row,
    type: 'formula',
  }));
  return [...base, ...normalizeMetricDefinitions(calculated).filter(def => !known.has(def.metric))];
}

export function resolveTransformOptions(mergedFormData: any): TransformOptions {
  const {
    hierarchyType = 'multi_dimension',
    groupby,
    hierarchy_dimensions,
    hierarchyDimensions,
    idColumn = '',
    parentIdColumn = '',
    labelColumn = '',
    metrics: rawMetrics = [],
    initialExpandDepth = 1,
    // Alias ancora attivo: i grafici creati via API possono averlo (equivale a initialExpandDepth -1).
    expand_all_by_default,
    expandAllByDefault,
    valueDisplayMode = 'all',
    value_display_mode,
    showSubtotals = true,
    showGrandTotal = true,
    grandTotalPosition = 'top',
    grand_total_position,
    stickyHeader,
    sticky_header,
    enableSearch,
    enable_search,
    compactMode,
    compact_mode,
    stripedRows,
    striped_rows,
    numberFormat,
    number_format,
    currencySymbol,
    currency_symbol,
    emit_filter,
    emitFilter,
    enableCrossFiltering,
    enable_cross_filtering,
    enableContextMenu,
    enable_context_menu,
    enableHierarchicalSort,
    enable_hierarchical_sort,
    enableSorting,
    enable_sorting,
    defaultSortColumn = '__hierarchy_tree__',
    default_sort_column,
    defaultSortOrder = 'none',
    default_sort_order,
    minMaxDisplayMode = 'none',
    min_max_display_mode,
    minMaxScope = 'leaves_only',
    min_max_scope,
    enableExport = true,
    showVarianceDelta,
    showVarianceBadges = true,
    resizableColumns = false,
    wrapHeaderLabels = false,
    reorderColumnsByDrag = false,
    showPeriodInMetricLabel = false,
    periodLabelsFromFilters = false,
    crossFilterAppliesToSelf = false,
    combineMetric = true,
    pivotSortOrder = 'desc',
    pivot_sort_order,
    pivotRowTotalsPosition = 'none',
    pivot_row_totals_position,
    pivotRowTotalsLabel = msg('totals.rowLabel'),
    pivot_row_totals_label,
    showPivotColumnSubtotals = true,
    pivotColumnSubtotalLabel = msg('totals.columnSubtotalLabel'),
    pivot_column_subtotal_label,
    pivotTimeDeltaMode = 'none',
    pivot_time_delta_mode,
    pivotTimeDeltaLag = 1,
    pivot_time_delta_lag,
  } = mergedFormData;

  const rawDimensions =
    groupby ||
    hierarchyDimensions ||
    hierarchy_dimensions ||
    mergedFormData.tree_dimensions ||
    mergedFormData.treeDimensions ||
    mergedFormData.dimensions;
  const dimensions = getColumnNames(rawDimensions);
  const pivotDimensions = getColumnNames(
    mergedFormData.columns ||
    mergedFormData.pivot_columns ||
    mergedFormData.pivotColumns,
  );

  const baseline = baselineToStrategy(resolveEndOfSeriesBaseline(mergedFormData));

  return {
    hierarchyType,
    dimensions,
    dimensionColumns: getDimensionColumns(rawDimensions),
    pivotDimensions,
    metrics: getMetricNames(rawMetrics),
    hiddenMetrics: resolveHiddenMetrics(mergedFormData, getMetricNames(rawMetrics)),
    idColumn: getColumnName(idColumn),
    parentIdColumn: getColumnName(parentIdColumn),
    labelColumn: getColumnName(labelColumn),
    isPivotMode: hierarchyType === 'multi_dimension' && pivotDimensions.length > 0,
    initialExpandDepth:
      expandAllByDefault || expand_all_by_default ? -1 : Number(initialExpandDepth ?? 1),
    valueDisplayMode: valueDisplayMode || value_display_mode || 'all',
    showSubtotals: showSubtotals ?? true,
    showGrandTotal: showGrandTotal ?? true,
    grandTotalPosition: grandTotalPosition || grand_total_position || 'top',
    metricsOnRows: Boolean(mergedFormData.metricsOnRows ?? mergedFormData.metrics_on_rows ?? false),
    metricsRowLevel: pickChoice(
      METRICS_ROW_LEVELS,
      'last',
      mergedFormData.metricsRowLevel,
      mergedFormData.metrics_row_level,
    ),
    metricsRowSubtotals: Boolean(
      mergedFormData.metricsRowSubtotals ?? mergedFormData.metrics_row_subtotals ?? true,
    ),
    stickyHeader: Boolean(stickyHeader ?? sticky_header ?? true),
    enableSearch: Boolean(enableSearch ?? enable_search ?? true),
    compactMode: Boolean(compactMode ?? compact_mode ?? false),
    stripedRows: Boolean(stripedRows ?? striped_rows ?? true),
    numberFormat: numberFormat || number_format || 'SMART_NUMBER',
    currencySymbol: currencySymbol || currency_symbol || '',
    isCrossFilterActive: Boolean(
      emitFilter ?? emit_filter ?? enableCrossFiltering ?? enable_cross_filtering ?? true,
    ),
    enableContextMenu: Boolean(
      enableContextMenu ?? enable_context_menu ?? true,
    ),
    enableHierarchicalSort:
      enableHierarchicalSort ?? enable_hierarchical_sort ?? enableSorting ?? enable_sorting ?? true,
    defaultSortColumn: defaultSortColumn || default_sort_column || '__hierarchy_tree__',
    defaultSortOrder: defaultSortOrder || default_sort_order || 'none',
    minMaxDisplayMode: minMaxDisplayMode || min_max_display_mode || 'none',
    minMaxScope: minMaxScope || min_max_scope || 'leaves_only',
    heatmapPalette: mergedFormData.heatmapPalette || mergedFormData.heatmap_palette || 'red_white_green',
    divergingMidpoint:
      mergedFormData.divergingMidpoint !== undefined &&
      mergedFormData.divergingMidpoint !== '' &&
      Number.isFinite(Number(mergedFormData.divergingMidpoint))
        ? Number(mergedFormData.divergingMidpoint)
        : mergedFormData.diverging_midpoint !== undefined &&
          mergedFormData.diverging_midpoint !== '' &&
          Number.isFinite(Number(mergedFormData.diverging_midpoint))
        ? Number(mergedFormData.diverging_midpoint)
        : undefined,
    dataBarZeroAxis: Boolean(mergedFormData.dataBarZeroAxis ?? mergedFormData.data_bar_zero_axis),
    enableExport: enableExport ?? true,
    showVarianceDelta: Boolean(showVarianceDelta),
    showCalendarComparison:
      mergedFormData.show_calendar_comparison !== false && mergedFormData.showCalendarComparison !== false,
    calendarComparisonMode:
      mergedFormData.calendar_comparison_mode === 'row_total' ? 'row_total' : 'paired',
    comparisonFormats: Array.isArray(mergedFormData.calendar_comparison_formats)
      ? resolveComparisonFormats(mergedFormData.calendar_comparison_formats, [])
      : null,
    comparisonLabel:
      typeof mergedFormData.calendar_comparison_label === 'string' &&
      mergedFormData.calendar_comparison_label.trim() !== ''
        ? mergedFormData.calendar_comparison_label.trim()
        : '{periodo}',
    showVarianceBadges: showVarianceBadges !== false,
    resizableColumns: Boolean(resizableColumns),
    wrapHeaderLabels: Boolean(wrapHeaderLabels),
    reorderColumnsByDrag: Boolean(reorderColumnsByDrag),
    showPeriodInMetricLabel: Boolean(showPeriodInMetricLabel),
    periodLabelsFromFilters: Boolean(periodLabelsFromFilters),
    crossFilterAppliesToSelf: Boolean(crossFilterAppliesToSelf),
    combineMetric: combineMetric ?? true,
    pivotSortOrder: pivotSortOrder || pivot_sort_order || 'desc',
    pivotRowTotalsPosition: pivotRowTotalsPosition || pivot_row_totals_position || 'none',
    pivotRowTotalsLabel: pivotRowTotalsLabel || pivot_row_totals_label || msg('totals.rowLabel'),
    showPivotColumnSubtotals: showPivotColumnSubtotals ?? true,
    pivotColumnSubtotalLabel: pivotColumnSubtotalLabel || pivot_column_subtotal_label || msg('totals.columnSubtotalLabel'),
    pivotTimeDeltaMode: pivotTimeDeltaMode || pivot_time_delta_mode || 'none',
    pivotTimeDeltaLag: Number(pivotTimeDeltaLag || pivot_time_delta_lag || 1),
    // La base del confronto di fine serie sostituisce comparisonType e referencePeriod; i grafici
    // salvati con le chiavi vecchie continuano a funzionare (vedi legacyMigration).
    comparisonTimeGrain: pickChoice(
      TIME_GRAINS,
      'year',
      mergedFormData.comparisonTimeGrain,
      mergedFormData.timeGrain,
      mergedFormData.time_grain,
      mapSupersetTimeGrain(mergedFormData.time_grain_sqla),
    ),
    comparisonReferencePeriod: baseline.referencePeriod,
    comparisonStrategy: baseline.strategy,
    goals: normalizeGoals(mergedFormData.goals),
    metricDefinitions: resolveMetricDefinitions(mergedFormData),
    tableCalculations: normalizeTableCalculations(
      mergedFormData.tableCalculations ?? mergedFormData.table_calculations,
      resolveMetricDefinitions(mergedFormData),
    ),
    dimensionLimits: normalizeDimensionLimits(
      mergedFormData.dimensionLimits ?? mergedFormData.dimension_limits,
    ),
    suppression: {
      threshold: Math.max(
        0,
        Math.floor(
          Number(mergedFormData.suppressionThreshold ?? mergedFormData.suppression_threshold) || 0,
        ),
      ),
      metrics: parseSuppressionMetrics(
        mergedFormData.suppressionMetrics ?? mergedFormData.suppression_metrics,
      ),
      label:
        String(mergedFormData.suppressionLabel ?? mergedFormData.suppression_label ?? '').trim() ||
        DEFAULT_SUPPRESSION_LABEL,
      complementary:
        mergedFormData.complementarySuppression ??
        mergedFormData.complementary_suppression ??
        true,
    },
    showSparklines: Boolean(mergedFormData.showSparklines),
    sparklineMetrics: parseSuppressionMetrics(mergedFormData.sparklineMetrics),
    aggregationMode: pickChoice(AGGREGATION_MODES, 'sum', mergedFormData.aggregationMode),
    conditionalFormatting: normalizeConditionalFormatting(mergedFormData.conditionalFormatting),
    weightColumn:
      mergedFormData.aggregationMode === 'weighted_avg'
        ? String(mergedFormData.weightColumn ?? '').trim()
        : '',
    timeDetection: pickChoice(['auto', 'off'] as const, 'auto', mergedFormData.timeDetection, mergedFormData.time_detection),
    timeDisplayFormat: pickChoice(
      ['auto', 'hms', 'ms', 'minutes', 'hours', 'seconds'] as const,
      'auto',
      mergedFormData.timeDisplayFormat,
      mergedFormData.time_display_format,
    ),
    timeFractionDigits: Math.min(
      3,
      Math.max(0, Math.round(Number(mergedFormData.timeFractionDigits ?? mergedFormData.time_fraction_digits ?? 0)) || 0),
    ),
    timeRollup: pickChoice(['mean', 'general'] as const, 'mean', mergedFormData.timeRollup, mergedFormData.time_rollup),
    theme: getTheme(
      mergedFormData.themeProfile ??
        mergedFormData.theme_profile ??
        mergedFormData.theme_palette ??
        mergedFormData.themePalette ??
        mergedFormData.theme,
      {
        customPositiveHex: colorToHex(mergedFormData.customPositiveHex),
        customNegativeHex: colorToHex(mergedFormData.customNegativeHex),
        customNeutralHex: colorToHex(mergedFormData.customNeutralHex),
      },
    ),
    enableWhatIf: Boolean(mergedFormData.enableWhatIf ?? mergedFormData.enable_what_if),
  };
}
