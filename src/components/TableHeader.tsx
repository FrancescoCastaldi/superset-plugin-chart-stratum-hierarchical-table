import React from 'react';
import classNames from 'classnames';
import { getMetricKeyFromColumn } from '../utils/metricReorder';
import { msg } from '../i18n';
import { PivotHeaderGroup, SortOrder, TableColumn } from '../types';
import { displayName } from '../utils/labels';
import { useColumnLayout } from './useColumnLayout';
import { useMetricDrag } from './hooks/useMetricDrag';

type ColumnLayout = ReturnType<typeof useColumnLayout>;
type MetricDrag = ReturnType<typeof useMetricDrag>;

/** Tutto ciò che le intestazioni leggono dalla tabella. */
export interface HeaderContext {
  columns: TableColumn[];
  displayCols: TableColumn[];
  pivotHeaderGroups?: PivotHeaderGroup[];
  combineMetric?: boolean;
  isPivotMode?: boolean;
  baseMetrics: string[];
  /** La dashboard riceve il nuovo ordine delle metriche (`onReorderMetrics`). */
  hostCanReorder: boolean;
  enableSort: boolean;
  sortDirection: SortOrder;
  /** La colonna indicata è quella per cui la tabella è ordinata (anche se la direzione è "nessuno"). */
  isCurrentSort: (columnKey: string) => boolean;
  onSort: (columnKey: string) => void;
  resizableColumns: boolean;
  columnLayout: ColumnLayout;
  metricDrag: MetricDrag;
}

const ariaSort = (sortable: boolean, active: boolean, direction: SortOrder): React.AriaAttributes['aria-sort'] =>
  !sortable ? undefined : active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none';

function SortIndicator({ enabled, active, direction }: { enabled: boolean; active: boolean; direction: SortOrder }) {
  if (!enabled) return null;
  if (!active || direction === 'none') {
    return <span className="sort-indicator sort-indicator-inactive" aria-hidden="true" />;
  }
  return (
    <span
      className="sort-indicator sort-indicator-active"
      aria-label={msg('header.sorted', {
        direction: msg(direction === 'asc' ? 'header.asc' : 'header.desc'),
      })}
    >
      {direction === 'asc' ? ' ▲' : ' ▼'}
    </span>
  );
}

function ResizeHandle({ col, ctx }: { col?: Pick<TableColumn, 'key'>; ctx: HeaderContext }) {
  if (!ctx.resizableColumns || !col) return null;
  const { columnLayout } = ctx;
  return (
    <span
      className="col-resize-handle"
      role="separator"
      aria-orientation="vertical"
      title={msg('header.resize')}
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
  );
}

type SortableThProps = Omit<React.ThHTMLAttributes<HTMLTableCellElement>, 'onClick'> & {
  sortable: boolean;
  active: boolean;
  direction: SortOrder;
  onSort: () => void;
};

/** Cella d'intestazione che si ordina con clic, Invio o Spazio e dichiara il suo stato con aria-sort. */
function SortableTh({ sortable, active, direction, onSort, className, children, ...rest }: SortableThProps) {
  return (
    <th
      {...rest}
      className={classNames(className, { 'sortable-header': sortable })}
      onClick={sortable ? onSort : undefined}
      tabIndex={sortable ? 0 : undefined}
      onKeyDown={
        sortable
          ? e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSort();
              }
            }
          : undefined
      }
      aria-sort={ariaSort(sortable, active && direction !== 'none', direction)}
    >
      {children}
    </th>
  );
}

const DragHandle = () => (
  <span className="drag-handle-icon" title={msg('header.dragMetric')}>
    ⠿
  </span>
);

