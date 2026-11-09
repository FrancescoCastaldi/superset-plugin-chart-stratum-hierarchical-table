import {
  ConditionalFormattingRule,
  PivotHeaderGroup,
  PivotRowTotalsPosition,
  PivotTimeDeltaMode,
  TableColumn,
  TableCalculationConfig,
} from '../types';
import {
  ConditionalFormatMatch,
  applyConditionalFormatting,
  firstByPriority,
} from '../utils/conditionalFormatting';
import { formatMetricValue } from '../utils/formatters';
import {
  defaultCalculationTitle,
  getCalculationFormatter,
} from '../utils/tableCalculations';
import {
  PERIOD_DELTA_PCT_SUFFIX,
  PERIOD_DELTA_SUFFIX,
  TimeDeltaStrategyConfig,
} from '../utils/timeComparison';

export const HIERARCHY_COLUMN_KEY = '__hierarchy_tree__';
export const ROW_TOTALS_GROUP_KEY = '__pivot_row_totals__';
export const PERIOD_COMPARISON_GROUP_KEY = '__period_comparison__';
export const SPARKLINE_GROUP_KEY = '__sparklines__';

export interface ValueFormat {
  numberFormat: string;
  currencySymbol: string;
}

/**
 * Columns, header groups and the ordered list of metric keys (duplicates included)
 * that the grand total must aggregate.
 */
export interface ColumnLayout {
  columns: TableColumn[];
  pivotHeaderGroups: PivotHeaderGroup[];
  metricKeys: string[];
}

/**
 * Comparison operands (e.g. richieste_conf) are fetched to compute deltas but are not rendered
 * as their own column.
 */
export function isComparisonOperandMetric(metric: string): boolean {
  const m = metric.toLowerCase();
  return (
    ((m.includes('confronto') || m.includes('comparison')) || m.includes('conf')) &&
    !m.includes('delta') &&
    !(m.includes('variazione') || m.includes('change'))
  );
}

export function createMetricFormatter(format: ValueFormat, metricName: string) {
  return (val: any) => formatMetricValue(val, format.numberFormat, format.currencySymbol, metricName);
}

export function formatSignedPercent(val: any): string {
  return val === null || val === undefined ? '-' : `${val > 0 ? '+' : ''}${val}%`;
}

/** Conditional format of one cell of a column from its value; null when no rule applies. */
export type CellConditionalFormat = (value: unknown) => ConditionalFormatMatch | null;

/**
 * Conditional formatting metadata of a generated column, from the rules of its metric
 * (`baseMetric` for pivot cells, the key otherwise). Column-scoped rules are resolved once,
 * against the pivot value of the column (its key outside pivots); cell and row rules are
 * resolved per cell value, and the two outcomes compete by priority.
 */
export function buildColumnConditionalFormat(
  column: Pick<TableColumn, 'key' | 'pivotValue' | 'baseMetric'>,
  rules: ConditionalFormattingRule[],
): CellConditionalFormat | undefined {
  const metricKey = column.baseMetric ?? column.key;
  const own = rules.filter(rule => rule.metric === metricKey);
  if (own.length === 0) return undefined;
  const columnMatch = applyConditionalFormatting(
    column.pivotValue ?? column.key,
    metricKey,
    own.filter(rule => rule.scope === 'column'),
  );
  const valueRules = own.filter(rule => rule.scope !== 'column');
  return value =>
    firstByPriority([applyConditionalFormatting(value, metricKey, valueRules), columnMatch]);
}

function includesAbsoluteDelta(mode: PivotTimeDeltaMode): boolean {
  return mode === 'absolute' || mode === 'both';
}

function includesPercentageDelta(mode: PivotTimeDeltaMode): boolean {
  return mode === 'percentage' || mode === 'both';
}

export function buildHierarchyColumn(hierarchyType: string, dimensions: string[]): TableColumn {
  return {
    key: HIERARCHY_COLUMN_KEY,
    title:
      hierarchyType === 'multi_dimension'
        ? dimensions.join(' / ') || 'Hierarchy'
        : 'Hierarchy Tree',
    dataIndex: 'name',
    isMetric: false,
    isHierarchyDimension: true,
    align: 'left',
    width: 280,
  };
}

