jest.mock('@superset-ui/core', () => ({
  getNumberFormatter: () => (val: any) => String(val),
  ensureIsArray: (val: any) =>
    val === null || val === undefined ? [] : Array.isArray(val) ? val : [val],
}));

import transformProps from '../src/plugin/transformProps';
import {
  computePairedDeltas,
  resolveComparisonFormats,
} from '../src/plugin/pairedComparison';
import { TableColumn, TreeNode } from '../src/types';

const OFFSET = '1 year ago';

/** Weekday pivot, 2026 against 2025: the comparison of Monday is the Monday of the offset. */
const weekdayRecords = [
  { sede: 'A', giorno: 'Lunedì', visite: 120, [`visite__${OFFSET}`]: 100 },
  { sede: 'A', giorno: 'Martedì', visite: 80, [`visite__${OFFSET}`]: 100 },
  { sede: 'B', giorno: 'Lunedì', visite: 50, [`visite__${OFFSET}`]: 0 },
  { sede: 'B', giorno: 'Martedì', visite: null, [`visite__${OFFSET}`]: 40 },
];

function run(formData: Record<string, unknown>, records: Record<string, unknown>[]) {
  return transformProps({
    width: 800,
    height: 400,
    formData: {
      hierarchyType: 'multi_dimension',
      groupby: ['sede'],
      metrics: ['visite'],
      ...formData,
    },
    rawFormData: {},
    queriesData: [{ data: records }],
    hooks: {},
    filterState: {},
  } as any);
}

const keys = (columns: TableColumn[]) => columns.map(c => c.key);
const row = (data: TreeNode[], name: string) => data.find(n => n.name === name) as TreeNode;

