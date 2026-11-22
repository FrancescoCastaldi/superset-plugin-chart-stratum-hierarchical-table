import { msg } from '../i18n';
import { HierarchyValueDisplayMode, SelectedFilterItem } from '../types';
import { BoltIcon, WarningIcon } from './icons';

export interface TableToolbarProps {
  enableSearch: boolean;
  searchInput: string;
  onSearchChange: (text: string) => void;
  onSearchClear: () => void;
  /** Righe scelte per il filtro incrociato, mostrate come etichette removibili. */
  selectedFilters: SelectedFilterItem[];
  onRemoveFilter: (key: string) => void;
  onClearFilters: () => void;
  displayMode: HierarchyValueDisplayMode;
  onDisplayModeChange: (mode: HierarchyValueDisplayMode) => void;
  /** Larghezze o ordine delle colonne cambiati dall'utente: offre il ripristino. */
  columnsCustomized: boolean;
  onResetColumns: () => void;
  enableExport: boolean;
  onExport: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  /** Impostazioni non valide che il grafico ha ignorato (per esempio un colore del tema). */
  configWarnings?: string[];
}

/** Barra sopra la tabella: ricerca, filtri attivi, livelli dei valori, ripristino colonne, CSV, espandi e comprimi. */
export default function TableToolbar({
  enableSearch,
  searchInput,
  onSearchChange,
  onSearchClear,
  selectedFilters,
  onRemoveFilter,
  onClearFilters,
  displayMode,
  onDisplayModeChange,
  columnsCustomized,
  onResetColumns,
  enableExport,
  onExport,
  onExpandAll,
  onCollapseAll,
  configWarnings = [],
}: TableToolbarProps) {
  return (
    <div className="superset-hierarchical-table-toolbar">
      <div className="table-toolbar-left">
        {enableSearch && (
          <div className="table-search-wrapper">
            <input
              type="text"
              placeholder={msg('toolbar.searchPlaceholder')}
              aria-label={msg('toolbar.searchLabel')}
              className="table-search-input"
              value={searchInput}
              onChange={e => onSearchChange(e.target.value)}
            />
            {searchInput && (
              <button
                type="button"
                className="table-search-clear-btn"
                onClick={onSearchClear}
                title={msg('toolbar.clearSearch')}
                aria-label={msg('toolbar.clearSearch')}
              >
                ✕
              </button>
            )}
          </div>
        )}

        {/* Active Cross Filters Multi-Indicator */}
        {selectedFilters.length > 0 && (
          <div className="active-cross-filter-container">
            {selectedFilters.map(filter => (
              <div key={filter.key} className="active-cross-filter-badge">
                <span className="filter-badge-icon">
                  <BoltIcon />
                </span>
                <span className="filter-badge-text">{filter.value}</span>
                <button
                  type="button"
                  className="filter-badge-clear"
                  onClick={() => onRemoveFilter(filter.key)}
                  title={msg('toolbar.removeFilter', { value: filter.value })}
                  aria-label={msg('toolbar.removeFilter', { value: filter.value })}
                >
                  ✕
                </button>
              </div>
            ))}
            {selectedFilters.length > 1 && (
              <button
                type="button"
                className="filter-clear-all-btn"
                onClick={onClearFilters}
                title={msg('toolbar.clearAllFilters')}
              >
                {msg('toolbar.clearAll', { count: selectedFilters.length })}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="table-toolbar-right">
        {configWarnings.length > 0 && (
          <span
            className="config-warning"
            role="img"
            title={`${msg('state.configIgnored')} ${configWarnings.join('; ')}`}
            aria-label={`${msg('state.configIgnored')} ${configWarnings.join('; ')}`}
          >
            <WarningIcon />
          </span>
        )}
        <div className="toolbar-display-mode-selector">
          <span className="toolbar-label">{msg('toolbar.values')}</span>
          <select
            value={displayMode}
            onChange={e => onDisplayModeChange(e.target.value as HierarchyValueDisplayMode)}
            className="toolbar-select"
            aria-label={msg('toolbar.valuesMode')}
          >
            <option value="all">{msg('toolbar.modeAll')}</option>
            <option value="leaves_only">{msg('toolbar.modeLeaves')}</option>
            <option value="parents_only">{msg('toolbar.modeParents')}</option>
          </select>
        </div>
        {columnsCustomized && (
          <button
            type="button"
            className="toolbar-btn"
            onClick={onResetColumns}
            title={msg('toolbar.restoreColumnsTitle')}
          >
            {msg('toolbar.restoreColumns')}
          </button>
        )}
        {enableExport && (
          <button
            type="button"
            className="toolbar-btn toolbar-export-btn"
            onClick={onExport}
            title={msg('toolbar.exportCsvTitle')}
          >
            {msg('toolbar.exportCsv')}
          </button>
        )}
        <button type="button" className="toolbar-btn" onClick={onExpandAll}>
          {msg('toolbar.expandAll')}
        </button>
        <button type="button" className="toolbar-btn" onClick={onCollapseAll}>
          {msg('toolbar.collapseAll')}
        </button>
      </div>
    </div>
  );
}
