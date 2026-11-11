import {
  ChartProps,
  ChartDataResponse,
  QueryFormData,
  DataRecord,
  ContextMenuFilters,
} from '@superset-ui/core';
import type { ResolvedTheme, ThemeProfileName } from '../utils/themes';

export type HierarchyType = 'multi_dimension' | 'parent_child';

export type AggregationFunction = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'weighted_avg';

export type SortOrder = 'asc' | 'desc' | 'none';

/** A metric key, a hierarchy dimension, a structural key, or a derived delta percentage. */
export type SortExpression =
  | string
  | '__hierarchy_tree__'
  | '__tree_level__'
  | '__leaf_count__'
  | `delta_${string}_pct`;

/** Placement of null, NaN and undefined sort values; unset behaves as 'bottom'. */
export type NullHandling = 'bottom' | 'top' | 'exclude';

export type MinMaxDisplayMode =
  | 'none'
  | 'badges'
  | 'heatmap'
  | 'diverging_heatmap'
  | 'data_bars'
  | 'bipolar_data_bars';

export type HeatmapDivergingPalette =
  | 'red_white_green'
  | 'red_yellow_green'
  | 'blue_white_red'
  | 'custom';

export interface DivergingColorOptions {
  midpoint?: number;
  palette?: HeatmapDivergingPalette;
  positiveColor?: string;
  negativeColor?: string;
  neutralColor?: string;
  polarity?: MetricPolarity;
}

export interface BipolarDataBarOptions {
  positiveColor?: string;
  negativeColor?: string;
  polarity?: MetricPolarity;
}

export type MinMaxScope = 'leaves_only' | 'level_aware' | 'all_nodes';

export type HierarchyValueDisplayMode = 'all' | 'leaves_only' | 'parents_only';

export type PivotTimeDeltaMode = 'none' | 'absolute' | 'percentage' | 'both';

export type PivotSortOrder = 'desc' | 'asc' | 'none';

export type PivotRowTotalsPosition = 'left' | 'right' | 'none';

export type ComparisonTimeGrain = 'auto' | 'day' | 'week' | 'month' | 'quarter' | 'year';

export type ComparisonReferencePeriod = 'current' | 'previous' | 'ytd';

export type ComparisonStrategy = 'prev_period' | 'prev_year_same_period' | 'budget_target';

export interface MinMaxBound {
  min: number;
  max: number;
}

export interface MinMaxBoundsMap {
  global: Record<string, MinMaxBound>;
  byLevel?: Record<string, Record<number, MinMaxBound>>;
}

export type ConditionalFormattingScope = 'cell' | 'row' | 'column';

export type ConditionalIcon = 'arrow_up' | 'arrow_down' | 'dot' | 'flag' | 'check' | 'warning';

export interface ConditionalFormattingRule {
  metric: string;
  operator: '>' | '>=' | '<' | '<=' | '==' | 'between' | 'regex';
  /** Threshold of the comparison operators, or the pattern of the regex operator. */
  targetValue: number | string;
  targetValue2?: number;
  colorScheme: 'red_green' | 'green_red' | 'blues' | 'custom';
  backgroundColor?: string;
  textColor?: string;
  highlightRow?: boolean;
  /** Conflict resolution: ascending, the first matching rule wins (1 is the highest). */
  priority?: number;
  /** Defaults to 'row' when highlightRow is set, 'cell' otherwise. */
  scope?: ConditionalFormattingScope;
  /** Indicator shown beside the value of a matching cell, coloured like the rule. */
  icon?: ConditionalIcon;
}

export type MetricType = 'sum' | 'mean' | 'distinct_count' | 'ratio' | 'delta_pct' | 'diff' | 'none';

export type MetricFormat = 'integer' | 'decimal' | 'percent' | 'duration' | 'days' | 'currency';

export type MetricPolarity = 'higher_is_better' | 'lower_is_better';

export type ConfidenceMethod = 'none' | 'wilson' | 'poisson';

export type SignalReference = 'parent' | 'total' | 'goal';

/**
 * Explicit meaning of one metric. When present it wins over the name heuristics for the roll-up
 * of parent rows and the grand total, the number format and the polarity of deltas.
 */
export interface MetricDefinition {
  metric: string;
  type: MetricType;
  /** 'mean': metric that weights the average; empty means a plain arithmetic mean. */
  weight?: string;
  /** 'distinct_count': hierarchy dimension of the counted entity (MAX at and below, SUM above). */
  entityDimension?: string;
  /** 'ratio': numerator / denominator * scale. */
  numerator?: string;
  denominator?: string;
  scale?: number;
  /** 'delta_pct': (current - baseline) / baseline * 100. 'diff': current - baseline on every node, including parents and the grand total (node-level difference, never a sum or average of child diffs). */
  current?: string;
  baseline?: string;
  format?: MetricFormat;
  decimals?: number;
  polarity?: MetricPolarity;
  /** 'ratio' only: confidence interval method, level and the reference of the significance signal. */
  ci?: ConfidenceMethod;
  ciLevel?: number;
  compareTo?: SignalReference;
  /** Table calculation modifier (e.g. pct_of_total, pct_of_parent, running_total, rank). */
  calculation?: TableCalculationType;
  calculationScope?: TableCalculationScope;
  rankMethod?: RankMethod;
  rankOrder?: 'desc' | 'asc';
  calculationDisplayMode?: 'replace' | 'companion_column';
}

