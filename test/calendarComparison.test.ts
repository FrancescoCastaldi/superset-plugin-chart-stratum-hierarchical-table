jest.mock('@superset-ui/core', () => ({
  getNumberFormatter: () => (val: any) => String(val),
  ensureIsArray: (val: any) => (Array.isArray(val) ? val : [val]),
}));

import { buildMultiDimensionTree } from '../src/utils/treeBuilder';
import {
  NATIVE_COMPARISON_SUFFIX,
  computeNativeTimeDelta,
  hasNativeComparison,
  nativeOffsetValue,
} from '../src/utils/timeComparison';
import { TreeNode } from '../src/types';

describe('Calendar filter comparison (native time offsets) in pivot tables', () => {
  describe('nativeOffsetValue', () => {
    it('reads the offset column of the metric', () => {
      expect(nativeOffsetValue({ totale: 10, 'totale__1 year ago': 7 }, 'totale')).toBe(7);
    });

    it('is undefined when the record has no offset column', () => {
      expect(nativeOffsetValue({ totale: 10 }, 'totale')).toBeUndefined();
    });

    it('is null when the offset column is empty', () => {
      expect(nativeOffsetValue({ totale: 10, 'totale__1 year ago': null }, 'totale')).toBeNull();
    });

    it('does not match another metric whose name starts with the same text', () => {
      expect(nativeOffsetValue({ totale: 10, 'totale_extra__1 year ago': 5 }, 'totale')).toBeUndefined();
    });
  });

  describe('tree baseline', () => {
    const records = [
      { presidio: 'Roma', mese: '2026-01', totale: 100, 'totale__1 year ago': 80 },
      { presidio: 'Roma', mese: '2026-02', totale: 150, 'totale__1 year ago': 120 },
      { presidio: 'Milano', mese: '2026-01', totale: 50, 'totale__1 year ago': 60 },
    ];

    it('stores the sum of the offsets of a row across the pivot values', () => {
      const tree = buildMultiDimensionTree(records, ['presidio'], ['totale'], ['mese']);
      const roma = tree.find(n => n.name === 'Roma') as TreeNode;
      const milano = tree.find(n => n.name === 'Milano') as TreeNode;
      expect(roma.metrics[`totale${NATIVE_COMPARISON_SUFFIX}`]).toBe(200);
      expect(milano.metrics[`totale${NATIVE_COMPARISON_SUFFIX}`]).toBe(60);
      expect(hasNativeComparison(tree, ['totale'])).toBe(true);
    });

    it('rolls the baseline up to the parent rows', () => {
      const nested = [
        { presidio: 'Roma', dip: 'Chirurgia', mese: '2026-01', totale: 100, 'totale__1 year ago': 80 },
        { presidio: 'Roma', dip: 'Medicina', mese: '2026-01', totale: 40, 'totale__1 year ago': 30 },
      ];
      const tree = buildMultiDimensionTree(nested, ['presidio', 'dip'], ['totale'], ['mese']);
      const roma = tree.find(n => n.name === 'Roma') as TreeNode;
      expect(roma.metrics[`totale${NATIVE_COMPARISON_SUFFIX}`]).toBe(110);
      expect(roma.metrics['totale___2026-01']).toBe(140);
    });

    it('counts the comparison of pivot values whose current value is empty', () => {
      const withEmptyCurrent = [
        { presidio: 'Roma', mese: '2026-01', totale: 100, 'totale__1 year ago': 80 },
        { presidio: 'Roma', mese: '2026-02', totale: null, 'totale__1 year ago': 30 },
      ];
      const tree = buildMultiDimensionTree(withEmptyCurrent, ['presidio'], ['totale'], ['mese']);
      const roma = tree.find(n => n.name === 'Roma') as TreeNode;
      expect(roma.metrics[`totale${NATIVE_COMPARISON_SUFFIX}`]).toBe(110);
      expect(roma.metrics['totale___2026-01']).toBe(100);
    });

    it('is absent when the records have no offset columns', () => {
      const plain = records.map(({ 'totale__1 year ago': _offset, ...rest }) => rest);
      const tree = buildMultiDimensionTree(plain, ['presidio'], ['totale'], ['mese']);
      expect(hasNativeComparison(tree, ['totale'])).toBe(false);
      expect(computeNativeTimeDelta(tree, ['totale'], ['2026-01', '2026-02'])).toBe(false);
    });
  });

  describe('computeNativeTimeDelta', () => {
    it('compares the current total of the row with its comparison baseline', () => {
      const tree = buildMultiDimensionTree(
        [
          { presidio: 'Roma', mese: '2026-01', totale: 100, 'totale__1 year ago': 80 },
          { presidio: 'Roma', mese: '2026-02', totale: 150, 'totale__1 year ago': 120 },
          { presidio: 'Milano', mese: '2026-01', totale: 50, 'totale__1 year ago': 60 },
        ],
        ['presidio'],
        ['totale'],
        ['mese'],
      );
      expect(computeNativeTimeDelta(tree, ['totale'], ['2026-01', '2026-02'])).toBe(true);
      const roma = tree.find(n => n.name === 'Roma') as TreeNode;
      const milano = tree.find(n => n.name === 'Milano') as TreeNode;
      // Roma: 250 against 200 -> +50, +25.0%
      expect(roma.metrics['totale___period_delta']).toBe(50);
      expect(roma.metrics['totale___period_delta_pct']).toBe(25);
      // Milano: 50 against 60 -> -10, -16.7%
      expect(milano.metrics['totale___period_delta']).toBe(-10);
      expect(milano.metrics['totale___period_delta_pct']).toBe(-16.7);
    });

    it('leaves the percentage empty when the baseline is zero', () => {
      const tree: TreeNode[] = [
        {
          key: 'A',
          id: 'A',
          name: 'A',
          dimension: 'presidio',
          depth: 0,
          path: ['A'],
          isLeaf: true,
          metrics: { [`totale___2026-01`]: 40, [`totale${NATIVE_COMPARISON_SUFFIX}`]: 0 },
          subtotals: {},
        } as TreeNode,
      ];
      computeNativeTimeDelta(tree, ['totale'], ['2026-01']);
      expect(tree[0].metrics['totale___period_delta']).toBe(40);
      expect(tree[0].metrics['totale___period_delta_pct']).toBeNull();
    });

    it('leaves the delta empty for a row without a baseline', () => {
      const tree: TreeNode[] = [
        {
          key: 'A',
          id: 'A',
          name: 'A',
          dimension: 'presidio',
          depth: 0,
          path: ['A'],
          isLeaf: true,
          metrics: { [`totale___2026-01`]: 40, [`totale${NATIVE_COMPARISON_SUFFIX}`]: 30 },
          subtotals: {},
        } as TreeNode,
        {
          key: 'B',
          id: 'B',
          name: 'B',
          dimension: 'presidio',
          depth: 0,
          path: ['B'],
          isLeaf: true,
          metrics: { [`totale___2026-01`]: 10 },
          subtotals: {},
        } as TreeNode,
      ];
      computeNativeTimeDelta(tree, ['totale'], ['2026-01']);
      expect(tree[0].metrics['totale___period_delta']).toBe(10);
      expect(tree[1].metrics['totale___period_delta']).toBeNull();
      expect(tree[1].metrics['totale___period_delta_pct']).toBeNull();
    });
  });
});