/** Intestazione del pivot: riga dei gruppi (metriche) e riga dei valori pivot. */
export function PivotHeader({ ctx }: { ctx: HeaderContext }) {
  const { columns, displayCols, columnLayout, metricDrag, enableSort, sortDirection, baseMetrics } = ctx;
  const drag = (key: string | null) => ({
    isDragging: metricDrag.dragged === key,
    before: metricDrag.dropTarget?.metric === key && metricDrag.dropTarget.position === 'before',
    after: metricDrag.dropTarget?.metric === key && metricDrag.dropTarget.position === 'after',
  });

  return (
    <>
      {/* Level 1: Main Metric Header Row */}
      <tr className="pivot-group-header-row">
        <SortableTh
          rowSpan={2}
          className="hierarchy-col"
          sortable={enableSort}
          active={ctx.isCurrentSort('__hierarchy_tree__')}
          direction={sortDirection}
          onSort={() => ctx.onSort('__hierarchy_tree__')}
          style={{
            width: columnLayout.widthOf(columns[0]),
            minWidth: columnLayout.widthOf(columns[0]),
            ...(ctx.resizableColumns ? { maxWidth: columnLayout.widthOf(columns[0]) } : {}),
            cursor: enableSort ? 'pointer' : undefined,
          }}
        >
          <span>{columns[0]?.title}</span>
          <SortIndicator enabled={enableSort} active={ctx.isCurrentSort('__hierarchy_tree__')} direction={sortDirection} />
          <ResizeHandle col={columns[0]} ctx={ctx} />
        </SortableTh>
        {(ctx.pivotHeaderGroups ?? []).map(group => {
          const metricKey = ctx.hostCanReorder && baseMetrics.includes(group.key) ? group.key : null;
          const draggable = Boolean(metricKey);
          const state = drag(metricKey);
          return (
            <SortableTh
              key={group.key}
              colSpan={group.colSpan}
              draggable={draggable}
              onDragStart={draggable ? e => metricDrag.onDragStart(e, metricKey!) : undefined}
              onDragOver={draggable ? e => metricDrag.onDragOver(e, metricKey!) : undefined}
              onDragLeave={draggable ? e => metricDrag.onDragLeave(e, metricKey!) : undefined}
              onDrop={draggable ? e => metricDrag.onDrop(e, metricKey!) : undefined}
              onDragEnd={draggable ? metricDrag.onDragEnd : undefined}
              className={classNames('metric-group-header', {
                'pivot-row-totals-group': group.key === '__pivot_row_totals__',
                'draggable-metric-th': draggable,
                'col-dragging': state.isDragging,
                'col-drop-target-before': state.before,
                'col-drop-target-after': state.after,
              })}
              sortable={enableSort}
              active={ctx.isCurrentSort(group.key)}
              direction={sortDirection}
              onSort={() => ctx.onSort(group.key)}
              style={{
                textAlign: 'center',
                borderBottom: '1px solid var(--st-border-strong, #d1d5db)',
                cursor: enableSort || draggable ? 'pointer' : undefined,
              }}
            >
              <span>
                {draggable && <DragHandle />}
                {displayName(group.title)}
              </span>
              <SortIndicator enabled={enableSort} active={ctx.isCurrentSort(group.key)} direction={sortDirection} />
            </SortableTh>
          );
        })}
      </tr>
      {/* Level 2: Sub-column Pivot Dimension Values Row */}
      <tr className="pivot-sub-header-row">
        {displayCols.map(col => {
          const metricKey = ctx.hostCanReorder ? getMetricKeyFromColumn(col, baseMetrics) : null;
          const draggable = Boolean(ctx.hostCanReorder && metricKey && (ctx.combineMetric || !ctx.isPivotMode));
          const state = drag(metricKey);
          return (
            <SortableTh
              key={col.key}
              draggable={draggable}
              onDragStart={draggable ? e => metricDrag.onDragStart(e, metricKey!) : undefined}
              onDragOver={draggable ? e => metricDrag.onDragOver(e, metricKey!) : undefined}
              onDragLeave={draggable ? e => metricDrag.onDragLeave(e, metricKey!) : undefined}
              onDrop={draggable ? e => metricDrag.onDrop(e, metricKey!) : undefined}
              onDragEnd={draggable ? metricDrag.onDragEnd : undefined}
              className={classNames('metric-header pivot-sub-header', {
                'pivot-row-totals-col': col.key.includes('___ROW_TOTAL'),
                'pivot-subtotal-col': col.key.includes('___SUBTOTAL'),
                'draggable-metric-th': draggable,
                'col-dragging': state.isDragging,
                'col-drop-target-before': state.before,
                'col-drop-target-after': state.after,
              })}
              sortable={enableSort}
              active={ctx.isCurrentSort(col.key)}
              direction={sortDirection}
              onSort={() => ctx.onSort(col.key)}
              style={{
                width: columnLayout.widthOf(col),
                minWidth: columnLayout.widthOf(col),
                cursor: enableSort || draggable ? 'pointer' : undefined,
              }}
            >
              <span>
                {draggable && ctx.combineMetric && <DragHandle />}
                {displayName(col.title)}
              </span>
              <SortIndicator enabled={enableSort} active={ctx.isCurrentSort(col.key)} direction={sortDirection} />
              <ResizeHandle col={col} ctx={ctx} />
            </SortableTh>
          );
        })}
      </tr>
    </>
  );
}