export type TableCalculationType =
  | 'none'
  | 'pct_of_total'
  | 'pct_of_parent'
  | 'running_total'
  | 'diff_from_previous'
  | 'diff_from_previous_pct'
  | 'rank';

export type TableCalculationScope = 'hierarchy' | 'periods';

export type RankMethod = 'competition' | 'dense';

export interface TableCalculationConfig {
  metric: string;
  type: TableCalculationType;
  /** Direction: across sibling nodes in hierarchy or across pivot periods. Default: 'hierarchy' */
  scope?: TableCalculationScope;
  /** Rank method when type is 'rank'. Default: 'competition' */
  rankMethod?: RankMethod;
  /** Sort order for rank: 'desc' (highest value is rank 1, default) or 'asc' */
  rankOrder?: 'desc' | 'asc';
  /** 'replace' replaces metric value, 'companion_column' adds a new column next to metric. Default: 'companion_column' */
  displayMode?: 'replace' | 'companion_column';
  /** Optional custom title for the calculation column */
  customTitle?: string;
}

export type DimensionLimitMode = 'top' | 'bottom';

export interface DimensionLimitRule {
  /** Target depth level (0 = root level, 1 = first child level, etc.) or dimension name. */
  level?: number;
  dimension?: string;
  /** Maximum number of elements to show before collapsing remainder into Others. 0 or undefined means no limit. */
  limit: number;
  /** Metric key to sort by when determining Top N. If unspecified, defaults to the first metric. */
  metric?: string;
  /** Direction: 'top' (highest values first, default) or 'bottom' (lowest values first). */
  mode?: DimensionLimitMode;
  /** Label for the synthetic node. Defaults to 'Altri ({k})' where {k} is the collapsed count. */
  othersLabel?: string;
}

export interface HierarchicalTableFormData extends QueryFormData {
  // Dimension & Metric Controls
  hierarchyType: HierarchyType;
  groupby?: string[];
  columns?: string[];
  pivot_columns?: string[];
  idColumn?: string;
  parentIdColumn?: string;
  labelColumn?: string;
  metrics: any;

  // Pivot & Matrix Options
  combineMetric?: boolean;
  pivotSortOrder?: PivotSortOrder;
  pivotRowTotalsPosition?: PivotRowTotalsPosition;
  pivotRowTotalsLabel?: string;
  showPivotColumnSubtotals?: boolean;
  pivotColumnSubtotalLabel?: string;
  pivotTimeDeltaMode?: PivotTimeDeltaMode;
  pivotTimeDeltaLag?: number;

  // Time Comparison: saved charts store these under the timeGrain, referencePeriod and
  // comparisonType control names, resolved to these fields in formDataOptions.ts.
  comparisonTimeGrain?: ComparisonTimeGrain;
  comparisonReferencePeriod?: ComparisonReferencePeriod;
  comparisonStrategy?: ComparisonStrategy;

  // Display & Hierarchy Options
  initialExpandDepth: number; // 0 = all collapsed, -1 = all expanded, N = expand up to level N
  valueDisplayMode?: HierarchyValueDisplayMode;
  showSubtotals: boolean;
  showGrandTotal: boolean;
  grandTotalPosition?: 'top' | 'bottom';
  stickyHeader: boolean;
  enableSearch: boolean;
  enableSorting: boolean;
  enableHierarchicalSort?: boolean;
  enableExport?: boolean;
  pageSize: number;
  virtualizationThreshold?: number;

  // Sorting & Conditional Formatting
  defaultSortColumn?: SortExpression;
  defaultSortOrder?: SortOrder;
  nullHandling?: NullHandling;
  minMaxDisplayMode?: MinMaxDisplayMode;
  minMaxScope?: MinMaxScope;

  // Formatting & Aesthetics
  numberFormat?: string;
  currencySymbol?: string;
  // Time and duration metrics
  timeDetection?: 'auto' | 'off';
  timeDisplayFormat?: 'auto' | 'hms' | 'ms' | 'minutes' | 'hours' | 'seconds';
  timeFractionDigits?: number | string;
  timeRollup?: 'mean' | 'general';
  conditionalFormatting?: ConditionalFormattingRule[];
  stripedRows?: boolean;
  compactMode?: boolean;

