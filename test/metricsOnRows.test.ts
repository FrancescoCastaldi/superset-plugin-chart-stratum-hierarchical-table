import { TableColumn, TreeNode } from '../src/types';
import {
  METRIC_VALUE_KEY,
  MetricsOnRowsOptions,
  pivotMetricsToRows,
} from '../src/utils/metricsOnRows';

const node = (
  key: string,
  name: string,
  depth: number,
  metrics: Record<string, number | null>,
  children?: TreeNode[],
): TreeNode => ({
  key,
  id: key,
  name,
  depth,
  path: [name],
  isLeaf: !children || children.length === 0,
  children,
  metrics,
});

const column = (key: string, title = key, extra: Partial<TableColumn> = {}): TableColumn => ({
  key,
  title,
  dataIndex: key,
  isMetric: true,
  ...extra,
});

const hierarchyColumn: TableColumn = {
  key: 'hierarchy',
  title: 'Struttura',
  dataIndex: 'hierarchy',
  isMetric: false,
  isHierarchyDimension: true,
};

// Sede S1 con ambulatori A e B, sede S2 con A. Valori flat: ricavi, costi.
function flatTree(): TreeNode[] {
  const s1a = node('S1/A', 'A', 1, { ricavi: 100, costi: 70 });
  const s1b = node('S1/B', 'B', 1, { ricavi: 300, costi: 150 });
  const s2a = node('S2/A', 'A', 1, { ricavi: 200, costi: 100 });
  return [
    node('S1', 'S1', 0, { ricavi: 400, costi: 220 }, [s1a, s1b]),
    node('S2', 'S2', 0, { ricavi: 200, costi: 100 }, [s2a]),
  ];
}

const base = (extra: Partial<MetricsOnRowsOptions> = {}): MetricsOnRowsOptions => ({
  metrics: ['ricavi', 'costi'],
  position: 2,
  dimensionCount: 2,
  subtotals: true,
  valueLabel: 'Valore',
  labelFor: m => (m === 'costi' ? 'Costi' : 'Ricavi'),
  grandTotalLabel: 'Totale',
  grandTotalPosition: 'bottom',
  ...extra,
});

describe('pivotMetricsToRows, flat, metric after the last level', () => {
  it('puts a metric row under each leaf, with the leaf values', () => {
    const out = pivotMetricsToRows(
      flatTree(),
      [hierarchyColumn, column('ricavi'), column('costi')],
      base(),
    );
    const s1 = out.data.find(n => n.name === 'S1')!;
    const a = s1.children!.find(n => n.name === 'A')!;
    expect(a.valueless).toBe(true);
    const rows = a.children!;
    expect(rows.map(r => r.name)).toEqual(['Ricavi', 'Costi']);
    expect(rows[0].metrics[METRIC_VALUE_KEY]).toBe(100);
    expect(rows[1].metrics[METRIC_VALUE_KEY]).toBe(70);
    expect(rows[0].metricRow).toEqual({ metric: 'ricavi', label: 'Ricavi', subtotal: true });
  });

  it('puts subtotal metric rows first on the upper level, with the node values', () => {
    const out = pivotMetricsToRows(
      flatTree(),
      [hierarchyColumn, column('ricavi'), column('costi')],
      base(),
    );
    const s1 = out.data.find(n => n.name === 'S1')!;
    expect(s1.children!.map(n => n.name)).toEqual(['Ricavi', 'Costi', 'A', 'B']);
    expect(s1.children![0].metrics[METRIC_VALUE_KEY]).toBe(400);
  });

  it('leaves out the upper subtotals when they are off', () => {
    const out = pivotMetricsToRows(
      flatTree(),
      [hierarchyColumn, column('ricavi'), column('costi')],
      base({ subtotals: false }),
    );
    const s1 = out.data.find(n => n.name === 'S1')!;
    expect(s1.children!.map(n => n.name)).toEqual(['A', 'B']);
  });

  it('adds a Totale node with the metric rows at the bottom, and drops the grand total row', () => {
    const out = pivotMetricsToRows(
      flatTree(),
      [hierarchyColumn, column('ricavi'), column('costi')],
      base({ grandTotal: node('total', 'total', 0, { ricavi: 600, costi: 320 }) }),
    );
    const last = out.data[out.data.length - 1];
    expect(last.name).toBe('Totale');
    expect(last.children!.map(n => n.metrics[METRIC_VALUE_KEY])).toEqual([600, 320]);
  });

  it('places the Totale node at the top when asked', () => {
    const out = pivotMetricsToRows(
      flatTree(),
      [hierarchyColumn, column('ricavi'), column('costi')],
      base({
        grandTotal: node('total', 'total', 0, { ricavi: 600, costi: 320 }),
        grandTotalPosition: 'top',
      }),
    );
    expect(out.data[0].name).toBe('Totale');
  });

  it('gives unique keys to every row, even when the same metric repeats under each leaf', () => {
    const out = pivotMetricsToRows(
      flatTree(),
      [hierarchyColumn, column('ricavi'), column('costi')],
      base(),
    );
    const keys: string[] = [];
    const walk = (nodes: TreeNode[]) =>
      nodes.forEach(n => {
        keys.push(n.key);
        if (n.children) walk(n.children);
      });
    walk(out.data);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps the value column unique and titled with the value label', () => {
    const out = pivotMetricsToRows(
      flatTree(),
      [hierarchyColumn, column('ricavi'), column('costi')],
      base(),
    );
    const valueColumns = out.columns.filter(c => c.isMetric);
    expect(valueColumns).toHaveLength(1);
    expect(valueColumns[0].key).toBe(METRIC_VALUE_KEY);
    expect(valueColumns[0].title).toBe('Valore');
    expect(out.columns[0].key).toBe('hierarchy');
  });

  it('keeps the formatter of each metric for its own rows', () => {
    const fmtRicavi = (v: any) => `R${v}`;
    const fmtCosti = (v: any) => `C${v}`;
    const out = pivotMetricsToRows(
      flatTree(),
      [
        hierarchyColumn,
        column('ricavi', 'ricavi', { formatter: fmtRicavi }),
        column('costi', 'costi', { formatter: fmtCosti }),
      ],
      base(),
    );
    const valueColumn = out.columns.find(c => c.key === METRIC_VALUE_KEY)!;
    expect(valueColumn.perMetric!.ricavi.formatter!(1)).toBe('R1');
    expect(valueColumn.perMetric!.costi.formatter!(1)).toBe('C1');
  });
});

