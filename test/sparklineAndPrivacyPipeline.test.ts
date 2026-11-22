jest.mock('@superset-ui/core', () => ({
  getNumberFormatter: (fmt: string) => (val: any) => `fmt[${fmt}](${val})`,
  ensureIsArray: (val: any) =>
    val === null || val === undefined ? [] : Array.isArray(val) ? val : [val],
}));

import { computeSparkline, sparklineTrend } from '../src/components/Sparkline';
import transformProps from '../src/plugin/transformProps';
import { HierarchicalTableChartProps } from '../src/types';
import { buildCsvRows } from '../src/utils/csvExport';

const run = (extra: Record<string, unknown>, data: Array<Record<string, unknown>>) => {
  const formData = {
    hierarchyType: 'multi_dimension',
    groupby: ['asl', 'distretto'],
    columns: ['mese'],
    metrics: ['casi', 'popolazione'],
    ...extra,
  };
  return transformProps({
    width: 800,
    height: 600,
    formData,
    rawFormData: formData,
    queriesData: [{ data }],
    hooks: {},
  } as unknown as HierarchicalTableChartProps);
};

const months = ['Gennaio', 'Febbraio', 'Marzo'];
const rows = (casi: Record<string, number[]>) =>
  Object.entries(casi).flatMap(([distretto, values]) =>
    values.map((v, i) => ({ asl: 'ASL1', distretto, mese: months[i], casi: v, popolazione: 1000 })),
  );

describe('computeSparkline', () => {
  it('scales between min and max and keeps the last point', () => {
    const { runs, last } = computeSparkline([0, 10, 5], 100, 20, 0);
    expect(runs).toEqual(['0,20 50,0 100,10']);
    expect(last).toEqual({ x: 100, y: 10 });
  });

  it('splits the line at gaps, centres a flat series and handles empty input', () => {
    expect(computeSparkline([1, null, 3], 100, 20, 0).runs).toHaveLength(2);
    expect(computeSparkline([4, 4], 100, 20, 0).runs).toEqual(['0,10 100,10']);
    expect(computeSparkline([null, null], 100, 20)).toEqual({ runs: [], last: null });
    expect(computeSparkline([7], 100, 20).runs).toEqual(['50,10']);
  });

  it('reads the trend from the first to the last value', () => {
    expect(sparklineTrend([1, 5, 9])).toBe('up');
    expect(sparklineTrend([9, 5, 1])).toBe('down');
    expect(sparklineTrend([3, 9, 3])).toBe('flat');
    expect(sparklineTrend([null, 3])).toBe('flat');
  });
});

describe('sparkline columns', () => {
  const data = rows({ Nord: [10, 20, 30], Sud: [5, 5, 5] });

  it('adds a Trend column per metric in calendar order when enabled', () => {
    const out = run({ showSparklines: true, sparklineMetrics: 'casi' }, data);
    const trend = out.columns.filter(c => c.sparkline);
    expect(trend).toHaveLength(1);
    expect(trend[0].sparkline).toEqual({ metric: 'casi', periods: ['Gennaio', 'Febbraio', 'Marzo'] });
    expect(out.pivotHeaderGroups!.some(g => g.title === 'Andamento' && g.colSpan === 1)).toBe(true);
  });

  it('adds none by default or without exactly one pivot dimension', () => {
    expect(run({}, data).columns.some(c => c.sparkline)).toBe(false);
    expect(run({ showSparklines: true, columns: [] }, data).columns.some(c => c.sparkline)).toBe(false);
  });
});

describe('suppression and intervals through transformProps', () => {
  const defs = JSON.stringify([
    { metric: 'casi', type: 'sum' },
    { metric: 'popolazione', type: 'sum' },
    { metric: 'tasso', type: 'ratio', numerator: 'casi', denominator: 'popolazione', scale: 1000, ci: 'poisson' },
  ]);
  const data = rows({ Nord: [30, 40, 50], Sud: [2, 40, 60], Centro: [20, 20, 20] });

  it('hides small counts, their rates and the interval, and exports the label', () => {
    const out = run(
      {
        metrics: ['casi', 'popolazione', 'tasso'],
        metricDefinitions: defs,
        suppressionThreshold: 5,
        suppressionMetrics: 'casi',
        groupby: ['distretto'],
      },
      data.map(r => ({ ...r, tasso: 0 })),
    );
    const sud = out.data.find(n => n.name === 'Sud')!;
    expect(sud.metrics['casi___Gennaio']).toBeNull();
    expect(sud.suppressed!['casi___Gennaio']).toBe('<5');
    expect(sud.metrics['tasso___Gennaio']).toBeNull();
    expect(sud.intervals?.['tasso___Gennaio']).toBeUndefined();
    // Complementary: the smallest visible sibling of that column is hidden as well.
    const centro = out.data.find(n => n.name === 'Centro')!;
    expect(centro.suppressed!['casi___Gennaio']).toBe('<5');
    expect(out.data.find(n => n.name === 'Nord')!.metrics['casi___Gennaio']).toBe(30);
    expect(out.grandTotalNode!.metrics['casi___Gennaio']).toBe(52);

    const csv = buildCsvRows({
      columns: out.columns,
      displayCols: out.columns.slice(1),
      nodes: out.data,
      displayMode: 'all',
      showGrandTotal: false,
      grandTotalPosition: 'top',
    });
    const col = out.columns.slice(1).findIndex(c => c.key === 'casi___Gennaio') + 1;
    expect(col).toBeGreaterThan(0);
    expect(csv.find(r => r[0].trim() === 'Sud')![col]).toBe('<5');
  });

  it('computes intervals and the significance signal against the parent', () => {
    const out = run(
      { metrics: ['casi', 'popolazione', 'tasso'], metricDefinitions: defs, groupby: ['asl', 'distretto'] },
      data.map(r => ({ ...r, tasso: 0 })),
    );
    const asl = out.data[0];
    const sud = asl.children!.find(n => n.name === 'Sud')!;
    const nord = asl.children!.find(n => n.name === 'Nord')!;
    const centro = asl.children!.find(n => n.name === 'Centro')!;
    expect(sud.intervals!['tasso___Marzo'].signal).toBe('above');
    expect(centro.intervals!['tasso___Gennaio'].signal).toBeUndefined();
    expect(nord.intervals!['tasso___Gennaio'].signal).toBe('above');
    expect(asl.intervals!['tasso___Marzo'].lower).toBeLessThan(asl.metrics['tasso___Marzo'] as number);
  });
});
