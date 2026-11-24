import { MetricDefinition, TreeNode } from '../src/types';
import { applyMetricDefinitions, normalizeMetricDefinitions } from '../src/utils/metricSemantics';

function node(
  key: string,
  metrics: Record<string, number | null>,
  children?: TreeNode[],
  depth = 0,
): TreeNode {
  return {
    key,
    id: key,
    name: key,
    depth,
    path: [key],
    isLeaf: !children || children.length === 0,
    children,
    metrics,
  };
}

const margin: MetricDefinition = {
  metric: 'margine',
  type: 'formula',
  formula: '([ricavi] - costi) / ricavi * 100',
};

describe('normalizeMetricDefinitions, formule', () => {
  it("accetta una formula valida e tiene l'etichetta", () => {
    const [def] = normalizeMetricDefinitions([
      {
        metric: 'margine',
        type: 'formula',
        formula: '(ricavi - costi) / ricavi * 100',
        label: 'Margine %',
      },
    ]);
    expect(def).toMatchObject({ metric: 'margine', type: 'formula', label: 'Margine %' });
  });

  it('scarta una formula che non si legge o che cita se stessa', () => {
    expect(
      normalizeMetricDefinitions([{ metric: 'x', type: 'formula', formula: 'ricavi +' }]),
    ).toEqual([]);
    expect(
      normalizeMetricDefinitions([{ metric: 'x', type: 'formula', formula: 'x * 2' }]),
    ).toEqual([]);
    expect(normalizeMetricDefinitions([{ metric: 'x', type: 'formula' }])).toEqual([]);
  });
});

describe('applyMetricDefinitions, formule', () => {
  it('calcola la formula su ogni foglia', () => {
    const leaf = node('a', { ricavi: 100, costi: 70 }, undefined, 1);
    applyMetricDefinitions([leaf], undefined, [margin]);
    expect(leaf.metrics.margine).toBeCloseTo(30);
  });

  it('ricalcola il padre dai propri totali, non dalla media dei figli', () => {
    const a = node('a', { ricavi: 100, costi: 70 }, undefined, 1);
    const b = node('b', { ricavi: 300, costi: 150 }, undefined, 1);
    // Margini dei figli: 30% e 50%, media 40%. Sui totali del padre: (400 - 220) / 400 = 45%.
    const parent = node('p', { ricavi: 400, costi: 220 }, [a, b]);
    applyMetricDefinitions([parent], undefined, [margin]);
    expect(parent.metrics.margine).toBeCloseTo(45);
    expect(a.metrics.margine).toBeCloseTo(30);
    expect(b.metrics.margine).toBeCloseTo(50);
  });

  it('calcola il totale generale dai propri valori', () => {
    const a = node('a', { ricavi: 100, costi: 70 }, undefined, 0);
    const b = node('b', { ricavi: 300, costi: 150 }, undefined, 0);
    const total = node('total', { ricavi: 400, costi: 220 });
    applyMetricDefinitions([a, b], total, [margin]);
    expect(total.metrics.margine).toBeCloseTo(45);
  });

  it('crea le chiavi di formula per ogni variante pivot degli operandi', () => {
    const leaf = node(
      'a',
      { ricavi___Gen: 100, costi___Gen: 70, ricavi___Feb: 200, costi___Feb: 150 },
      undefined,
      1,
    );
    applyMetricDefinitions([leaf], undefined, [margin]);
    expect(leaf.metrics['margine___Gen']).toBeCloseTo(30);
    expect(leaf.metrics['margine___Feb']).toBeCloseTo(25);
    expect(leaf.metrics.margine).toBeUndefined();
  });

  it('dà null quando un operando manca sul nodo', () => {
    const leaf = node('a', { ricavi: 100 }, undefined, 1);
    applyMetricDefinitions([leaf], undefined, [margin]);
    expect(leaf.metrics.margine).toBeNull();
  });

  it('dà null per divisione per zero', () => {
    const leaf = node('a', { ricavi: 0, costi: 5 }, undefined, 1);
    applyMetricDefinitions([leaf], undefined, [margin]);
    expect(leaf.metrics.margine).toBeNull();
  });

  it("calcola una formula che cita un'altra formula, in qualunque ordine di definizione", () => {
    const doubled: MetricDefinition = {
      metric: 'margine_doppio',
      type: 'formula',
      formula: 'margine * 2',
    };
    const leaf = node('a', { ricavi: 100, costi: 70 }, undefined, 1);
    applyMetricDefinitions([leaf], undefined, [doubled, margin]);
    expect(leaf.metrics.margine_doppio).toBeCloseTo(60);
  });

  it('lascia fuori le formule in ciclo senza bloccare le altre', () => {
    const a: MetricDefinition = { metric: 'a', type: 'formula', formula: 'b + 1' };
    const b: MetricDefinition = { metric: 'b', type: 'formula', formula: 'a + 1' };
    const leaf = node('n', { ricavi: 100, costi: 70 }, undefined, 1);
    applyMetricDefinitions([leaf], undefined, [a, b, margin]);
    expect(leaf.metrics.a).toBeUndefined();
    expect(leaf.metrics.b).toBeUndefined();
    expect(leaf.metrics.margine).toBeCloseTo(30);
  });

  it('non tocca il valore di una metrica senza formula', () => {
    const leaf = node('a', { ricavi: 100, costi: 70, altro: 5 }, undefined, 1);
    applyMetricDefinitions([leaf], undefined, [margin]);
    expect(leaf.metrics.ricavi).toBe(100);
    expect(leaf.metrics.altro).toBe(5);
  });
});
