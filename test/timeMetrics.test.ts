jest.mock('@superset-ui/core', () => ({
  getNumberFormatter: () => (val: any) => String(val),
  ensureIsArray: (val: any) =>
    val === null || val === undefined ? [] : Array.isArray(val) ? val : [val],
}));

import transformProps from '../src/plugin/transformProps';
import { TableColumn, TreeNode } from '../src/types';
import { buildCsvRows } from '../src/utils/csvExport';
import {
  convertTimeColumns,
  formatDuration,
  formatSignedDuration,
  parseTimeToSeconds,
  timeColumnRole,
} from '../src/utils/timeValues';

function run(formData: Record<string, unknown>, records: Record<string, unknown>[]) {
  return transformProps({
    width: 800,
    height: 400,
    formData: { hierarchyType: 'multi_dimension', ...formData },
    rawFormData: {},
    queriesData: [{ data: records }],
    hooks: {},
    filterState: {},
  } as any);
}

const column = (columns: TableColumn[], key: string) => columns.find(c => c.key === key) as TableColumn;
const row = (data: TreeNode[], name: string) => data.find(n => n.name === name) as TreeNode;

describe('time values', () => {
  it('reads the texts Superset sends for Time fields', () => {
    expect(parseTimeToSeconds('00:12:54.425000')).toBeCloseTo(774.425, 6);
    expect(parseTimeToSeconds('26:10:00')).toBe(94200);
    expect(parseTimeToSeconds('1 day, 2:03:04')).toBe(86400 + 7384);
    expect(parseTimeToSeconds('PT12M54S')).toBe(774);
    expect(parseTimeToSeconds('12:54')).toBeNull();
    expect(parseTimeToSeconds('Sportello')).toBeNull();
    expect(parseTimeToSeconds('2026-01-01 00:12:54')).toBeNull();
  });

  it('writes durations, rounding before it splits the digits', () => {
    expect(formatDuration(774.425)).toBe('12:54');
    expect(formatDuration(3723)).toBe('1:02:03');
    expect(formatDuration(59.6)).toBe('01:00');
    expect(formatDuration(3599.6)).toBe('1:00:00');
    expect(formatDuration(774.425, { fractionDigits: 3 })).toBe('12:54.425');
    expect(formatDuration(3930, { format: 'minutes', fractionDigits: 1 })).toBe('65,5 min');
    expect(formatSignedDuration(300)).toBe('+05:00');
    expect(formatSignedDuration(-30)).toBe('-00:30');
    expect(formatSignedDuration(0)).toBe('00:00');
  });

  it('tells durations from percentages in the keys of the columns', () => {
    expect(timeColumnRole('ritardo')).toBe('value');
    expect(timeColumnRole('ritardo___Lunedì')).toBe('value');
    expect(timeColumnRole('ritardo___comp')).toBe('value');
    expect(timeColumnRole('ritardo___ROW_TOTAL')).toBe('value');
    expect(timeColumnRole('ritardo___diff')).toBe('delta');
    expect(timeColumnRole('ritardo___Lunedì___diff')).toBe('delta');
    expect(timeColumnRole('ritardo___period_delta')).toBe('delta');
    expect(timeColumnRole('ritardo___delta___Lunedì')).toBe('delta');
    expect(timeColumnRole('ritardo___delta')).toBe('other');
    expect(timeColumnRole('ritardo___Lunedì___delta')).toBe('other');
    expect(timeColumnRole('ritardo___delta_pct___Lunedì')).toBe('other');
    expect(timeColumnRole('ritardo___period_delta_pct')).toBe('other');
    expect(timeColumnRole('ritardo___pp')).toBe('other');
    expect(timeColumnRole('ritardo___ratio')).toBe('other');
  });

  it('converts only the wanted columns', () => {
    const rows = [{ fascia: '08:00:00', attesa: '00:10:00' }];
    const { rows: out, timeKeys } = convertTimeColumns(rows, ['attesa']);
    expect(timeKeys).toEqual(['attesa']);
    expect(out[0]).toEqual({ fascia: '08:00:00', attesa: 600 });
    expect(rows[0].attesa).toBe('00:10:00');
  });
});

describe('CSV export of Time metrics', () => {
  it('writes durations as in the table and plain numbers as they are', () => {
    const props = run({ groupby: ['sede'], metrics: ['ritardo', 'visite'] }, [
      { sede: 'A', ritardo: '00:10:00', visite: 10 },
    ]);
    const rows = buildCsvRows({
      columns: props.columns,
      displayCols: props.columns.filter(c => c.isMetric),
      nodes: props.data,
      displayMode: 'all',
      showGrandTotal: false,
      grandTotalPosition: 'top',
    } as any);
    expect(rows[1].slice(1)).toEqual(['10:00', '10']);
  });
});

