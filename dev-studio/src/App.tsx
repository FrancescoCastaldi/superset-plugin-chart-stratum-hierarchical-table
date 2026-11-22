import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import transformProps from '../../src/plugin/transformProps';
import HierarchicalTable from '../../src/components/HierarchicalTable';
import '../../src/components/HierarchicalTable.css';
import './studio.css';

import { ALL_SCENARIOS, getScenarioById } from './mockData';
import { TopNav } from './components/TopNav';
import { ExploreControlPanel } from './components/ExploreControlPanel';
import { DiagnosticsDrawer, LogEntry } from './components/DiagnosticsDrawer';
import { CreateChartApiModal } from './components/CreateChartApiModal';

export default function App() {
  const [currentScenarioId, setCurrentScenarioId] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    return p.get('scenario') || 'healthcare';
  });
  const scenario = useMemo(() => getScenarioById(currentScenarioId), [currentScenarioId]);

  const [formData, setFormData] = useState<Record<string, any>>(() => {
    const p = new URLSearchParams(window.location.search);
    const initial: Record<string, any> = { ...scenario.formData };
    if (p.has('whatif')) {
      initial.enableWhatIf = true;
      initial.enable_what_if = true;
    }
    // ?fd={"minMaxDisplayMode":"heatmap"} sovrascrive alcuni controlli: utile per condividere uno stato o fare uno screenshot.
    const overrides = p.get('fd');
    if (overrides) {
      try {
        Object.assign(initial, JSON.parse(overrides));
      } catch {
        // JSON non valido: si usa lo scenario com'è
      }
    }
    return initial;
  });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isApiModalOpen, setIsApiModalOpen] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    return p.has('apiModal');
  });

  // Update scenario
  const handleSelectScenario = useCallback((id: string) => {
    setCurrentScenarioId(id);
    const nextScenario = getScenarioById(id);
    setFormData({ ...nextScenario.formData });
    addLog('perf', `Scenario caricato: ${nextScenario.name}`, { rows: nextScenario.data.length });
  }, []);

  // Reset to default scenario form data
  const handleResetFormData = useCallback(() => {
    setFormData({ ...scenario.formData });
    addLog('perf', `FormData ripristinato allo scenario: ${scenario.name}`);
  }, [scenario]);

  // Copy Superset configuration
  const handleCopyConfig = useCallback(() => {
    navigator.clipboard.writeText(JSON.stringify(formData, null, 2));
    addLog('perf', 'Configurazione formData copiata negli appunti!');
  }, [formData]);

  // Log an event
  const addLog = useCallback((type: LogEntry['type'], message: string, payload?: any) => {
    const entry: LogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      time: new Date().toLocaleTimeString('it-IT', { hour12: false, fractionalSecondDigits: 3 }),
      type,
      message,
      payload,
    };
    setLogs((prev) => [entry, ...prev.slice(0, 49)]);
  }, []);

  // Update single formData field with bidirectional alias sync
  const handleFormChange = useCallback((key: string, value: any) => {
    setFormData((prev) => {
      const next = { ...prev, [key]: value };
      const ALIASES: Record<string, string[]> = {
        minMaxDisplayMode: ['min_max_display_mode'],
        min_max_display_mode: ['minMaxDisplayMode'],
        minMaxScope: ['min_max_scope'],
        min_max_scope: ['minMaxScope'],
        heatmapPalette: ['heatmap_palette'],
        heatmap_palette: ['heatmapPalette'],
        divergingMidpoint: ['diverging_midpoint'],
        diverging_midpoint: ['divergingMidpoint'],
        themeProfile: ['theme_palette', 'theme_profile', 'theme'],
        theme_palette: ['themeProfile', 'theme_profile', 'theme'],
        theme_profile: ['themeProfile', 'theme_palette', 'theme'],
        theme: ['themeProfile', 'theme_profile', 'theme_palette'],
        stripedRows: ['striped_rows'],
        striped_rows: ['stripedRows'],
        compactMode: ['compact_mode'],
        compact_mode: ['compactMode'],
        stickyHeader: ['sticky_header'],
        sticky_header: ['stickyHeader'],
        enableSearch: ['enable_search'],
        enable_search: ['enableSearch'],
        numberFormat: ['number_format'],
        number_format: ['numberFormat'],
        currencySymbol: ['currency_symbol'],
        currency_symbol: ['currencySymbol'],
        virtualizationEnabled: ['virtualization_enabled'],
        virtualization_enabled: ['virtualizationEnabled'],
        pageSize: ['page_size'],
        page_size: ['pageSize'],
        showSubtotals: ['show_rollup_totals', 'subtotals_enabled'],
        show_rollup_totals: ['showSubtotals', 'subtotals_enabled'],
        subtotals_enabled: ['showSubtotals', 'show_rollup_totals'],
        showGrandTotal: ['show_grand_total', 'grand_total_enabled'],
        show_grand_total: ['showGrandTotal', 'grand_total_enabled'],
        grand_total_enabled: ['showGrandTotal', 'show_grand_total'],
        grandTotalPosition: ['grand_total_position'],
        grand_total_position: ['grandTotalPosition'],
        enableContextMenu: ['enable_context_menu'],
        enable_context_menu: ['enableContextMenu'],
        enableWhatIf: ['enable_what_if'],
        enable_what_if: ['enableWhatIf'],
        showVarianceDelta: ['show_variance_delta'],
        show_variance_delta: ['showVarianceDelta'],
        pivotTimeDeltaMode: ['pivot_time_delta_mode'],
        pivot_time_delta_mode: ['pivotTimeDeltaMode'],
        pivotTimeDeltaLag: ['pivot_time_delta_lag'],
        pivot_time_delta_lag: ['pivotTimeDeltaLag'],
        comparisonStrategy: ['comparison_strategy', 'comparisonType'],
        comparison_strategy: ['comparisonStrategy', 'comparisonType'],
        comparisonType: ['comparisonStrategy', 'comparison_strategy'],
        comparisonReferencePeriod: ['comparison_reference_period', 'referencePeriod'],
        comparison_reference_period: ['comparisonReferencePeriod', 'referencePeriod'],
        referencePeriod: ['comparisonReferencePeriod', 'comparison_reference_period'],
        comparisonTimeGrain: ['comparison_time_grain', 'timeGrain'],
        comparison_time_grain: ['comparisonTimeGrain', 'timeGrain'],
        timeGrain: ['comparisonTimeGrain', 'comparison_time_grain'],
        columns: ['pivot_columns', 'pivotColumns'],
        pivot_columns: ['columns', 'pivotColumns'],
        pivotColumns: ['columns', 'pivot_columns'],
      };
      if (ALIASES[key]) {
        for (const alias of ALIASES[key]) {
          next[alias] = value;
        }
      }
      return next;
    });
    addLog('filter', `Aggiornato parametro Explore [${key}]`, value);
  }, [addLog]);

  // Available dimensions and metrics from the raw data
  const availableDimensions = useMemo(() => {
    if (!scenario.data || scenario.data.length === 0) return [];
    return Object.keys(scenario.data[0]).filter((k) => typeof scenario.data[0][k] === 'string');
  }, [scenario.data]);

  const availableMetrics = useMemo(() => {
    if (!scenario.data || scenario.data.length === 0) return [];
    return Object.keys(scenario.data[0]).filter((k) => typeof scenario.data[0][k] === 'number');
  }, [scenario.data]);

  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasDimensions, setCanvasDimensions] = useState<{ width: number; height: number }>({
    width: 1200,
    height: 600,
  });

  useEffect(() => {
    if (!canvasRef.current) return;
    const updateSize = () => {
      if (canvasRef.current) {
        const { clientWidth, clientHeight } = canvasRef.current;
        if (clientWidth > 0 && clientHeight > 0) {
          setCanvasDimensions({ width: clientWidth, height: clientHeight });
        }
      }
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, []);

  // Run transformProps pipeline with timing
  const { transformedProps, execTimeMs, error } = useMemo(() => {
    const t0 = performance.now();
    try {
      const props = transformProps({
        width: canvasDimensions.width,
        height: canvasDimensions.height,
        formData,
        rawFormData: formData,
        queriesData: [{ data: scenario.data }],
        hooks: {
          setDataMask: (mask: any) => {
            addLog('filter', 'setDataMask (Cross-Filtering)', mask);
          },
          onContextMenu: (filters: any) => {
            addLog('context_menu', 'onContextMenu (Native Drill)', filters);
          },
          onReorderMetrics: (nextMetrics: string[]) => {
            addLog('reorder', 'onReorderMetrics (Drag & Drop)', nextMetrics);
            handleFormChange('metrics', nextMetrics);
          },
          onWhatIfChange: (scen: any) => {
            if (scen) {
              addLog('perf', `What-If Scenario: ${scen.name || 'Attivo'}`, scen.adjustments);
            } else {
              addLog('perf', 'What-If: Reset Baseline ripristinato');
            }
          },
        },
        filterState: {},
      } as any);

      return {
        transformedProps: props,
        execTimeMs: performance.now() - t0,
        error: null,
      };
    } catch (err: any) {
      return {
        transformedProps: null,
        execTimeMs: performance.now() - t0,
        error: err?.message || String(err),
      };
    }
  }, [formData, scenario.data, addLog, handleFormChange]);

  // Count rendered tree nodes
  const nodeCount = useMemo(() => {
    const nodes = transformedProps?.data || (transformedProps as any)?.treeData;
    if (!nodes || !Array.isArray(nodes)) return 0;
    const countNodes = (treeNodes: any[]): number => {
      let c = treeNodes.length;
      for (const n of treeNodes) {
        if (n.children && n.children.length > 0) {
          c += countNodes(n.children);
        }
      }
      return c;
    };
    return countNodes(nodes);
  }, [transformedProps]);

  return (
    <div className="studio-container">
      <TopNav
        currentScenarioId={currentScenarioId}
        onSelectScenario={handleSelectScenario}
        onResetFormData={handleResetFormData}
        onCopyConfig={handleCopyConfig}
        onOpenApiModal={() => setIsApiModalOpen(true)}
        rowCount={scenario.data.length}
      />

      <div className="studio-main">
        {/* Left: Explore Control Panel */}
        <ExploreControlPanel
          formData={formData}
          onChange={handleFormChange}
          availableDimensions={availableDimensions}
          availableMetrics={availableMetrics}
          records={scenario.data}
        />

        {/* Right: Live Chart Viewport */}
        <main className="studio-viewport">
          <div className="chart-wrapper">
            {error ? (
              <div
                style={{
                  background: '#ffebe9',
                  color: '#cf222e',
                  border: '1px solid #ff8182',
                  padding: '16px',
                  borderRadius: '8px',
                  fontFamily: 'monospace',
                }}
              >
                <strong>⚠️ Errore di esecuzione transformProps:</strong>
                <p style={{ marginTop: '8px' }}>{error}</p>
              </div>
            ) : transformedProps ? (
              <div ref={canvasRef} className="chart-canvas">
                <HierarchicalTable
                  {...transformedProps}
                  width={canvasDimensions.width}
                  height={canvasDimensions.height}
                />
              </div>
            ) : (
              <div>Caricamento tabella...</div>
            )}
          </div>

          {/* Bottom: Diagnostics Drawer */}
          <DiagnosticsDrawer
            logs={logs}
            onClearLogs={() => setLogs([])}
            execTimeMs={execTimeMs}
            nodeCount={nodeCount}
            activeFilterCount={transformedProps?.isCrossFilterActive ? 1 : 0}
          />
        </main>
      </div>

      {/* Superset REST API Modal (POST /api/v1/chart/) */}
      <CreateChartApiModal
        isOpen={isApiModalOpen}
        onClose={() => setIsApiModalOpen(false)}
        formData={formData}
        scenarioName={scenario.name}
      />
    </div>
  );
}