  // Theme & Palette: the hex overrides apply only to the custom profile.
  themeProfile?: ThemeProfileName;
  customPositiveHex?: string;
  customNegativeHex?: string;
  customNeutralHex?: string;

  // Advanced Rollup Calculations: weightColumn is the metric that weights the weighted_avg rollup.
  aggregationMode?: AggregationFunction;
  weightColumn?: string;

  // Metric Semantics: explicit meaning of metrics, wins over the name heuristics.
  metricDefinitions?: MetricDefinition[];

  // Privacy and trend.
  suppressionThreshold?: number;
  suppressionMetrics?: string;
  suppressionLabel?: string;
  complementarySuppression?: boolean;
  showSparklines?: boolean;
  sparklineMetrics?: string;

  // Goals (optional)
  goals?: { metricKey: string; target: number; direction: 'higher_is_better' | 'lower_is_better' }[];

  // Cross Filtering (Superset 6.1.0)
  emit_filter?: boolean;
  enableCrossFiltering?: boolean;
  /** The table is filtered by its own cross-filter too, so it shows only the selection. */
  crossFilterAppliesToSelf?: boolean;

  // Context Menu & Drill
  enableContextMenu?: boolean;

  // Table Calculations & Measure Modifiers (F2)
  tableCalculations?: TableCalculationConfig[];

  // Dimension Limits & Top N (F3)
  dimensionLimits?: DimensionLimitRule[] | string;

  // Diverging Heatmap & Bipolar Data Bars (F4)
  divergingMidpoint?: number | string;
  heatmapPalette?: HeatmapDivergingPalette;
  dataBarZeroAxis?: boolean;

  // What-If Simulation & Scenarios
  enableWhatIf?: boolean;
}

export type MetricGoal = NonNullable<HierarchicalTableFormData['goals']>[number];

export type GoalDirection = MetricGoal['direction'];

export type GoalStatus = 'achieved' | 'on_track' | 'at_risk' | 'missed';

export interface GoalDelta {
  deltaAbsolute: number;
  /** Signed percentage of the target; null when the target is zero. */
  deltaPct: number | null;
  status: GoalStatus;
}

/** Adjustment rule for a single metric in a What-If scenario. */
export interface WhatIfAdjustment {
  metric: string;
  /** Multiplicative factor: 1.10 means +10%, 0.85 means -15%. */
  factor: number;
}

/** A named What-If scenario with its adjustments. */
export interface WhatIfScenario {
  id: string;
  name: string;
  adjustments: WhatIfAdjustment[];
  createdAt: number;
}

/** Snapshot of the baseline tree before simulation, for delta rendering. */
export interface WhatIfBaseline {
  /** Original metric values per node key, for tooltip display. */
  nodeBaselines: Map<string, Record<string, number | null>>;
}

/** Result of applying a What-If scenario to a tree. */
export interface WhatIfResult {
  simulatedTree: TreeNode[];
  simulatedGrandTotal: TreeNode | undefined;
  baseline: WhatIfBaseline;
  activeScenario?: WhatIfScenario;
}

/** Confidence interval of a ratio cell, in the units of the cell value. */
export interface CellInterval {
  lower: number;
  upper: number;
  level: number;
  /** The interval lies entirely above or below the reference of the significance signal. */
  signal?: 'above' | 'below';
}

export interface TreeNode {
  key: string;
  id: string;
  name: string;
  dimension?: string;
  depth: number;
  path: string[];
  /** Original database values along the dimension path, present only when they differ from the displayed string path. */
  rawPath?: (string | number | boolean | null)[];
  isLeaf: boolean;
  children?: TreeNode[];
  metrics: Record<string, number | string | null>;
  subtotals?: Record<string, number | string | null>;
  rawData?: DataRecord;
  /** Confidence intervals by metric key, for ratio metrics with a ci method. */
  intervals?: Record<string, CellInterval>;
  /** Label shown in place of the hidden value of a small-number-suppressed cell, by metric key. */
  suppressed?: Record<string, string>;
  /** True if this node is a synthetic aggregated 'Others' row grouping excluded items beyond dimension limits. */
  isOthers?: boolean;
  /** Count of original items collapsed into this synthetic 'Others' row. */
  othersCount?: number;
}

export interface TableColumn {
  key: string;
  title: string;
  dataIndex: string;
  width?: number | string;
  align?: 'left' | 'center' | 'right';
  isMetric: boolean;
  isHierarchyDimension?: boolean;
  pivotValue?: string;
  baseMetric?: string;
  formatter?: (val: any) => any;
  /** The CSV export writes the formatted text (a duration) instead of the raw number (seconds). */
  exportFormatted?: boolean;
  /** Direction of improvement of the metric of the column, from its definition. */
  polarity?: MetricPolarity;
  /** Value of a delta column that means "no change" (0 by default, 1 for a ratio column). */
  deltaBaseline?: number;
  /** Trend column: the cell draws the series of `metric` over `periods` instead of a value. */
  sparkline?: { metric: string; periods: string[] };
  /** Type of table calculation if this column represents a measure modifier. */
  calculationType?: TableCalculationType;
}