/** Intestazione della tabella piatta: una cella per colonna. */
export function FlatHeader({ ctx }: { ctx: HeaderContext }) {
  const { columns, columnLayout, metricDrag, enableSort, sortDirection, baseMetrics } = ctx;
  const localDrag = columnLayout.drag;

  return (
    <tr>
      {columns.map(col => {
        const sortKey = col.isHierarchyDimension ? '__hierarchy_tree__' : col.key;
        // The flag lets the viewer move columns without the dashboard's help; otherwise the
        // reorder goes through the host hook, as before.
        const isLocal = columnLayout.reorderable && Boolean(col.isMetric);
        const hostKey = ctx.hostCanReorder ? getMetricKeyFromColumn(col, baseMetrics) : null;
        const draggable = isLocal || Boolean(ctx.hostCanReorder && hostKey);
        const isDragging = isLocal ? localDrag.dragKey === col.key : metricDrag.dragged === hostKey;
        const before = isLocal
          ? localDrag.dropTarget?.key === col.key && localDrag.dropTarget.position === 'before'
          : metricDrag.dropTarget?.metric === hostKey && metricDrag.dropTarget.position === 'before';
        const after = isLocal
          ? localDrag.dropTarget?.key === col.key && localDrag.dropTarget.position === 'after'
          : metricDrag.dropTarget?.metric === hostKey && metricDrag.dropTarget.position === 'after';

        return (
          <SortableTh
            key={col.key}
            draggable={draggable}
            onDragStart={
              isLocal ? e => localDrag.onDragStart(e, col.key) : draggable ? e => metricDrag.onDragStart(e, hostKey!) : undefined
            }
            onDragOver={
              isLocal ? e => localDrag.onDragOver(e, col.key) : draggable ? e => metricDrag.onDragOver(e, hostKey!) : undefined
            }
            onDragLeave={
              isLocal ? e => localDrag.onDragLeave(e, col.key) : draggable ? e => metricDrag.onDragLeave(e, hostKey!) : undefined
            }
            onDrop={isLocal ? e => localDrag.onDrop(e, col.key) : draggable ? e => metricDrag.onDrop(e, hostKey!) : undefined}
            onDragEnd={isLocal ? localDrag.onDragEnd : draggable ? metricDrag.onDragEnd : undefined}
            className={classNames({
              'hierarchy-col': col.isHierarchyDimension,
              'metric-header': col.isMetric,
              'draggable-metric-th': draggable,
              'col-dragging': isDragging,
              'col-drop-target-before': before,
              'col-drop-target-after': after,
            })}
            sortable={enableSort}
            active={ctx.isCurrentSort(sortKey)}
            direction={sortDirection}
            onSort={() => ctx.onSort(sortKey)}
            style={{
              width: columnLayout.widthOf(col),
              minWidth: columnLayout.widthOf(col),
              ...(ctx.resizableColumns && col.isHierarchyDimension ? { maxWidth: columnLayout.widthOf(col) } : {}),
              cursor: enableSort || draggable ? 'pointer' : undefined,
            }}
          >
            <span>
              {draggable && <DragHandle />}
              {displayName(col.title)}
            </span>
            <SortIndicator enabled={enableSort} active={ctx.isCurrentSort(sortKey)} direction={sortDirection} />
            <ResizeHandle col={col} ctx={ctx} />
          </SortableTh>
        );
      })}
    </tr>
  );
}
