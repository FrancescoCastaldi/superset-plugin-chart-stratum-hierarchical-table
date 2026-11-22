/**
 * @jest-environment jsdom
 */
jest.mock('@superset-ui/core', () => ({
  getNumberFormatter: (fmt: string) => (val: any) => `fmt[${fmt}](${val})`,
  ensureIsArray: (val: any) =>
    val === null || val === undefined ? [] : Array.isArray(val) ? val : [val],
}));

import React from 'react';
import { createRoot } from 'react-dom/client';
import { act, Simulate } from 'react-dom/test-utils';
import HierarchicalTable from '../src/components/HierarchicalTable';
import transformProps from '../src/plugin/transformProps';
import { layoutStorageKey } from '../src/utils/columnLayout';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const build = (flags: Record<string, unknown> = {}) =>
  transformProps({
    width: 900,
    height: 500,
    formData: {
      slice_id: 77,
      groupby: ['sede'],
      metrics: ['Richieste', 'Prime visite'],
      initialExpandDepth: 1,
      ...flags,
    },
    queriesData: [
      {
        data: [
          { sede: 'ROMA', Richieste: 10, 'Prime visite': 3 },
          { sede: 'CAPRANICA', Richieste: 20, 'Prime visite': 5 },
        ],
      },
    ],
  } as any);

