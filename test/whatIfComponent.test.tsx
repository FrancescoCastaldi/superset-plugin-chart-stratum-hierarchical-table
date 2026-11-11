/**
 * @jest-environment jsdom
 */
jest.mock('@superset-ui/core', () => ({
  getNumberFormatter: (fmt: string) => (val: any) =>
    val === null || val === undefined ? '-' : `fmt[${fmt}](${val})`,
  ensureIsArray: (val: any) =>
    val === null || val === undefined ? [] : Array.isArray(val) ? val : [val],
}));

import React from 'react';
import { createRoot } from 'react-dom/client';
import { act, Simulate } from 'react-dom/test-utils';
import HierarchicalTable from '../src/components/HierarchicalTable';
import transformProps from '../src/plugin/transformProps';
import {
  rollupTreeMetrics,
  computeGrandTotal,
  computeHorizontalRowTotals,
} from '../src/utils/aggregations';
import * as timeMetricRegistry from '../src/utils/timeMetricRegistry';
import { TreeNode } from '../src/types';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('HierarchicalTable What-If & stateless time metrics (TDD)', () => {
  it('normalizes JSON metricDefinitions and ignores stale weightColumn when aggregationMode is not weighted_avg', () => {
    const rawRecords = [
      { gruppo: 'G1', sede: 'A', num: 100, den: 100, ratio: 1, alt: 10 },
      { gruppo: 'G1', sede: 'B', num: 200, den: 100, ratio: 2, alt: 30 },
    ];
    const formData = {
      slice_id: 91,
      groupby: ['gruppo', 'sede'],
      metrics: ['num', 'den', 'ratio', 'alt'],
      enableWhatIf: true,
      aggregationMode: 'avg',
      weightColumn: 'num',
      metricDefinitions: JSON.stringify([
        { metric: 'num', type: 'sum' },
        { metric: 'den', type: 'sum' },
        { metric: 'ratio', type: 'ratio', numerator: 'num', denominator: 'den' },
      ]),
      initialExpandDepth: 1,
    };

    const props = transformProps({
      width: 900,
      height: 500,
      formData,
      queriesData: [{ data: rawRecords }],
    } as any);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      expect(() => {
        act(() => root.render(<HierarchicalTable {...(props as any)} />));
      }).not.toThrow();

      const toggleBtn = container.querySelector('.whatif-title-btn') as HTMLButtonElement;
      expect(toggleBtn).not.toBeNull();
      act(() => {
        Simulate.click(toggleBtn);
      });

      const numberInputs = Array.from(
        container.querySelectorAll('.whatif-number-input'),
      ) as HTMLInputElement[];
      expect(numberInputs.length).toBeGreaterThan(0);

      // Adjust the first simulatable metric ('num') by +50% -> factor 1.5
      // New parent 'num' avg = (150 + 300) / 2 = 225, OR with explicit sum def (150 + 300 = 450),
      // while 'alt' has no definition -> MUST use 'avg' (20), NOT weighted_avg by 'num' (23.3)!
      expect(() => {
        act(() => {
          Simulate.change(numberInputs[0], { target: { value: '50' } as any });
        });
      }).not.toThrow();

      // Grand total cells: num = 450 (+50%), den = 200, ratio = 2,25 (+50%), alt = 20 (avg, not weighted_avg 23,3)
      const firstBodyCells = Array.from(container.querySelectorAll('tbody tr:first-child td')).map(
        td => (td.textContent || '').trim(),
      );
      expect(firstBodyCells[3]).toContain('2,25');
      expect(firstBodyCells[4]).toBe('20');
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });

  it('has no mutable global state in timeMetricRegistry and isolates two tables cleanly', () => {
    expect('setTimeMetricNames' in timeMetricRegistry).toBe(false);

    // Table 1: 'metrica_x' holds Time durations (detected only by values, neutral name without heuristics)
    transformProps({
      width: 800,
      height: 400,
      formData: { groupby: ['gruppo', 'sede'], metrics: ['metrica_x'] },
      queriesData: [
        {
          data: [
            { gruppo: 'G', sede: 'A', metrica_x: '00:10:00' },
            { gruppo: 'G', sede: 'B', metrica_x: '00:20:00' },
          ],
        },
      ],
    } as any);

    // Immediately call stateless rollup/total functions WITHOUT passing timeMetrics (simulating plain numeric Table 2)
    const numericTree: TreeNode[] = [
      {
        id: 'G',
        key: 'G',
        name: 'G',
        depth: 0,
        isLeaf: false,
        metrics: {},
        children: [
          {
            id: 'G>A',
            key: 'G>A',
            name: 'A',
            depth: 1,
            isLeaf: true,
            metrics: { metrica_x: 10, 'metrica_x___M1': 10, 'metrica_x___M2': 20 },
          },
          {
            id: 'G>B',
            key: 'G>B',
            name: 'B',
            depth: 1,
            isLeaf: true,
            metrics: { metrica_x: 20, 'metrica_x___M1': 20, 'metrica_x___M2': 40 },
          },
        ],
      },
    ];

    rollupTreeMetrics(numericTree, ['metrica_x'], 'sum');
    expect(numericTree[0].metrics.metrica_x).toBe(30);

    const gt = computeGrandTotal(numericTree, ['metrica_x'], 'sum');
    expect(gt.metrics.metrica_x).toBe(30);

    computeHorizontalRowTotals(numericTree, ['metrica_x'], ['M1', 'M2'], 'sum');
    expect(numericTree[0].children![0].metrics['metrica_x___ROW_TOTAL']).toBe(30);

    // Now verify passing an explicit timeMetrics Set activates duration averaging without polluting globals
    const timeTree: TreeNode[] = [
      {
        id: 'G',
        key: 'G',
        name: 'G',
        depth: 0,
        isLeaf: false,
        metrics: {},
        children: [
          {
            id: 'G>A',
            key: 'G>A',
            name: 'A',
            depth: 1,
            isLeaf: true,
            metrics: { metrica_x: 600, 'metrica_x___M1': 600, 'metrica_x___M2': 1200 },
          },
          {
            id: 'G>B',
            key: 'G>B',
            name: 'B',
            depth: 1,
            isLeaf: true,
            metrics: { metrica_x: 1200, 'metrica_x___M1': 1200, 'metrica_x___M2': 1800 },
          },
        ],
      },
    ];
    const timeSet = new Set(['metrica_x']);
    rollupTreeMetrics(timeTree, ['metrica_x'], 'sum', '', undefined, timeSet);
    expect(timeTree[0].metrics.metrica_x).toBe(900);
    const timeGt = computeGrandTotal(timeTree, ['metrica_x'], 'sum', '', timeSet);
    expect(timeGt.metrics.metrica_x).toBe(900);
    computeHorizontalRowTotals(timeTree, ['metrica_x'], ['M1', 'M2'], 'sum', undefined, '', timeSet);
    expect(timeTree[0].children![0].metrics['metrica_x___ROW_TOTAL']).toBe(900);
  });
});
