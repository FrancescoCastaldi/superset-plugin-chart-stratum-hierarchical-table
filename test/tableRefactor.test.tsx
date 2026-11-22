/**
 * @jest-environment jsdom
 */
jest.mock('@superset-ui/core', () => ({
  getNumberFormatter: (fmt: string) => (val: any) => `fmt[${fmt}](${val})`,
  ensureIsArray: (val: any) =>
    val === null || val === undefined ? [] : Array.isArray(val) ? val : [val],
}));

import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act, Simulate } from 'react-dom/test-utils';
import { findVarianceDelta, isSimulatedChange } from '../src/components/cells/cellUtils';
import ErrorBoundary from '../src/components/ErrorBoundary';
import HierarchicalTable from '../src/components/HierarchicalTable';
import { useExpandedKeys } from '../src/components/hooks/useExpandedKeys';
import { useWhatIf } from '../src/components/hooks/useWhatIf';
import transformProps from '../src/plugin/transformProps';
import { TreeNode, WhatIfBaseline } from '../src/types';

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

const props = (formData: Record<string, unknown>, data: Record<string, unknown>[]) =>
  transformProps({
    width: 900,
    height: 500,
    formData: { slice_id: 11, groupby: ['sede'], metrics: ['Richieste'], ...formData },
    queriesData: [{ data }],
  } as any);

const SEDI = [
  { sede: 'ROMA', Richieste: 10 },
  { sede: 'MILANO', Richieste: 20 },
];

