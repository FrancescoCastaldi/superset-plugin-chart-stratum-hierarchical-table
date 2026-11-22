import React from 'react';
import classNames from 'classnames';
import Sparkline from './Sparkline';
import {
  DeltaColumnValue,
  DeltaPill,
  GoalBadge,
  NewBadge,
  SignalMarker,
  WhatIfPill,
} from './cells/badges';
import { CellVisual, heatmapStyle } from './cells/CellVisual';
import { deltaClassName, findVarianceDelta, isSimulatedChange, numericValue } from './cells/cellUtils';
import { msg } from '../i18n';
import {
  HeatmapDivergingPalette,
  HierarchyValueDisplayMode,
  MinMaxBoundsMap,
  MinMaxDisplayMode,
  MinMaxScope,
  TableColumn,
  TreeNode,
  WhatIfBaseline,
} from '../types';
import { CONDITIONAL_ICONS, firstByPriority } from '../utils/conditionalFormatting';
import { getNormalizedMetricValue } from '../utils/formatters';
import { NEW_VALUE, displayName } from '../utils/labels';
import { ColumnMeta } from '../utils/tableColumns';
import { ResolvedTheme } from '../utils/themes';

export interface HierarchicalTableRowProps {
  node: TreeNode;
  displayCols: TableColumn[];
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
  /** Riga raggiungibile con Tab; le altre si raggiungono con le frecce (un solo punto di sosta per la tabella). */
  tabbable?: boolean;
  onFocusRow?: (key: string) => void;
}

