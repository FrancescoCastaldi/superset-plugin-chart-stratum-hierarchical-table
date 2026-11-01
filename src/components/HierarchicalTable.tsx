import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import Sparkline from './Sparkline';
import classNames from 'classnames';
import { reorderMetricsWithPosition, getMetricKeyFromColumn } from '../utils/metricReorder';
import {
  HierarchicalTableTransformedProps,
  TreeNode,
  TableColumn,
  SortOrder,
  MinMaxBoundsMap,
  MinMaxDisplayMode,
  MinMaxScope,
  CellInterval,
  HierarchyValueDisplayMode,
  MetricPolarity,
  MetricGoal,
  ConditionalFormattingRule,
  HeatmapDivergingPalette,
  WhatIfAdjustment,
  WhatIfBaseline,
  WhatIfScenario,
} from '../types';
import {
  filterTreeBySearch,
  sortTreeByExpression,
  calculateMinMaxBounds,
} from '../utils/treeBuilder';
import { getNormalizedMetricValue, getHeatmapBgColor } from '../utils/formatters';
import { ColumnMeta, buildColumnMetaMap, getDisplayColumns } from '../utils/tableColumns';
import { buildCsvRows, downloadCsv, serializeCsv } from '../utils/csvExport';
import { GOAL_STATUS_LABELS, computeGoalDelta, formatGoalDelta } from '../utils/goalBenchmark';
import { CONDITIONAL_ICONS, firstByPriority } from '../utils/conditionalFormatting';
import { buildColumnConditionalFormat } from '../plugin/columnBuilders';
import { buildContextMenuFilters } from '../plugin/contextMenu';
import { computeDivergingColor, computeBipolarDataBar } from '../utils/advancedCellVisuals';
import { getTheme, ResolvedTheme } from '../utils/themes';
import { useFlatTreeVirtualization } from './useFlatTreeVirtualization';
import { useCrossFilterSelection } from './useCrossFilterSelection';
import { useColumnLayout } from './useColumnLayout';
import { applyWhatIfScenario, computeWhatIfDelta } from '../utils/whatIfEngine';
import { createScenarioManager } from '../utils/whatIfScenarioManager';
import WhatIfToolbar from './WhatIfToolbar';
import './HierarchicalTable.css';

export type { ColumnMeta } from '../utils/tableColumns';

const NO_GOALS: MetricGoal[] = [];
const NO_RULES: ConditionalFormattingRule[] = [];
const DEFAULT_THEME = getTheme();

function GoalBadge({
  value,
  goal,
  formatter,
}: {
  value: number;
  goal: MetricGoal;
  formatter?: (val: any) => string;
}) {
  const delta = computeGoalDelta(value, goal);
  const comparison = formatGoalDelta(delta, formatter);
  const target = formatter ? formatter(goal.target) : String(goal.target);
  return (
    <span
      className={`goal-badge goal-${delta.status}`}
      aria-label={`${GOAL_STATUS_LABELS[delta.status]}: ${comparison} vs target ${target}`}
    >
      {comparison}
    </span>
  );
}

function SignalMarker({
  interval,
  polarity,
  formatter,
}: {
  interval: CellInterval;
  polarity?: MetricPolarity;
  formatter?: (val: any) => any;
}) {
  const show = (v: number) => (formatter ? formatter(v) : String(Math.round(v * 10) / 10));
  const range = `CI ${Math.round(interval.level * 1000) / 10}%: ${show(interval.lower)} to ${show(interval.upper)}`;
  if (!interval.signal) {
    return <span className="ci-range" title={range} aria-label={range} />;
  }
  const good = (interval.signal === 'above') === (polarity !== 'lower_is_better');
  const label = `${interval.signal === 'above' ? 'Significantly above' : 'Significantly below'} the reference. ${range}`;
  return (
    <span className={`signal-marker ${good ? 'signal-good' : 'signal-bad'}`} title={label} aria-label={label}>
      {interval.signal === 'above' ? '▲' : '▼'}
    </span>
  );
}

/** Re-render the window only when the scroll crosses a block of rows, not on every pixel. */
const SCROLL_STEP_PX = 32 * 10;
const quantizeScrollTop = (scrollTop: number): number =>
  Math.floor(scrollTop / SCROLL_STEP_PX) * SCROLL_STEP_PX;

/** Delta colour class; a metric where lower is better swaps the good and bad colours. */
function deltaClassName(val: number, polarity?: MetricPolarity): string {
  if (val === 0) return 'delta-neutral';
  const improves = polarity === 'lower_is_better' ? val < 0 : val > 0;
  return improves ? 'delta-positive' : 'delta-negative';
}

function isHierarchySortKey(key?: string, dims?: string[]): boolean {
  if (!key) return false;
  return (
    key === '__hierarchy_tree__' ||
    key === 'name' ||
    key === 'hierarchy' ||
    key === 'category' ||
    Boolean(dims && dims.includes(key))
  );
}

interface HierarchicalTableRowProps {
  node: TreeNode;
  displayCols: any[];
  columnMetaMap: Map<string, ColumnMeta>;
  isExpanded: boolean;
  isFilterSelected: boolean;
  emitFilter: boolean;
  activeDisplayMode: HierarchyValueDisplayMode;
  minMaxDisplayMode: MinMaxDisplayMode;
  minMaxScope: MinMaxScope;
  minMaxBounds: MinMaxBoundsMap | null;
  heatmapPalette?: HeatmapDivergingPalette;
  divergingMidpoint?: number;
  dataBarZeroAxis?: boolean;
  theme: ResolvedTheme;
  showVarianceDelta?: boolean;
  showVarianceBadges?: boolean;
  whatIfBaseline?: WhatIfBaseline;
  onToggleExpand: (key: string) => void;
  onNodeClick: (node: TreeNode) => void;
  onContextMenu?: (e: React.MouseEvent, node: TreeNode, col?: TableColumn) => void;
}

