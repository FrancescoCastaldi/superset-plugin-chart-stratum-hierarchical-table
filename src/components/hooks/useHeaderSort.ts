import { useCallback, useEffect, useState } from 'react';
import { SortOrder } from '../../types';

/** Chiave che indica la colonna della gerarchia (nomi dei nodi) nell'ordinamento. */
export function isHierarchySortKey(key?: string, dims?: string[]): boolean {
  if (!key) return false;
  return (
    key === '__hierarchy_tree__' ||
    key === 'name' ||
    key === 'hierarchy' ||
    key === 'category' ||
    Boolean(dims && dims.includes(key))
  );
}

export interface UseHeaderSortParams {
  defaultSortColumn: string;
  defaultSortOrder: SortOrder;
  dimensions: string[];
  enabled: boolean;
  /** Vero subito dopo un trascinamento o un ridimensionamento: il clic che li chiude non ordina. */
  isBusy: () => boolean;
}

/** Ordinamento scelto con il clic sulle intestazioni (asc, desc, nessuno), con partenza dai valori iniziali. */
export function useHeaderSort({ defaultSortColumn, defaultSortOrder, dimensions, enabled, isBusy }: UseHeaderSortParams) {
  const [sortColumn, setSortColumn] = useState<string>(defaultSortColumn || '__hierarchy_tree__');
  const [sortDirection, setSortDirection] = useState<SortOrder>(defaultSortOrder || 'none');

  useEffect(() => {
    if (defaultSortColumn) setSortColumn(defaultSortColumn);
  }, [defaultSortColumn]);

  useEffect(() => {
    if (defaultSortOrder) setSortDirection(defaultSortOrder);
  }, [defaultSortOrder]);

  const isCurrent = useCallback(
    (columnKey: string) =>
      sortColumn === columnKey ||
      (isHierarchySortKey(sortColumn, dimensions) && isHierarchySortKey(columnKey, dimensions)),
    [sortColumn, dimensions],
  );

  const sortBy = useCallback(
    (columnKey: string) => {
      if (!enabled || isBusy()) return;
      if (isCurrent(columnKey)) {
        // Cycle: asc -> desc -> none -> asc
        setSortDirection(prev => (prev === 'asc' ? 'desc' : prev === 'desc' ? 'none' : 'asc'));
      } else {
        setSortColumn(columnKey);
        setSortDirection('asc');
      }
    },
    [enabled, isBusy, isCurrent],
  );

  return { sortColumn, sortDirection, isCurrent, sortBy };
}
