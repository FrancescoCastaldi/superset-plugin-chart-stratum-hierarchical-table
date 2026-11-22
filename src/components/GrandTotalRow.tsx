import React from 'react';
import classNames from 'classnames';
import { DeltaColumnValue, DeltaPill, NewBadge, WhatIfPill } from './cells/badges';
import { deltaClassName, findVarianceDelta, isSimulatedChange } from './cells/cellUtils';
import { HierarchyValueDisplayMode, TableColumn, TreeNode, WhatIfBaseline } from '../types';
import { NEW_VALUE, displayName } from '../utils/labels';
import { ColumnMeta } from '../utils/tableColumns';

export interface GrandTotalRowProps {
  node: TreeNode;
  displayCols: TableColumn[];
  columnMetaMap: Map<string, ColumnMeta>;
  activeDisplayMode: HierarchyValueDisplayMode;
  showVarianceDelta?: boolean;
  showVarianceBadges?: boolean;
  whatIfBaseline?: WhatIfBaseline;
  onContextMenu?: (e: React.MouseEvent, node: TreeNode | null, col?: TableColumn) => void;
}

/** Riga del totale generale: stesse celle delle righe, senza espansione né filtro. */
export default function GrandTotalRow({
  node,
  displayCols,
  columnMetaMap,
  activeDisplayMode,
  showVarianceDelta,
  showVarianceBadges = true,
  whatIfBaseline,
  onContextMenu,
}: GrandTotalRowProps) {
  const openMenu = (col?: TableColumn) =>
    onContextMenu ? (e: React.MouseEvent) => onContextMenu(e, null, col) : undefined;

  return (
    <tr className="grand-total-row" onContextMenu={openMenu()}>
      <td className="hierarchy-cell" onContextMenu={openMenu()}>
        <span className="node-name">{displayName(node.name)}</span>
      </td>
      {displayCols.map(col => {
        if (activeDisplayMode === 'leaves_only') {
          return <td key={col.key} className="metric-cell empty-metric-cell" onContextMenu={openMenu(col)} />;
        }
        const val = node.metrics?.[col.key] ?? node.subtotals?.[col.key];
        const isDelta = columnMetaMap.get(col.key)?.isDelta ?? false;

        const variance =
          showVarianceDelta && showVarianceBadges && !isDelta && typeof val === 'number' && !col.key.endsWith('___comp')
            ? findVarianceDelta(node, col)
            : null;
        const varianceBadge =
          variance !== null ? (
            <DeltaPill value={variance} className={deltaClassName(variance, col.polarity)} titleKey="total.change" />
          ) : null;

        const baselineVal = whatIfBaseline?.nodeBaselines?.get(node.key)?.[col.key];
        const isSimulatedModified = isSimulatedChange(val, baselineVal);
        const whatIfBadge =
          isSimulatedModified && typeof baselineVal === 'number' ? (
            <WhatIfPill value={val as number} baseline={baselineVal} col={col} titleKey="total.simulated" />
          ) : null;

        return (
          <td
            key={col.key}
            className={classNames('metric-cell', {
              'pivot-row-totals-cell': col.key.endsWith('___ROW_TOTAL'),
              'whatif-modified-cell': isSimulatedModified,
            })}
            onContextMenu={openMenu(col)}
          >
            {val === NEW_VALUE ? (
              <NewBadge />
            ) : isDelta && typeof val === 'number' ? (
              <DeltaColumnValue value={val} col={col} titleKey="total.deltaPct" />
            ) : (
              <>
                {col.formatter ? col.formatter(val) : String(val ?? '-')}
                {varianceBadge}
                {whatIfBadge}
              </>
            )}
          </td>
        );
      })}
    </tr>
  );
}
