/**
 * @jest-environment jsdom
 */
jest.mock('@superset-ui/core', () => ({
  getNumberFormatter: (fmt: string) => (val: any) => `fmt[${fmt}](${val})`,
  ensureIsArray: (val: any) =>
    val === null || val === undefined ? [] : Array.isArray(val) ? val : [val],
}));

import fs from 'node:fs';
import path from 'node:path';
import { createRoot, Root } from 'react-dom/client';
import { act, Simulate } from 'react-dom/test-utils';
import HierarchicalTable from '../src/components/HierarchicalTable';
import { contrastRatio } from '../src/utils/themes';
import transformProps from '../src/plugin/transformProps';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const onCrossFilter = jest.fn();

beforeEach(() => {
  onCrossFilter.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const props = transformProps({
    width: 900,
    height: 500,
    formData: { slice_id: 21, groupby: ['area', 'sede'], metrics: ['Richieste'], initialExpandDepth: 1 },
    queriesData: [
      {
        data: [
          { area: 'NORD', sede: 'MILANO', Richieste: 20 },
          { area: 'NORD', sede: 'TORINO', Richieste: 5 },
          { area: 'SUD', sede: 'NAPOLI', Richieste: 7 },
        ],
      },
    ],
    hooks: { onAddFilter: jest.fn() },
  } as any);
  act(() => root.render(<HierarchicalTable {...(props as any)} onCrossFilter={onCrossFilter} />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const rows = () => Array.from(container.querySelectorAll<HTMLElement>('tr[data-tree-row]'));
const rowOf = (name: string) => rows().find(r => r.querySelector('.node-name')?.textContent === name) as HTMLElement;
const key = (el: HTMLElement, k: string) => act(() => Simulate.keyDown(el, { key: k }));

describe('struttura per i lettori di schermo', () => {
  it('la tabella è un treegrid con un nome', () => {
    const table = container.querySelector('table');
    expect(table?.getAttribute('role')).toBe('treegrid');
    expect(table?.getAttribute('aria-label')).toBe('Tabella gerarchica');
  });

  it('ogni riga dichiara livello e stato di espansione', () => {
    const nord = rowOf('NORD');
    expect(nord.getAttribute('role')).toBe('row');
    expect(nord.getAttribute('aria-level')).toBe('1');
    expect(nord.getAttribute('aria-expanded')).toBe('true');
    const milano = rowOf('MILANO');
    expect(milano.getAttribute('aria-level')).toBe('2');
    expect(milano.hasAttribute('aria-expanded')).toBe(false);
  });

  it('una sola riga è raggiungibile con Tab', () => {
    const tabbable = rows().filter(r => r.tabIndex === 0);
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toBe(rows()[0]);
  });
});

describe('tastiera', () => {
  it('le frecce su e giù spostano il fuoco tra le righe', () => {
    const first = rows()[0];
    act(() => first.focus());
    key(first, 'ArrowDown');
    expect(document.activeElement).toBe(rows()[1]);
    key(rows()[1], 'ArrowUp');
    expect(document.activeElement).toBe(first);
  });

  it('Fine e Home vanno all\'ultima e alla prima riga', () => {
    const first = rows()[0];
    act(() => first.focus());
    key(first, 'End');
    expect(document.activeElement).toBe(rows()[rows().length - 1]);
    key(document.activeElement as HTMLElement, 'Home');
    expect(document.activeElement).toBe(first);
  });

  it('la riga a fuoco diventa quella raggiungibile con Tab', () => {
    const first = rows()[0];
    act(() => first.focus());
    key(first, 'ArrowDown');
    act(() => (document.activeElement as HTMLElement).focus());
    const tabbable = rows().filter(r => r.tabIndex === 0);
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toBe(rows()[1]);
  });

  it('freccia sinistra chiude un padre aperto, destra lo riapre', () => {
    const nord = rowOf('NORD');
    act(() => nord.focus());
    key(nord, 'ArrowLeft');
    expect(rowOf('NORD').getAttribute('aria-expanded')).toBe('false');
    expect(rows().map(r => r.querySelector('.node-name')?.textContent)).not.toContain('MILANO');
    key(rowOf('NORD'), 'ArrowRight');
    expect(rowOf('NORD').getAttribute('aria-expanded')).toBe('true');
    expect(rows().map(r => r.querySelector('.node-name')?.textContent)).toContain('MILANO');
  });

  it('freccia destra su un padre aperto va al primo figlio, sinistra su un figlio torna al padre', () => {
    const nord = rowOf('NORD');
    act(() => nord.focus());
    key(nord, 'ArrowRight');
    expect(document.activeElement).toBe(rowOf('MILANO'));
    key(rowOf('MILANO'), 'ArrowLeft');
    expect(document.activeElement).toBe(rowOf('NORD'));
  });

  it('Invio sulla riga attiva il filtro incrociato', () => {
    const nord = rowOf('NORD');
    act(() => nord.focus());
    key(nord, 'Enter');
    expect(onCrossFilter).toHaveBeenCalledTimes(1);
    expect(onCrossFilter.mock.calls[0][0]).toBe('area');
  });

  it('i tasti dentro un pulsante o un campo non muovono le righe', () => {
    const toggle = container.querySelector('.tree-toggle-btn') as HTMLElement;
    act(() => Simulate.keyDown(toggle, { key: 'ArrowDown' }));
    expect(document.activeElement).not.toBe(rows()[1]);
  });
});

describe('contrasto e fuoco visibile', () => {
  const css = fs.readFileSync(path.join(__dirname, '../src/components/HierarchicalTable.css'), 'utf8');

  it('il testo tenue ha almeno 4.5:1 su bianco', () => {
    const colors = Array.from(css.matchAll(/^\s*color:\s*var\(--st-text-faint,\s*(#[0-9a-fA-F]{6})\)/gm)).map(m => m[1]);
    expect(colors.length).toBeGreaterThan(0);
    for (const color of colors) expect(contrastRatio(color)).toBeGreaterThanOrEqual(4.5);
  });

  it('righe e controlli hanno uno stile :focus-visible', () => {
    expect(css).toMatch(/tr\[data-tree-row\]:focus-visible/);
    expect(css).toMatch(/button:focus-visible/);
  });
});
