import { MetricPolarity, TableColumn, TreeNode } from '../../types';

/** Numero con segno e un decimale: +14.2%, -3.0%. */
export const signedPercent = (value: number): string => `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;

/** Freccia che precede una variazione: su con il più, giù con il meno, niente a zero. */
export const arrowOf = (value: number): string => (value > 0 ? '▲ +' : value < 0 ? '▼ ' : '');

/** Classe di colore di una variazione; con polarità "meno è meglio" verde e rosso si scambiano. */
export function deltaClassName(val: number, polarity?: MetricPolarity): string {
  if (val === 0) return 'delta-neutral';
  const improves = polarity === 'lower_is_better' ? val < 0 : val > 0;
  return improves ? 'delta-positive' : 'delta-negative';
}

/** Numero finito dal valore di una cella (numero o testo numerico), altrimenti null. */
export function numericValue(val: unknown): number | null {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string' && val.trim() !== '' && Number.isFinite(Number(val))) return Number(val);
  return null;
}

type ColumnRef = Pick<TableColumn, 'key' | 'baseMetric'>;
type NodeValues = Pick<TreeNode, 'metrics' | 'subtotals'>;

const finite = (raw: unknown): raw is number => typeof raw === 'number' && Number.isFinite(raw);

/**
 * Variazione % da mostrare come badge accanto al valore di una cella (con "Variazione % tra
 * periodi" attiva). La cerca in tre posti, dal più specifico: la variazione della colonna pivot,
 * la variazione sul periodo di confronto, la metrica di variazione accanto alla metrica.
 * Vale per le righe dell'albero e per il totale generale.
 */
export function findVarianceDelta(node: NodeValues, col: ColumnRef): number | null {
  const read = (key: string): unknown => node.metrics?.[key] ?? node.subtotals?.[key];

  if (col.key.includes('___')) {
    const pivotKey = col.key.replace(/^(.+?)___(.+)$/, '$1___delta_pct___$2');
    const raw = read(pivotKey);
    if (finite(raw)) return raw;
  }

  const baseMetric = col.baseMetric ?? col.key.split('___')[0];
  const periodDelta = read(`${baseMetric}___period_delta_pct`);
  if (finite(periodDelta)) return periodDelta;

  for (const key of [
    `${baseMetric}___delta`,
    `delta_${baseMetric}_pct`,
    `${baseMetric}_delta_pct`,
    `delta_${baseMetric}`,
  ]) {
    const raw = read(key);
    if (finite(raw)) return raw;
  }
  return null;
}

/** Valore diverso dalla base della simulazione What-If (oltre l'arrotondamento). */
export function isSimulatedChange(value: unknown, baseline: unknown): value is number {
  return typeof value === 'number' && typeof baseline === 'number' && Math.abs(value - baseline) > 0.0001;
}