function rowTotalsHeaderGroup(
  position: PivotRowTotalsPosition,
  label: string,
  rowTotalsCols: TableColumn[],
): PivotHeaderGroup | null {
  return position !== 'none' && rowTotalsCols.length > 0
    ? {
        title: label,
        key: ROW_TOTALS_GROUP_KEY,
        colSpan: rowTotalsCols.length,
      }
    : null;
}

/**
 * Non-pivot layout: one column per metric. Comparison operands are still aggregated.
 */
export function buildFlatColumns(metrics: string[], format: ValueFormat, records?: any[], treeData?: any[]): ColumnLayout {
  const columns: TableColumn[] = [];
  const metricKeys: string[] = [];
  const hasComp = Boolean(records && records.length > 0 && Object.keys(records[0]).some(k => k.includes('__')));
  const compMap: Record<string, string> = {};

  if (hasComp && records) {
    for (const m of metrics) {
      const k = Object.keys(records[0]).find(key => key.startsWith(m + '__'));
      if (k) compMap[m] = k;
    }
    if (treeData && treeData.length > 0) {
      function rollupNode(node: any) {
        if (!node.children || node.children.length === 0) {
          node.metrics = node.metrics || {};
          for (const m of metrics) {
            if (compMap[m]) {
              const compVal = (node.rawData && node.rawData[compMap[m]] !== undefined) ? Number(node.rawData[compMap[m]]) : 0;
              node.metrics[m + '___comp'] = compVal;
              const curVal = Number(node.metrics[m] || 0);
              const diff = curVal - compVal;
              const delta = compVal !== 0 ? (diff / compVal) * 100 : 0;
              node.metrics[m + '___diff'] = diff;
              node.metrics[m + '___delta'] = delta;
            }
          }
          node.subtotals = Object.assign({}, node.metrics);
        } else {
          for (const c of node.children) {
            rollupNode(c);
          }
          node.metrics = node.metrics || {};
          for (const m of metrics) {
            if (compMap[m]) {
              let curSum = 0, compSum = 0;
              for (const c of node.children) {
                curSum += Number((c.metrics && c.metrics[m]) || 0);
                compSum += Number((c.metrics && c.metrics[m + '___comp']) || 0);
              }
              node.metrics[m] = curSum;
              node.metrics[m + '___comp'] = compSum;
              const diff = curSum - compSum;
              const delta = compSum !== 0 ? (diff / compSum) * 100 : 0;
              node.metrics[m + '___diff'] = diff;
              node.metrics[m + '___delta'] = delta;
            }
          }
          node.subtotals = Object.assign({}, node.metrics);
        }
      }
      for (const root of treeData) {
        rollupNode(root);
      }
    }
  }

  for (const m of metrics) {
    if (hasComp && isComparisonOperandMetric(m)) {
      metricKeys.push(m);
      continue;
    }

    if (hasComp && compMap[m]) {
      metricKeys.push(m, `${m}___comp`, `${m}___diff`, `${m}___delta`);
      columns.push({
        key: m,
        title: `${m} (Attuale)`,
        dataIndex: m,
        isMetric: true,
        align: 'right',
        width: 135,
        formatter: createMetricFormatter(format, m),
      });
      columns.push({
        key: `${m}___comp`,
        title: `${m} (Comparison)`,
        dataIndex: `${m}___comp`,
        isMetric: true,
        align: 'right',
        width: 135,
        formatter: createMetricFormatter(format, m),
      });
      columns.push({
        key: `${m}___diff`,
        title: `Δ ${m}`,
        dataIndex: `${m}___diff`,
        isMetric: true,
        align: 'right',
        width: 115,
        formatter: createMetricFormatter(format, m),
      });
      columns.push({
        key: `${m}___delta`,
        title: `Δ% ${m}`,
        dataIndex: `${m}___delta`,
        isMetric: true,
        align: 'right',
        width: 105,
        formatter: createMetricFormatter(format, `${m}___delta`),
      });
    } else {
      metricKeys.push(m);
      const isDelta = m.includes('delta') || m.includes('diff') || m.endsWith('___delta');
      const isPct = m.includes('pct') || m.includes('%');
      const colWidth = isDelta && isPct ? 105 : isDelta ? 115 : 135;

      columns.push({
        key: m,
        title: m.endsWith('___delta') ? `Δ% ${m.replace('___delta', '')}` : m,
        dataIndex: m,
        isMetric: true,
        align: 'right',
        width: colWidth,
        formatter: createMetricFormatter(format, m),
      });
    }
  }

  return { columns, pivotHeaderGroups: [], metricKeys };
}

