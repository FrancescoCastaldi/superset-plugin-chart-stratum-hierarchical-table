/**
 * @jest-environment jsdom
 */
jest.mock('@superset-ui/core', () => ({
  getNumberFormatter: (fmt: string) => (val: number) => `${fmt}(${val})`,
  ensureIsArray: (value: unknown) => (Array.isArray(value) ? value : value == null ? [] : [value]),
}));

import { createRoot, Root } from 'react-dom/client';
import { act, Simulate } from 'react-dom/test-utils';
import RowListControl, {
  insertToken,
  metricToken,
  operandsOf,
} from '../src/plugin/controls/RowListControl';
import {
  CALCULATED_METRICS_EXAMPLE,
  CALCULATED_METRICS_FIELDS,
  calculatedMetricsNormalize,
} from '../src/plugin/controls/specs';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const props = (value: unknown, onChange = jest.fn()) => ({
  label: 'Metriche calcolate',
  description: 'Descrizione',
  value,
  onChange,
  fields: CALCULATED_METRICS_FIELDS,
  storedAs: 'json' as const,
  exampleRows: CALCULATED_METRICS_EXAMPLE,
  newRow: () => ({ type: 'formula' }),
  normalize: calculatedMetricsNormalize,
  metricChoices: ['ricavi'],
  datasetMetricChoices: ['ricavi', 'costi'],
});

const saved = (formula: string) =>
  JSON.stringify([{ type: 'formula', metric: 'margine', formula }]);

describe('formula helpers', () => {
  it('writes metric names between square brackets', () => {
    expect(metricToken('SUM(importo)')).toBe('[SUM(importo)]');
  });

  it('inserts a token at the caret, replacing the selection', () => {
    expect(insertToken('a + b', '[x]', 2, 2)).toEqual({ text: 'a [x]+ b', caret: 5 });
    expect(insertToken('a + b', '[x]', 0, 1)).toEqual({ text: '[x] + b', caret: 3 });
    expect(insertToken('', '[x]', 0, 0)).toEqual({ text: '[x]', caret: 3 });
  });

  it('keeps the position inside the text when the selection is out of range', () => {
    expect(insertToken('ab', '[x]', 99, 99).text).toBe('ab[x]');
  });

  it('lists the dataset metrics a formula cites', () => {
    expect(operandsOf('([ricavi] - costi) / [boh]', ['ricavi', 'costi'])).toEqual([
      'ricavi',
      'costi',
    ]);
    expect(operandsOf('ricavi +', ['ricavi'])).toEqual([]);
  });
});

describe('calculated metrics control', () => {
  it('shows a chip for every dataset metric, draggable', () => {
    act(() => root.render(<RowListControl {...props(saved(''))} />));
    const chips = Array.from(
      container.querySelectorAll('[aria-label="Metriche disponibili"] button'),
    );
    expect(chips.map(chip => chip.textContent)).toEqual(['ricavi', 'costi']);
    expect(chips.every(chip => chip.getAttribute('draggable') === 'true')).toBe(true);
  });

  it('inserts the metric in the formula when a chip is clicked, and saves the cited metrics', () => {
    const onChange = jest.fn();
    act(() => root.render(<RowListControl {...props(saved(''), onChange)} />));
    const chip = Array.from(
      container.querySelectorAll('[aria-label="Metriche disponibili"] button'),
    ).find(c => c.textContent === 'costi')!;
    act(() => Simulate.click(chip));
    const [row] = JSON.parse(onChange.mock.calls[0][0] as string);
    expect(row.formula).toBe('[costi]');
    expect(row.operands).toEqual(['costi']);
  });

  it('inserts the dropped metric in the formula', () => {
    const onChange = jest.fn();
    act(() => root.render(<RowListControl {...props(saved('[ricavi] - '), onChange)} />));
    const textarea = container.querySelector('textarea')!;
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    act(() => Simulate.drop(textarea, { dataTransfer: { getData: () => '[costi]' } } as any));
    const [row] = JSON.parse(onChange.mock.calls[0][0] as string);
    expect(row.formula).toBe('[ricavi] - [costi]');
    expect(row.operands).toEqual(['ricavi', 'costi']);
  });

  it('warns about a formula that does not parse', () => {
    act(() => root.render(<RowListControl {...props(saved('ricavi +'))} />));
    expect(container.textContent).toContain('Formula non valida');
  });

  it('warns about a metric that is neither in the chart nor in the dataset', () => {
    act(() => root.render(<RowListControl {...props(saved('[ricavi] / [boh]'))} />));
    expect(container.textContent).toContain('Metriche non trovate');
    expect(container.textContent).toContain('boh');
  });

  it('does not warn for a formula that cites another calculated metric', () => {
    const value = JSON.stringify([
      { type: 'formula', metric: 'margine', formula: '[ricavi] - [costi]' },
      { type: 'formula', metric: 'doppio', formula: '[margine] * 2' },
    ]);
    act(() => root.render(<RowListControl {...props(value)} />));
    expect(container.textContent).not.toContain('Metriche non trovate');
  });
});