describe('pivotMetricsToRows, pivot periods', () => {
  it('makes one column per period and reads each metric per period', () => {
    const leaf = node('S1/A', 'A', 1, {
      ricavi___Gen: 10,
      ricavi___Feb: 20,
      costi___Gen: 4,
      costi___Feb: 8,
    });
    const parent = node(
      'S1',
      'S1',
      0,
      { ricavi___Gen: 10, ricavi___Feb: 20, costi___Gen: 4, costi___Feb: 8 },
      [leaf],
    );
    const columns = [
      hierarchyColumn,
      column('ricavi___Gen', 'Gen', { baseMetric: 'ricavi' }),
      column('ricavi___Feb', 'Feb', { baseMetric: 'ricavi' }),
      column('costi___Gen', 'Gen', { baseMetric: 'costi' }),
      column('costi___Feb', 'Feb', { baseMetric: 'costi' }),
    ];
    const out = pivotMetricsToRows([parent], columns, base({ position: 2, dimensionCount: 1 }));
    expect(out.columns.filter(c => c.isMetric).map(c => c.key)).toEqual(['___Gen', '___Feb']);
    const rows = out.data[0].children!.filter(c => c.metricRow);
    expect(rows.map(r => r.name)).toEqual(['Ricavi', 'Costi']);
    expect(rows[1].children ?? []).toEqual([]);
    expect(
      out.data[0].children!.find(c => c.name === 'A')!.children!.map(c => c.metrics['___Gen']),
    ).toEqual([10, 4]);
  });
});

describe('pivotMetricsToRows, metric level at the top', () => {
  it('makes each metric a root that holds the whole tree, with the grand total as values', () => {
    const out = pivotMetricsToRows(
      flatTree(),
      [hierarchyColumn, column('ricavi'), column('costi')],
      base({ position: 0, grandTotal: node('total', 'total', 0, { ricavi: 600, costi: 320 }) }),
    );
    expect(out.data.map(n => n.name)).toEqual(['Ricavi', 'Costi']);
    expect(out.data[0].metrics[METRIC_VALUE_KEY]).toBe(600);
    const s1 = out.data[0].children!.find(n => n.name === 'S1')!;
    expect(s1.metrics[METRIC_VALUE_KEY]).toBe(400);
    expect(out.data.some(n => n.name === 'Totale')).toBe(false);
  });
});

describe('pivotMetricsToRows, metric level in the middle', () => {
  it('repeats the lower levels under each metric row, with that metric values', () => {
    const out = pivotMetricsToRows(
      flatTree(),
      [hierarchyColumn, column('ricavi'), column('costi')],
      base({ position: 1 }),
    );
    const s1 = out.data.find(n => n.name === 'S1')!;
    expect(s1.children!.map(n => n.name)).toEqual(['Ricavi', 'Costi']);
    const ricaviRow = s1.children![0];
    expect(ricaviRow.metrics[METRIC_VALUE_KEY]).toBe(400);
    expect(ricaviRow.children!.map(n => n.name)).toEqual(['A', 'B']);
    expect(ricaviRow.children![1].metrics[METRIC_VALUE_KEY]).toBe(300);
    const costiRow = s1.children![1];
    expect(costiRow.children![1].metrics[METRIC_VALUE_KEY]).toBe(150);
    expect(ricaviRow.children![0].key).not.toBe(costiRow.children![0].key);
  });
});

describe('pivotMetricsToRows, no metric columns', () => {
  it('leaves the tree alone', () => {
    const tree = flatTree();
    const out = pivotMetricsToRows(tree, [hierarchyColumn], base({ metrics: [] }));
    expect(out.data).toBe(tree);
  });
});