export interface MultiPivotColumnsParams {
  metrics: string[];
  displayDim1Values: string[];
  dim2Values: string[];
  rowTotalsPosition: PivotRowTotalsPosition;
  rowTotalsLabel: string;
  showColumnSubtotals: boolean;
  columnSubtotalLabel: string;
  format: ValueFormat;
}

/**
 * Two pivot dimensions: first-level header per value of the 1st dimension with an optional
 * subtotal column, one column per value of the 2nd dimension, plus the row totals block.
 */
export function buildMultiPivotColumns({
  metrics,
  displayDim1Values,
  dim2Values,
  rowTotalsPosition,
  rowTotalsLabel,
  showColumnSubtotals,
  columnSubtotalLabel,
  format,
}: MultiPivotColumnsParams): ColumnLayout {
  const columns: TableColumn[] = [];
  const pivotHeaderGroups: PivotHeaderGroup[] = [];
  const metricKeys: string[] = [];

  const rowTotalsCols: TableColumn[] = [];
  if (rowTotalsPosition !== 'none') {
    for (const m of metrics) {
      if (isComparisonOperandMetric(m)) {
        continue;
      }

      if (showColumnSubtotals) {
        const rowTotalKey = `${m}___ROW_TOTAL`;
        metricKeys.push(rowTotalKey);
        rowTotalsCols.push({
          key: rowTotalKey,
          title: metrics.length > 1 ? `${columnSubtotalLabel} (${m})` : columnSubtotalLabel,
          dataIndex: rowTotalKey,
          isMetric: true,
          pivotValue: rowTotalsLabel,
          baseMetric: `${rowTotalsLabel} ${columnSubtotalLabel}`,
          align: 'right',
          width: 130,
          formatter: createMetricFormatter(format, m),
        });
      }

      for (const v2 of dim2Values) {
        const channelTotalKey = `${m}___ROW_TOTAL___${v2}`;
        metricKeys.push(channelTotalKey);
        rowTotalsCols.push({
          key: channelTotalKey,
          title: metrics.length > 1 ? `${v2} (${m})` : v2,
          dataIndex: channelTotalKey,
          isMetric: true,
          pivotValue: rowTotalsLabel,
          baseMetric: `${rowTotalsLabel} ${v2}`,
          align: 'right',
          width: 130,
          formatter: createMetricFormatter(format, m),
        });
      }
    }
  }

  const totalsGroup = rowTotalsHeaderGroup(rowTotalsPosition, rowTotalsLabel, rowTotalsCols);

  if (rowTotalsPosition === 'left' && totalsGroup) {
    pivotHeaderGroups.push(totalsGroup);
    columns.push(...rowTotalsCols);
  }

  for (const d1Val of displayDim1Values) {
    let subColsCount = 0;

    for (const m of metrics) {
      if (isComparisonOperandMetric(m)) {
        continue;
      }

      if (showColumnSubtotals) {
        const subtotalKey = `${m}___${d1Val}___SUBTOTAL`;
        metricKeys.push(subtotalKey);
        subColsCount++;
        columns.push({
          key: subtotalKey,
          title: metrics.length > 1 ? `${columnSubtotalLabel} (${m})` : columnSubtotalLabel,
          dataIndex: subtotalKey,
          isMetric: true,
          pivotValue: d1Val,
          baseMetric: `${d1Val} ${columnSubtotalLabel}`,
          align: 'right',
          width: 130,
          formatter: createMetricFormatter(format, m),
        });
      }

      for (const v2 of dim2Values) {
        const cellKey = `${m}___${d1Val}___${v2}`;
        metricKeys.push(cellKey);
        subColsCount++;
        columns.push({
          key: cellKey,
          title: metrics.length > 1 ? `${v2} (${m})` : v2,
          dataIndex: cellKey,
          isMetric: true,
          pivotValue: d1Val,
          baseMetric: `${d1Val} ${v2}`,
          align: 'right',
          width: 130,
          formatter: createMetricFormatter(format, m),
        });
      }
    }

    if (subColsCount > 0) {
      pivotHeaderGroups.push({
        title: d1Val,
        key: d1Val,
        colSpan: subColsCount,
      });
    }
  }

  if (rowTotalsPosition === 'right' && totalsGroup) {
    pivotHeaderGroups.push(totalsGroup);
    columns.push(...rowTotalsCols);
  }

  return { columns, pivotHeaderGroups, metricKeys };
}

