jest.mock('@superset-ui/core', () => ({
  getNumberFormatter: () => (val: any) => String(val),
  ensureIsArray: (val: any) =>
    val === null || val === undefined ? [] : Array.isArray(val) ? val : [val],
}));

import {
  computeGrandTotal,
  rollupTreeMetrics,
  weightedAvgOnNode,
} from '../src/utils/aggregations';
import { resolveTransformOptions } from '../src/plugin/formDataOptions';
import { buildTreeData } from '../src/plugin/treeData';
import { buildGrandTotalNode } from '../src/plugin/grandTotal';
import controlPanel from '../src/plugin/controlPanel';
import { TreeNode } from '../src/types';

type Metrics = Record<string, number | string | null>;

const leaf = (key: string, metrics: Metrics): TreeNode => ({
  key,
  id: key,
  name: key,
  depth: 1,
  path: [key],
  isLeaf: true,
  metrics,
});

const parent = (key: string, children: TreeNode[]): TreeNode => ({
  key,
  id: key,
  name: key,
  depth: 0,
  path: [key],
  isLeaf: false,
  metrics: {},
  children,
});

const fixture = (weights: number[]): TreeNode =>
  parent('P', [
    leaf('a', { value: 10, w: weights[0] }),
    leaf('b', { value: 20, w: weights[1] }),
    leaf('c', { value: 30, w: weights[2] }),
  ]);

describe('weightedAvg aggregation', () => {
  it('weightedAvgOnNode returns sum(value*weight)/sum(weight) over the children', () => {
    const result = weightedAvgOnNode(fixture([1, 2, 3]), 'w', 'value');
    expect(result).toBeCloseTo(23.33, 2);
    expect(Math.round((result as number) * 100) / 100).toBe(23.33);
  });

  it('weighted_avg fallback zero: all-zero weights degrade to the arithmetic mean', () => {
    expect(weightedAvgOnNode(fixture([0, 0, 0]), 'w', 'value')).toBe(20);
  });

  it('weightedAvgOnNode returns null for a node without numeric child values', () => {
    expect(weightedAvgOnNode(leaf('x', { value: 5, w: 1 }), 'w', 'value')).toBeNull();
    expect(weightedAvgOnNode(parent('P', [leaf('a', { value: null, w: 1 })]), 'w', 'value')).toBeNull();
  });

  it('weightedAvg applies the pivot suffix of the metric to the weight key', () => {
    const node = parent('P', [
      leaf('a', { 'value___2024': 10, 'w___2024': 3, 'value___2025': 10, 'w___2025': 1 }),
      leaf('b', { 'value___2024': 20, 'w___2024': 1, 'value___2025': 20, 'w___2025': 3 }),
    ]);
    expect(weightedAvgOnNode(node, 'w', 'value___2024')).toBe(12.5);
    expect(weightedAvgOnNode(node, 'w', 'value___2025')).toBe(17.5);
  });

  it('weightedAvg rollup: explicit weightColumn overrides the rate heuristic and sums the weight', () => {
    const tree = [
      parent('A', [
        leaf('x', { richieste_corr: 100, pazienti: 1, acc_corr: 80 }),
        leaf('y', { richieste_corr: 300, pazienti: 3, acc_corr: 40 }),
      ]),
    ];
    rollupTreeMetrics(tree, ['richieste_corr', 'pazienti', 'acc_corr'], 'weighted_avg', 'pazienti');
    expect(tree[0].metrics.pazienti).toBe(4);
    expect(tree[0].subtotals?.pazienti).toBe(4);
    expect(tree[0].metrics.acc_corr).toBe(50);
    expect(tree[0].metrics.richieste_corr).toBe(250);
  });

  it('weightedAvg rollup carries summed weights up to the next level', () => {
    const tree = [
      parent('Root', [
        parent('A', [leaf('a1', { value: 10, w: 1 }), leaf('a2', { value: 20, w: 1 })]),
        leaf('B', { value: 40, w: 2 }),
      ]),
    ];
    rollupTreeMetrics(tree, ['value', 'w'], 'weighted_avg', 'w');
    const a = tree[0].children![0];
    expect(a.metrics.value).toBe(15);
    expect(a.metrics.w).toBe(2);
    expect(tree[0].metrics.value).toBe(27.5);
    expect(tree[0].metrics.w).toBe(4);
  });

  it('weighted_avg fallback zero in the rollup and keeps derived metrics recomputed', () => {
    const tree = [
      parent('A', [
        leaf('x', { ricoveri: 10, ricoveri_conf: 5, w: 0, delta_ricoveri_pct: null }),
        leaf('y', { ricoveri: 30, ricoveri_conf: 15, w: 0, delta_ricoveri_pct: null }),
      ]),
    ];
    rollupTreeMetrics(tree, ['ricoveri', 'ricoveri_conf', 'w', 'delta_ricoveri_pct'], 'weighted_avg', 'w');
    expect(tree[0].metrics.ricoveri).toBe(20);
    expect(tree[0].metrics.ricoveri_conf).toBe(10);
    expect(tree[0].metrics.w).toBe(0);
    expect(tree[0].metrics.delta_ricoveri_pct).toBe(100);
  });

  it('weightedAvg without a weightColumn keeps the pre-existing heuristic path', () => {
    const tree = [
      parent('A', [
        leaf('x', { richieste_corr: 100, acc_corr: 80 }),
        leaf('y', { richieste_corr: 300, acc_corr: 60 }),
      ]),
    ];
    rollupTreeMetrics(tree, ['richieste_corr', 'acc_corr'], 'weighted_avg', '');
    expect(tree[0].metrics.richieste_corr).toBe(400);
    expect(tree[0].metrics.acc_corr).toBe(65);
  });

  it('weightedAvg grand total uses the explicit weight over the roots', () => {
    const roots = [
      leaf('a', { value: 10, w: 1, acc_corr: 80, richieste_corr: 300 }),
      leaf('b', { value: 20, w: 2, acc_corr: 60, richieste_corr: 100 }),
      leaf('c', { value: 30, w: 3, acc_corr: 40, richieste_corr: 100 }),
    ];
    const gt = computeGrandTotal(roots, ['value', 'w', 'acc_corr', 'richieste_corr'], 'weighted_avg', 'w');
    expect(gt.metrics.value).toBeCloseTo(23.33, 2);
    expect(gt.metrics.w).toBe(6);
    expect(gt.metrics.acc_corr).toBeCloseTo(53.33, 2);

    const heuristic = computeGrandTotal(roots, ['value', 'w', 'acc_corr', 'richieste_corr']);
    expect(heuristic.metrics.value).toBe(60);
    expect(heuristic.metrics.acc_corr).toBe(68);
  });

  it('weighted_avg fallback zero in the grand total', () => {
    const gt = computeGrandTotal(
      [leaf('a', { value: 10, w: 0 }), leaf('b', { value: 20, w: 0 }), leaf('c', { value: 30, w: 0 })],
      ['value', 'w'],
      'weighted_avg',
      'w',
    );
    expect(gt.metrics.value).toBe(20);
    expect(gt.metrics.w).toBe(0);
  });
});

