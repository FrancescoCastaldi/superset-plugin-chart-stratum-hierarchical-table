/**
 * @jest-environment jsdom
 */
jest.mock('@superset-ui/core', () => ({
  getNumberFormatter: (fmt: string) => (val: any) => `fmt[${fmt}](${val})`,
  ensureIsArray: (val: any) =>
    val === null || val === undefined ? [] : Array.isArray(val) ? val : [val],
}));

import React, { useRef } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act, Simulate } from 'react-dom/test-utils';
import HierarchicalTable from '../src/components/HierarchicalTable';
import { computeRenderWindow, sliceRenderWindow } from '../src/components/useFlatTreeVirtualization';
import { COMPACT_ROW_HEIGHT, DEFAULT_ROW_HEIGHT, useRowHeight } from '../src/components/hooks/useRowHeight';
import transformProps from '../src/plugin/transformProps';

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
  jest.restoreAllMocks();
});

describe('altezza di riga', () => {
  let latest = 0;
  const Probe = ({ compact }: { compact: boolean }) => {
    const ref = useRef<HTMLTableSectionElement>(null);
    latest = useRowHeight(ref, compact, 'a');
    return (
      <table>
        <tbody ref={ref}>
          <tr data-tree-row="">
            <td>x</td>
          </tr>
        </tbody>
      </table>
    );
  };

  it('senza layout usa i valori di riserva, uno per la modalità compatta', () => {
    act(() => root.render(<Probe compact={false} />));
    expect(latest).toBe(DEFAULT_ROW_HEIGHT);
    act(() => root.render(<Probe compact />));
    expect(latest).toBe(COMPACT_ROW_HEIGHT);
  });

  it('con una riga misurabile usa la sua altezza vera', () => {
    jest.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ height: 36.46 } as DOMRect);
    act(() => root.render(<Probe compact={false} />));
    expect(latest).toBe(36.5);
  });
});

describe('finestra virtuale', () => {
  it('la funzione usa l\'altezza di riga e il margine ricevuti', () => {
    const win = computeRenderWindow(2000, { threshold: 500, pageSize: 40, scrollTop: 4000, rowHeight: 40, buffer: 10 });
    expect(win).toEqual({ start: 90, end: 150, padTop: 90 * 40, padBottom: 1850 * 40 });
    const sliced = sliceRenderWindow(Array.from({ length: 2000 }, (_, i) => i), {
      threshold: 500,
      pageSize: 40,
      scrollTop: 4000,
      rowHeight: 40,
      buffer: 10,
    });
    expect(sliced.rows[0]).toBe(90);
  });

  const many = (count: number) =>
    transformProps({
      width: 900,
      height: 400,
      formData: { slice_id: 3, groupby: ['sede'], metrics: ['Richieste'], virtualizationThreshold: 500 },
      queriesData: [{ data: Array.from({ length: count }, (_, i) => ({ sede: `S${String(i).padStart(4, '0')}`, Richieste: i })) }],
    } as any);

  it('con molte righe ne disegna solo una parte e mantiene l\'altezza totale', () => {
    act(() => root.render(<HierarchicalTable {...(many(1200) as any)} />));
    const rendered = container.querySelectorAll('tr[data-tree-row]').length;
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThan(120);
    const spacers = Array.from(container.querySelectorAll('tbody tr[style*="height"]')) as HTMLElement[];
    const padBottom = parseFloat(spacers[spacers.length - 1].style.height);
    expect(padBottom + rendered * DEFAULT_ROW_HEIGHT).toBeCloseTo(1200 * DEFAULT_ROW_HEIGHT, 0);
  });

  it('scorrendo la finestra segue la posizione con l\'altezza di riga della tabella', () => {
    act(() => root.render(<HierarchicalTable {...(many(1200) as any)} />));
    const wrapper = container.querySelector('.table-scroll-wrapper') as HTMLElement;
    Object.defineProperty(wrapper, 'scrollTop', { value: 4000, configurable: true });
    act(() => Simulate.scroll(wrapper));
    const names = Array.from(container.querySelectorAll('tr[data-tree-row] .node-name')).map(el => el.textContent);
    // 4000 px a 40 px per riga: la prima riga visibile è la 100, e la finestra parte con un margine prima.
    expect(names).toContain('S0100');
    expect(names).not.toContain('S0000');
  });
});
