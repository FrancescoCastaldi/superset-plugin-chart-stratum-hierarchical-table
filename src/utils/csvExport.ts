import { HierarchyValueDisplayMode, TableColumn, TreeNode, WhatIfBaseline } from '../types';
import { computeWhatIfDelta } from './whatIfEngine';

export const CSV_EXPORT_FILENAME = 'stratum_tree_export.csv';

export function shouldRenderMetricValue(node: TreeNode, mode: HierarchyValueDisplayMode): boolean {
  const hasChildren = Boolean(node.children && node.children.length > 0);
  if (mode === 'leaves_only') return !hasChildren;
  if (mode === 'parents_only') return hasChildren;
  return true;
}

export interface CsvExportParams {
  columns: TableColumn[];
  displayCols: TableColumn[];
  nodes: TreeNode[];
  displayMode: HierarchyValueDisplayMode;
  showGrandTotal: boolean;
  grandTotalNode?: TreeNode;
  grandTotalPosition: 'top' | 'bottom';
  whatIfBaseline?: WhatIfBaseline;
}

function cellValue(node: TreeNode, key: string, column?: TableColumn): string {
  const suppressed = node.suppressed?.[key];
  if (suppressed !== undefined) return suppressed;
  const val = node.metrics?.[key] ?? node.subtotals?.[key];
  if (val === null || val === undefined) return '';
  // Durations are exported as written in the table (12:54), not as a number of seconds
  if (column?.exportFormatted && column.formatter && typeof val === 'number') return String(column.formatter(val));
  return String(val);
}

/**
 * Rows of the CSV export: header, optional grand total, then the full tree in pre-order
 * (collapsed nodes included) with the hierarchy indented by two spaces per level.
 * When whatIfBaseline is provided, columns are enriched with Base, Simulato, and Delta %.
 */
export function buildCsvRows({
  columns,
  displayCols,
  nodes,
  displayMode,
  showGrandTotal,
  grandTotalNode,
  grandTotalPosition,
  whatIfBaseline,
}: CsvExportParams): string[][] {
  const hasWhatIf = Boolean(
    whatIfBaseline &&
    whatIfBaseline.nodeBaselines &&
    whatIfBaseline.nodeBaselines.size > 0,
  );

  const headerRow: string[] = [columns[0]?.title || 'Hierarchy'];
  if (hasWhatIf) {
    for (const c of displayCols) {
      const baseTitle = c.baseMetric ? `${c.baseMetric} (${c.title || c.key})` : c.title || c.key;
      headerRow.push(`${baseTitle} (Base)`);
      headerRow.push(`${baseTitle} (Simulato)`);
      headerRow.push(`${baseTitle} (Δ%)`);
    }
  } else {
    headerRow.push(
      ...displayCols.map(c => (c.baseMetric ? `${c.baseMetric} (${c.title || c.key})` : c.title || c.key)),
    );
  }

  const rows: string[][] = [headerRow];

  function extractNodeMetricCells(node: TreeNode, renderValues: boolean): string[] {
    if (!renderValues) {
      return hasWhatIf
        ? new Array(displayCols.length * 3).fill('')
        : new Array(displayCols.length).fill('');
    }
    if (!hasWhatIf) {
      return displayCols.map(c => cellValue(node, c.key, c));
    }
    const result: string[] = [];
    for (const c of displayCols) {
      const simValStr = cellValue(node, c.key);
      const baseRaw = whatIfBaseline!.nodeBaselines.get(node.key)?.[c.key];
      const baseValStr = baseRaw !== null && baseRaw !== undefined ? String(baseRaw) : simValStr;
      const simNum =
        typeof node.metrics?.[c.key] === 'number'
          ? (node.metrics[c.key] as number)
          : typeof node.subtotals?.[c.key] === 'number'
          ? (node.subtotals[c.key] as number)
          : null;
      const baseNum = typeof baseRaw === 'number' ? baseRaw : null;
      let deltaPctStr = '';
      if (simNum !== null && baseNum !== null) {
        const delta = computeWhatIfDelta(simNum, baseNum);
        if (delta.pct !== null) {
          deltaPctStr = `${delta.pct > 0 ? '+' : ''}${delta.pct.toFixed(1)}%`;
        }
      }
      result.push(baseValStr, simValStr, deltaPctStr);
    }
    return result;
  }

  const gtRow =
    showGrandTotal && grandTotalNode
      ? [
          grandTotalNode.name,
          ...extractNodeMetricCells(grandTotalNode, displayMode !== 'leaves_only'),
        ]
      : null;

  if (gtRow && grandTotalPosition === 'top') {
    rows.push(gtRow);
  }

  function traverseForExport(nodeList: TreeNode[]) {
    for (const node of nodeList) {
      const indent = '  '.repeat(node.depth ?? 0);
      const renderValues = shouldRenderMetricValue(node, displayMode);
      rows.push([
        indent + node.name,
        ...extractNodeMetricCells(node, renderValues),
      ]);
      if (node.children && node.children.length > 0) {
        traverseForExport(node.children);
      }
    }
  }

  traverseForExport(nodes);

  if (gtRow && grandTotalPosition === 'bottom') {
    rows.push(gtRow);
  }

  return rows;
}

export function escapeCsvCell(cell: unknown): string {
  const str = String(cell ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function serializeCsv(rows: unknown[][]): string {
  return rows.map(row => row.map(escapeCsvCell).join(',')).join('\r\n');
}

/**
 * Triggers a browser download; the BOM makes Excel open the file as UTF-8.
 * No-op outside a browser environment.
 */
export function downloadCsv(csvContent: string, filename: string = CSV_EXPORT_FILENAME): void {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  }
}