function mount(flags: Record<string, unknown> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<HierarchicalTable {...(build(flags) as any)} />));
  return {
    container,
    q: (selector: string) => container.querySelector(selector) as HTMLElement,
    all: (selector: string) => Array.from(container.querySelectorAll(selector)) as HTMLElement[],
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

const headerTitles = (t: ReturnType<typeof mount>) =>
  t.all('thead th').map(th => (th.textContent || '').replace(/[⠿▲▼\s]+$/g, '').replace(/^⠿/, '').trim());

describe('column layout flags in the table', () => {
  beforeEach(() => window.localStorage.clear());

  it('renders the table as before with every flag off', () => {
    const t = mount();
    const table = t.q('table.hierarchical-table');
    expect(table.className).not.toMatch(/wrap-labels|resizable-columns/);
    expect(table.getAttribute('style') ?? '').not.toMatch(/table-layout/);
    expect(t.q('colgroup')).toBeNull();
    expect(t.all('.col-resize-handle')).toHaveLength(0);
    expect(t.all('thead th[draggable="true"]')).toHaveLength(0);
    expect(t.q('.toolbar-btn[title*="Ripristina"]')).toBeNull();
    t.unmount();
  });

  it('wraps the labels with the wrap flag, without touching widths', () => {
    const t = mount({ wrapHeaderLabels: true });
    expect(t.q('table.hierarchical-table').className).toMatch(/wrap-labels/);
    expect(t.q('colgroup')).toBeNull();
    expect(t.all('.col-resize-handle')).toHaveLength(0);
    t.unmount();
  });

  it('puts a handle on every header and fixes the table to its columns with the resize flag', () => {
    const t = mount({ resizableColumns: true });
    const table = t.q('table.hierarchical-table');
    expect(table.className).toMatch(/resizable-columns/);
    expect(table.style.tableLayout).toBe('fixed');
    const cols = t.all('colgroup col');
    expect(cols).toHaveLength(3);
    expect(t.all('thead .col-resize-handle')).toHaveLength(3);
    const total = cols.reduce((sum, col) => sum + parseFloat(col.style.width), 0);
    expect(parseFloat(table.style.width)).toBe(total);
    t.unmount();
  });

  it('widens a column by dragging its handle, and the table follows', () => {
    const t = mount({ resizableColumns: true });
    const before = parseFloat(t.q('table').style.width);
    const handle = t.all('thead .col-resize-handle')[1];
    jest
      .spyOn(handle.parentElement as HTMLElement, 'getBoundingClientRect')
      .mockReturnValue({ width: 135, left: 0, right: 135, top: 0, bottom: 30, height: 30, x: 0, y: 0, toJSON: () => ({}) });

    act(() => {
      Simulate.mouseDown(handle, { clientX: 400 });
    });
    act(() => {
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 460 }));
    });
    act(() => {
      document.dispatchEvent(new MouseEvent('mouseup', { clientX: 460 }));
    });

    expect(parseFloat(t.all('colgroup col')[1].style.width)).toBe(195);
    expect(parseFloat(t.q('table').style.width)).toBe(before + 60);
    // The toolbar offers the way back.
    expect(t.q('.toolbar-btn[title*="Ripristina"]')).not.toBeNull();
    t.unmount();
  });

  it('moves a metric column, header and values together, with the reorder flag', () => {
    const t = mount({ reorderColumnsByDrag: true });
    const before = headerTitles(t);
    expect(before.slice(1)).toEqual(['Richieste', 'Prime visite']);
    const headers = t.all('thead th[draggable="true"]');
    expect(headers).toHaveLength(2);

    const rect = { left: 0, width: 100, right: 100, top: 0, bottom: 30, height: 30, x: 0, y: 0, toJSON: () => ({}) };
    jest.spyOn(headers[0], 'getBoundingClientRect').mockReturnValue(rect);
    const dataTransfer = { setData: () => undefined, getData: () => 'Prime visite', dropEffect: '', effectAllowed: '' };
    act(() => {
      Simulate.dragStart(headers[1], { dataTransfer });
    });
    act(() => {
      Simulate.dragOver(headers[0], { dataTransfer, clientX: 10 });
    });
    act(() => {
      Simulate.drop(headers[0], { dataTransfer, clientX: 10 });
    });

    expect(headerTitles(t).slice(1)).toEqual(['Prime visite', 'Richieste']);
    // The values follow their headers: in the ROMA row, 3 (Prime visite) now comes before 10 (Richieste).
    const romaRow = t.all('tbody tr').find(tr => (tr.textContent || '').includes('ROMA')) as HTMLElement;
    const cells = Array.from(romaRow.querySelectorAll('td')).map(td => td.textContent || '');
    expect(cells.slice(1)).toEqual(['3', '10']);
    expect(JSON.parse(window.localStorage.getItem(layoutStorageKey(77)) as string).order).toEqual([
      'Prime visite',
      'Richieste',
    ]);
    t.unmount();
  });

  it('starts from the layout saved for the chart', () => {
    window.localStorage.setItem(
      layoutStorageKey(77),
      JSON.stringify({ widths: { Richieste: 222 }, order: ['Prime visite', 'Richieste'] }),
    );
    const t = mount({ reorderColumnsByDrag: true, resizableColumns: true });
    expect(headerTitles(t).slice(1)).toEqual(['Prime visite', 'Richieste']);
    const widths = t.all('colgroup col').map(col => parseFloat(col.style.width));
    expect(widths[2]).toBe(222);
    t.unmount();
  });

  it('puts the columns back with the reset button', () => {
    window.localStorage.setItem(
      layoutStorageKey(77),
      JSON.stringify({ widths: {}, order: ['Prime visite', 'Richieste'] }),
    );
    const t = mount({ reorderColumnsByDrag: true });
    act(() => {
      Simulate.click(t.q('.toolbar-btn[title*="Ripristina"]'));
    });
    expect(headerTitles(t).slice(1)).toEqual(['Richieste', 'Prime visite']);
    expect(window.localStorage.getItem(layoutStorageKey(77))).toBeNull();
    t.unmount();
  });

  it('dynamically expands columns to fill 100% of container width when measured', () => {
    const clientWidthSpy = jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.classList && this.classList.contains('table-scroll-wrapper')) {
        return 1200;
      }
      return 0;
    });

    const t = mount({ resizableColumns: true });
    const cols = t.all('colgroup col');
    expect(cols).toHaveLength(3);
    const total = cols.reduce((sum, col) => sum + parseFloat(col.style.width), 0);
    expect(total).toBe(1200);
    expect(parseFloat(t.q('table.hierarchical-table').style.width)).toBe(1200);

    const colWidths = cols.map(c => parseFloat(c.style.width));
    expect(colWidths[0]).toBe(611);
    expect(colWidths[1]).toBe(295);
    expect(colWidths[2]).toBe(294);

    clientWidthSpy.mockRestore();
    t.unmount();
  });

  it('allows resizing in a dynamically expanded table and respects reset', () => {
    const clientWidthSpy = jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.classList && this.classList.contains('table-scroll-wrapper')) {
        return 1200;
      }
      return 0;
    });

    const t = mount({ resizableColumns: true });
    const handle = t.all('thead .col-resize-handle')[1];
    jest.spyOn(handle.parentElement as HTMLElement, 'getBoundingClientRect').mockReturnValue({
      width: 295,
      left: 611,
      right: 906,
      top: 0,
      bottom: 30,
      height: 30,
      x: 611,
      y: 0,
      toJSON: () => ({}),
    });

    act(() => {
      Simulate.mouseDown(handle, { clientX: 906 });
    });
    act(() => {
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 956 }));
    });
    act(() => {
      document.dispatchEvent(new MouseEvent('mouseup', { clientX: 956 }));
    });

    expect(parseFloat(t.all('colgroup col')[1].style.width)).toBe(345);
    expect(parseFloat(t.q('table.hierarchical-table').style.width)).toBe(1200);

    // Double-click resets that column back to proportional
    act(() => {
      Simulate.doubleClick(handle);
    });
    expect(parseFloat(t.all('colgroup col')[1].style.width)).toBe(295);

    clientWidthSpy.mockRestore();
    t.unmount();
  });
});
