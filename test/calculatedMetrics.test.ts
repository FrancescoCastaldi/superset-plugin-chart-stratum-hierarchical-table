jest.mock('@superset-ui/core', () => ({
  buildQueryContext: (_formData: any, buildFn: any) => ({ queries: buildFn({}) }),
  getNumberFormatter: (fmt: string) => (val: any) => `fmt[${fmt}](${val})`,
  ensureIsArray: (val: any) =>
    val === null || val === undefined ? [] : Array.isArray(val) ? val : [val],
}));

import buildQuery from '../src/plugin/buildQuery';
import { resolveHiddenMetrics, resolveMetricDefinitions } from '../src/plugin/formDataOptions';
import transformProps from '../src/plugin/transformProps';
import { HierarchicalTableChartProps, HierarchicalTableFormData } from '../src/types';

const margine = {
  metric: 'margine',
  formula: '([ricavi] - [costi]) / [ricavi] * 100',
  label: 'Margine %',
  operands: ['costi'],
};

describe('resolveMetricDefinitions', () => {
  it('turns the rows of the calculated metrics control into formula definitions', () => {
    const defs = resolveMetricDefinitions({ calculatedMetrics: JSON.stringify([margine]) });
    expect(defs).toHaveLength(1);
    expect(defs[0]).toMatchObject({ metric: 'margine', type: 'formula', label: 'Margine %' });
  });

  it('keeps the JSON definition when both define the same name', () => {
    const defs = resolveMetricDefinitions({
      metricDefinitions: JSON.stringify([
        { metric: 'margine', type: 'formula', formula: 'ricavi' },
      ]),
      calculatedMetrics: JSON.stringify([margine, { metric: 'altro', formula: 'ricavi * 2' }]),
    });
    expect(defs.map(d => d.metric)).toEqual(['margine', 'altro']);
    expect(defs[0].formula).toBe('ricavi');
  });

  it('drops rows whose formula does not parse', () => {
    expect(
      resolveMetricDefinitions({
        calculatedMetrics: JSON.stringify([{ metric: 'x', formula: '1 +' }]),
      }),
    ).toEqual([]);
  });
});

describe('resolveHiddenMetrics', () => {
  it('lists the saved metrics the formulas cite and the chart does not show', () => {
    const fd = {
      calculatedMetrics: JSON.stringify([
        margine,
        { metric: 'b', formula: 'ricavi', operands: ['ricavi', 'costi'] },
      ]),
    };
    expect(resolveHiddenMetrics(fd, ['ricavi'])).toEqual(['costi']);
  });

  it('is empty without calculated metrics', () => {
    expect(resolveHiddenMetrics({}, ['ricavi'])).toEqual([]);
  });
});

describe('buildQuery with calculated metrics', () => {
  it('asks the query for the cited saved metrics that are not selected', () => {
    const formData = {
      datasource: '1__table',
      hierarchyType: 'multi_dimension',
      groupby: ['sede'],
      metrics: ['ricavi'],
      calculatedMetrics: JSON.stringify([margine]),
    } as unknown as HierarchicalTableFormData;
    const q = (buildQuery(formData) as any).queries[0];
    expect(q.metrics).toEqual(['ricavi', 'costi']);
  });

  it('does not duplicate a metric the chart already selects', () => {
    const formData = {
      datasource: '1__table',
      hierarchyType: 'multi_dimension',
      groupby: ['sede'],
      metrics: ['ricavi', { label: 'costi', expressionType: 'SQL', sqlExpression: 'SUM(c)' }],
      calculatedMetrics: JSON.stringify([margine]),
    } as unknown as HierarchicalTableFormData;
    const q = (buildQuery(formData) as any).queries[0];
    expect(q.metrics).toHaveLength(2);
  });
});

describe('transformProps with a hidden operand', () => {
  const records = [
    { sede: 'S1', ricavi: 100, costi: 70 },
    { sede: 'S2', ricavi: 300, costi: 150 },
  ];
  const run = () => {
    const formData = {
      hierarchyType: 'multi_dimension',
      groupby: ['sede'],
      metrics: ['ricavi'],
      calculatedMetrics: JSON.stringify([margine]),
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

  it('computes the formula from an operand the chart does not show', () => {
    const out = run();
    const s1 = out.data.find(n => n.name === 'S1')!;
    expect(s1.metrics.margine).toBeCloseTo(30);
    expect(out.grandTotalNode?.metrics.margine).toBeCloseTo(((400 - 220) / 400) * 100);
  });

  it('adds a column for the formula but none for the hidden operand', () => {
    const out = run();
    const keys = out.columns.map(c => c.key);
    expect(keys).toContain('margine');
    expect(keys).toContain('ricavi');
    expect(keys).not.toContain('costi');
  });
});