describe('hierarchical table with Time metrics', () => {
  // `ritardo` has no word that the name heuristics read as an average: only the data says it is a time
  const records = [
    { sede: 'A', canale: 'Sportello', ritardo: '00:10:00', visite: 10 },
    { sede: 'A', canale: 'Web', ritardo: '00:20:00', visite: 30 },
    { sede: 'B', canale: 'Sportello', ritardo: '00:30:00', visite: 20 },
  ];
  const base = { groupby: ['sede', 'canale'], metrics: ['ritardo', 'visite'] };

  it('reads the times as seconds instead of zero', () => {
    const props = run(base, records);
    const a = row(props.data, 'A');
    expect(a.children?.find(c => c.name === 'Sportello')?.metrics.ritardo).toBe(600);
    expect(a.children?.find(c => c.name === 'Web')?.metrics.ritardo).toBe(1200);
  });

  it('averages the durations in the parent rows and the grand total, and still adds the counts', () => {
    const props = run(base, records);
    expect(row(props.data, 'A').metrics.ritardo).toBe(900);
    expect(row(props.data, 'A').metrics.visite).toBe(40);
    expect(row(props.data, 'B').metrics.ritardo).toBe(1800);
    expect(props.grandTotalNode?.metrics.ritardo).toBe(1350);
    expect(props.grandTotalNode?.metrics.visite).toBe(60);
  });

  it('adds them like the other metrics when the roll-up is set to general', () => {
    const props = run({ ...base, timeRollup: 'general' }, records);
    expect(row(props.data, 'A').metrics.ritardo).toBe(1800);
  });

  it('writes the cells as durations and leaves the counts alone', () => {
    const props = run(base, records);
    expect(column(props.columns, 'ritardo').formatter?.(774.425)).toBe('12:54');
    expect(column(props.columns, 'ritardo').formatter?.(null)).toBe('-');
    expect(column(props.columns, 'visite').formatter?.(40)).toBe('40');
  });

  it('follows the format and the decimals chosen', () => {
    const props = run({ ...base, timeDisplayFormat: 'hms', timeFractionDigits: 1 }, records);
    expect(column(props.columns, 'ritardo').formatter?.(774.45)).toBe('0:12:54.5');
  });

  it('shows hours from the format automatic when the table reaches one', () => {
    const props = run(base, [
      { sede: 'A', canale: 'Web', ritardo: '01:30:00', visite: 1 },
      { sede: 'A', canale: 'Sportello', ritardo: '00:10:00', visite: 1 },
    ]);
    expect(column(props.columns, 'ritardo').formatter?.(600)).toBe('0:10:00');
  });

  it('leaves the values and the formats alone when the detection is off', () => {
    const props = run({ ...base, timeDetection: 'off' }, records);
    expect(column(props.columns, 'ritardo').formatter?.(600)).not.toBe('10:00');
  });

  it('never reads a dimension as a time', () => {
    const props = run({ groupby: ['fascia'], metrics: ['ritardo'] }, [
      { fascia: '08:00:00', ritardo: '00:10:00' },
      { fascia: '13:00:00', ritardo: '00:20:00' },
    ]);
    expect(props.data.map(n => n.name)).toEqual(['08:00:00', '13:00:00']);
    expect(props.data[0].metrics.ritardo).toBe(600);
  });

  it('keeps a table of numbers as it was', () => {
    const props = run({ groupby: ['sede', 'canale'], metrics: ['visite'] }, records);
    expect(row(props.data, 'A').metrics.visite).toBe(40);
    expect(column(props.columns, 'visite').formatter?.(40)).toBe('40');
  });

  describe('comparison with the period of the calendar filter', () => {
    const OFFSET = '1 year ago';
    const withComparison = [
      { sede: 'A', canale: 'Sportello', ritardo: '00:10:00', [`ritardo__${OFFSET}`]: '00:05:00' },
      { sede: 'A', canale: 'Web', ritardo: '00:20:00', [`ritardo__${OFFSET}`]: '00:15:00' },
      { sede: 'B', canale: 'Sportello', ritardo: '00:30:00', [`ritardo__${OFFSET}`]: '00:30:00' },
    ];
    const props = run(
      { groupby: ['sede', 'canale'], metrics: ['ritardo'], calendar_comparison_formats: ['abs', 'pct'] },
      withComparison,
    );

    it('reads the comparison period as seconds, and averages it in the parents', () => {
      const a = row(props.data, 'A');
      expect(a.children?.[0].metrics['ritardo___comp']).toBe(300);
      expect(a.metrics.ritardo).toBe(900);
      expect(a.metrics['ritardo___comp']).toBe(600);
      expect(a.metrics['ritardo___diff']).toBe(300);
    });

    it('writes the comparison and the difference as durations, the percentage as a number', () => {
      expect(column(props.columns, 'ritardo___comp').formatter?.(300)).toBe('05:00');
      expect(column(props.columns, 'ritardo___diff').formatter?.(300)).toBe('+05:00');
      expect(column(props.columns, 'ritardo___diff').formatter?.(-30)).toBe('-00:30');
      expect(column(props.columns, 'ritardo___delta').formatter?.(50)).toContain('%');
    });
  });

  describe('pivot', () => {
    const pivotRecords = [
      { sede: 'A', giorno: 'Lunedì', ritardo: '00:10:00' },
      { sede: 'A', giorno: 'Martedì', ritardo: '00:20:00' },
      { sede: 'B', giorno: 'Lunedì', ritardo: '00:30:00' },
    ];
    const props = run(
      { groupby: ['sede'], columns: ['giorno'], metrics: ['ritardo'], pivotRowTotalsPosition: 'right' },
      pivotRecords,
    );

    it('writes the pivot cells as durations', () => {
      expect(row(props.data, 'A').metrics['ritardo___Lunedì']).toBe(600);
      expect(column(props.columns, 'ritardo___Lunedì').formatter?.(600)).toBe('10:00');
    });

    it('gives the row total as the average of the cells, and the grand total as the average of the rows', () => {
      expect(row(props.data, 'A').metrics['ritardo___ROW_TOTAL']).toBe(900);
      expect(props.grandTotalNode?.metrics['ritardo___Lunedì']).toBe(1200);
    });
  });
});
