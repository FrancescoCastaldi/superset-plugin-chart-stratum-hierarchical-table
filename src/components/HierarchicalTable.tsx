import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import classNames from 'classnames';
import {
  HierarchicalTableTransformedProps,
  TreeNode,
  TableColumn,
  HierarchyValueDisplayMode,
  MetricGoal,
  ConditionalFormattingRule,
} from '../types';
import { filterTreeBySearch, sortTreeByExpression, calculateMinMaxBounds } from '../utils/treeBuilder';
import { buildColumnMetaMap, getDisplayColumns } from '../utils/tableColumns';
import { buildColumnConditionalFormat } from '../plugin/columnBuilders';
import { buildContextMenuFilters } from '../plugin/contextMenu';
import { getTheme } from '../utils/themes';
import { normalizeMetricDefinitions } from '../utils/metricSemantics';
import { msg } from '../i18n';
import { useFlatTreeVirtualization } from './useFlatTreeVirtualization';
import { useCrossFilterSelection } from './useCrossFilterSelection';
import { useColumnLayout } from './useColumnLayout';
import { useContainerWidth } from './hooks/useContainerWidth';
import { useCsvExport } from './hooks/useCsvExport';
import { useExpandedKeys } from './hooks/useExpandedKeys';
import { useHeaderSort } from './hooks/useHeaderSort';
import { useMetricDrag } from './hooks/useMetricDrag';
import { useWhatIf } from './hooks/useWhatIf';
import ErrorBoundary from './ErrorBoundary';
import GrandTotalRow from './GrandTotalRow';
import HierarchicalTableRow from './HierarchicalTableRow';
import TableToolbar from './TableToolbar';
import { FlatHeader, HeaderContext, PivotHeader } from './TableHeader';
import WhatIfToolbar from './WhatIfToolbar';
import './HierarchicalTable.css';

export type { ColumnMeta } from '../utils/tableColumns';

const NO_GOALS: MetricGoal[] = [];
const NO_RULES: ConditionalFormattingRule[] = [];
const DEFAULT_THEME = getTheme();

/** Re-render the window only when the scroll crosses a block of rows, not on every pixel. */
const SCROLL_STEP_PX = 32 * 10;
const quantizeScrollTop = (scrollTop: number): number =>
  Math.floor(scrollTop / SCROLL_STEP_PX) * SCROLL_STEP_PX;