export interface PivotHeaderGroup {
  title: string;
  key: string;
  colSpan: number;
  subGroups?: PivotHeaderGroup[];
}

export interface HierarchicalTableTransformedProps {
  width: number;
  height: number;
  data: TreeNode[];
  rawRecords: DataRecord[];
  columns: TableColumn[];
  pivotHeaderGroups?: PivotHeaderGroup[];
  isPivotMode?: boolean;
  combineMetric?: boolean;
  pivotSortOrder?: PivotSortOrder;
  pivotRowTotalsPosition?: PivotRowTotalsPosition;
  pivotRowTotalsLabel?: string;
  showPivotColumnSubtotals?: boolean;
  pivotColumnSubtotalLabel?: string;
  pivotTimeDeltaMode?: PivotTimeDeltaMode;
  formData: HierarchicalTableFormData;
  hierarchyType: HierarchyType;
  dimensions: string[];
  pivotColumns?: string[];
  metrics: string[];
  displayMetrics: string[];
  initialExpandDepth: number;
  valueDisplayMode?: HierarchyValueDisplayMode;
  showSubtotals: boolean;
  showGrandTotal: boolean;
  grandTotalPosition?: 'top' | 'bottom';
  grandTotalNode?: TreeNode;
  stickyHeader: boolean;
  enableSearch: boolean;
  enableHierarchicalSort?: boolean;
  defaultSortColumn?: SortExpression;
  defaultSortOrder?: SortOrder;
  minMaxDisplayMode?: MinMaxDisplayMode;
  minMaxScope?: MinMaxScope;
  heatmapPalette?: HeatmapDivergingPalette;
  divergingMidpoint?: number;
  dataBarZeroAxis?: boolean;
  enableExport?: boolean;
  compactMode: boolean;
  stripedRows: boolean;
  emitFilter: boolean;
  enableContextMenu?: boolean;
  showVarianceDelta?: boolean;
  showVarianceBadges?: boolean;
  /** Column widths can be dragged from the edge of the header (omitted when off). */
  resizableColumns?: boolean;
  /** Long header and row labels wrap onto more lines (omitted when off). */
  wrapHeaderLabels?: boolean;
  /** Metric columns can be dragged to another place, with no help from the dashboard (omitted when off). */
  reorderColumnsByDrag?: boolean;
  goals?: MetricGoal[];
  conditionalFormatting?: ConditionalFormattingRule[];
  theme?: ResolvedTheme;
  filterState?: {
    value?: any;
    selectedValues?: string[];
    filters?: any;
    /** Nodes this chart selected, kept by the dashboard so that the table can show them again. */
    selectedNodes?: SelectedFilterItem[];
  };
  onContextMenu?: (clientX: number, clientY: number, filters?: ContextMenuFilters) => void;
  onCrossFilter?: (
    dimension: string,
    value: FilterValue | FilterValue[],
    pathMap?: Record<string, FilterValue> | Record<string, FilterValue>[],
    isCurrentlySelected?: boolean,
    allSelectedFilters?: SelectedFilterItem[],
  ) => void;
  onClearFilter?: () => void;
  onReorderMetrics?: (metrics: string[]) => void;
  enableWhatIf?: boolean;
  whatIfBaseline?: WhatIfBaseline;
  onWhatIfChange?: (scenario: WhatIfScenario | null) => void;
}

/** A dimension is a dataset column, or a custom SQL column that the dashboard filter can carry as is. */
export type DimensionColumn =
  | string
  | { expressionType: 'SQL'; sqlExpression: string; label: string };

/** Value of a dimension as the database stores it: what a dashboard filter has to compare with. */
export type FilterValue = string | number | boolean | null;

export interface SelectedFilterItem {
  key: string;
  dimension: string;
  /** What the table shows for the node. */
  value: string;
  /** The stored value of the node, when it differs from what the table shows. */
  rawValue?: FilterValue;
  /** Stored value of each level of the path, by dimension. */
  pathMap?: Record<string, FilterValue>;
}

export type HierarchicalTableChartProps = ChartProps & {
  formData: HierarchicalTableFormData;
  queriesData: ChartDataResponse[];
  filterState?: any;
  hooks?: {
    setDataMask?: (dataMask: any) => void;
    onAddFilter?: (filter: any) => void;
    onContextMenu?: (clientX: number, clientY: number, filters?: ContextMenuFilters) => void;
    onReorderMetrics?: (metrics: string[]) => void;
    onWhatIfChange?: (scenario: WhatIfScenario | null) => void;
  };
};
