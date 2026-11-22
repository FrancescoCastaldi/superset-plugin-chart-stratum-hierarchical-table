import { useCallback, useMemo, useState } from 'react';
import {
  AggregationFunction,
  MetricDefinition,
  TreeNode,
  WhatIfAdjustment,
  WhatIfBaseline,
  WhatIfScenario,
} from '../../types';
import { rollupFunction } from '../../utils/aggregations';
import { applyWhatIfScenario } from '../../utils/whatIfEngine';
import { createScenarioManager } from '../../utils/whatIfScenarioManager';

export interface UseWhatIfParams {
  data: TreeNode[];
  grandTotalNode?: TreeNode;
  metrics: string[];
  dimensions: string[];
  aggregationMode: AggregationFunction;
  weightColumn: string;
  metricDefinitions: MetricDefinition[];
  timeMetrics?: ReadonlySet<string>;
  /** Base storica data dalla dashboard: vale solo quando non c'è una simulazione locale. */
  externalBaseline?: WhatIfBaseline;
  onWhatIfChange?: (scenario: WhatIfScenario | null) => void;
}

const isNeutral = (adjustments: WhatIfAdjustment[]): boolean =>
  adjustments.length === 0 || adjustments.every(a => a.factor === 1);

/**
 * Simulazione What-If: le variazioni scelte, gli scenari salvati e l'albero ricalcolato.
 * Senza variazioni attive l'albero e il totale restano quelli originali.
 */
export function useWhatIf({
  data,
  grandTotalNode,
  metrics,
  dimensions,
  aggregationMode,
  weightColumn,
  metricDefinitions,
  timeMetrics,
  externalBaseline,
  onWhatIfChange,
}: UseWhatIfParams) {
  const [adjustments, setAdjustments] = useState<WhatIfAdjustment[]>([]);
  const [activeScenarioName, setActiveScenarioName] = useState<string | undefined>();
  const scenarioManager = useMemo(() => createScenarioManager(), []);
  const [savedScenarios, setSavedScenarios] = useState<WhatIfScenario[]>(() => scenarioManager.list());

  const result = useMemo(() => {
    if (isNeutral(adjustments)) return null;
    return applyWhatIfScenario(
      data,
      grandTotalNode,
      adjustments,
      metrics,
      rollupFunction(weightColumn, aggregationMode),
      weightColumn,
      dimensions,
      metricDefinitions,
      activeScenarioName ? { id: 'active', name: activeScenarioName } : undefined,
      timeMetrics,
    );
  }, [
    data,
    grandTotalNode,
    adjustments,
    metrics,
    aggregationMode,
    weightColumn,
    metricDefinitions,
    timeMetrics,
    dimensions,
    activeScenarioName,
  ]);

  const reset = useCallback(() => {
    setAdjustments([]);
    setActiveScenarioName(undefined);
    onWhatIfChange?.(null);
  }, [onWhatIfChange]);

  const changeAdjustments = useCallback(
    (next: WhatIfAdjustment[]) => {
      setAdjustments(next);
      if (!onWhatIfChange) return;
      if (isNeutral(next)) {
        onWhatIfChange(null);
      } else {
        onWhatIfChange({
          id: 'custom',
          name: activeScenarioName || 'Personalizzato',
          adjustments: next,
          createdAt: Date.now(),
        });
      }
    },
    [onWhatIfChange, activeScenarioName],
  );

  const saveScenario = useCallback(
    (name: string) => {
      const scenario: WhatIfScenario = {
        id: `scenario_${Date.now()}`,
        name,
        adjustments,
        createdAt: Date.now(),
      };
      scenarioManager.save(scenario);
      setSavedScenarios(scenarioManager.list());
      setActiveScenarioName(name);
      onWhatIfChange?.(scenario);
    },
    [adjustments, scenarioManager, onWhatIfChange],
  );

  const loadScenario = useCallback(
    (scenario: WhatIfScenario) => {
      setAdjustments(scenario.adjustments);
      setActiveScenarioName(scenario.name);
      onWhatIfChange?.(scenario);
    },
    [onWhatIfChange],
  );

  return {
    adjustments,
    activeScenarioName,
    savedScenarios,
    treeData: result?.simulatedTree ?? data,
    grandTotalNode: result?.simulatedGrandTotal ?? grandTotalNode,
    // La base della simulazione locale descrive l'albero simulato che si vede: ha la precedenza.
    baseline: result?.baseline ?? externalBaseline,
    reset,
    changeAdjustments,
    saveScenario,
    loadScenario,
  };
}
