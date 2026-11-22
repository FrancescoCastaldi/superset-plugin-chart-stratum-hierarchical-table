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
import { act } from 'react-dom/test-utils';
import HierarchicalTable from '../src/components/HierarchicalTable';
import { luminance, parseCssColor, sampleHostColors } from '../src/components/hooks/useHostColors';
import transformProps from '../src/plugin/transformProps';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('colori dell\'ospite', () => {
  it('legge i formati che restituisce getComputedStyle', () => {
    expect(parseCssColor('rgb(1, 2, 3)')).toEqual({ r: 1, g: 2, b: 3, a: 1 });
    expect(parseCssColor('rgba(1, 2, 3, 0.5)')).toEqual({ r: 1, g: 2, b: 3, a: 0.5 });
    expect(parseCssColor('rgb(1 2 3 / 25%)')).toEqual({ r: 1, g: 2, b: 3, a: 0.25 });
    expect(parseCssColor('rgba(0, 0, 0, 0)')?.a).toBe(0);
    expect(parseCssColor('transparent')).toBeNull();
  });

  it('la luminanza va da 0 (nero) a 1 (bianco)', () => {
    expect(luminance({ r: 0, g: 0, b: 0, a: 1 })).toBe(0);
    expect(luminance({ r: 255, g: 255, b: 255, a: 1 })).toBeCloseTo(1, 5);
  });

  const host = (style: string) => {
    const parent = document.createElement('div');
    parent.setAttribute('style', style);
    const child = document.createElement('div');
    parent.appendChild(child);
    document.body.appendChild(parent);
    return { child, remove: () => parent.remove() };
  };

  it('riconosce un fondo scuro con testo chiaro', () => {
    const { child, remove } = host('background-color: rgb(20, 24, 33); color: rgb(230, 232, 236)');
    expect(sampleHostColors(child)).toEqual({ dark: true, text: 'rgb(230, 232, 236)', background: 'rgb(20, 24, 33)' });
    remove();
  });

  it('un fondo chiaro resta chiaro', () => {
    const { child, remove } = host('background-color: rgb(255, 255, 255); color: rgb(31, 41, 55)');
    expect(sampleHostColors(child).dark).toBe(false);
    remove();
  });

  it('salta i fondi trasparenti e usa il primo antenato opaco', () => {
    const outer = document.createElement('div');
    outer.setAttribute('style', 'background-color: rgb(10, 10, 10); color: rgb(240, 240, 240)');
    const middle = document.createElement('div');
    middle.setAttribute('style', 'background-color: rgba(0, 0, 0, 0)');
    const child = document.createElement('div');
    middle.appendChild(child);
    outer.appendChild(middle);
    document.body.appendChild(outer);
    expect(sampleHostColors(child).dark).toBe(true);
    outer.remove();
  });

  it('senza elemento o senza genitore usa i colori chiari', () => {
    expect(sampleHostColors(null).dark).toBe(false);
    expect(sampleHostColors(document.createElement('div')).dark).toBe(false);
  });
});

describe('tabella nel tema scuro', () => {
  let container: HTMLDivElement;
  let root: Root;
  const render = (style: string) => {
    container = document.createElement('div');
    container.setAttribute('style', style);
    document.body.appendChild(container);
    root = createRoot(container);
    const props = transformProps({
      width: 800,
      height: 400,
      formData: { slice_id: 4, groupby: ['sede'], metrics: ['Richieste'] },
      queriesData: [{ data: [{ sede: 'ROMA', Richieste: 10 }] }],
    } as any);
    act(() => root.render(<HierarchicalTable {...(props as any)} />));
    return container.querySelector('.superset-hierarchical-table-container') as HTMLElement;
  };

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('prende la classe st-dark e i colori della pagina', () => {
    const table = render('background-color: rgb(20, 24, 33); color: rgb(230, 232, 236)');
    expect(table.classList.contains('st-dark')).toBe(true);
    expect(table.style.getPropertyValue('--st-host-bg')).toBe('rgb(20, 24, 33)');
    expect(table.style.getPropertyValue('--st-host-text')).toBe('rgb(230, 232, 236)');
  });

  it('in tema chiaro non aggiunge la classe', () => {
    const table = render('background-color: rgb(255, 255, 255); color: rgb(31, 41, 55)');
    expect(table.classList.contains('st-dark')).toBe(false);
  });
});

describe('fogli di stile', () => {
  const files = ['HierarchicalTable.css', 'WhatIfToolbar.css'].map(name =>
    fs.readFileSync(path.join(__dirname, '../src/components', name), 'utf8'),
  );
  const NEUTRAL_SURFACE = ['ffffff', 'fff', 'fafafa', 'f9fafb', 'f8fafc', 'f3f4f6', 'f1f5f9', 'edf2f7', 'e5e7eb', 'e2e8f0', 'd1d5db', 'cbd5e1'];
  const NEUTRAL_TEXT = ['1f2937', '111827', '0f172a', '1e293b', '334155', '374151', '4b5563', '475569', '6b7280', '64748b', '6c757d', '9ca3af', '94a3b8'];

  /** Dichiarazioni di colore che non passano da una variabile --st-: scrivere un grigio fisso rompe il tema scuro. */
  const fixed = (css: string, props: RegExp, hexes: string[]) => {
    const stripped = css.replace(/var\(--st-[a-z-]+,\s*#[0-9a-fA-F]{3,6}\)/g, 'VAR');
    const offenders: string[] = [];
    for (const m of stripped.matchAll(/^\s*([a-z-]+)\s*:\s*([^;{}]+);/gm)) {
      if (!props.test(m[1])) continue;
      for (const h of m[2].matchAll(/#([0-9a-fA-F]{3,6})\b/g)) {
        if (hexes.includes(h[1].toLowerCase())) offenders.push(m[0].trim());
      }
    }
    return offenders;
  };

  it('sfondi e bordi neutri passano dalle variabili del tema', () => {
    for (const css of files) {
      expect(fixed(css, /^(background|border|outline)/, NEUTRAL_SURFACE)).toEqual([]);
    }
  });

  it('i colori del testo neutri passano dalle variabili del tema', () => {
    for (const css of files) {
      expect(fixed(css, /^color$/, NEUTRAL_TEXT)).toEqual([]);
    }
  });

  it('il tema scuro è dichiarato dentro @supports e usa i colori dell\'ospite', () => {
    const css = files[0];
    expect(css).toContain('@supports (color: color-mix');
    expect(css).toContain('.superset-hierarchical-table-container.st-dark');
    expect(css).toContain('--st-host-bg');
  });

  it('il carattere è quello di Superset', () => {
    expect(files[0]).toMatch(/font-family:\s*inherit;/);
  });
});
