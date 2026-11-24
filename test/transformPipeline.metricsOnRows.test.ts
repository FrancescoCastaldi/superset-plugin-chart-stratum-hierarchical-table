jest.mock('@superset-ui/core', () => ({
  getNumberFormatter: (fmt: string) => (val: any) => `fmt[${fmt}](${val})`,
  ensureIsArray: (val: any) =>
    val === null || val === undefined ? [] : Array.isArray(val) ? val : [val],
}));

import transformProps from '../src/plugin/transformProps';
import { HierarchicalTableChartProps } from '../src/types';

const records = [
  { sede: 'S1', mese: 'Gen', incassi: 100, totem: 40 },
  { sede: 'S1', mese: 'Feb', incassi: 200, totem: 60 },
  { sede: 'S2', mese: 'Gen', incassi: 50, totem: 10 },
];

const run = (extra: Record<string, unknown> = {}) => {
  const formData = {
    hierarchyType: 'multi_dimension',
    groupby: ['sede', 'mese'],
    metrics: ['incassi', 'totem'],
    metricsOnRows: true,
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

describe('transformProps with metrics on rows', () => {
  it('puts only the chosen metric on rows and keeps the others as columns', () => {
    const out = run({ metricsRowMetrics: ['totem'] });
    const keys = out.columns.filter(c => c.isMetric).map(c => c.key);
    expect(keys).toEqual(['incassi', '__value']);
    const s1 = out.data.find(n => n.name === 'S1')!;
    expect(s1.metrics.incassi).toBe(300);
    const gen = s1.children!.find(n => n.name === 'Gen')!;
    expect(gen.metrics.incassi).toBe(100);
    expect(gen.children!.map(r => [r.name, r.metrics.__value])).toEqual([['totem', 40]]);
  });

  it('puts every metric on rows when none is chosen', () => {
    const out = run();
    expect(out.columns.filter(c => c.isMetric).map(c => c.key)).toEqual(['__value']);
    const gen = out.data.find(n => n.name === 'S1')!.children!.find(n => n.name === 'Gen')!;
    expect(gen.children!.map(r => r.name)).toEqual(['incassi', 'totem']);
  });

  it('changes nothing when the switch is off', () => {
    const out = run({ metricsOnRows: false, metricsRowMetrics: ['totem'] });
    expect(out.columns.filter(c => c.isMetric).map(c => c.key)).toEqual(['incassi', 'totem']);
  });
});