export interface SinglePivotColumnsParams {
  metrics: string[];
  displayPivotValues: string[];
  combineMetric: boolean;
  rowTotalsPosition: PivotRowTotalsPosition;
  rowTotalsLabel: string;
  deltaMode: PivotTimeDeltaMode;
  format: ValueFormat;
}

function buildCombinedPivotColumns(
  {
    metrics,
    displayPivotValues,
    rowTotalsPosition,
    deltaMode,
    format,
  }: SinglePivotColumnsParams,
  rowTotalsCols: TableColumn[],
  totalsGroup: PivotHeaderGroup | null,
  layout: ColumnLayout,
): void {
  const { columns, pivotHeaderGroups, metricKeys } = layout;

  if (rowTotalsPosition === 'left' && totalsGroup) {
    pivotHeaderGroups.push(totalsGroup);
    columns.push(...rowTotalsCols);
  }

  for (const pVal of displayPivotValues) {
    let subColsCount = 0;

    for (const m of metrics) {
      if (isComparisonOperandMetric(m)) {
        continue;
      }

      const baseCompositeKey = `${m}___${pVal}`;
      metricKeys.push(baseCompositeKey);
      subColsCount++;

      columns.push({
        key: baseCompositeKey,
        title: m,
        dataIndex: baseCompositeKey,
        isMetric: true,
        pivotValue: pVal,
        baseMetric: m,
        align: 'right',
        width: 130,
        formatter: createMetricFormatter(format, m),
      });

      if (includesAbsoluteDelta(deltaMode)) {
        const deltaKey = `${m}___delta___${pVal}`;
        metricKeys.push(deltaKey);
        subColsCount++;

        columns.push({
          key: deltaKey,
          title: metrics.length > 1 ? `Δ ${m}` : 'Delta',
          dataIndex: deltaKey,
          isMetric: true,
          pivotValue: pVal,
          baseMetric: `${m} Delta`,
          align: 'right',
          width: 120,
          formatter: createMetricFormatter(format, 'delta'),
        });
      }

      if (includesPercentageDelta(deltaMode)) {
        const deltaPctKey = `${m}___delta_pct___${pVal}`;
        metricKeys.push(deltaPctKey);
        subColsCount++;

        columns.push({
          key: deltaPctKey,
          title: metrics.length > 1 ? `Δ% ${m}` : 'Δ%',
          dataIndex: deltaPctKey,
          isMetric: true,
          pivotValue: pVal,
          baseMetric: `${m} Δ%`,
          align: 'right',
          width: 110,
          formatter: formatSignedPercent,
        });
      }
    }

    if (subColsCount > 0) {
      pivotHeaderGroups.push({
        title: pVal,
        key: pVal,
        colSpan: subColsCount,
      });
    }
  }

  if (rowTotalsPosition === 'right' && totalsGroup) {
    pivotHeaderGroups.push(totalsGroup);
    columns.push(...rowTotalsCols);
  }
}

