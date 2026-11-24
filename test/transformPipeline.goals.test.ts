jest.mock('@superset-ui/core', () => ({
  getNumberFormatter: () => (val: any) => String(val),
  ensureIsArray: (val: any) =>
    val === null || val === undefined ? [] : Array.isArray(val) ? val : [val],
}));

import { resolveTransformOptions } from '../src/plugin/formDataOptions';
import transformProps from '../src/plugin/transformProps';
import { computeGoalDelta, formatGoalDelta, normalizeGoals } from '../src/utils/goalBenchmark';
import { buildColumnMetaMap } from '../src/utils/tableColumns';
import { HierarchicalTableChartProps, MetricGoal, TableColumn } from '../src/types';

const higher = (target: number): MetricGoal => ({
  metricKey: 'ricavi',
  target,
  direction: 'higher_is_better',
});
const lower = (target: number): MetricGoal => ({
  metricKey: 'costi',
  target,
  direction: 'lower_is_better',
});

describe('computeGoalDelta', () => {
  it('returns the absolute delta, the percentage delta and the status', () => {
    expect(computeGoalDelta(110, higher(100))).toEqual({
      deltaAbsolute: 10,
      deltaPct: 10,
      status: 'achieved',
    });
    const result = computeGoalDelta(80, higher(200));
    expect(result.deltaAbsolute).toBe(-120);
    expect(result.deltaPct).toBe(-60);
    expect(result.status).toBe('missed');
  });

  it('keeps the signed delta relative to the target for lower_is_better goals', () => {
    expect(computeGoalDelta(80, lower(100))).toEqual({
      deltaAbsolute: -20,
      deltaPct: -20,
      status: 'achieved',
    });
  });

  it('formats the comparison as a signed percentage, or an absolute gap for zero targets', () => {
    expect(formatGoalDelta(computeGoalDelta(110, higher(100)))).toBe('+10,0%');
    expect(formatGoalDelta(computeGoalDelta(80, lower(100)))).toBe('-20,0%');
    expect(formatGoalDelta(computeGoalDelta(-3, higher(0)))).toBe('-3');
    expect(formatGoalDelta(computeGoalDelta(5, lower(0)), v => `${v} EUR`)).toBe('+5 EUR');
  });
});

describe('goal direction', () => {
  it('higher_is_better: 110 against a target of 100 is achieved', () => {
    expect(computeGoalDelta(110, higher(100)).status).toBe('achieved');
    expect(computeGoalDelta(80, higher(100)).status).toBe('at_risk');
  });

  it('lower_is_better: 80 against a target of 100 is achieved', () => {
    expect(computeGoalDelta(80, lower(100)).status).toBe('achieved');
    expect(computeGoalDelta(110, lower(100)).status).toBe('on_track');
  });
});

describe('goal thresholds', () => {
  it.each([
    [110, 'achieved'],
    [95, 'on_track'],
    [80, 'at_risk'],
    [50, 'missed'],
  ])('higher_is_better attainment %d%% maps to %s', (actual, status) => {
    expect(computeGoalDelta(actual, higher(100)).status).toBe(status);
  });

  it.each([
    [110, 'achieved'],
    [95, 'on_track'],
    [80, 'at_risk'],
    [50, 'missed'],
  ])('lower_is_better attainment %d%% maps to %s', (target, status) => {
    expect(computeGoalDelta(100, lower(target)).status).toBe(status);
  });

  it('includes the lower bound of every band', () => {
    expect(computeGoalDelta(100, higher(100)).status).toBe('achieved');
    expect(computeGoalDelta(90, higher(100)).status).toBe('on_track');
    expect(computeGoalDelta(75, higher(100)).status).toBe('at_risk');
    expect(computeGoalDelta(74.99, higher(100)).status).toBe('missed');
  });
});