const HierarchicalTableRow = React.memo(function HierarchicalTableRow({
  node,
  displayCols,
  columnMetaMap,
  isExpanded,
  isFilterSelected,
  emitFilter,
  activeDisplayMode,
  minMaxDisplayMode,
  minMaxScope,
  minMaxBounds,
  heatmapPalette,
  divergingMidpoint,
  dataBarZeroAxis,
  theme,
  showVarianceDelta,
  showVarianceBadges = true,
  whatIfBaseline,
  onToggleExpand,
  onNodeClick,
  onContextMenu,
}: HierarchicalTableRowProps) {
  const hasChildren = Boolean(node.children && node.children.length > 0);
  const themeClass = `theme-${theme.style}`;
  // Profiles map onto the theme-* CSS classes; only custom hex colours need inline overrides.
  const isCustom = theme.name === 'custom';
  const paddingLeft = node.depth * 20 + 8;
  const hasMinMax = minMaxDisplayMode !== 'none' && Boolean(minMaxBounds);
  const inScope = hasMinMax
    ? minMaxScope === 'all_nodes' || minMaxScope === 'level_aware'
      ? true
      : Boolean(node.isLeaf || !hasChildren)
    : false;

  const renderValues =
    activeDisplayMode === 'all'
      ? true
      : activeDisplayMode === 'leaves_only'
      ? !hasChildren
      : hasChildren;
  const cellValue = (key: string) => node.metrics?.[key] ?? node.subtotals?.[key];
  const cellFormats = displayCols.map(col =>
    renderValues ? columnMetaMap.get(col.key)?.conditionalFormat?.(cellValue(col.key)) : null,
  );
  // A row-scoped match formats every metric cell of the row, competing by priority with the
  // cell's own match.
  const rowFormat = firstByPriority(cellFormats.filter(format => format?.scope === 'row'));

  return (
    <tr
      className={classNames({
        'parent-row': hasChildren,
        'selected-filter-row': isFilterSelected,
      })}
      onContextMenu={onContextMenu ? e => onContextMenu(e, node) : undefined}
    >
      {/* Hierarchy Column */}
      <td
        className="hierarchy-cell"
        onContextMenu={onContextMenu ? e => onContextMenu(e, node) : undefined}
      >
        <div className="tree-cell-content" style={{ paddingLeft: `${paddingLeft}px` }}>
          {emitFilter && (
            <input
              type="checkbox"
              className="node-checkbox"
              checked={isFilterSelected}
              onChange={() => onNodeClick(node)}
              aria-label={`Select ${node.name} for cross-filtering`}
            />
          )}
          {hasChildren ? (
            <button
              type="button"
              className="tree-toggle-btn"
              onClick={() => onToggleExpand(node.key)}
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? '−' : '+'}
            </button>
          ) : (
            <span className="tree-spacer" />
          )}
          <span
            className={classNames('node-name', {
              'node-parent': hasChildren,
              'node-filter-active': isFilterSelected,
            })}
            onClick={() => onNodeClick(node)}
            title={`Click to ${isFilterSelected ? 'remove from filter' : 'filter dashboard by ' + node.name} (${node.path.join(' > ')})`}
          >
            {node.name}
          </span>
        </div>
      </td>

      {/* Metric / Pivot Columns */}
      {displayCols.map((col, index) => {
        if (!renderValues) {
          return (
            <td
              key={col.key}
              className="metric-cell empty-metric-cell"
              onContextMenu={onContextMenu ? e => onContextMenu(e, node, col) : undefined}
            />
          );
        }

        if (col.sparkline) {
          const { metric, periods } = col.sparkline;
          const series = (periods as string[]).map((p: string) => {
            const v = cellValue(`${metric}___${p}`);
            return typeof v === 'number' ? v : null;
          });
          return (
            <td
              key={col.key}
              className="metric-cell sparkline-cell"
              onContextMenu={onContextMenu ? e => onContextMenu(e, node, col) : undefined}
            >
              <Sparkline values={series} polarity={col.polarity} label={`${metric}: ${periods[0]} to ${periods[periods.length - 1]}`} />
            </td>
          );
        }

        const meta = columnMetaMap.get(col.key);
        const val = cellValue(col.key);
        // A matching rule replaces the heatmap background with its own colours.
        const format = firstByPriority([rowFormat, cellFormats[index]]);
        const isDelta = meta?.isDelta ?? false;
        const isNuovo = val === 'Nuovo';

        const bound =
          inScope && hasMinMax
            ? minMaxScope === 'level_aware'
              ? minMaxBounds?.byLevel?.[col.key]?.[node.depth ?? 0]
              : minMaxBounds?.global[col.key]
            : undefined;

        const numericVal =
          typeof val === 'number' && Number.isFinite(val)
            ? val
            : typeof val === 'string' && val.trim() !== '' && Number.isFinite(Number(val))
            ? Number(val)
            : null;
        const isNumeric = numericVal !== null;
        const range = bound && bound.max > bound.min ? bound.max - bound.min : 0;
        const normalized =
          isNumeric && bound && range > 0
            ? getNormalizedMetricValue(numericVal, bound)
            : 0;

        const isMin = inScope && isNumeric && bound && range > 0 && numericVal === bound.min;
        const isMax = inScope && isNumeric && bound && range > 0 && numericVal === bound.max;

        // Base metric content
        const baseContent = isNuovo ? (
          <span className="badge-delta-nuovo">New</span>
        ) : isDelta && typeof val === 'number' ? (
          col?.key?.endsWith('___delta') ? (
            <span
              className={classNames('delta-badge', deltaClassName(val, col?.polarity))}
              title={`Delta %: ${val > 0 ? '+' : ''}${val.toFixed(1)}%`}
            >
              {val > 0 ? '▲ +' : val < 0 ? '▼ ' : ''}
              {Math.abs(val).toFixed(1)}%
            </span>
          ) : (
            <span
              className={deltaClassName(val, col?.polarity)}
            >
              {col?.formatter ? col.formatter(val) : String(val ?? '-')}
            </span>
          )
        ) : col?.formatter ? (
          col.formatter(val)
        ) : (
          String(val ?? '-')
        );

        // Variance Delta Badge (showVarianceDelta)
        let cellVarianceDelta: number | null = null;
        if (showVarianceDelta && showVarianceBadges && !isDelta && isNumeric && !col?.key?.endsWith('___comp')) {
          // 1. Pivot column: e.g. ${m}___${pVal} -> ${m}___delta_pct___${pVal}
          const pivotDeltaPctKey = col.key.includes('___')
            ? col.key.replace(/^(.+?)___(.+)$/, '$1___delta_pct___$2')
            : null;
          if (pivotDeltaPctKey) {
            const rawDelta = node.metrics?.[pivotDeltaPctKey] ?? node.subtotals?.[pivotDeltaPctKey];
            if (typeof rawDelta === 'number' && Number.isFinite(rawDelta)) {
              cellVarianceDelta = rawDelta;
            }
          }

          // 2. Reference period comparison delta: ${m}___period_delta_pct
          if (cellVarianceDelta === null) {
            const baseMetric = col.baseMetric ?? col.key.split('___')[0];
            const refDeltaPctKey = `${baseMetric}___period_delta_pct`;
            const rawRefDelta = node.metrics?.[refDeltaPctKey] ?? node.subtotals?.[refDeltaPctKey];
            if (typeof rawRefDelta === 'number' && Number.isFinite(rawRefDelta)) {
              cellVarianceDelta = rawRefDelta;
            }
          }

          // 3. Tree comparison delta or companion metric delta_${m}_pct
          if (cellVarianceDelta === null) {
            const baseMetric = col.baseMetric ?? col.key.split('___')[0];
            const companionKeys = [
              `${baseMetric}___delta`,
              `delta_${baseMetric}_pct`,
              `${baseMetric}_delta_pct`,
              `delta_${baseMetric}`,
            ];
            for (const cKey of companionKeys) {
              const raw = node.metrics?.[cKey] ?? node.subtotals?.[cKey];
              if (typeof raw === 'number' && Number.isFinite(raw)) {
                cellVarianceDelta = raw;
                break;
              }
            }
          }
        }

        const varianceBadge =
          cellVarianceDelta !== null ? (
            <span
              className={classNames('delta-badge', deltaClassName(cellVarianceDelta, col?.polarity))}
              title={`Change: ${cellVarianceDelta > 0 ? '+' : ''}${cellVarianceDelta.toFixed(1)}%`}
            >
              {cellVarianceDelta > 0 ? '▲ +' : cellVarianceDelta < 0 ? '▼ ' : ''}
              {Math.abs(cellVarianceDelta).toFixed(1)}%
            </span>
          ) : null;

        // What-If baseline and delta badge
        const baselineVal = whatIfBaseline?.nodeBaselines?.get(node.key)?.[col.key];
        const isSimulatedModified =
          typeof val === 'number' &&
          typeof baselineVal === 'number' &&
          Math.abs(val - baselineVal) > 0.0001;

        let whatIfBadge: React.ReactNode = null;
        if (isSimulatedModified) {
          const delta = computeWhatIfDelta(val as number, baselineVal);
          if (delta.pct !== null) {
            const isPositive = delta.pct > 0;
            const isGood =
              col?.polarity === 'lower_is_better' ? !isPositive : isPositive;
            const badgeClass = isGood ? 'whatif-delta-good' : 'whatif-delta-bad';
            const arrow = isPositive ? '▲ +' : '▼ ';
            const formattedCurrent = col.formatter ? col.formatter(val) : String(val);
            const formattedBase = col.formatter ? col.formatter(baselineVal) : String(baselineVal);
            whatIfBadge = (
              <span
                className={classNames('whatif-delta-badge', badgeClass)}
                title={`Simulato: ${formattedCurrent} (Base: ${formattedBase}, Scostamento: ${delta.pct > 0 ? '+' : ''}${delta.pct.toFixed(1)}%)`}
              >
                {arrow}{Math.abs(delta.pct).toFixed(1)}%
              </span>
            );
          }
        }

        const interval = node.intervals?.[col.key];
        const suppressedLabel = node.suppressed?.[col.key];
        const withGoal = (
          <>
            {baseContent}
            {varianceBadge}
            {whatIfBadge}
            {meta?.goal && isNumeric && (
              <GoalBadge value={numericVal} goal={meta.goal} formatter={meta.formatter} />
            )}
          </>
        );
        const cellContent =
          suppressedLabel !== undefined ? (
            <span className="suppressed-cell" title="Value hidden for privacy (small number)">
              {suppressedLabel}
            </span>
          ) : interval || format?.rule.icon ? (
            <>
              {withGoal}
              {format?.rule.icon && (
                <span className="cond-icon" aria-hidden="true" style={format.style.color ? { color: format.style.color } : undefined}>
                  {CONDITIONAL_ICONS[format.rule.icon]}
                </span>
              )}
              {interval && (
                <SignalMarker interval={interval} polarity={col.polarity} formatter={col.formatter} />
              )}
            </>
          ) : (
            withGoal
          );

        // Cell heatmap background style
        const cellStyle: React.CSSProperties = {};
        if (minMaxDisplayMode === 'heatmap' && inScope && isNumeric && range > 0) {
          cellStyle.backgroundColor = getHeatmapBgColor(normalized, theme.style);
        } else if (minMaxDisplayMode === 'diverging_heatmap' && inScope && isNumeric && bound) {
          const divResult = computeDivergingColor(val as number, bound.min, bound.max, {
            polarity: col.polarity,
            palette: heatmapPalette,
            midpoint: divergingMidpoint,
            positiveColor: isCustom ? theme.positive : undefined,
            negativeColor: isCustom ? theme.negative : undefined,
            neutralColor: isCustom ? theme.neutral : undefined,
          });
          cellStyle.backgroundColor = divResult.bgColor;
          cellStyle.color = divResult.textColor;
        }

        return (
          <td
            key={col.key}
            className={classNames('metric-cell', format?.className, {
              'pivot-row-totals-cell': col.key.includes('___ROW_TOTAL'),
              'pivot-subtotal-cell': col.key.includes('___SUBTOTAL'),
              'whatif-modified-cell': isSimulatedModified,
            })}
            style={format ? format.style : cellStyle}
            onContextMenu={onContextMenu ? e => onContextMenu(e, node, col) : undefined}
          >
            {minMaxDisplayMode === 'badges' ? (
              <div className="metric-cell-badges-wrapper">
                <span className="metric-val">{cellContent}</span>
                {isMax && (
                  <span
                    className={`minmax-badge minmax-max ${themeClass}`}
                    style={isCustom ? { background: theme.positive } : undefined}
                    title={`Maximum value: ${val}`}
                  >
                    MAX
                  </span>
                )}
                {isMin && (
                  <span
                    className={`minmax-badge minmax-min ${themeClass}`}
                    style={isCustom ? { color: theme.negative, borderColor: theme.negative } : undefined}
                    title={`Minimum value: ${val}`}
                  >
                    MIN
                  </span>
                )}
              </div>
            ) : minMaxDisplayMode === 'data_bars' || minMaxDisplayMode === 'bipolar_data_bars' ? (
              <div className="data-bar-container">
                {inScope && isNumeric && bound && minMaxDisplayMode === 'bipolar_data_bars' ? (
                  (() => {
                    const bar = computeBipolarDataBar(val as number, bound.min, bound.max, {
                      polarity: col.polarity,
                      positiveColor: isCustom ? theme.positive : undefined,
                      negativeColor: isCustom ? theme.negative : undefined,
                    });
                    const zeroPct =
                      bound.min < 0 && bound.max > 0
                        ? (Math.abs(bound.min) / (Math.abs(bound.min) + bound.max)) * 100
                        : 0;
                    return (
                      <>
                        {bound.min < 0 && bound.max > 0 && dataBarZeroAxis !== false && (
                          <div className="data-bar-zero-line" style={{ left: `${zeroPct}%` }} />
                        )}
                        <div
                          className="data-bar-fill bipolar"
                          style={{
                            left: `${bar.leftPct}%`,
                            width: `${bar.widthPct}%`,
                            backgroundColor: bar.color,
                          }}
                        />
                      </>
                    );
                  })()
                ) : inScope && isNumeric && range > 0 ? (
                  <div
                    className={`data-bar-fill ${themeClass}`}
                    style={{
                      width: `${Math.round(normalized * 100)}%`,
                      ...(isCustom ? { backgroundColor: theme.neutral } : {}),
                    }}
                  />
                ) : null}
                <span className="data-bar-value">{cellContent}</span>
              </div>
            ) : (
              cellContent
            )}
          </td>
        );
      })}
    </tr>
  );
});