function buildSeparatedPivotColumns(
  {
    metrics,
    displayPivotValues,
    rowTotalsPosition,
    rowTotalsLabel,
    deltaMode,
    format,
  }: SinglePivotColumnsParams,
  layout: ColumnLayout,
): void {
  const { columns, pivotHeaderGroups, metricKeys } = layout;

  const rowTotalColumn = (m: string): TableColumn => {
    const rowTotalKey = `${m}___ROW_TOTAL`;
    metricKeys.push(rowTotalKey);
    return {
      key: rowTotalKey,
      title: rowTotalsLabel,
      dataIndex: rowTotalKey,
      isMetric: true,
      pivotValue: rowTotalsLabel,
      baseMetric: `${rowTotalsLabel} ${m}`,
      align: 'right',
      width: 140,
      formatter: createMetricFormatter(format, m),
    };
  };

  for (const m of metrics) {
    if (isComparisonOperandMetric(m)) {
      continue;
    }

    const hasRowTotal = rowTotalsPosition !== 'none';
    pivotHeaderGroups.push({
      title: m,
      key: m,
      colSpan: displayPivotValues.length + (hasRowTotal ? 1 : 0),
    });

    if (rowTotalsPosition === 'left') {
      columns.push(rowTotalColumn(m));
    }

    for (const pVal of displayPivotValues) {
      const compositeKey = `${m}___${pVal}`;
      metricKeys.push(compositeKey);

      columns.push({
        key: compositeKey,
        title: pVal,
        dataIndex: compositeKey,
        isMetric: true,
        pivotValue: pVal,
        baseMetric: m,
        align: 'right',
        width: 140,
        formatter: createMetricFormatter(format, m),
      });
    }

    if (rowTotalsPosition === 'right') {
      columns.push(rowTotalColumn(m));
    }

    if (includesAbsoluteDelta(deltaMode)) {
      pivotHeaderGroups.push({
        title: `Delta ${m}`,
        key: `delta___${m}`,
        colSpan: displayPivotValues.length,
      });

      for (const pVal of displayPivotValues) {
        const deltaKey = `${m}___delta___${pVal}`;
        metricKeys.push(deltaKey);

        columns.push({
          key: deltaKey,
          title: pVal,
          dataIndex: deltaKey,
          isMetric: true,
          pivotValue: pVal,
          baseMetric: `${m} Delta`,
          align: 'right',
          width: 120,
          formatter: createMetricFormatter(format, 'delta'),
        });
      }
    }

    if (includesPercentageDelta(deltaMode)) {
      pivotHeaderGroups.push({
        title: `Δ% ${m}`,
        key: `delta_pct___${m}`,
        colSpan: displayPivotValues.length,
      });

      for (const pVal of displayPivotValues) {
        const deltaPctKey = `${m}___delta_pct___${pVal}`;
        metricKeys.push(deltaPctKey);

        columns.push({
          key: deltaPctKey,
          title: pVal,
          dataIndex: deltaPctKey,
          isMetric: true,
          pivotValue: pVal,
          baseMetric: `${m} Δ%`,
          align: 'right',
          width: 110,
          formatter: formatSignedPercent,
        });
      }
    }
  }
}

function periodComparisonTitle({ strategy, referencePeriod, timeGrain }: TimeDeltaStrategyConfig): string {
  if (strategy === 'budget_target') return 'Δ vs budget target';
  if (strategy === 'prev_year_same_period') return 'Δ vs same period last year';
  if (referencePeriod === 'ytd') return 'Δ vs YTD average';
  switch (timeGrain) {
    case 'year':
      return 'Δ vs previous year (YoY)';
    case 'month':
      return 'Δ vs previous month (MoM)';
    case 'quarter':
      return 'Δ vs previous quarter (QoQ)';
    case 'day':
      return 'Δ vs previous day (DoD)';
    case 'week':
      return 'Δ vs previous week (WoW)';
    default:
      return 'Δ vs previous period';
  }
}