function HierarchicalTableInner(props: HierarchicalTableTransformedProps) {
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
    aggregationMode: propAggregationMode,
    weightColumn: propWeightColumn,
    metricDefinitions: propMetricDefinitions,
    timeMetrics: propTimeMetrics,
    whatIfBaseline: externalWhatIfBaseline,
    onWhatIfChange,
    onContextMenu,
    onCrossFilter,
    onClearFilter,
    onReorderMetrics,
  } = props;
  const nullHandling = props.formData?.nullHandling;

  const resolvedAggregationMode = useMemo(() => {
    const raw = propAggregationMode ?? props.formData?.aggregationMode;
    return raw === 'avg' || raw === 'min' || raw === 'max' || raw === 'count' || raw === 'weighted_avg'
      ? raw
      : 'sum';
  }, [propAggregationMode, props.formData?.aggregationMode]);

  const resolvedWeightColumn = useMemo(() => {
    if (resolvedAggregationMode !== 'weighted_avg') return '';
    return String(propWeightColumn ?? props.formData?.weightColumn ?? '').trim();
  }, [resolvedAggregationMode, propWeightColumn, props.formData?.weightColumn]);

  const resolvedMetricDefinitions = useMemo(
    () => normalizeMetricDefinitions(propMetricDefinitions ?? props.formData?.metricDefinitions),
    [propMetricDefinitions, props.formData],
  );

  const resolvedTimeMetrics = useMemo(
    () =>
      propTimeMetrics && propTimeMetrics.length > 0
        ? new Set(propTimeMetrics.map(m => m.toLowerCase()))
        : undefined,
    [propTimeMetrics],
  );

  // Simulazione What-If: albero, totale e base storica con le variazioni applicate
  const whatIf = useWhatIf({
    data,
    grandTotalNode,
    metrics,
    dimensions,
    aggregationMode: resolvedAggregationMode,
    weightColumn: resolvedWeightColumn,
    metricDefinitions: resolvedMetricDefinitions,
    timeMetrics: resolvedTimeMetrics,
    externalBaseline: externalWhatIfBaseline,
    onWhatIfChange,
  });
  const effectiveTreeData = whatIf.treeData;
  const effectiveGrandTotalNode = whatIf.grandTotalNode;
  const effectiveWhatIfBaseline = whatIf.baseline;

  const [activeDisplayMode, setActiveDisplayMode] = useState<HierarchyValueDisplayMode>(valueDisplayMode || 'all');

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
  const containerWidth = useContainerWidth(scrollWrapperRef, width);

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

  const { expandedKeys, toggleExpand, expandAll, collapseAll } = useExpandedKeys(
    data,
    effectiveTreeData,
    initialExpandDepth,
  );

  // Pure base metrics list (excluding synthetic deltas / table calculations)
  const baseMetrics = useMemo(() => {
    const formMetrics = props.formData?.metrics;
    if (Array.isArray(formMetrics) && formMetrics.length > 0) {
      return formMetrics.map((m: any) => (typeof m === 'string' ? m : m?.label || m?.metric_name || String(m)));
    }
    return metrics.filter(m => !m.includes('___'));
  }, [props.formData?.metrics, metrics]);

  const metricDrag = useMetricDrag(baseMetrics, onReorderMetrics);
  const isSortBusy = useCallback(
    () => metricDrag.isDraggingRef.current || columnLayout.wasJustResized(),
    [metricDrag.isDraggingRef, columnLayout],
  );
  const { sortColumn, sortDirection, isCurrent: isCurrentSort, sortBy } = useHeaderSort({
    defaultSortColumn,
    defaultSortOrder,
    dimensions,
    enabled: enableHierarchicalSort,
    isBusy: isSortBusy,
  });

  // Sibling-aware recursive in-tree sorting
  const sortedData = useMemo(() => {
    if (!enableHierarchicalSort || sortDirection === 'none' || !sortColumn) {
      return effectiveTreeData;
    }
    return sortTreeByExpression(effectiveTreeData, sortColumn, sortDirection, nullHandling, dimensions, grandTotalPosition);
  }, [effectiveTreeData, dimensions, enableHierarchicalSort, grandTotalPosition, nullHandling, sortColumn, sortDirection]);

  // Filtered data tree based on search
  const filteredData = useMemo(() => filterTreeBySearch(sortedData, debouncedSearch), [sortedData, debouncedSearch]);

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
    [enableContextMenu, onContextMenu, dimensions, props.hierarchyType, props.formData?.idColumn, props.pivotColumns],
  );

  // Flatten visible tree nodes according to expanded state
  const hasSearch = debouncedSearch.trim().length > 0;
  const visibleRows = useMemo(() => {
    const rows: TreeNode[] = [];

    function traverse(nodes: TreeNode[]) {
      for (const node of nodes) {
        rows.push(node);
        const hasChildren = Boolean(node.children && node.children.length > 0);
        if (hasChildren && (expandedKeys.has(node.key) || hasSearch)) {
          traverse(node.children!);
        }
      }
    }

    traverse(filteredData);
    return rows;
  }, [filteredData, expandedKeys, hasSearch]);

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
            const colWidth = columnLayout.widthOf(col);
            const px = typeof colWidth === 'number' ? colWidth : parseFloat(String(colWidth ?? ''));
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
    () => buildColumnMetaMap(displayCols, goals, col => buildColumnConditionalFormat(col, conditionalFormatting)),
    [displayCols, goals, conditionalFormatting],
  );

  // Min/Max bounds calculation for conditional formatting
  const minMaxBounds = useMemo(() => {
    if (minMaxDisplayMode === 'none') return null;
    const metricKeys = displayCols.map(c => c.key);
    return calculateMinMaxBounds(effectiveTreeData, metricKeys, minMaxScope);
  }, [effectiveTreeData, displayCols, minMaxDisplayMode, minMaxScope]);

  const { exportCsv, exportWhatIfCsv } = useCsvExport({
    columns,
    displayCols,
    nodes: filteredData,
    displayMode: rowDisplayMode,
    showGrandTotal,
    grandTotalNode: effectiveGrandTotalNode,
    grandTotalPosition,
    whatIfBaseline: effectiveWhatIfBaseline,
  });

  if (!data || data.length === 0) {
    const emptyKey =
      metrics.length === 0
        ? 'state.noMetrics'
        : props.hierarchyType === 'multi_dimension' && dimensions.length === 0
        ? 'state.noDimensions'
        : 'state.noData';
    return (
      <div className="superset-hierarchical-table-container" style={containerStyle}>
        <div className="empty-state">{msg(emptyKey)}</div>
      </div>
    );
  }

  const grandTotalRow = showGrandTotal && effectiveGrandTotalNode && (
    <GrandTotalRow
      node={effectiveGrandTotalNode}
      displayCols={displayCols}
      columnMetaMap={columnMetaMap}
      activeDisplayMode={activeDisplayMode}
      showVarianceDelta={showVarianceDelta}
      showVarianceBadges={showVarianceBadges}
      whatIfBaseline={effectiveWhatIfBaseline}
      onContextMenu={onContextMenu ? handleContextMenu : undefined}
    />
  );

  const headerContext: HeaderContext = {
    columns,
    displayCols,
    pivotHeaderGroups: props.pivotHeaderGroups,
    combineMetric: props.combineMetric,
    isPivotMode: props.isPivotMode,
    baseMetrics,
    hostCanReorder: Boolean(onReorderMetrics),
    enableSort: Boolean(enableHierarchicalSort),
    sortDirection,
    isCurrentSort,
    onSort: sortBy,
    resizableColumns,
    columnLayout,
    metricDrag,
  };

  return (
    <div className="superset-hierarchical-table-container" style={containerStyle}>
      {(enableWhatIf || Boolean(externalWhatIfBaseline)) && (
        <WhatIfToolbar
          metrics={metrics}
          metricDefinitions={resolvedMetricDefinitions}
          adjustments={whatIf.adjustments}
          onAdjustmentsChange={whatIf.changeAdjustments}
          onReset={whatIf.reset}
          onSaveScenario={whatIf.saveScenario}
          onLoadScenario={whatIf.loadScenario}
          onExportWithSimulation={exportWhatIfCsv}
          savedScenarios={whatIf.savedScenarios}
          activeScenarioName={whatIf.activeScenarioName}
        />
      )}
      <TableToolbar
        enableSearch={enableSearch}
        searchInput={searchInput}
        onSearchChange={setSearchInput}
        onSearchClear={() => {
          setSearchInput('');
          setDebouncedSearch('');
        }}
        selectedFilters={Array.from(selectedFilterMap.values())}
        onRemoveFilter={handleRemoveSingleFilter}
        onClearFilters={handleClearActiveFilter}
        displayMode={activeDisplayMode}
        onDisplayModeChange={setActiveDisplayMode}
        columnsCustomized={columnLayout.customized}
        onResetColumns={columnLayout.reset}
        enableExport={enableExport}
        onExport={exportCsv}
        onExpandAll={expandAll}
        onCollapseAll={collapseAll}
        configWarnings={theme.warnings}
      />

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
              <PivotHeader ctx={headerContext} />
            ) : (
              <FlatHeader ctx={headerContext} />
            )}
          </thead>
          <tbody>
            {grandTotalPosition === 'top' && grandTotalRow}

            {renderWindow.padTop > 0 && <tr style={{ height: renderWindow.padTop }} />}
            {/* Rows share the parent-level click handlers, so cross-filtering survives windowing */}
            {rows.map((node: TreeNode) => (
              <HierarchicalTableRow
                key={node.key}
                node={node}
                displayCols={displayCols}
                columnMetaMap={columnMetaMap}
                isExpanded={expandedKeys.has(node.key) || hasSearch}
                isFilterSelected={selectedFilterMap.has(node.key)}
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
            ))}
            {hasSearch && visibleRows.length === 0 && (
              <tr className="no-results-row">
                <td colSpan={columns.length || 1} className="empty-state">
                  {msg('state.noSearchResults')}
                </td>
              </tr>
            )}
            {renderWindow.padBottom > 0 && <tr style={{ height: renderWindow.padBottom }} />}

            {grandTotalPosition === 'bottom' && grandTotalRow}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** La tabella gerarchica, protetta da un errore di disegno che lascerebbe vuota la scheda. */
export default function HierarchicalTable(props: HierarchicalTableTransformedProps) {
  return (
    <ErrorBoundary resetKey={props.data}>
      <HierarchicalTableInner {...props} />
    </ErrorBoundary>
  );
}