describe('goal zero edge cases', () => {
  it('higher_is_better with a zero target: achieved when actual >= 0, missed otherwise', () => {
    expect(computeGoalDelta(0, higher(0)).status).toBe('achieved');
    expect(computeGoalDelta(12, higher(0)).status).toBe('achieved');
    const negative = computeGoalDelta(-3, higher(0));
    expect(negative.status).toBe('missed');
    expect(negative.deltaAbsolute).toBe(-3);
    expect(negative.deltaPct).toBeNull();
  });

  it('lower_is_better with a zero actual value is achieved', () => {
    const result = computeGoalDelta(0, lower(50));
    expect(result.status).toBe('achieved');
    expect(result.deltaPct).toBe(-100);
  });

  it('lower_is_better with a zero target: achieved when actual <= 0, missed otherwise', () => {
    expect(computeGoalDelta(0, lower(0)).status).toBe('achieved');
    expect(computeGoalDelta(-1, lower(0)).status).toBe('achieved');
    const over = computeGoalDelta(5, lower(0));
    expect(over.status).toBe('missed');
    expect(over.deltaPct).toBeNull();
    expect(Number.isFinite(over.deltaAbsolute)).toBe(true);
  });
});

describe('goal pipeline', () => {
  it('resolves goals from the JSON text control and from an array', () => {
    const json = JSON.stringify([
      { metricKey: 'ricavi', target: 1000, direction: 'higher_is_better' },
      { metricKey: 'costi', target: '250.5', direction: 'lower_is_better' },
    ]);
    expect(resolveTransformOptions({ goals: json }).goals).toEqual([
      { metricKey: 'ricavi', target: 1000, direction: 'higher_is_better' },
      { metricKey: 'costi', target: 250.5, direction: 'lower_is_better' },
    ]);
    expect(resolveTransformOptions({ goals: [higher(10)] }).goals).toEqual([higher(10)]);
    expect(resolveTransformOptions({}).goals).toEqual([]);
  });

  it('drops malformed goal entries and defaults a missing direction to higher_is_better', () => {
    expect(
      normalizeGoals([
        { metricKey: 'a', target: 1 },
        { metricKey: '', target: 1, direction: 'higher_is_better' },
        { metricKey: 'b', target: 'abc', direction: 'higher_is_better' },
        { metricKey: 'c', target: 5, direction: 'sideways' },
        null,
      ]),
    ).toEqual([{ metricKey: 'a', target: 1, direction: 'higher_is_better' }]);
    expect(normalizeGoals('not json')).toEqual([]);
    expect(normalizeGoals('')).toEqual([]);
    expect(normalizeGoals('{"metricKey":"a"}')).toEqual([]);
  });

  it('attaches each goal to the metric columns it benchmarks', () => {
    const columns: TableColumn[] = [
      { key: 'ricavi', title: 'ricavi', dataIndex: 'ricavi', isMetric: true },
      { key: 'ricavi___2026', title: 'ricavi', dataIndex: 'ricavi___2026', isMetric: true, pivotValue: '2026', baseMetric: 'ricavi' },
      { key: 'ricavi___delta___2026', title: 'Delta', dataIndex: 'ricavi___delta___2026', isMetric: true, pivotValue: '2026', baseMetric: 'ricavi Delta' },
      { key: 'ricavi___ROW_TOTAL', title: 'ricavi', dataIndex: 'ricavi___ROW_TOTAL', isMetric: true, baseMetric: 'Totals ricavi' },
      { key: 'costi', title: 'costi', dataIndex: 'costi', isMetric: true },
    ];
    const map = buildColumnMetaMap(columns, [higher(100)]);
    expect(map.get('ricavi')?.goal).toEqual(higher(100));
    expect(map.get('ricavi___2026')?.goal).toEqual(higher(100));
    expect(map.get('ricavi___delta___2026')?.goal).toBeUndefined();
    expect(map.get('ricavi___ROW_TOTAL')?.goal).toBeUndefined();
    expect(map.get('costi')?.goal).toBeUndefined();
  });

  it('passes resolved goals to the component props only when configured', () => {
    const build = (formData: any) =>
      transformProps({
        width: 400,
        height: 300,
        formData: { groupby: ['area'], metrics: ['ricavi'], ...formData },
        queriesData: [{ data: [{ area: 'Nord', ricavi: 120 }] }],
      } as unknown as HierarchicalTableChartProps);

    expect(build({ goals: [higher(100)] }).goals).toEqual([higher(100)]);
    expect(build({})).not.toHaveProperty('goals');
  });
});