/**
 * Appends, after every other column, the absolute and percentage delta of the current period
 * against the baseline of the time comparison strategy, under one header group.
 */
/** Header of the delta columns against the comparison period of the calendar filter */
export const CALENDAR_COMPARISON_TITLE = 'Δ vs periodo di confronto (filtro Calendar)';

export function appendPeriodComparisonColumns(
  layout: ColumnLayout,
  metrics: string[],
  config: TimeDeltaStrategyConfig,
  format: ValueFormat,
  titleOverride?: string,
): void {
  const multiple = metrics.length > 1;
  let count = 0;
  for (const m of metrics) {
    if (isComparisonOperandMetric(m)) continue;
    const deltaKey = `${m}${PERIOD_DELTA_SUFFIX}`;
    const deltaPctKey = `${m}${PERIOD_DELTA_PCT_SUFFIX}`;
    layout.metricKeys.push(deltaKey, deltaPctKey);
    layout.columns.push(
      {
        key: deltaKey,
        title: multiple ? `Δ ${m}` : 'Δ',
        dataIndex: deltaKey,
        isMetric: true,
        baseMetric: `${m} Δ period`,
        align: 'right',
        width: 120,
        formatter: createMetricFormatter(format, 'delta'),
      },
      {
        key: deltaPctKey,
        title: multiple ? `Δ% ${m}` : 'Δ%',
        dataIndex: deltaPctKey,
        isMetric: true,
        baseMetric: `${m} Δ% period`,
        align: 'right',
        width: 110,
        formatter: formatSignedPercent,
      },
    );
    count += 2;
  }
  if (count > 0) {
    layout.pivotHeaderGroups.push({
      title: titleOverride ?? periodComparisonTitle(config),
      key: PERIOD_COMPARISON_GROUP_KEY,
      colSpan: count,
    });
  }
}

/**
 * Trend columns of the single pivot layout: one column per metric whose cell draws the series
 * over the periods (in chronological order). Metrics that are comparison operands or deltas
 * have no trend of their own. Returns the number of columns added.
 */
export function appendSparklineColumns(
  layout: ColumnLayout,
  metrics: string[],
  periods: string[],
  selected: string[],
): number {
  if (periods.length < 2) return 0;
  const candidates = metrics.filter(
    m => !isComparisonOperandMetric(m) && !/delta|variazione/i.test(m) && (selected.length === 0 || selected.includes(m)),
  );
  const multiple = candidates.length > 1;
  for (const m of candidates) {
    const key = `${m}___SPARK`;
    layout.columns.push({
      key,
      title: multiple ? `Trend ${m}` : 'Trend',
      dataIndex: key,
      isMetric: true,
      baseMetric: m,
      align: 'center',
      width: 120,
      sparkline: { metric: m, periods },
    });
  }
  if (candidates.length > 0) {
    layout.pivotHeaderGroups.push({ title: 'Trend', key: SPARKLINE_GROUP_KEY, colSpan: candidates.length });
  }
  return candidates.length;
}

/**
 * One pivot dimension (or several joined into one composite key): either the combined layout
 * (pivot value -> metrics/deltas) or the separated layout (metric -> pivot values).
 */