describe('stati della tabella', () => {
  it('senza righe dice che non ci sono dati', () => {
    act(() => root.render(<HierarchicalTable {...(props({}, []) as any)} />));
    expect(container.querySelector('.empty-state')?.textContent).toBe('Nessun dato da mostrare per la tabella gerarchica.');
  });

  it('senza metriche invita a sceglierne una', () => {
    act(() => root.render(<HierarchicalTable {...(props({ metrics: [] }, []) as any)} />));
    expect(container.querySelector('.empty-state')?.textContent).toContain('almeno una metrica');
  });

  it('senza dimensioni invita a sceglierne una', () => {
    act(() => root.render(<HierarchicalTable {...(props({ groupby: [] }, []) as any)} />));
    expect(container.querySelector('.empty-state')?.textContent).toContain('almeno una dimensione');
  });

  it('una ricerca senza risultati lo dice in una riga', () => {
    jest.useFakeTimers();
    try {
      act(() => root.render(<HierarchicalTable {...(props({}, SEDI) as any)} />));
      const input = container.querySelector('input.table-search-input') as HTMLInputElement;
      input.value = 'zzzz';
      act(() => Simulate.change(input));
      act(() => {
        jest.advanceTimersByTime(300);
      });
      expect(container.querySelector('.no-results-row')?.textContent).toBe('Nessun nodo corrisponde alla ricerca.');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('ErrorBoundary', () => {
  const Boom = () => {
    throw new Error('dato inatteso');
  };

  it('mostra un messaggio al posto del grafico e si riprende quando cambiano i dati', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      act(() =>
        root.render(
          <ErrorBoundary resetKey={1}>
            <Boom />
          </ErrorBoundary>,
        ),
      );
      const alert = container.querySelector('[role="alert"]');
      expect(alert?.textContent).toContain('Impossibile mostrare la tabella.');
      expect(alert?.textContent).toContain('dato inatteso');

      act(() =>
        root.render(
          <ErrorBoundary resetKey={2}>
            <p>ok</p>
          </ErrorBoundary>,
        ),
      );
      expect(container.textContent).toBe('ok');
    } finally {
      spy.mockRestore();
    }
  });
});

describe('nodi espansi', () => {
  const node = (key: string, depth: number, children?: TreeNode[]): TreeNode => ({
    key,
    id: key,
    name: key,
    depth,
    path: [key],
    isLeaf: !children,
    children,
    metrics: {},
  });
  const tree = (...extra: string[]): TreeNode[] => [
    node('a', 0, [node('a1', 1, [node('a1x', 2)])]),
    ...extra.map(k => node(k, 0, [node(`${k}1`, 1)])),
  ];

  let latest: ReturnType<typeof useExpandedKeys>;
  const Probe = ({ data, depth }: { data: TreeNode[]; depth: number }) => {
    latest = useExpandedKeys(data, data, depth);
    return null;
  };
  const keys = () => Array.from(latest.expandedKeys).sort();

  it('parte dal livello iniziale', () => {
    act(() => root.render(<Probe data={tree('b')} depth={1} />));
    expect(keys()).toEqual(['a', 'b']);
  });

  it('applica il livello iniziale ai dati arrivati dopo il primo disegno', () => {
    act(() => root.render(<Probe data={[]} depth={1} />));
    expect(keys()).toEqual([]);
    act(() => root.render(<Probe data={tree('b')} depth={1} />));
    expect(keys()).toEqual(['a', 'b']);
  });

  it('conserva la scelta dell\'utente quando i dati cambiano e aggiunge solo i nodi nuovi', () => {
    act(() => root.render(<Probe data={tree('b')} depth={1} />));
    act(() => latest.toggleExpand('a')); // l'utente chiude a
    expect(keys()).toEqual(['b']);
    act(() => root.render(<Probe data={tree('b', 'c')} depth={1} />));
    expect(keys()).toEqual(['b', 'c']);
  });

  it('con gli stessi nodi non tocca lo stato', () => {
    act(() => root.render(<Probe data={tree('b')} depth={1} />));
    act(() => latest.toggleExpand('a'));
    act(() => root.render(<Probe data={tree('b')} depth={1} />));
    expect(keys()).toEqual(['b']);
  });

  it('riparte dal predefinito quando cambia il livello iniziale', () => {
    act(() => root.render(<Probe data={tree('b')} depth={1} />));
    act(() => latest.toggleExpand('a'));
    act(() => root.render(<Probe data={tree('b')} depth={-1} />));
    expect(keys()).toEqual(['a', 'a1', 'b']);
    act(() => root.render(<Probe data={tree('b')} depth={0} />));
    expect(keys()).toEqual([]);
  });

  it('espandi tutto e comprimi tutto', () => {
    act(() => root.render(<Probe data={tree('b')} depth={0} />));
    act(() => latest.expandAll());
    expect(keys()).toEqual(['a', 'a1', 'b']);
    act(() => latest.collapseAll());
    expect(keys()).toEqual([]);
  });
});

describe('simulazione What-If', () => {
  const leaf = (name: string, value: number): TreeNode => ({
    key: name,
    id: name,
    name,
    dimension: 'sede',
    depth: 0,
    path: [name],
    isLeaf: true,
    metrics: { Richieste: value },
  });
  const external: WhatIfBaseline = { nodeBaselines: new Map([['ROMA', { Richieste: 999 }]]) };

  let latest: ReturnType<typeof useWhatIf>;
  const Probe = ({ data }: { data: TreeNode[] }) => {
    latest = useWhatIf({
      data,
      metrics: ['Richieste'],
      dimensions: ['sede'],
      aggregationMode: 'sum',
      weightColumn: '',
      metricDefinitions: [],
      externalBaseline: external,
    });
    return null;
  };

  it('senza variazioni usa i dati originali e la base esterna', () => {
    const data = [leaf('ROMA', 10)];
    act(() => root.render(<Probe data={data} />));
    expect(latest.treeData).toBe(data);
    expect(latest.baseline).toBe(external);
  });

  it('con una variazione attiva la base è quella della simulazione, non quella esterna', () => {
    const data = [leaf('ROMA', 10), leaf('MILANO', 20)];
    act(() => root.render(<Probe data={data} />));
    act(() => latest.changeAdjustments([{ metric: 'Richieste', factor: 1.1 }]));
    expect(latest.baseline).not.toBe(external);
    expect(latest.baseline?.nodeBaselines.get('ROMA')?.Richieste).toBe(10);
    expect(latest.treeData[0].metrics.Richieste).toBeCloseTo(11);
    act(() => latest.reset());
    expect(latest.baseline).toBe(external);
  });
});

describe('variazione accanto al valore', () => {
  const col = { key: 'visite', baseMetric: 'visite' };

  it('cerca prima nella colonna pivot, poi nel periodo di confronto, poi nelle metriche accanto', () => {
    expect(findVarianceDelta({ metrics: { visite___delta_pct___2026: 7, visite___period_delta_pct: 3 } }, { key: 'visite___2026' })).toBe(7);
    expect(findVarianceDelta({ metrics: { visite___period_delta_pct: 3, delta_visite_pct: 1 } }, col)).toBe(3);
    expect(findVarianceDelta({ metrics: { delta_visite_pct: 5 } }, col)).toBe(5);
    expect(findVarianceDelta({ metrics: { visite___delta: 2 } }, col)).toBe(2);
    expect(findVarianceDelta({ metrics: { visite: 1 } }, col)).toBeNull();
  });

  it('legge anche i subtotali e ignora i valori non numerici', () => {
    expect(findVarianceDelta({ metrics: {}, subtotals: { visite___delta: 4 } }, col)).toBe(4);
    expect(findVarianceDelta({ metrics: { visite___delta: 'Nuovo' } }, col)).toBeNull();
  });

  it('riconosce una variazione simulata solo oltre l\'arrotondamento', () => {
    expect(isSimulatedChange(10, 10)).toBe(false);
    expect(isSimulatedChange(10.00001, 10)).toBe(false);
    expect(isSimulatedChange(11, 10)).toBe(true);
    expect(isSimulatedChange('11', 10)).toBe(false);
  });
});

describe('intestazioni', () => {
  it('si ordinano con Invio e dichiarano aria-sort', () => {
    act(() => root.render(<HierarchicalTable {...(props({}, SEDI) as any)} />));
    const header = Array.from(container.querySelectorAll('thead th')).find(th => th.textContent?.includes('Richieste')) as HTMLElement;
    expect(header.getAttribute('aria-sort')).toBe('none');
    act(() => Simulate.keyDown(header, { key: 'Enter' }));
    const after = Array.from(container.querySelectorAll('thead th')).find(th => th.textContent?.includes('Richieste')) as HTMLElement;
    expect(after.getAttribute('aria-sort')).toBe('ascending');
    act(() => Simulate.keyDown(after, { key: ' ' }));
    const again = Array.from(container.querySelectorAll('thead th')).find(th => th.textContent?.includes('Richieste')) as HTMLElement;
    expect(again.getAttribute('aria-sort')).toBe('descending');
  });
});
