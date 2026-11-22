import { useCallback } from 'react';
import { HierarchyValueDisplayMode, TableColumn, TreeNode, WhatIfBaseline } from '../../types';
import { buildCsvRows, downloadCsv, serializeCsv } from '../../utils/csvExport';

export interface UseCsvExportParams {
  columns: TableColumn[];
  displayCols: TableColumn[];
  nodes: TreeNode[];
  displayMode: HierarchyValueDisplayMode;
  showGrandTotal: boolean;
  grandTotalNode?: TreeNode;
  grandTotalPosition: 'top' | 'bottom';
  whatIfBaseline?: WhatIfBaseline;
}

/** Esportazione CSV della gerarchia visibile, e della versione con la simulazione What-If. */
export function useCsvExport(params: UseCsvExportParams) {
  const { columns, displayCols, nodes, displayMode, showGrandTotal, grandTotalNode, grandTotalPosition, whatIfBaseline } =
    params;

  const build = useCallback(
    (baseline?: WhatIfBaseline) =>
      buildCsvRows({
        columns,
        displayCols,
        nodes,
        displayMode,
        showGrandTotal,
        grandTotalNode,
        grandTotalPosition,
        ...(baseline ? { whatIfBaseline: baseline } : {}),
      }),
    [columns, displayCols, nodes, displayMode, showGrandTotal, grandTotalNode, grandTotalPosition],
  );

  const exportCsv = useCallback(() => downloadCsv(serializeCsv(build())), [build]);

  const exportWhatIfCsv = useCallback(
    () => downloadCsv(serializeCsv(build(whatIfBaseline)), 'stratum_whatif_simulation.csv'),
    [build, whatIfBaseline],
  );

  return { exportCsv, exportWhatIfCsv };
}