describe('paired calendar comparison', () => {
  describe('computePairedDeltas', () => {
    it('gives every format from the current value and the comparison', () => {
      expect(computePairedDeltas(120, 100)).toEqual({ abs: 20, pct: 20, pp: 20, ratio: 1.2 });
      expect(computePairedDeltas(80, 100)).toEqual({ abs: -20, pct: -20, pp: -20, ratio: 0.8 });
    });

    it('marks a positive value over a zero comparison as new, with no ratio', () => {
      expect(computePairedDeltas(50, 0)).toEqual({ abs: 50, pct: 'Nuovo', pp: 50, ratio: null });
      expect(computePairedDeltas(0, 0)).toEqual({ abs: 0, pct: 0, pp: 0, ratio: null });
    });

    it('gives no delta when one side is missing', () => {
      expect(computePairedDeltas(null, 40)).toEqual({ abs: null, pct: null, pp: null, ratio: null });
      expect(computePairedDeltas(40, undefined)).toEqual({ abs: null, pct: null, pp: null, ratio: null });
    });

    it('uses the size of a negative comparison to give the sign of the change', () => {
      expect(computePairedDeltas(-50, -100).pct).toBe(50);
    });
  });

  describe('resolveComparisonFormats', () => {
    it('keeps the column order whatever the order of the selection', () => {
      expect(resolveComparisonFormats(['ratio', 'abs'], ['pct'])).toEqual(['abs', 'ratio']);
    });

    it('falls back when the chart never chose, and honours an empty choice', () => {
      expect(resolveComparisonFormats(undefined, ['pct'])).toEqual(['pct']);
      expect(resolveComparisonFormats([], ['pct'])).toEqual([]);
    });

    it('drops values it does not know', () => {
      expect(resolveComparisonFormats(['abs', 'bogus'], [])).toEqual(['abs']);
    });
  });

  describe('single pivot (weekdays)', () => {
    const props = run(
      { columns: ['giorno'], calendar_comparison_formats: ['abs', 'pct'] },
      weekdayRecords,
    );

    it('puts the comparison and the deltas next to the value of each weekday', () => {
      const cols = keys(props.columns).filter(k => k.startsWith('visite___Lunedì'));
      expect(cols).toEqual([
        'visite___Lunedì',
        'visite___Lunedì___comp',
        'visite___Lunedì___diff',
        'visite___Lunedì___delta',
      ]);
    });

    it('pairs Monday of the current period with Monday of the comparison, per row', () => {
      const a = row(props.data, 'A');
      expect(a.metrics['visite___Lunedì']).toBe(120);
      expect(a.metrics['visite___Lunedì___comp']).toBe(100);
      expect(a.metrics['visite___Lunedì___diff']).toBe(20);
      expect(a.metrics['visite___Lunedì___delta']).toBe(20);
      expect(a.metrics['visite___Martedì___delta']).toBe(-20);
    });

    it('keeps the comparison of a weekday whose current value is empty', () => {
      const b = row(props.data, 'B');
      expect(b.metrics['visite___Martedì___comp']).toBe(40);
      expect(b.metrics['visite___Martedì___delta']).toBeNull();
      expect(b.metrics['visite___Lunedì___delta']).toBe('Nuovo');
    });

    it('widens the header group of each weekday over the added columns', () => {
      const monday = props.pivotHeaderGroups?.find(g => g.key === 'Lunedì');
      expect(monday?.colSpan).toBe(4);
      const total = (props.pivotHeaderGroups ?? []).reduce((sum, g) => sum + g.colSpan, 0);
      // The hierarchy column has no group.
      expect(total).toBe(props.columns.length - 1);
    });

    it('rolls the comparison up to the parent rows and the grand total', () => {
      const grand = props.grandTotalNode as TreeNode;
      expect(grand.metrics['visite___Lunedì']).toBe(170);
      expect(grand.metrics['visite___Lunedì___comp']).toBe(100);
      expect(grand.metrics['visite___Lunedì___diff']).toBe(70);
      expect(grand.metrics['visite___Martedì___comp']).toBe(140);
    });

    it('gives the delta columns the polarity of the metric definition', () => {
      const withPolarity = run(
        {
          columns: ['giorno'],
          calendar_comparison_formats: ['abs', 'pct'],
          metricDefinitions: [{ metric: 'visite', type: 'sum', polarity: 'lower_is_better' }],
        },
        weekdayRecords,
      );
      const delta = withPolarity.columns.find(c => c.key === 'visite___Lunedì___delta');
      const diff = withPolarity.columns.find(c => c.key === 'visite___Lunedì___diff');
      expect(delta?.polarity).toBe('lower_is_better');
      expect(diff?.polarity).toBe('lower_is_better');
    });
  });

  describe('formats', () => {
    it('shows the ratio and the percentage points, with the ratio neutral at 1', () => {
      const props = run(
        { columns: ['giorno'], calendar_comparison_formats: ['pp', 'ratio'] },
        weekdayRecords,
      );
      const ratio = props.columns.find(c => c.key === 'visite___Lunedì___ratio');
      const pp = props.columns.find(c => c.key === 'visite___Lunedì___pp');
      expect(ratio?.deltaBaseline).toBe(1);
      expect(pp?.deltaBaseline).toBeUndefined();
      expect(ratio?.formatter?.(1.2)).toBe('1.20×');
      expect(pp?.formatter?.(3.456)).toBe('+3.5 pp');
      expect(row(props.data, 'A').metrics['visite___Lunedì___ratio']).toBe(1.2);
    });

    it('shows only the two values when no delta is chosen', () => {
      const props = run({ columns: ['giorno'], calendar_comparison_formats: [] }, weekdayRecords);
      expect(keys(props.columns).filter(k => k.startsWith('visite___Lunedì'))).toEqual([
        'visite___Lunedì',
        'visite___Lunedì___comp',
      ]);
    });

    it('names the comparison columns with the chosen label', () => {
      const props = run(
        { columns: ['giorno'], calendar_comparison_label: 'Anno prec.' },
        weekdayRecords,
      );
      expect(props.columns.find(c => c.key === 'visite___Lunedì___comp')?.title).toBe(
        'visite (Anno prec.)',
      );
    });
  });

  describe('row totals', () => {
    it('adds the comparison of the row total as the sum over the pivot values', () => {
      const props = run(
        { columns: ['giorno'], pivotRowTotalsPosition: 'right', calendar_comparison_formats: ['abs'] },
        weekdayRecords,
      );
      const b = row(props.data, 'B');
      expect(b.metrics['visite___ROW_TOTAL']).toBe(50);
      // Tuesday has no current value but its comparison counts.
      expect(b.metrics['visite___ROW_TOTAL___comp']).toBe(40);
      expect(b.metrics['visite___ROW_TOTAL___diff']).toBe(10);
      expect(keys(props.columns)).toContain('visite___ROW_TOTAL___comp');
    });
  });

  describe('two pivot dimensions', () => {
    const records = [
      { sede: 'A', anno: '2026', giorno: 'Lunedì', visite: 10, [`visite__${OFFSET}`]: 8 },
      { sede: 'A', anno: '2026', giorno: 'Martedì', visite: 5, [`visite__${OFFSET}`]: 10 },
    ];
    const props = run(
      { columns: ['anno', 'giorno'], calendar_comparison_formats: ['pct'] },
      records,
    );

    it('pairs every combination of the two pivot values', () => {
      const a = row(props.data, 'A');
      expect(a.metrics['visite___2026___Lunedì___comp']).toBe(8);
      expect(a.metrics['visite___2026___Lunedì___delta']).toBe(25);
      expect(a.metrics['visite___2026___Martedì___delta']).toBe(-50);
      expect(keys(props.columns)).toContain('visite___2026___Lunedì___comp');
    });

    it('pairs the subtotal of the first pivot value', () => {
      const a = row(props.data, 'A');
      expect(a.metrics['visite___2026___SUBTOTAL___comp']).toBe(18);
      expect(a.metrics['visite___2026___SUBTOTAL___delta']).toBe(-16.7);
    });
  });

  describe('flat table', () => {
    const flat = [
      { sede: 'A', visite: 120, [`visite__${OFFSET}`]: 100 },
      { sede: 'B', visite: 50, [`visite__${OFFSET}`]: 0 },
    ];

    it('keeps value, comparison, Δ and Δ% when the chart never chose the formats', () => {
      const props = run({}, flat);
      expect(keys(props.columns).slice(1)).toEqual([
        'visite',
        'visite___comp',
        'visite___diff',
        'visite___delta',
      ]);
    });

    it('follows the chosen formats', () => {
      const props = run({ calendar_comparison_formats: ['ratio'] }, flat);
      expect(keys(props.columns).slice(1)).toEqual(['visite', 'visite___comp', 'visite___ratio']);
      expect(row(props.data, 'A').metrics['visite___ratio']).toBe(1.2);
      expect((props.grandTotalNode as TreeNode).metrics['visite___ratio']).toBe(1.7);
    });
  });

  describe('modes', () => {
    it('shows only the Δ of the row total in the row total mode', () => {
      const props = run(
        { columns: ['giorno'], calendar_comparison_mode: 'row_total' },
        weekdayRecords,
      );
      expect(keys(props.columns).some(k => k.endsWith('___comp'))).toBe(false);
      expect(keys(props.columns)).toContain('visite___period_delta');
    });

    it('shows nothing when the calendar comparison is off', () => {
      const props = run({ columns: ['giorno'], show_calendar_comparison: false }, weekdayRecords);
      expect(keys(props.columns).some(k => k.endsWith('___comp'))).toBe(false);
      expect(keys(props.columns)).not.toContain('visite___period_delta');
    });

    it('leaves the table alone when the filter sends no comparison period', () => {
      const plain = weekdayRecords.map(({ [`visite__${OFFSET}`]: _o, ...rest }) => rest);
      const props = run({ columns: ['giorno'] }, plain);
      expect(keys(props.columns).some(k => k.endsWith('___comp'))).toBe(false);
    });
  });
});
