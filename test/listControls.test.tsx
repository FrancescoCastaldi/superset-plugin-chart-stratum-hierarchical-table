/**
 * @jest-environment jsdom
 */
jest.mock('@superset-ui/core', () => ({
  getNumberFormatter: (fmt: string) => (val: number) => `${fmt}(${val})`,
  ensureIsArray: (value: unknown) => (Array.isArray(value) ? value : value == null ? [] : [value]),
}));

import { createRoot, Root } from 'react-dom/client';
import { act, Simulate } from 'react-dom/test-utils';
import JsonTextControl from '../src/plugin/controls/JsonTextControl';
import RowListControl from '../src/plugin/controls/RowListControl';
import {
  CONDITIONAL_FORMATTING_EXAMPLE,
  CONDITIONAL_FORMATTING_FIELDS,
  GOALS_EXAMPLE,
  GOALS_FIELDS,
  METRIC_DEFINITIONS_EXAMPLE,
  METRIC_DEFINITIONS_SCHEMA,
  conditionalFormattingNormalize,
  conditionalFormattingWarning,
  goalsNormalize,
  metricDefinitionsNormalize,
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

const goalsProps = (value: unknown, onChange = jest.fn()) => ({
  label: 'Obiettivi',
  description: 'Descrizione',
  value,
  onChange,
  storedAs: 'json' as const,
  fields: GOALS_FIELDS,
  exampleRows: GOALS_EXAMPLE,
  newRow: () => ({ direction: 'higher_is_better' }),
  normalize: goalsNormalize,
  aliases: { metricKey: 'metric' },
  addLabel: 'Aggiungi obiettivo',
  rowTitle: 'Obiettivo',
  emptyHint: 'Nessun obiettivo.',
  metricChoices: ['accessi', 'ricavi'],
});

const button = (text: string): HTMLButtonElement => {
  const found = Array.from(container.querySelectorAll('button')).find(b => b.textContent === text);
  if (!found) throw new Error(`pulsante "${text}" non trovato`);
  return found as HTMLButtonElement;
};

describe('RowListControl', () => {
  it('senza righe mostra il suggerimento, l\'intestazione e l\'esempio', () => {
    act(() => root.render(<RowListControl {...goalsProps('')} />));
    expect(container.textContent).toContain('Obiettivi');
    expect(container.textContent).toContain('Nessun obiettivo.');
    expect(container.querySelector('details pre')?.textContent).toContain('"accessi"');
  });

  it('Inserisci esempio salva l\'esempio come testo JSON', () => {
    const onChange = jest.fn();
    act(() => root.render(<RowListControl {...goalsProps('', onChange)} />));
    act(() => Simulate.click(button('Inserisci esempio')));
    expect(onChange).toHaveBeenCalledTimes(1);
    const saved = onChange.mock.calls[0][0];
    expect(typeof saved).toBe('string');
    expect(goalsNormalize(JSON.parse(saved))).toHaveLength(1);
  });

  it('aggiunge una riga, la compila e salva lo stesso formato di prima', () => {
    const onChange = jest.fn();
    act(() => root.render(<RowListControl {...goalsProps('', onChange)} />));
    act(() => Simulate.click(button('Aggiungi obiettivo')));
    expect(container.querySelectorAll('[role="group"]')).toHaveLength(1);

    const metric = container.querySelector('input[list]') as HTMLInputElement;
    metric.value = 'accessi';
    act(() => Simulate.blur(metric));
    const target = Array.from(container.querySelectorAll('input[type="text"]')).find(
      el => (el as HTMLInputElement).placeholder === 'es. 1000',
    ) as HTMLInputElement;
    target.value = '1500,5';
    act(() => Simulate.blur(target));

    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(JSON.parse(last)).toEqual([{ direction: 'higher_is_better', metric: 'accessi', target: 1500.5 }]);
    expect(goalsNormalize(JSON.parse(last))).toHaveLength(1);
  });

  it('legge i grafici salvati con metricKey e li riscrive con metric', () => {
    const onChange = jest.fn();
    act(() => root.render(<RowListControl {...goalsProps('[{"metricKey":"accessi","target":10}]', onChange)} />));
    const metric = container.querySelector('input[list]') as HTMLInputElement;
    expect(metric.defaultValue).toBe('accessi');
    act(() => Simulate.click(button('Rimuovi')));
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('segnala le voci che il grafico ignorerebbe e le metriche non scelte', () => {
    act(() => root.render(<RowListControl {...goalsProps('[{"metric":"sconosciuta","target":"x"}]')} />));
    expect(container.textContent).toContain('verrà ignorata');
    expect(container.textContent).toContain('non è tra quelle scelte');
  });

  it('mostra un avviso se il valore salvato non è JSON valido', () => {
    act(() => root.render(<RowListControl {...goalsProps('[{')} />));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('non è un elenco valido');
  });

  it('riordina le righe', () => {
    const onChange = jest.fn();
    act(() =>
      root.render(
        <RowListControl {...goalsProps('[{"metric":"a","target":1},{"metric":"b","target":2}]', onChange)} />,
      ),
    );
    act(() => Simulate.click(button('Giù')));
    const saved = JSON.parse(onChange.mock.calls[0][0]);
    expect(saved.map((r: any) => r.metric)).toEqual(['b', 'a']);
  });

  it('un valore cambiato da fuori sostituisce le righe', () => {
    act(() => root.render(<RowListControl {...goalsProps('[{"metric":"a","target":1}]')} />));
    expect(container.querySelectorAll('[role="group"]')).toHaveLength(1);
    act(() => root.render(<RowListControl {...goalsProps('[{"metric":"a","target":1},{"metric":"b","target":2}]')} />));
    expect(container.querySelectorAll('[role="group"]')).toHaveLength(2);
  });

  it('formattazione condizionale: salva un array e mostra il campo "Fino a" solo per "tra"', () => {
    const onChange = jest.fn();
    act(() =>
      root.render(
        <RowListControl
          label="Regole"
          value={[{ metric: 'attesa', operator: 'between', targetValue: 10 }]}
          onChange={onChange}
          storedAs="array"
          fields={CONDITIONAL_FORMATTING_FIELDS}
          exampleRows={CONDITIONAL_FORMATTING_EXAMPLE}
          newRow={() => ({ operator: '>' })}
          normalize={conditionalFormattingNormalize}
          rowWarning={conditionalFormattingWarning}
          metricChoices={['attesa']}
        />,
      ),
    );
    expect(container.textContent).toContain('Fino a');
    expect(container.textContent).toContain('indica anche il valore finale');
    const operator = container.querySelector('select') as HTMLSelectElement;
    operator.value = '>';
    act(() => Simulate.change(operator));
    const saved = onChange.mock.calls[0][0];
    expect(Array.isArray(saved)).toBe(true);
    expect(saved[0]).toMatchObject({ metric: 'attesa', operator: '>', targetValue: 10 });
  });
});

describe('JsonTextControl', () => {
  const props = (value: unknown, onChange = jest.fn()) => ({
    label: 'Definizioni',
    value,
    onChange,
    normalize: metricDefinitionsNormalize,
    exampleRows: METRIC_DEFINITIONS_EXAMPLE,
    schemaLines: METRIC_DEFINITIONS_SCHEMA,
  });

  it('inserisce l\'esempio e lo emette senza errori', () => {
    const onChange = jest.fn();
    act(() => root.render(<JsonTextControl {...props('', onChange)} />));
    act(() => Simulate.click(button('Inserisci esempio')));
    const [text, errors] = onChange.mock.calls[0];
    expect(metricDefinitionsNormalize(JSON.parse(text))).toHaveLength(1);
    expect(errors).toEqual([]);
  });

  it('un errore di sintassi viene emesso come errore che blocca e mostrato in linea', () => {
    const onChange = jest.fn();
    act(() => root.render(<JsonTextControl {...props('[]', onChange)} />));
    const area = container.querySelector('textarea') as HTMLTextAreaElement;
    area.value = '[{"metric":';
    act(() => Simulate.change(area));
    expect(onChange.mock.calls[0][1][0]).toMatch(/^JSON non valido/);
    expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/JSON non valido/);
  });

  it('le voci ignorate sono solo un avviso, non un errore', () => {
    const onChange = jest.fn();
    act(() => root.render(<JsonTextControl {...props('[{"metric":"x","type":"boh"}]', onChange)} />));
    expect(container.textContent).toContain('verrà ignorata');
    expect(container.querySelector('[role="alert"]')).toBeNull();
    const area = container.querySelector('textarea') as HTMLTextAreaElement;
    area.value = '[{"metric":"x","type":"boh"},{"metric":"y","type":"sum"}]';
    act(() => Simulate.change(area));
    expect(onChange.mock.calls[0][1]).toEqual([]);
  });

  it('elenca i campi accettati', () => {
    act(() => root.render(<JsonTextControl {...props('')} />));
    expect(container.querySelector('details ul')?.textContent).toContain('ratio: numerator e denominator');
  });
});
