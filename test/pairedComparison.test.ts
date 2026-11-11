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
import { comparisonPeriodLabel, resolveComparisonLabel } from '../src/utils/periodLabels';
import { TableColumn, TreeNode } from '../src/types';

const OFFSET = '1 year ago';

/** Weekday pivot, 2026 against 2025: the comparison of Monday is the Monday of the offset. */
const weekdayRecords = [
  { sede: 'A', giorno: 'Lunedì', visite: 120, [`visite__${OFFSET}`]: 100 },
  { sede: 'A', giorno: 'Martedì', visite: 80, [`visite__${OFFSET}`]: 100 },
  { sede: 'B', giorno: 'Lunedì', visite: 50, [`visite__${OFFSET}`]: 0 },
  { sede: 'B', giorno: 'Martedì', visite: null, [`visite__${OFFSET}`]: 40 },
];

function run(
  formData: Record<string, unknown>,
  records: Record<string, unknown>[],
  range: { from_dttm?: unknown; to_dttm?: unknown } = {},
) {
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
    queriesData: [{ data: records, ...range }],
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

    it('keeps only value, comparison and Δ% by default when the chart never chose the formats', () => {
      const props = run({}, flat);
      expect(keys(props.columns).slice(1)).toEqual([
        'visite',
        'visite___comp',
        'visite___delta',
      ]);
    });

    it('follows the chosen formats', () => {
      const props = run({ calendar_comparison_formats: ['ratio'] }, flat);
      expect(keys(props.columns).slice(1)).toEqual(['visite', 'visite___comp', 'visite___ratio']);
      expect(row(props.data, 'A').metrics['visite___ratio']).toBe(1.2);
      expect((props.grandTotalNode as TreeNode).metrics['visite___ratio']).toBe(1.7);
    });

    it('respects show_calendar_comparison=false in flat layout even when offset columns exist', () => {
      const props = run({ show_calendar_comparison: false }, flat);
      expect(keys(props.columns).slice(1)).toEqual(['visite']);
      expect(props.columns.find(c => c.key === 'visite')?.title).toBe('visite');
      expect(keys(props.columns).some(k => k.endsWith('___comp') || k.endsWith('___delta'))).toBe(false);
    });

    it('resolves ___delta collision when showVarianceDelta and calendar comparison are both active in flat layout', () => {
      const multiPeriodFlat = [
        { anno: 2024, visite: 100, [`visite__${OFFSET}`]: 80 },
        { anno: 2025, visite: 150, [`visite__${OFFSET}`]: 100 },
      ];
      const props = run(
        { groupby: ['anno'], showVarianceDelta: true, show_calendar_comparison: true },
        multiPeriodFlat,
      );
      const deltaCols = props.columns.filter(c => c.key === 'visite___delta');
      expect(deltaCols).toHaveLength(1);
      // Calendar comparison takes precedence: (150 - 100) / 100 = +50%, not row-to-row (150 - 100) / 100 or overwritten
      expect(row(props.data, '2024').metrics['visite___delta']).toBe(25);
      expect(row(props.data, '2025').metrics['visite___delta']).toBe(50);
    });

    it('only detects flat comparison from ${metric}__ columns, preserves null missing comparison and does not overwrite defined/weighted parent values', () => {
      const recordsWithAttrUnderscore = [
        { cod__interno: 'X', visite: 10 },
        { cod__interno: 'Y', visite: 20 },
      ];
      const noFalseComp = run({}, recordsWithAttrUnderscore);
      expect(keys(noFalseComp.columns)).toEqual(['__hierarchy_tree__', 'visite']);

      const missingCompRecords = [
        { gruppo: 'G1', sede: 'A', visite: 50, [`visite__${OFFSET}`]: null, peso: 10, prezzo: 0.2 },
        { gruppo: 'G1', sede: 'B', visite: 30, [`visite__${OFFSET}`]: 0, peso: 30, prezzo: 0.6 },
        { gruppo: 'G2', sede: 'C', visite: 40, [`visite__${OFFSET}`]: undefined, peso: 10, prezzo: 0.4 },
      ];
      const props = transformProps({
        width: 900,
        height: 400,
        formData: {
          groupby: ['gruppo', 'sede'],
          metrics: ['visite', 'prezzo', 'peso'],
          aggregationMode: 'weighted_avg',
          weightColumn: 'peso',
        },
        queriesData: [{ data: missingCompRecords }],
      } as any);

      const g1 = row(props.data, 'G1');
      const a = g1.children!.find(c => c.name === 'A')!;
      const b = g1.children!.find(c => c.name === 'B')!;
      const g2 = row(props.data, 'G2');

      // Missing comparison is null (not coerced to 0 -> no false "Nuovo")
      expect(a.metrics['visite___comp']).toBeNull();
      expect(a.metrics['visite___delta']).toBeNull();
      expect(g2.metrics['visite___comp']).toBeNull();
      expect(g2.metrics['visite___delta']).toBeNull();
      // Explicit 0 comparison still yields "Nuovo"
      expect(b.metrics['visite___comp']).toBe(0);
      expect(b.metrics['visite___delta']).toBe('Nuovo');
      // Precomputed weighted_avg parent value must NOT be overwritten by raw sum (0.2*10 + 0.6*30)/40 = 0.5, not 0.8!
      expect(g1.metrics['prezzo']).toBeCloseTo(0.5);
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
  describe('dynamic title of the comparison columns', () => {
    const october2026 = { from: '2026-10-01T00:00:00', to: '2026-11-01T00:00:00' };

    it('reads the comparison period from the range and the offset', () => {
      expect(comparisonPeriodLabel(october2026, '1 year ago')).toBe('ott 2025');
      expect(comparisonPeriodLabel(october2026, '1 month ago')).toBe('set 2026');
    });

    it('spans several months and names a whole year by its year', () => {
      expect(
        comparisonPeriodLabel({ from: '2026-07-01T00:00:00', to: '2026-10-01T00:00:00' }, '1 year ago'),
      ).toBe('lug 2025 – set 2025');
      expect(
        comparisonPeriodLabel({ from: '2026-01-01T00:00:00', to: '2027-01-01T00:00:00' }, '1 year ago'),
      ).toBe('2025');
    });

    it('puts the same span right before the current one for an inherited offset', () => {
      // 31 days before October: 31 August to 30 September.
      expect(comparisonPeriodLabel(october2026, 'inherited')).toBe('ago 2026 – set 2026');
    });

    it('is unknown without a range or with an offset it cannot read', () => {
      expect(comparisonPeriodLabel({}, '1 year ago')).toBeNull();
      expect(comparisonPeriodLabel(october2026, 'boh')).toBeNull();
    });

    it('fills the tokens of the template and falls back when they are unknown', () => {
      const scope = { timeRange: october2026, offset: '1 year ago' };
      expect(resolveComparisonLabel('', scope)).toBe('ott 2025');
      expect(resolveComparisonLabel('Anno prec. {periodo}', scope)).toBe('Anno prec. ott 2025');
      expect(resolveComparisonLabel('{corrente} vs {periodo}', scope)).toBe('ott 2026 vs ott 2025');
      expect(resolveComparisonLabel('{offset}', scope)).toBe('1 anno fa');
      expect(resolveComparisonLabel('', { offset: '1 year ago' })).toBe('1 anno fa');
      expect(resolveComparisonLabel('', {})).toBe('Confronto');
    });

    it('titles the comparison columns with the period the filter compares against', () => {
      const props = run({ columns: ['giorno'] }, weekdayRecords, {
        from_dttm: '2026-10-01T00:00:00',
        to_dttm: '2026-11-01T00:00:00',
      });
      expect(props.columns.find(c => c.key === 'visite___Lunedì___comp')?.title).toBe(
        'visite (ott 2025)',
      );
    });

    it('follows the filter: another month gives another title', () => {
      const props = run({ columns: ['giorno'] }, weekdayRecords, {
        from_dttm: '2026-03-01T00:00:00',
        to_dttm: '2026-04-01T00:00:00',
      });
      expect(props.columns.find(c => c.key === 'visite___Lunedì___comp')?.title).toBe(
        'visite (mar 2025)',
      );
    });
  });
});
