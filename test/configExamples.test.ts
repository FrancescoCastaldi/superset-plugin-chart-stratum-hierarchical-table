jest.mock('@superset-ui/core', () => ({
  getNumberFormatter: (fmt: string) => (val: number) => `${fmt}(${val})`,
}));

import config from '../src/plugin/controlPanel';
import { normalizeGoals, inspectGoals } from '../src/utils/goalBenchmark';
import { normalizeMetricDefinitions } from '../src/utils/metricSemantics';
import { normalizeTableCalculations } from '../src/utils/tableCalculations';
import { normalizeDimensionLimits, applyDimensionLimits } from '../src/utils/dimensionLimits';
import { normalizeConditionalFormatting } from '../src/utils/conditionalFormatting';
import { TreeNode } from '../src/types';

type Control = { name: string; config: { description?: string } };

function controlNamed(name: string): Control {
  for (const section of config.controlPanelSections ?? []) {
    for (const row of section?.controlSetRows ?? []) {
      for (const item of row as unknown[]) {
        if (item && typeof item === 'object' && (item as Control).name === name) return item as Control;
      }
    }
  }
  throw new Error(`controllo ${name} non trovato`);
}

/** Primo array JSON dopo "Esempio:" nella descrizione di un controllo. */
function exampleOf(name: string): string {
  const description = controlNamed(name).config.description ?? '';
  const start = description.indexOf('Esempio:');
  expect(start).toBeGreaterThanOrEqual(0);
  const from = description.indexOf('[', start);
  const to = description.lastIndexOf(']');
  return description.slice(from, to + 1);
}

describe('esempi mostrati nel pannello', () => {
  it('goals: l\'esempio produce un obiettivo', () => {
    expect(normalizeGoals(exampleOf('goals'))).toEqual([
      { metricKey: 'accessi', target: 1000, direction: 'higher_is_better' },
    ]);
  });

  it('conditionalFormatting: l\'esempio produce una regola con il suo colore di sfondo', () => {
    const rules = normalizeConditionalFormatting(JSON.parse(exampleOf('conditionalFormatting')));
    expect(rules).toHaveLength(1);
    expect(rules[0].backgroundColor).toBe('#fee2e2');
  });

  it('metricDefinitions: l\'esempio produce una definizione', () => {
    expect(normalizeMetricDefinitions(exampleOf('metricDefinitions'))).toHaveLength(1);
  });

  it('tableCalculations: l\'esempio produce un calcolo', () => {
    expect(normalizeTableCalculations(exampleOf('tableCalculations'))).toHaveLength(1);
  });

  it('dimensionLimits: l\'esempio produce una regola', () => {
    expect(normalizeDimensionLimits(exampleOf('dimensionLimits'))).toHaveLength(1);
  });
});

describe('obiettivi', () => {
  it('accetta metric come alias di metricKey', () => {
    expect(normalizeGoals([{ metric: 'a', target: 5 }, { metricKey: 'b', target: '7' }])).toEqual([
      { metricKey: 'a', target: 5, direction: 'higher_is_better' },
      { metricKey: 'b', target: 7, direction: 'higher_is_better' },
    ]);
  });

  it('spiega perché scarta una voce', () => {
    const result = inspectGoals([{ metric: 'a' }, { metric: 'b', target: 1, direction: 'su' }, 4]);
    expect(result.goals).toEqual([]);
    expect(result.dropped).toHaveLength(3);
    expect(result.dropped[0]).toContain('Obiettivo 1');
    expect(result.dropped[0]).toContain('target');
    expect(result.dropped[1]).toContain('direction');
  });

  it('segnala un errore di sintassi invece di ignorarlo', () => {
    expect(inspectGoals('[{').syntaxError).toBeTruthy();
    expect(inspectGoals('{"a":1}').syntaxError).toBeTruthy();
    expect(inspectGoals('').syntaxError).toBeUndefined();
  });
});

describe('definizioni di metrica con calcolo di tabella', () => {
  it('conserva i campi calculation* letti poi dai calcoli di tabella', () => {
    const definitions = normalizeMetricDefinitions([
      {
        metric: 'ricavi',
        type: 'sum',
        calculation: 'rank',
        rankMethod: 'dense',
        rankOrder: 'asc',
        calculationScope: 'periods',
        calculationDisplayMode: 'replace',
      },
    ]);
    expect(definitions[0]).toMatchObject({ calculation: 'rank', rankMethod: 'dense', rankOrder: 'asc' });
    const calculations = normalizeTableCalculations('', definitions);
    expect(calculations).toHaveLength(1);
    expect(calculations[0]).toMatchObject({
      metric: 'ricavi',
      type: 'rank',
      rankMethod: 'dense',
      rankOrder: 'asc',
      scope: 'periods',
      displayMode: 'replace',
    });
  });

  it('ignora un calcolo sconosciuto', () => {
    const definitions = normalizeMetricDefinitions([{ metric: 'x', type: 'sum', calculation: 'boh' }]);
    expect(definitions[0].calculation).toBeUndefined();
  });
});

describe('titolo personalizzato dei calcoli', () => {
  it('un titolo vuoto torna al titolo predefinito', () => {
    const [calc] = normalizeTableCalculations([{ metric: 'ricavi', type: 'pct_of_total', customTitle: '   ' }]);
    expect(calc.customTitle).toBeUndefined();
  });
});

describe('riga Altri del Top N', () => {
  const leaf = (name: string, v: number, w: number): TreeNode => ({
    key: name,
    id: name,
    name,
    dimension: 'reparto',
    depth: 0,
    path: [name],
    isLeaf: true,
    metrics: { prezzo: v, qty: w },
  });
  const nodes = [leaf('A', 100, 1), leaf('B', 10, 1), leaf('C', 20, 1), leaf('D', 30, 1)];
  const rules = [{ limit: 1, dimension: 'reparto', metric: 'prezzo', mode: 'top' as const, othersLabel: 'Altri ({k})' }];

  it('somma per default (comportamento storico)', () => {
    const result = applyDimensionLimits(nodes, rules, 'prezzo');
    expect(result.find(n => n.isOthers)?.metrics.prezzo).toBe(60);
  });

  it('usa la media quando il grafico aggrega con la media', () => {
    const result = applyDimensionLimits(nodes, rules, 'prezzo', {
      metricNames: ['prezzo', 'qty'],
      aggregationMode: 'avg',
    });
    const others = result.find(n => n.isOthers);
    expect(others?.metrics.prezzo).toBe(20);
    expect(others?.metrics.qty).toBe(1);
  });

  it('usa il massimo e non modifica i nodi originali', () => {
    const before = JSON.stringify(nodes);
    const result = applyDimensionLimits(nodes, rules, 'prezzo', {
      metricNames: ['prezzo', 'qty'],
      aggregationMode: 'max',
    });
    expect(result.find(n => n.isOthers)?.metrics.prezzo).toBe(30);
    expect(JSON.stringify(nodes)).toBe(before);
  });
});
