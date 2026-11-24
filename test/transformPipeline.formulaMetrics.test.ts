jest.mock('@superset-ui/core', () => ({
  getNumberFormatter: (fmt: string) => (val: any) => `fmt[${fmt}](${val})`,
  ensureIsArray: (val: any) =>
    val === null || val === undefined ? [] : Array.isArray(val) ? val : [val],
}));

import transformProps from '../src/plugin/transformProps';
import { HierarchicalTableChartProps } from '../src/types';

const records = [
  { sede: 'S1', reparto: 'A', ricavi: 100, costi: 70 },
  { sede: 'S1', reparto: 'B', ricavi: 300, costi: 150 },
  { sede: 'S2', reparto: 'A', ricavi: 200, costi: 100 },
];

const DEFINITIONS = [
  { metric: 'ricavi', type: 'sum' },
  { metric: 'costi', type: 'sum' },
  {
    metric: 'margine',
    type: 'formula',
    formula: '([ricavi] - costi) / ricavi * 100',
    label: 'Margine %',
  },
];

const run = (extra: Record<string, unknown> = {}) => {
  const formData = {
    hierarchyType: 'multi_dimension',
    groupby: ['sede', 'reparto'],
    metrics: ['ricavi', 'costi'],
    metricDefinitions: JSON.stringify(DEFINITIONS),
    ...extra,
  };
  return transformProps({
    width: 800,
    height: 600,
    formData,
    rawFormData: formData,
    queriesData: [{ data: records }],
    hooks: {},
  } as unknown as HierarchicalTableChartProps);
};

describe('transformProps with formula metrics', () => {
  it('computes the formula on the parent rows from their totals, not from the child margins', () => {
    const out = run();
    const s1 = out.data.find(n => n.name === 'S1')!;
    // Figli: 30% e 50%. Padre: (400 - 220) / 400 = 45%.
    expect(s1.metrics.margine).toBeCloseTo(45);
    const leaf = s1.children!.find(n => n.name === 'A')!;
    expect(leaf.metrics.margine).toBeCloseTo(30);
  });

  it('computes the formula on the grand total from its totals', () => {
    const out = run();
    // Totali: ricavi 600, costi 320 -> (600 - 320) / 600 = 46,67%.
    expect(out.data.length).toBeGreaterThan(0);
    const total = out.grandTotalNode;
    expect(total?.metrics.margine).toBeCloseTo((280 / 600) * 100);
  });

  it('adds a column for the formula, titled with its label', () => {
    const out = run();
    const column = out.columns.find(c => c.key === 'margine');
    expect(column).toBeDefined();
    expect(column?.title).toBe('Margine %');
  });

  it('keeps the table unchanged when there are no formulas', () => {
    const out = run({ metricDefinitions: JSON.stringify([{ metric: 'ricavi', type: 'sum' }]) });
    expect(out.columns.some(c => c.key === 'margine')).toBe(false);
  });
});