describe('weightedAvg transform pipeline', () => {
  const records = [
    { area: 'Nord', presidio: 'Milano', prezzo: 10, qty: 1 },
    { area: 'Nord', presidio: 'Torino', prezzo: 20, qty: 2 },
    { area: 'Sud', presidio: 'Napoli', prezzo: 30, qty: 3 },
  ];
  const formData = { groupby: ['area', 'presidio'], metrics: ['prezzo', 'qty'] };

  it('resolves weightColumn only when aggregationMode is weighted_avg', () => {
    expect(resolveTransformOptions({}).weightColumn).toBe('');
    expect(resolveTransformOptions({ aggregationMode: 'sum', weightColumn: 'qty' }).weightColumn).toBe('');
    expect(
      resolveTransformOptions({ aggregationMode: 'weighted_avg', weightColumn: ' qty ' }).weightColumn,
    ).toBe('qty');
  });

  it('weightedAvg flows through buildTreeData and buildGrandTotalNode', () => {
    const options = resolveTransformOptions({ ...formData, aggregationMode: 'weighted_avg', weightColumn: 'qty' });
    const { treeData, metrics } = buildTreeData(records, options);
    const nord = treeData.find(n => n.name === 'Nord')!;
    expect(nord.metrics.prezzo).toBeCloseTo(16.67, 2);
    expect(nord.metrics.qty).toBe(3);

    const gt = buildGrandTotalNode({
      treeData,
      records,
      metrics,
      metricKeys: metrics,
      showGrandTotal: true,
      isPivotMode: false,
      pivotDimensions: [],
      pivotTimeDeltaMode: 'none',
      pivotTimeDeltaLag: 1,
      weightColumn: options.weightColumn,
    })!;
    expect(gt.metrics.prezzo).toBeCloseTo(23.33, 2);
    expect(gt.metrics.qty).toBe(6);
  });

  it('the weight metric is ignored by the other aggregation modes, which apply their own function', () => {
    const base = { ...formData, weightColumn: 'qty' };
    const prezzo = (aggregationMode: string) =>
      buildTreeData(records, resolveTransformOptions({ ...base, aggregationMode })).treeData.find(
        n => n.name === 'Nord',
      )!.metrics.prezzo;
    expect(prezzo('sum')).toBe(30);
    expect(prezzo('avg')).toBe(15);
    expect(prezzo('min')).toBe(10);
    expect(prezzo('max')).toBe(20);
  });
});

describe('weightColumn control', () => {
  type Row = unknown[];
  const findControl = (name: string): any =>
    (controlPanel.controlPanelSections as { controlSetRows: Row[] }[])
      .flatMap(s => s.controlSetRows.flat())
      .find((item: any) => item && typeof item === 'object' && item.name === name);

  it('is a metric selector visible only when aggregationMode is weighted_avg', () => {
    const control = findControl('weightColumn');
    expect(control).toBeDefined();
    expect(control.config.type).toBe('SelectControl');
    expect(control.config.freeForm).toBe(true);
    expect(
      control.config.mapStateToProps({ controls: { metrics: { value: ['prezzo', 'qty'] } } }).choices,
    ).toEqual([
      ['prezzo', 'prezzo'],
      ['qty', 'qty'],
    ]);
    const visible = (value: unknown) =>
      control.config.visibility({ controls: { aggregationMode: { value } } });
    expect(visible('weighted_avg')).toBe(true);
    expect(visible('sum')).toBe(false);
    expect(visible('avg')).toBe(false);
    expect(visible(undefined)).toBe(false);
  });
});