/** Una riga dell'albero: nome del nodo con espansione e filtro, poi una cella per ogni colonna. */
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
  tabbable = false,
  onFocusRow,
}: HierarchicalTableRowProps) {
  const hasChildren = Boolean(node.children && node.children.length > 0);
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

  const openMenu = (col?: TableColumn) => (onContextMenu ? (e: React.MouseEvent) => onContextMenu(e, node, col) : undefined);

  const renderCell = (col: TableColumn, index: number) => {
    if (!renderValues) {
      return <td key={col.key} className="metric-cell empty-metric-cell" onContextMenu={openMenu(col)} />;
    }

    if (col.sparkline) {
      const { metric, periods } = col.sparkline;
      const series = periods.map(p => {
        const v = cellValue(`${metric}___${p}`);
        return typeof v === 'number' ? v : null;
      });
      return (
        <td key={col.key} className="metric-cell sparkline-cell" onContextMenu={openMenu(col)}>
          <Sparkline
            values={series}
            polarity={col.polarity}
            label={msg('sparkline.range', { metric, from: periods[0], to: periods[periods.length - 1] })}
          />
        </td>
      );
    }

    const meta = columnMetaMap.get(col.key);
    const val = cellValue(col.key);
    // A matching rule replaces the heatmap background with its own colours.
    const format = firstByPriority([rowFormat, cellFormats[index]]);
    const isDelta = meta?.isDelta ?? false;
    const numeric = numericValue(val);

    const bound =
      inScope && hasMinMax
        ? minMaxScope === 'level_aware'
          ? minMaxBounds?.byLevel?.[col.key]?.[node.depth ?? 0]
          : minMaxBounds?.global[col.key]
        : undefined;
    const range = bound && bound.max > bound.min ? bound.max - bound.min : 0;
    const scale = {
      mode: minMaxDisplayMode,
      inScope,
      numeric,
      bound,
      normalized: numeric !== null && bound && range > 0 ? getNormalizedMetricValue(numeric, bound) : 0,
      polarity: col.polarity,
      palette: heatmapPalette,
      midpoint: divergingMidpoint,
      dataBarZeroAxis,
      theme,
    };

    // Valore della cella
    const baseContent =
      val === NEW_VALUE ? (
        <NewBadge />
      ) : isDelta && typeof val === 'number' ? (
        <DeltaColumnValue value={val} col={col} titleKey="cell.deltaPct" />
      ) : col.formatter ? (
        col.formatter(val)
      ) : (
        String(val ?? '-')
      );

    // Variazione % tra periodi (badge accanto al valore)
    const cellVarianceDelta =
      showVarianceDelta && showVarianceBadges && !isDelta && numeric !== null && !col.key.endsWith('___comp')
        ? findVarianceDelta(node, col)
        : null;
    const varianceBadge =
      cellVarianceDelta !== null ? (
        <DeltaPill
          value={cellVarianceDelta}
          className={deltaClassName(cellVarianceDelta, col.polarity)}
          titleKey="cell.change"
        />
      ) : null;

    // Simulazione What-If
    const baselineVal = whatIfBaseline?.nodeBaselines?.get(node.key)?.[col.key];
    const isSimulatedModified = isSimulatedChange(val, baselineVal);
    const whatIfBadge =
      isSimulatedModified && typeof baselineVal === 'number' ? (
        <WhatIfPill value={val as number} baseline={baselineVal} col={col} titleKey="cell.simulated" />
      ) : null;

    const interval = node.intervals?.[col.key];
    const suppressedLabel = node.suppressed?.[col.key];
    const withGoal = (
      <>
        {baseContent}
        {varianceBadge}
        {whatIfBadge}
        {meta?.goal && numeric !== null && (
          <GoalBadge value={numeric} goal={meta.goal} formatter={meta.formatter} />
        )}
      </>
    );
    const cellContent =
      suppressedLabel !== undefined ? (
        <span className="suppressed-cell" title={msg('cell.suppressed')}>
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
          {interval && <SignalMarker interval={interval} polarity={col.polarity} formatter={col.formatter} />}
        </>
      ) : (
        withGoal
      );

    return (
      <td
        key={col.key}
        className={classNames('metric-cell', format?.className, {
          'pivot-row-totals-cell': col.key.includes('___ROW_TOTAL'),
          'pivot-subtotal-cell': col.key.includes('___SUBTOTAL'),
          'whatif-modified-cell': isSimulatedModified,
        })}
        style={format ? format.style : heatmapStyle(scale)}
        onContextMenu={openMenu(col)}
      >
        <CellVisual scale={scale} content={cellContent} />
      </td>
    );
  };

  return (
    <tr
      data-tree-row=""
      data-node-key={node.key}
      role="row"
      aria-level={node.depth + 1}
      aria-expanded={hasChildren ? isExpanded : undefined}
      aria-selected={isFilterSelected || undefined}
      tabIndex={tabbable ? 0 : -1}
      onFocus={e => {
        if (e.target === e.currentTarget) onFocusRow?.(node.key);
      }}
      className={classNames({
        'parent-row': hasChildren,
        'selected-filter-row': isFilterSelected,
      })}
      onContextMenu={openMenu()}
    >
      {/* Hierarchy Column */}
      <td className="hierarchy-cell" onContextMenu={openMenu()}>
        <div className="tree-cell-content" style={{ paddingLeft: `${paddingLeft}px` }}>
          {emitFilter && (
            <input
              type="checkbox"
              className="node-checkbox"
              checked={isFilterSelected}
              onChange={() => onNodeClick(node)}
              aria-label={msg('tree.selectNode', { name: displayName(node.name) })}
            />
          )}
          {hasChildren ? (
            <button
              type="button"
              className="tree-toggle-btn"
              onClick={() => onToggleExpand(node.key)}
              aria-label={isExpanded ? msg('tree.collapse') : msg('tree.expand')}
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
            title={msg(isFilterSelected ? 'tree.filterRemove' : 'tree.filterAdd', {
              name: displayName(node.name),
              path: node.path.map(displayName).join(' > '),
            })}
          >
            {displayName(node.name)}
          </span>
        </div>
      </td>

      {/* Metric / Pivot Columns */}
      {displayCols.map(renderCell)}
    </tr>
  );
});

export default HierarchicalTableRow;
