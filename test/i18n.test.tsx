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
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import HierarchicalTable from '../src/components/HierarchicalTable';
import { MESSAGES, msg } from '../src/i18n';
import transformProps from '../src/plugin/transformProps';
import { displayName, GRAND_TOTAL_NAME } from '../src/utils/labels';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('msg', () => {
  it('sostituisce i segnaposto e lascia quelli senza parametro', () => {
    expect(msg('toolbar.clearAll', { count: 3 })).toBe('Rimuovi tutti (3)');
    expect(msg('tree.filterAdd', { name: 'Roma', path: 'Lazio > Roma' })).toContain('Roma (Lazio > Roma)');
    expect(msg('toolbar.clearAll')).toBe('Rimuovi tutti ({count})');
    expect(msg('toolbar.clearAll', { other: 1 })).toBe('Rimuovi tutti ({count})');
  });
});

describe('dizionario', () => {
  it('nessun testo ha emoji, trattini lunghi o doppi trattini', () => {
    const emoji = /\p{Extended_Pictographic}/u;
    const dashes = /[–—]| -- /;
    for (const [key, text] of Object.entries(MESSAGES)) {
      expect({ key, emoji: emoji.test(text) }).toEqual({ key, emoji: false });
      expect({ key, dashes: dashes.test(text) }).toEqual({ key, dashes: false });
    }
  });
});

describe('nomi mostrati', () => {
  it('traduce solo gli identificatori interni', () => {
    expect(displayName(GRAND_TOTAL_NAME)).toBe('Totale generale');
    expect(displayName('(Empty)')).toBe('(Vuoto)');
    expect(displayName('Roma')).toBe('Roma');
    expect(displayName('Grand Totals')).toBe('Grand Totals');
  });
});

describe('sorgenti dei componenti', () => {
  const dir = path.join(__dirname, '../src/components');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.tsx') && !f.startsWith('._'));

  it('nessun attributo visibile scritto come testo fisso', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = fs.readFileSync(path.join(dir, file), 'utf8');
      for (const m of source.matchAll(/\b(title|aria-label|placeholder|alt)="([^"{}]+)"/g)) {
        offenders.push(`${file}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('nessun testo nel JSX scritto fuori dal dizionario', () => {
    const allowed = new Set(['MAX', 'MIN']);
    const offenders: string[] = [];
    for (const file of files) {
      const source = fs.readFileSync(path.join(dir, file), 'utf8');
      for (const m of source.matchAll(/>\s*\n?\s*([A-Za-zÀ-ú][A-Za-zÀ-ú ,.!?'-]{2,})\n?\s*<\//g)) {
        const text = m[1].trim();
        if (!allowed.has(text)) offenders.push(`${file}: ${text}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('tabella resa', () => {
  const english = [
    'Expand All',
    'Collapse All',
    'Export CSV',
    'Search hierarchy',
    'Grand Total',
    'Leaves only',
    'All levels',
    'Parents only',
    'Clear',
    'Values:',
  ];

  const build = (flags: Record<string, unknown> = {}) =>
    transformProps({
      width: 900,
      height: 500,
      formData: { slice_id: 5, groupby: ['sede'], metrics: ['Richieste'], initialExpandDepth: 1, enableWhatIf: true, ...flags },
      queriesData: [{ data: [{ sede: 'ROMA', Richieste: 10 }, { sede: null, Richieste: 20 }] }],
    } as any);

  function visibleTexts(container: HTMLElement): string[] {
    const texts = [container.textContent ?? ''];
    container.querySelectorAll('[title],[aria-label],[placeholder]').forEach(el => {
      for (const attr of ['title', 'aria-label', 'placeholder']) {
        const value = el.getAttribute(attr);
        if (value) texts.push(value);
      }
    });
    return texts;
  }

  it('mostra tutto in italiano, con i nomi interni tradotti', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(<HierarchicalTable {...(build() as any)} />));

    const text = visibleTexts(container).join('\n');
    expect(text).toContain('Espandi tutto');
    expect(text).toContain('Comprimi tutto');
    expect(text).toContain('Esporta CSV');
    expect(text).toContain('Totale generale');
    expect(text).toContain('(Vuoto)');
    expect(text).toContain('Simulazione What-If');
    expect(container.querySelector('input[placeholder="Cerca nella gerarchia..."]')).not.toBeNull();
    for (const word of english) expect(text).not.toContain(word);

    act(() => root.unmount());
    container.remove();
  });
});