export function buildSinglePivotColumns(params: SinglePivotColumnsParams): ColumnLayout {
  const { metrics, rowTotalsPosition, rowTotalsLabel, format } = params;
  const layout: ColumnLayout = { columns: [], pivotHeaderGroups: [], metricKeys: [] };

  // The row totals keys are registered for both layouts (the separated layout registers
  // them again next to each metric): the grand total aggregates the resulting list as is.
  const rowTotalsCols: TableColumn[] = [];
  if (rowTotalsPosition !== 'none') {
    for (const m of metrics) {
      if (isComparisonOperandMetric(m)) {
        continue;
      }

      const rowTotalKey = `${m}___ROW_TOTAL`;
      layout.metricKeys.push(rowTotalKey);

      rowTotalsCols.push({
        key: rowTotalKey,
        title: m,
        dataIndex: rowTotalKey,
        isMetric: true,
        pivotValue: rowTotalsLabel,
        baseMetric: `${rowTotalsLabel} ${m}`,
        align: 'right',
        width: 130,
        formatter: createMetricFormatter(format, m),
      });
    }
  }

  const totalsGroup = rowTotalsHeaderGroup(rowTotalsPosition, rowTotalsLabel, rowTotalsCols);

  if (params.combineMetric) {
    buildCombinedPivotColumns(params, rowTotalsCols, totalsGroup, layout);
  } else {
    buildSeparatedPivotColumns(params, layout);
  }

  return layout;
}

/**
 * Appends or adapts columns for Table Calculations (modificatori di misura).
 */
export function appendTableCalculationColumns(
  layout: ColumnLayout,
  configs: TableCalculationConfig[],
  format: ValueFormat,
  isPivotMode: boolean,
  pivotValues?: string[],
): void {
  if (!configs || configs.length === 0) return;

  for (const config of configs) {
    if (config.displayMode === 'replace') {
      for (const col of layout.columns) {
        if (col.baseMetric === config.metric || col.dataIndex === config.metric) {
          col.calculationType = config.type;
          col.formatter = getCalculationFormatter(config.type, format.numberFormat, format.currencySymbol);
          if (config.customTitle) {
            col.title = config.customTitle;
          }
        }
      }
      continue;
    }

    // companion_column mode
    if (!isPivotMode) {
      const idx = layout.columns.findIndex(c => c.dataIndex === config.metric || c.baseMetric === config.metric);
      const calcKey = `${config.metric}___calc_${config.type}`;
      const title = config.customTitle ?? defaultCalculationTitle(config);
      const newCol: TableColumn = {
        key: calcKey,
        title,
        dataIndex: calcKey,
        isMetric: true,
        baseMetric: title,
        align: 'right',
        width: 120,
        formatter: getCalculationFormatter(config.type, format.numberFormat, format.currencySymbol),
        calculationType: config.type,
      };
      if (idx >= 0) {
        layout.columns.splice(idx + 1, 0, newCol);
      } else {
        layout.columns.push(newCol);
      }
      layout.metricKeys.push(calcKey);
    } else {
      if (config.scope === 'periods' && pivotValues && pivotValues.length > 0) {
        for (const p of pivotValues) {
          const srcKey = `${config.metric}___${p}`;
          const calcKey = `${srcKey}___calc_${config.type}`;
          const idx = layout.columns.findIndex(c => c.dataIndex === srcKey);
          const title = config.customTitle ? `${config.customTitle} (${p})` : `${defaultCalculationTitle(config)} ${p}`;
          const newCol: TableColumn = {
            key: calcKey,
            title,
            dataIndex: calcKey,
            isMetric: true,
            pivotValue: p,
            baseMetric: `${config.metric} (${config.type})`,
            align: 'right',
            width: 120,
            formatter: getCalculationFormatter(config.type, format.numberFormat, format.currencySymbol),
            calculationType: config.type,
          };
          if (idx >= 0) {
            layout.columns.splice(idx + 1, 0, newCol);
          } else {
            layout.columns.push(newCol);
          }
          layout.metricKeys.push(calcKey);
        }
      } else {
        const calcKey = `${config.metric}___calc_${config.type}`;
        const title = config.customTitle ?? defaultCalculationTitle(config);
        const newCol: TableColumn = {
          key: calcKey,
          title,
          dataIndex: calcKey,
          isMetric: true,
          baseMetric: title,
          align: 'right',
          width: 120,
          formatter: getCalculationFormatter(config.type, format.numberFormat, format.currencySymbol),
          calculationType: config.type,
        };
        layout.columns.push(newCol);
        layout.metricKeys.push(calcKey);
      }
    }
  }
}