export default function HierarchicalTable(props: HierarchicalTableTransformedProps) {
  const {
    width,
    height,
    data = [],
    columns: sourceColumns = [],
    dimensions = [],
    initialExpandDepth = 1,
    valueDisplayMode = 'all',
    showGrandTotal = true,
    grandTotalPosition = 'top',
    grandTotalNode,
    stickyHeader = true,
    enableSearch = true,
    enableHierarchicalSort = true,
    defaultSortColumn = '__hierarchy_tree__',
    defaultSortOrder = 'none',
    minMaxDisplayMode = 'none',
    minMaxScope = 'leaves_only',
    heatmapPalette = 'red_white_green',
    divergingMidpoint,
    dataBarZeroAxis,
    enableExport = true,
    compactMode = false,
    stripedRows = true,
    emitFilter = true,
    enableContextMenu = true,
    showVarianceDelta = false,
    showVarianceBadges = true,
    resizableColumns = false,
    wrapHeaderLabels = false,
    reorderColumnsByDrag = false,
    goals = NO_GOALS,
    conditionalFormatting = NO_RULES,
    theme = DEFAULT_THEME,
    metrics = [],
    enableWhatIf = false,
    whatIfBaseline: externalWhatIfBaseline,
    onWhatIfChange,
    onContextMenu,
    onCrossFilter,
    onClearFilter,
    onReorderMetrics,
  } = props;
  const nullHandling = props.formData?.nullHandling;

  // What-If Simulation State
  const [whatIfAdjustments, setWhatIfAdjustments] = useState<WhatIfAdjustment[]>([]);
  const [activeScenarioName, setActiveScenarioName] = useState<string | undefined>();
  const scenarioManager = useMemo(() => createScenarioManager(), []);
  const [savedScenarios, setSavedScenarios] = useState<WhatIfScenario[]>(() => scenarioManager.list());

  const whatIfResult = useMemo(() => {
    if (whatIfAdjustments.length === 0 || whatIfAdjustments.every(a => a.factor === 1)) {
      return null;
    }
    return applyWhatIfScenario(
      data,
      grandTotalNode,
      whatIfAdjustments,
      metrics,
      props.formData?.aggregationMode || 'sum',
      props.formData?.weightColumn,
      dimensions,
      props.formData?.metricDefinitions,
      activeScenarioName ? { id: 'active', name: activeScenarioName } : undefined,
    );
  }, [data, grandTotalNode, whatIfAdjustments, metrics, props.formData, dimensions, activeScenarioName]);

  const effectiveTreeData = whatIfResult?.simulatedTree ?? data;
  const effectiveGrandTotalNode = whatIfResult?.simulatedGrandTotal ?? grandTotalNode;
  const effectiveWhatIfBaseline = externalWhatIfBaseline ?? whatIfResult?.baseline;

  const handleResetWhatIf = useCallback(() => {
    setWhatIfAdjustments([]);
    setActiveScenarioName(undefined);
    if (onWhatIfChange) onWhatIfChange(null);
  }, [onWhatIfChange]);

  const handleAdjustmentsChange = useCallback(
    (newAdjustments: WhatIfAdjustment[]) => {
      setWhatIfAdjustments(newAdjustments);
      if (onWhatIfChange) {
        if (newAdjustments.length === 0 || newAdjustments.every(a => a.factor === 1)) {
          onWhatIfChange(null);
        } else {
          onWhatIfChange({
            id: 'custom',
            name: activeScenarioName || 'Personalizzato',
            adjustments: newAdjustments,
            createdAt: Date.now(),
          });
        }
      }
    },
    [onWhatIfChange, activeScenarioName],
  );

  const handleSaveScenario = useCallback(
    (name: string) => {
      const id = `scenario_${Date.now()}`;
      const newScen: WhatIfScenario = {
        id,
        name,
        adjustments: whatIfAdjustments,
        createdAt: Date.now(),
      };
      scenarioManager.save(newScen);
      setSavedScenarios(scenarioManager.list());
      setActiveScenarioName(name);
      if (onWhatIfChange) onWhatIfChange(newScen);
    },
    [whatIfAdjustments, scenarioManager, onWhatIfChange],
  );

  const handleLoadScenario = useCallback(
    (scen: WhatIfScenario) => {
      setWhatIfAdjustments(scen.adjustments);
      setActiveScenarioName(scen.name);
      if (onWhatIfChange) onWhatIfChange(scen);
    },
    [onWhatIfChange],
  );

  const [activeDisplayMode, setActiveDisplayMode] = useState<HierarchyValueDisplayMode>(
    valueDisplayMode || 'all',
  );

  useEffect(() => {
    if (valueDisplayMode) {
      setActiveDisplayMode(valueDisplayMode);
    }
  }, [valueDisplayMode]);

  // Without subtotals the parent rows carry no values, the same as the leaves-only view.
  const rowDisplayMode: HierarchyValueDisplayMode =
    props.showSubtotals === false && activeDisplayMode === 'all' ? 'leaves_only' : activeDisplayMode;

  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Rows picked for cross-filtering: the dashboard is told from the click, and its own state is followed.
  const {
    selection: selectedFilterMap,
    toggleNode: handleNodeClick,
    removeNode: handleRemoveSingleFilter,
    clearSelection: handleClearActiveFilter,
  } = useCrossFilterSelection({
    dimensions,
    emitFilter,
    onCrossFilter,
    onClearFilter,
    filterState: props.filterState,
  });

  const scrollWrapperRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);

  useEffect(() => {
    const el = scrollWrapperRef.current;
    if (!el) return undefined;

    const measure = () => {
      const clientWidth = el.clientWidth;
      if (clientWidth > 0) {
        setContainerWidth(prev => (prev !== clientWidth ? clientWidth : prev));
      }
    };

    measure();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => measure());
      observer.observe(el);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [width]);

  // Widths and order of the columns as the viewer set them (only with the layout flags on).
  const columnLayout = useColumnLayout({
    columns: sourceColumns,
    resizable: resizableColumns,
    reorderable: reorderColumnsByDrag,
    isPivotMode: Boolean(props.isPivotMode),
    storageId: (props.formData as any)?.slice_id,
    containerWidth,
  });
  const columns = columnLayout.columns;

  const renderResizeHandle = (col?: { key: string }) =>
    resizableColumns && col ? (
      <span
        className="col-resize-handle"
        role="separator"
        aria-orientation="vertical"
        title="Drag to resize, double-click to restore"
        onMouseDown={e =>
          columnLayout.startResize(
            e,
            col.key,
            (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect().width,
          )
        }
        onClick={e => e.stopPropagation()}
        onDoubleClick={e => {
          e.stopPropagation();
          columnLayout.resetWidth(col.key);
        }}
      />
    ) : null;

  const containerStyle = useMemo(() => {
    const style: React.CSSProperties = {
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      position: 'relative',
      boxSizing: 'border-box',
    };
    if (typeof width === 'number' && width > 0) {
      style.width = `${width}px`;
      style.maxWidth = `${width}px`;
    } else if (typeof width === 'string' && width) {
      style.width = width;
      style.maxWidth = width;
    } else {
      style.width = '100%';
    }
    if (typeof height === 'number' && height > 0) {
      style.height = `${height}px`;
      style.maxHeight = `${height}px`;
    } else if (typeof height === 'string' && height) {
      style.height = height;
      style.maxHeight = height;
    } else {
      style.height = '100%';
    }
    return style;
  }, [width, height]);

  // Set of expanded node keys
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => {
    const initialKeys = new Set<string>();

    function collectInitialKeys(nodes: TreeNode[]) {
      for (const node of nodes) {
        if (node.children && node.children.length > 0) {
          if (initialExpandDepth === -1 || node.depth < initialExpandDepth) {
            initialKeys.add(node.key);
            collectInitialKeys(node.children);
          }
        }
      }
    }

    collectInitialKeys(data);
    return initialKeys;
  });

  const toggleExpand = useCallback((key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleExpandAll = useCallback(() => {
    const allKeys = new Set<string>();
    function collectAllKeys(nodes: TreeNode[]) {
      for (const node of nodes) {
        if (node.children && node.children.length > 0) {
          allKeys.add(node.key);
          collectAllKeys(node.children);
        }
      }
    }
    collectAllKeys(effectiveTreeData);
    setExpandedKeys(allKeys);
  }, [effectiveTreeData]);

  const handleCollapseAll = useCallback(() => {
    setExpandedKeys(new Set<string>());
  }, []);

  // Sorting state (initialized from formData defaultSortColumn & defaultSortOrder)
  const [sortColumn, setSortColumn] = useState<string>(defaultSortColumn || '__hierarchy_tree__');
  const [sortDirection, setSortDirection] = useState<SortOrder>(defaultSortOrder || 'none');

  useEffect(() => {
    if (defaultSortColumn) {
      setSortColumn(defaultSortColumn);
    }
  }, [defaultSortColumn]);

  useEffect(() => {
    if (defaultSortOrder) {
      setSortDirection(defaultSortOrder);
    }
  }, [defaultSortOrder]);

  // Metric column drag and drop reordering state
  const [draggedMetricCol, setDraggedMetricCol] = useState<string | null>(null);
  const [dropTargetCol, setDropTargetCol] = useState<{ metric: string; position: 'before' | 'after' } | null>(null);
  const isDraggingColumnRef = useRef(false);

  // Pure base metrics list (excluding synthetic deltas / table calculations)
  const baseMetrics = useMemo(() => {
    const formMetrics = props.formData?.metrics;
    if (Array.isArray(formMetrics) && formMetrics.length > 0) {
      return formMetrics.map((m: any) =>
        typeof m === 'string' ? m : m?.label || m?.metric_name || String(m),
      );
    }
    return metrics.filter(m => !m.includes('___'));
  }, [props.formData?.metrics, metrics]);

  const handleColumnDragStart = useCallback((e: React.DragEvent, metricKey: string) => {
    isDraggingColumnRef.current = true;
    setDraggedMetricCol(metricKey);
    e.dataTransfer.setData('text/plain', metricKey);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleColumnDragOver = useCallback((e: React.DragEvent, targetMetricKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const isBefore = e.clientX < rect.left + rect.width / 2;
    setDropTargetCol({ metric: targetMetricKey, position: isBefore ? 'before' : 'after' });
  }, []);

  const handleColumnDragLeave = useCallback((e: React.DragEvent, targetMetricKey: string) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) {
      return;
    }
    setDropTargetCol(prev => (prev?.metric === targetMetricKey ? null : prev));
  }, []);

  const handleColumnDrop = useCallback((e: React.DragEvent, targetMetricKey: string) => {
    e.preventDefault();
    const sourceMetric = e.dataTransfer.getData('text/plain') || draggedMetricCol;
    const rect = e.currentTarget.getBoundingClientRect();
    const isBefore = e.clientX < rect.left + rect.width / 2;
    const position =
      dropTargetCol && dropTargetCol.metric === targetMetricKey
        ? dropTargetCol.position
        : isBefore
        ? 'before'
        : 'after';

    if (
      sourceMetric &&
      targetMetricKey &&
      sourceMetric !== targetMetricKey &&
      onReorderMetrics &&
      baseMetrics.length > 0
    ) {
      const nextMetrics = reorderMetricsWithPosition(baseMetrics, sourceMetric, targetMetricKey, position);
      onReorderMetrics(nextMetrics);
    }
    setDraggedMetricCol(null);
    setDropTargetCol(null);
    setTimeout(() => {
      isDraggingColumnRef.current = false;
    }, 100);
  }, [baseMetrics, draggedMetricCol, dropTargetCol, onReorderMetrics]);

  const handleColumnDragEnd = useCallback(() => {
    setDraggedMetricCol(null);
    setDropTargetCol(null);
    setTimeout(() => {
      isDraggingColumnRef.current = false;
    }, 100);
  }, []);

  const handleHeaderSort = useCallback(
    (columnKey: string) => {
      if (!enableHierarchicalSort || isDraggingColumnRef.current || columnLayout.wasJustResized()) return;
      const isCurrent =
        sortColumn === columnKey ||
        (isHierarchySortKey(sortColumn, dimensions) && isHierarchySortKey(columnKey, dimensions));
      if (isCurrent) {
        // Cycle: asc -> desc -> none -> asc
        setSortDirection(prev => {
          if (prev === 'asc') return 'desc';
          if (prev === 'desc') return 'none';
          return 'asc';
        });
      } else {
        setSortColumn(columnKey);
        setSortDirection('asc');
      }
    },
    [columnLayout, dimensions, enableHierarchicalSort, sortColumn],
  );

  // Sibling-aware recursive in-tree sorting
  const sortedData = useMemo(() => {
    if (!enableHierarchicalSort || sortDirection === 'none' || !sortColumn) {
      return effectiveTreeData;
    }
    return sortTreeByExpression(effectiveTreeData, sortColumn, sortDirection, nullHandling, dimensions, grandTotalPosition);
  }, [effectiveTreeData, dimensions, enableHierarchicalSort, grandTotalPosition, nullHandling, sortColumn, sortDirection]);

  // Filtered data tree based on search
  const filteredData = useMemo(() => {
    return filterTreeBySearch(sortedData, debouncedSearch);
  }, [sortedData, debouncedSearch]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, targetNode: TreeNode | null, targetColumn?: TableColumn) => {
      if (!enableContextMenu || !onContextMenu) return;
      e.preventDefault();
      e.stopPropagation();
      const filters = buildContextMenuFilters(
        { node: targetNode, column: targetColumn },
        {
          dimensions,
          hierarchyType: props.hierarchyType,
          idColumn: props.formData?.idColumn,
          pivotDimensions: props.pivotColumns,
        },
      );
      onContextMenu(e.clientX, e.clientY, filters);
    },
    [
      enableContextMenu,
      onContextMenu,
      dimensions,
      props.hierarchyType,
      props.formData?.idColumn,
      props.pivotColumns,
    ],
  );

  // Flatten visible tree nodes according to expanded state
  const visibleRows = useMemo(() => {
    const rows: TreeNode[] = [];
    const hasSearch = debouncedSearch.trim().length > 0;

    function traverse(nodes: TreeNode[]) {
      for (const node of nodes) {
        rows.push(node);
        const hasChildren = Boolean(node.children && node.children.length > 0);
        const isExpanded = expandedKeys.has(node.key) || hasSearch;

        if (hasChildren && isExpanded) {
          traverse(node.children!);
        }
      }
    }

    traverse(filteredData);
    return rows;
  }, [filteredData, expandedKeys, debouncedSearch]);

  const [scrollTop, setScrollTop] = useState(0);
  const { renderWindow, rows } = useFlatTreeVirtualization(visibleRows, {
    pageSize: props.formData?.pageSize,
    threshold: props.formData?.virtualizationThreshold,
    scrollTop,
  });

  const displayCols = useMemo(() => getDisplayColumns(columns), [columns]);

  // With resizable columns the table takes the sum of its column widths, so that a narrower column
  // really narrows the table, and a wider one scrolls it, instead of the others giving way.
  const fixedTableStyle = useMemo((): React.CSSProperties | undefined => {
    if (!resizableColumns) return undefined;
    const total =
      columnLayout.totalWidth > 0
        ? columnLayout.totalWidth
        : columns.reduce((sum, col) => {
            const width = columnLayout.widthOf(col);
            const px = typeof width === 'number' ? width : parseFloat(String(width ?? ''));
            return sum + (Number.isFinite(px) ? px : columnLayout.defaultWidth);
          }, 0);
    return { tableLayout: 'fixed', width: total, minWidth: total, maxWidth: 'none' };
  }, [resizableColumns, columns, columnLayout]);

  // Sticky second header row sits under the first one, which is taller when its labels wrap.
  const theadRef = useRef<HTMLTableSectionElement>(null);
  const [firstHeaderRowHeight, setFirstHeaderRowHeight] = useState<number | null>(null);
  useEffect(() => {
    if (!wrapHeaderLabels || !props.isPivotMode) {
      setFirstHeaderRowHeight(null);
      return undefined;
    }
    const measure = () => {
      const row = theadRef.current?.querySelector('tr.pivot-group-header-row');
      const heightNow = row ? Math.ceil(row.getBoundingClientRect().height) : 0;
      setFirstHeaderRowHeight(heightNow > 0 ? heightNow : null);
    };
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (observer && theadRef.current) observer.observe(theadRef.current);
    return () => observer?.disconnect();
  }, [wrapHeaderLabels, props.isPivotMode, columns, width]);

  // Pre-computed column metadata (avoids 10k+ string checks during rendering)
  const columnMetaMap = useMemo(
    () =>
      buildColumnMetaMap(displayCols, goals, col =>
        buildColumnConditionalFormat(col, conditionalFormatting),
      ),
    [displayCols, goals, conditionalFormatting],
  );

  // Min/Max bounds calculation for conditional formatting
  const minMaxBounds = useMemo(() => {
    if (minMaxDisplayMode === 'none') return null;
    const metricKeys = displayCols.map(c => c.key);
    return calculateMinMaxBounds(effectiveTreeData, metricKeys, minMaxScope);
  }, [effectiveTreeData, displayCols, minMaxDisplayMode, minMaxScope]);

  const renderSortIndicator = (columnKey: string) => {
    if (!enableHierarchicalSort) return null;
    const isCurrent =
      sortColumn === columnKey ||
      (isHierarchySortKey(sortColumn, dimensions) && isHierarchySortKey(columnKey, dimensions));
    const isActive = isCurrent && sortDirection !== 'none';
    if (!isActive) {
      return <span className="sort-indicator sort-indicator-inactive" aria-hidden="true" />;
    }
    return (
      <span
        className="sort-indicator sort-indicator-active"
        aria-label={`Sorted ${sortDirection}`}
      >
        {sortDirection === 'asc' ? ' ▲' : ' ▼'}
      </span>
    );
  };

  const handleExportCSV = useCallback(() => {
    const rows = buildCsvRows({
      columns,
      displayCols,
      nodes: filteredData,
      displayMode: rowDisplayMode,
      showGrandTotal,
      grandTotalNode: effectiveGrandTotalNode,
      grandTotalPosition,
    });
    downloadCsv(serializeCsv(rows));
  }, [
    displayCols,
    columns,
    showGrandTotal,
    effectiveGrandTotalNode,
    grandTotalPosition,
    filteredData,
    rowDisplayMode,
  ]);

  const handleExportWhatIfCSV = useCallback(() => {
    const rows = buildCsvRows({
      columns,
      displayCols,
      nodes: filteredData,
      displayMode: rowDisplayMode,
      showGrandTotal,
      grandTotalNode: effectiveGrandTotalNode,
      grandTotalPosition,
      whatIfBaseline: effectiveWhatIfBaseline,
    });
    downloadCsv(serializeCsv(rows), 'stratum_whatif_simulation.csv');
  }, [
    displayCols,
    columns,
    showGrandTotal,
    effectiveGrandTotalNode,
    grandTotalPosition,
    filteredData,
    rowDisplayMode,
    effectiveWhatIfBaseline,
  ]);

  if (!data || data.length === 0) {
    return (
      <div className="superset-hierarchical-table-container" style={containerStyle}>
        <div className="empty-state">No data available for hierarchical table.</div>
      </div>
    );
  }

  const grandTotalRow = showGrandTotal && effectiveGrandTotalNode && (
    <tr
      className="grand-total-row"
      onContextMenu={onContextMenu ? e => handleContextMenu(e, null) : undefined}
    >
      <td
        className="hierarchy-cell"
        onContextMenu={onContextMenu ? e => handleContextMenu(e, null) : undefined}
      >
        <span className="node-name">{effectiveGrandTotalNode.name}</span>
      </td>
      {displayCols.map(col => {
        if (activeDisplayMode === 'leaves_only') {
          return (
            <td
              key={col.key}
              className="metric-cell empty-metric-cell"
              onContextMenu={onContextMenu ? e => handleContextMenu(e, null, col) : undefined}
            />
          );
        }
        const val = effectiveGrandTotalNode.metrics?.[col.key] ?? effectiveGrandTotalNode.subtotals?.[col.key];
        const isDelta = columnMetaMap.get(col.key)?.isDelta ?? false;
        const isNuovo = val === 'Nuovo';

        let gtVarianceDelta: number | null = null;
        if (showVarianceDelta && showVarianceBadges && !isDelta && typeof val === 'number' && !col?.key?.endsWith('___comp')) {
          const pivotDeltaPctKey = col.key.includes('___')
            ? col.key.replace(/^(.+?)___(.+)$/, '$1___delta_pct___$2')
            : null;
          if (pivotDeltaPctKey) {
            const rawDelta =
              effectiveGrandTotalNode.metrics?.[pivotDeltaPctKey] ?? effectiveGrandTotalNode.subtotals?.[pivotDeltaPctKey];
            if (typeof rawDelta === 'number' && Number.isFinite(rawDelta)) {
              gtVarianceDelta = rawDelta;
            }
          }
          if (gtVarianceDelta === null) {
            const baseMetric = col.baseMetric ?? col.key.split('___')[0];
            const refDeltaPctKey = `${baseMetric}___period_delta_pct`;
            const rawRefDelta =
              effectiveGrandTotalNode.metrics?.[refDeltaPctKey] ?? effectiveGrandTotalNode.subtotals?.[refDeltaPctKey];
            if (typeof rawRefDelta === 'number' && Number.isFinite(rawRefDelta)) {
              gtVarianceDelta = rawRefDelta;
            }
          }
          if (gtVarianceDelta === null) {
            const baseMetric = col.baseMetric ?? col.key.split('___')[0];
            const companionDeltaKey = `${baseMetric}___delta`;
            const rawDelta =
              effectiveGrandTotalNode.metrics?.[companionDeltaKey] ?? effectiveGrandTotalNode.subtotals?.[companionDeltaKey];
            if (typeof rawDelta === 'number' && Number.isFinite(rawDelta)) {
              gtVarianceDelta = rawDelta;
            }
          }
        }

        const gtVarianceBadge =
          gtVarianceDelta !== null ? (
            <span
              className={classNames('delta-badge', deltaClassName(gtVarianceDelta, col?.polarity))}
              title={`Total change: ${gtVarianceDelta > 0 ? '+' : ''}${gtVarianceDelta.toFixed(1)}%`}
            >
              {gtVarianceDelta > 0 ? '▲ +' : gtVarianceDelta < 0 ? '▼ ' : ''}
              {Math.abs(gtVarianceDelta).toFixed(1)}%
            </span>
          ) : null;

        // What-If delta badge on Grand Total
        const gtBaselineVal = effectiveWhatIfBaseline?.nodeBaselines?.get(effectiveGrandTotalNode.key)?.[col.key];
        const isGtSimulatedModified =
          typeof val === 'number' &&
          typeof gtBaselineVal === 'number' &&
          Math.abs(val - gtBaselineVal) > 0.0001;

        let gtWhatIfBadge: React.ReactNode = null;
        if (isGtSimulatedModified) {
          const delta = computeWhatIfDelta(val as number, gtBaselineVal);
          if (delta.pct !== null) {
            const isPositive = delta.pct > 0;
            const isGood =
              col?.polarity === 'lower_is_better' ? !isPositive : isPositive;
            const badgeClass = isGood ? 'whatif-delta-good' : 'whatif-delta-bad';
            const arrow = isPositive ? '▲ +' : '▼ ';
            const formattedCurrent = col.formatter ? col.formatter(val) : String(val);
            const formattedBase = col.formatter ? col.formatter(gtBaselineVal) : String(gtBaselineVal);
            gtWhatIfBadge = (
              <span
                className={classNames('whatif-delta-badge', badgeClass)}
                title={`Simulated total: ${formattedCurrent} (Base: ${formattedBase}, Scostamento: ${delta.pct > 0 ? '+' : ''}${delta.pct.toFixed(1)}%)`}
              >
                {arrow}{Math.abs(delta.pct).toFixed(1)}%
              </span>
            );
          }
        }

        return (
          <td
            key={col.key}
            className={classNames('metric-cell', {
              'pivot-row-totals-cell': col.key.endsWith('___ROW_TOTAL'),
              'whatif-modified-cell': isGtSimulatedModified,
            })}
            onContextMenu={onContextMenu ? e => handleContextMenu(e, null, col) : undefined}
          >
            {isNuovo ? (
              <span className="badge-delta-nuovo">New</span>
            ) : isDelta && typeof val === 'number' ? (
              col?.key?.endsWith('___delta') ? (
                <span
                  className={classNames('delta-badge', deltaClassName(val, col?.polarity))}
                  title={`Total delta %: ${val > 0 ? '+' : ''}${val.toFixed(1)}%`}
                >
                  {val > 0 ? '▲ +' : val < 0 ? '▼ ' : ''}
                  {Math.abs(val).toFixed(1)}%
                </span>
              ) : (
                <span
                  className={deltaClassName(val, col?.polarity)}
                >
                  {col?.formatter ? col.formatter(val) : String(val ?? '-')}
                </span>
              )
            ) : (
              <>
                {col?.formatter ? col.formatter(val) : String(val ?? '-')}
                {gtVarianceBadge}
                {gtWhatIfBadge}
              </>
            )}
          </td>
        );
      })}
    </tr>
  );

  return (
    <div className="superset-hierarchical-table-container" style={containerStyle}>
      {(enableWhatIf || Boolean(externalWhatIfBaseline)) && (
        <WhatIfToolbar
          metrics={metrics}
          metricDefinitions={props.formData?.metricDefinitions}
          adjustments={whatIfAdjustments}
          onAdjustmentsChange={handleAdjustmentsChange}
          onReset={handleResetWhatIf}
          onSaveScenario={handleSaveScenario}
          onLoadScenario={handleLoadScenario}
          onExportWithSimulation={handleExportWhatIfCSV}
          savedScenarios={savedScenarios}
          activeScenarioName={activeScenarioName}
        />
      )}
      {/* Toolbar */}
      <div className="superset-hierarchical-table-toolbar">
        <div className="table-toolbar-left">
          {enableSearch && (
            <div className="table-search-wrapper">
              <input
                type="text"
                placeholder="Search hierarchy..."
                className="table-search-input"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
              />
              {searchInput && (
                <button
                  type="button"
                  className="table-search-clear-btn"
                  onClick={() => {
                    setSearchInput('');
                    setDebouncedSearch('');
                  }}
                  title="Clear search"
                >
                  ✕
                </button>
              )}
            </div>
          )}

          {/* Active Cross Filters Multi-Indicator */}
          {selectedFilterMap.size > 0 && (
            <div className="active-cross-filter-container">
              {Array.from(selectedFilterMap.values()).map(filter => (
                <div key={filter.key} className="active-cross-filter-badge">
                  <span className="filter-badge-icon">⚡</span>
                  <span className="filter-badge-text">{filter.value}</span>
                  <button
                    type="button"
                    className="filter-badge-clear"
                    onClick={() => handleRemoveSingleFilter(filter.key)}
                    title={`Remove ${filter.value} filter`}
                  >
                    ✕
                  </button>
                </div>
              ))}
              {selectedFilterMap.size > 1 && (
                <button
                  type="button"
                  className="filter-clear-all-btn"
                  onClick={handleClearActiveFilter}
                  title="Clear all filters"
                >
                  Clear All ({selectedFilterMap.size})
                </button>
              )}
            </div>
          )}
        </div>

        <div className="table-toolbar-right">
          <div className="toolbar-display-mode-selector">
            <span className="toolbar-label">Values:</span>
            <select
              value={activeDisplayMode}
              onChange={e => setActiveDisplayMode(e.target.value as HierarchyValueDisplayMode)}
              className="toolbar-select"
              aria-label="Metric value display mode"
            >
              <option value="all">All levels</option>
              <option value="leaves_only">Leaves only</option>
              <option value="parents_only">Parents only</option>
            </select>
          </div>
          {columnLayout.customized && (
            <button
              type="button"
              className="toolbar-btn"
              onClick={columnLayout.reset}
              title="Restore column widths and order"
            >
              Ripristina colonne
            </button>
          )}
          {enableExport && (
            <button
              type="button"
              className="toolbar-btn toolbar-export-btn"
              onClick={handleExportCSV}
              title="Download hierarchy CSV with preserved order and subtotals"
            >
              Export CSV
            </button>
          )}
          <button type="button" className="toolbar-btn" onClick={handleExpandAll}>
            Expand All
          </button>
          <button type="button" className="toolbar-btn" onClick={handleCollapseAll}>
            Collapse All
          </button>
        </div>
      </div>

      {/* Table Content */}
      <div
        ref={scrollWrapperRef}
        className="table-scroll-wrapper"
        onScroll={e => rows.length < visibleRows.length && setScrollTop(quantizeScrollTop(e.currentTarget.scrollTop))}
      >
        <table
          className={classNames('hierarchical-table', {
            'sticky-header': stickyHeader,
            compact: compactMode,
            striped: stripedRows,
            'pivot-matrix-mode': props.isPivotMode,
            'wrap-labels': wrapHeaderLabels,
            'resizable-columns': resizableColumns,
          })}
          style={{
            ...fixedTableStyle,
            ...(firstHeaderRowHeight ? ({ '--pivot-sub-top': `${firstHeaderRowHeight}px` } as React.CSSProperties) : {}),
          }}
        >
          {resizableColumns && (
            <colgroup>
              {columns.map(col => (
                <col key={col.key} style={{ width: columnLayout.widthOf(col) ?? columnLayout.defaultWidth }} />
              ))}
            </colgroup>
          )}
          <thead ref={theadRef}>
            {props.isPivotMode && props.pivotHeaderGroups && props.pivotHeaderGroups.length > 0 ? (
              <>
                {/* Level 1: Main Metric Header Row */}
                <tr className="pivot-group-header-row">
                  <th
                    rowSpan={2}
                    className={classNames('hierarchy-col', {
                      'sortable-header': enableHierarchicalSort,
                    })}
                    onClick={
                      enableHierarchicalSort
                        ? () => handleHeaderSort('__hierarchy_tree__')
                        : undefined
                    }
                    tabIndex={enableHierarchicalSort ? 0 : undefined}
                    onKeyDown={
                      enableHierarchicalSort
                        ? e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleHeaderSort('__hierarchy_tree__');
                            }
                          }
                        : undefined
                    }
                    aria-sort={
                      !enableHierarchicalSort
                        ? undefined
                        : isHierarchySortKey(sortColumn, dimensions) && sortDirection !== 'none'
                        ? sortDirection === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                    style={{
                      width: columnLayout.widthOf(columns[0]),
                      minWidth: columnLayout.widthOf(columns[0]),
                      ...(resizableColumns ? { maxWidth: columnLayout.widthOf(columns[0]) } : {}),
                      cursor: enableHierarchicalSort ? 'pointer' : undefined,
                    }}
                  >
                    <span>{columns[0]?.title}</span>
                    {renderSortIndicator('__hierarchy_tree__')}
                    {renderResizeHandle(columns[0])}
                  </th>
                  {props.pivotHeaderGroups.map(group => {
                    const isSortable = Boolean(enableHierarchicalSort);
                    const isGroupActive = sortColumn === group.key && sortDirection !== 'none';
                    const groupMetricKey = onReorderMetrics && baseMetrics.includes(group.key) ? group.key : null;
                    const isGroupDraggable = Boolean(groupMetricKey);
                    const isGroupDragging = draggedMetricCol === groupMetricKey;
                    const isGroupTargetBefore = dropTargetCol?.metric === groupMetricKey && dropTargetCol.position === 'before';
                    const isGroupTargetAfter = dropTargetCol?.metric === groupMetricKey && dropTargetCol.position === 'after';

                    return (
                      <th
                        key={group.key}
                        colSpan={group.colSpan}
                        draggable={isGroupDraggable}
                        onDragStart={isGroupDraggable ? e => handleColumnDragStart(e, groupMetricKey!) : undefined}
                        onDragOver={isGroupDraggable ? e => handleColumnDragOver(e, groupMetricKey!) : undefined}
                        onDragLeave={isGroupDraggable ? e => handleColumnDragLeave(e, groupMetricKey!) : undefined}
                        onDrop={isGroupDraggable ? e => handleColumnDrop(e, groupMetricKey!) : undefined}
                        onDragEnd={isGroupDraggable ? handleColumnDragEnd : undefined}
                        className={classNames('metric-group-header', {
                          'sortable-header': isSortable,
                          'pivot-row-totals-group': group.key === '__pivot_row_totals__',
                          'draggable-metric-th': isGroupDraggable,
                          'col-dragging': isGroupDragging,
                          'col-drop-target-before': isGroupTargetBefore,
                          'col-drop-target-after': isGroupTargetAfter,
                        })}
                        onClick={isSortable ? () => handleHeaderSort(group.key) : undefined}
                        tabIndex={isSortable ? 0 : undefined}
                        onKeyDown={
                          isSortable
                            ? e => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  handleHeaderSort(group.key);
                                }
                              }
                            : undefined
                        }
                        aria-sort={
                          !isSortable
                            ? undefined
                            : isGroupActive
                            ? sortDirection === 'asc'
                              ? 'ascending'
                              : 'descending'
                            : 'none'
                        }
                        style={{
                          textAlign: 'center',
                          borderBottom: '1px solid #d1d5db',
                          cursor: isSortable || isGroupDraggable ? 'pointer' : undefined,
                        }}
                      >
                        <span>
                          {isGroupDraggable && (
                            <span className="drag-handle-icon" title="Drag metric">
                              ⠿
                            </span>
                          )}
                          {group.title}
                        </span>
                        {renderSortIndicator(group.key)}
                      </th>
                    );
                  })}
                </tr>
                {/* Level 2: Sub-column Pivot Dimension Values Row */}
                <tr className="pivot-sub-header-row">
                  {displayCols.map(col => {
                    const isSortable = Boolean(enableHierarchicalSort);
                    const isColActive = sortColumn === col.key && sortDirection !== 'none';
                    const subMetricKey = onReorderMetrics ? getMetricKeyFromColumn(col, baseMetrics) : null;
                    const isSubDraggable = Boolean(onReorderMetrics && subMetricKey && (props.combineMetric || !props.isPivotMode));
                    const isSubDragging = draggedMetricCol === subMetricKey;
                    const isSubTargetBefore = dropTargetCol?.metric === subMetricKey && dropTargetCol.position === 'before';
                    const isSubTargetAfter = dropTargetCol?.metric === subMetricKey && dropTargetCol.position === 'after';

                    return (
                      <th
                        key={col.key}
                        draggable={isSubDraggable}
                        onDragStart={isSubDraggable ? e => handleColumnDragStart(e, subMetricKey!) : undefined}
                        onDragOver={isSubDraggable ? e => handleColumnDragOver(e, subMetricKey!) : undefined}
                        onDragLeave={isSubDraggable ? e => handleColumnDragLeave(e, subMetricKey!) : undefined}
                        onDrop={isSubDraggable ? e => handleColumnDrop(e, subMetricKey!) : undefined}
                        onDragEnd={isSubDraggable ? handleColumnDragEnd : undefined}
                        className={classNames('metric-header pivot-sub-header', {
                          'sortable-header': isSortable,
                          'pivot-row-totals-col': col.key.includes('___ROW_TOTAL'),
                          'pivot-subtotal-col': col.key.includes('___SUBTOTAL'),
                          'draggable-metric-th': isSubDraggable,
                          'col-dragging': isSubDragging,
                          'col-drop-target-before': isSubTargetBefore,
                          'col-drop-target-after': isSubTargetAfter,
                        })}
                        onClick={
                          isSortable ? () => handleHeaderSort(col.key) : undefined
                        }
                        tabIndex={isSortable ? 0 : undefined}
                        onKeyDown={
                          isSortable
                            ? e => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  handleHeaderSort(col.key);
                                }
                              }
                            : undefined
                        }
                        aria-sort={
                          !isSortable
                            ? undefined
                            : isColActive
                            ? sortDirection === 'asc'
                              ? 'ascending'
                              : 'descending'
                            : 'none'
                        }
                        style={{
                          width: columnLayout.widthOf(col),
                          minWidth: columnLayout.widthOf(col),
                          cursor: isSortable || isSubDraggable ? 'pointer' : undefined,
                        }}
                      >
                        <span>
                          {isSubDraggable && props.combineMetric && (
                            <span className="drag-handle-icon" title="Drag metric">
                              ⠿
                            </span>
                          )}
                          {col.title}
                        </span>
                        {renderSortIndicator(col.key)}
                        {renderResizeHandle(col)}
                      </th>
                    );
                  })}
                </tr>
              </>
            ) : (
              <tr>
                {columns.map(col => {
                  const isSortable = Boolean(enableHierarchicalSort);
                  const sortKey = col.isHierarchyDimension ? '__hierarchy_tree__' : col.key;
                  const isColActive =
                    (sortColumn === sortKey ||
                      (col.isHierarchyDimension && isHierarchySortKey(sortColumn, dimensions))) &&
                    sortDirection !== 'none';
                  // The flag lets the viewer move columns without the dashboard's help; otherwise the
                  // reorder goes through the host hook, as before.
                  const isLocalDraggable = columnLayout.reorderable && Boolean(col.isMetric);
                  const flatMetricKey = onReorderMetrics ? getMetricKeyFromColumn(col, baseMetrics) : null;
                  const isFlatDraggable = isLocalDraggable || Boolean(onReorderMetrics && flatMetricKey);
                  const localDrag = columnLayout.drag;
                  const isFlatDragging = isLocalDraggable
                    ? localDrag.dragKey === col.key
                    : draggedMetricCol === flatMetricKey;
                  const isFlatTargetBefore = isLocalDraggable
                    ? localDrag.dropTarget?.key === col.key && localDrag.dropTarget.position === 'before'
                    : dropTargetCol?.metric === flatMetricKey && dropTargetCol.position === 'before';
                  const isFlatTargetAfter = isLocalDraggable
                    ? localDrag.dropTarget?.key === col.key && localDrag.dropTarget.position === 'after'
                    : dropTargetCol?.metric === flatMetricKey && dropTargetCol.position === 'after';

                  return (
                    <th
                      key={col.key}
                      draggable={isFlatDraggable}
                      onDragStart={
                        isLocalDraggable
                          ? e => localDrag.onDragStart(e, col.key)
                          : isFlatDraggable
                          ? e => handleColumnDragStart(e, flatMetricKey!)
                          : undefined
                      }
                      onDragOver={
                        isLocalDraggable
                          ? e => localDrag.onDragOver(e, col.key)
                          : isFlatDraggable
                          ? e => handleColumnDragOver(e, flatMetricKey!)
                          : undefined
                      }
                      onDragLeave={
                        isLocalDraggable
                          ? e => localDrag.onDragLeave(e, col.key)
                          : isFlatDraggable
                          ? e => handleColumnDragLeave(e, flatMetricKey!)
                          : undefined
                      }
                      onDrop={
                        isLocalDraggable
                          ? e => localDrag.onDrop(e, col.key)
                          : isFlatDraggable
                          ? e => handleColumnDrop(e, flatMetricKey!)
                          : undefined
                      }
                      onDragEnd={
                        isLocalDraggable ? localDrag.onDragEnd : isFlatDraggable ? handleColumnDragEnd : undefined
                      }
                      className={classNames({
                        'hierarchy-col': col.isHierarchyDimension,
                        'metric-header': col.isMetric,
                        'sortable-header': isSortable,
                        'draggable-metric-th': isFlatDraggable,
                        'col-dragging': isFlatDragging,
                        'col-drop-target-before': isFlatTargetBefore,
                        'col-drop-target-after': isFlatTargetAfter,
                      })}
                      onClick={isSortable ? () => handleHeaderSort(sortKey) : undefined}
                      tabIndex={isSortable ? 0 : undefined}
                      onKeyDown={
                        isSortable
                          ? e => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleHeaderSort(sortKey);
                              }
                            }
                          : undefined
                      }
                      aria-sort={
                        !isSortable
                          ? undefined
                          : isColActive
                          ? sortDirection === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      }
                      style={{
                        width: columnLayout.widthOf(col),
                        minWidth: columnLayout.widthOf(col),
                        ...(resizableColumns && col.isHierarchyDimension ? { maxWidth: columnLayout.widthOf(col) } : {}),
                        cursor: isSortable || isFlatDraggable ? 'pointer' : undefined,
                      }}
                    >
                      <span>
                        {isFlatDraggable && (
                          <span className="drag-handle-icon" title="Drag metric">
                            ⠿
                          </span>
                        )}
                        {col.title}
                      </span>
                      {renderSortIndicator(sortKey)}
                      {renderResizeHandle(col)}
                    </th>
                  );
                })}
              </tr>
            )}
          </thead>
          <tbody>
            {grandTotalPosition === 'top' && grandTotalRow}

            {renderWindow.padTop > 0 && <tr style={{ height: renderWindow.padTop }} />}
            {/* Rows share the parent-level click handlers, so cross-filtering survives windowing */}
            {rows.map((node: TreeNode) => {
              const isExpanded = expandedKeys.has(node.key) || debouncedSearch.trim().length > 0;
              const isFilterSelected = selectedFilterMap.has(node.key);

              return (
                <HierarchicalTableRow
                  key={node.key}
                  node={node}
                  displayCols={displayCols}
                  columnMetaMap={columnMetaMap}
                  isExpanded={isExpanded}
                  isFilterSelected={isFilterSelected}
                  emitFilter={emitFilter}
                  activeDisplayMode={rowDisplayMode}
                  minMaxDisplayMode={minMaxDisplayMode}
                  minMaxScope={minMaxScope}
                  minMaxBounds={minMaxBounds}
                  heatmapPalette={heatmapPalette}
                  divergingMidpoint={divergingMidpoint}
                  dataBarZeroAxis={dataBarZeroAxis}
                  theme={theme}
                  showVarianceDelta={Boolean(showVarianceDelta)}
                  showVarianceBadges={showVarianceBadges}
                  whatIfBaseline={effectiveWhatIfBaseline}
                  onToggleExpand={toggleExpand}
                  onNodeClick={handleNodeClick}
                  onContextMenu={handleContextMenu}
                />
              );
            })}
            {renderWindow.padBottom > 0 && <tr style={{ height: renderWindow.padBottom }} />}

            {grandTotalPosition === 'bottom' && grandTotalRow}
          </tbody>
        </table>
      </div>
    </div>
  );
}
