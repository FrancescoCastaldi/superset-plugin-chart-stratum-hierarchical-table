import { MetricRowFormat, TableColumn, TreeNode } from '../types';

/**
 * Metriche sulle righe: le metriche diventano un livello dell'albero, e le colonne diventano i
 * periodi del pivot (o una sola colonna "Valore" senza pivot). Esempio con la metrica dopo l'ultimo
 * livello: Sede > Ambulatorio > [Ricavi, Costi, Margine %], dove ogni riga metrica ha i valori della
 * propria foglia, mentre sui livelli superiori (con subtotali attivi) ha il valore del nodo.
 *
 * Il livello si può mettere anche più in alto: sotto ogni riga metrica compare il sottoalbero delle
 * dimensioni più in basso, ripetuto per ciascuna metrica, con i valori di quella metrica.
 */

export interface MetricsOnRowsOptions {
  /** Metriche (nome base) nell'ordine di visualizzazione. */
  metrics: string[];
  /** Quante dimensioni stanno sopra il livello metrica: 0 in cima, dimensions.length dopo l'ultima. */
  position: number;
  /** Numero di dimensioni dell'albero. */
  dimensionCount: number;
  /** Mostra le righe metrica anche sui livelli superiori al livello metrica (subtotali). */
  subtotals: boolean;
  /** Titolo del valore senza pivot. */
  valueLabel: string;
  /** Titolo della riga di un metrica (la formula può avere un'etichetta). */
  labelFor: (metric: string) => string;
  /** Totale generale: diventa un nodo "Totale" con le righe metrica; undefined per nasconderlo. */
  grandTotal?: TreeNode;
  grandTotalLabel: string;
  grandTotalPosition: 'top' | 'bottom';
}

export interface MetricsOnRowsResult {
  data: TreeNode[];
  columns: TableColumn[];
}

/** Chiave del valore quando la tabella non ha pivot: la colonna è unica. */
export const METRIC_VALUE_KEY = '__value';

const slotKey = (slot: string): string => (slot === '' ? METRIC_VALUE_KEY : slot);

/**
 * Metrica e periodo di una colonna metrica: la chiave è la metrica seguita dal suffisso del
 * periodo (`ricavi___Gen`, `ricavi__1 year ago`, `ricavi` nel caso piatto). Null se non si riconosce.
 */
function splitColumnKey(key: string, metrics: string[]): { metric: string; slot: string } | null {
  const candidates = metrics
    .filter(m => key === m || key.startsWith(`${m}___`) || key.startsWith(`${m}__`))
    .sort((a, b) => b.length - a.length);
  const metric = candidates[0];
  if (metric === undefined) return null;
  return { metric, slot: key.slice(metric.length) };
}

/** Somma delle radici per chiave: il totale quando manca il totale generale. */
function sumOfRoots(roots: TreeNode[]): TreeNode {
  const metrics: Record<string, number | string | null> = {};
  for (const root of roots) {
    for (const [key, value] of Object.entries(root.metrics)) {
      if (typeof value === 'number')
        metrics[key] = (typeof metrics[key] === 'number' ? (metrics[key] as number) : 0) + value;
    }
  }
  return { key: 'root', id: 'root', name: '', depth: 0, path: [], isLeaf: false, metrics };
}

/** Valori di una metrica su un nodo, nelle chiavi delle colonne-periodo. */
function projectMetric(
  source: Record<string, number | string | null>,
  metric: string,
  slots: string[],
): Record<string, number | string | null> {
  const out: Record<string, number | string | null> = {};
  for (const slot of slots) {
    const value = source[metric + slot];
    out[slotKey(slot)] = value === undefined ? null : value;
  }
  return out;
}

/** Copia del sottoalbero per una riga metrica: chiavi univoche per riga, valori della sola metrica. */
function cloneForMetric(
  nodes: TreeNode[],
  prefix: string,
  depthShift: number,
  metric: string,
  slots: string[],
  labelFor: (metric: string) => string,
): TreeNode[] {
  return nodes.map(node => ({
    ...node,
    key: `${prefix}/${node.key}`,
    id: `${prefix}/${node.id}`,
    depth: node.depth + depthShift,
    valueless: false,
    metrics: projectMetric(node.metrics, metric, slots),
    subtotals: undefined,
    children: node.children
      ? cloneForMetric(node.children, prefix, depthShift, metric, slots, labelFor)
      : undefined,
  }));
}

interface RowContext {
  metrics: string[];
  slots: string[];
  dimensionCount: number;
  subtotals: boolean;
  position: number;
  labelFor: (metric: string) => string;
}

/** Righe metrica sotto un nodo (o al livello radice), con i valori del nodo e il sottoalbero per metrica. */
function metricRowsFor(
  parent: TreeNode | undefined,
  parentKey: string,
  parentDepth: number,
  originals: TreeNode[],
  ctx: RowContext,
): TreeNode[] {
  return ctx.metrics.map(metric => {
    const key = `${parentKey}|m:${metric}`;
    const values = parent ? projectMetric(parent.metrics, metric, ctx.slots) : {};
    // Sotto la riga restano le dimensioni più in basso, se ci sono (le foglie non ne hanno).
    const children =
      originals.length > 0
        ? cloneForMetric(originals, key, 1, metric, ctx.slots, ctx.labelFor)
        : [];
    return {
      key,
      id: key,
      name: ctx.labelFor(metric),
      dimension: parent?.dimension,
      depth: parentDepth,
      path: parent?.path ?? [],
      rawPath: parent?.rawPath,
      isLeaf: children.length === 0,
      children: children.length > 0 ? children : undefined,
      metrics: values,
      metricRow: { metric, label: ctx.labelFor(metric), subtotal: parent !== undefined },
    };
  });
}

/** Nodo sopra il livello metrica: i valori non si mostrano, si mostrano le sue righe metrica. */
function rewriteAbove(node: TreeNode, dimensionDepth: number, ctx: RowContext): TreeNode {
  const originals = node.children ?? [];
  const rowDepth = dimensionDepth + 1;
  node.valueless = true;
  if (dimensionDepth === ctx.position - 1 || originals.length === 0) {
    node.children = metricRowsFor(node, node.key, rowDepth, originals, ctx);
    return node;
  }
  const rewritten = originals.map(child => rewriteAbove(child, dimensionDepth + 1, ctx));
  node.children = ctx.subtotals
    ? [...metricRowsFor(node, node.key, rowDepth, [], ctx), ...rewritten]
    : rewritten;
  return node;
}

/**
 * Riorganizza l'albero e le colonne. Le colonne metriche diventano una per periodo (chiave uguale
 * allo slot); quelle non riconosciute, e le sparkline, si tolgono. Le colonne non metriche restano.
 */
export function pivotMetricsToRows(
  tree: TreeNode[],
  columns: TableColumn[],
  options: MetricsOnRowsOptions,
): MetricsOnRowsResult {
  const metricColumns: { column: TableColumn; metric: string; slot: string }[] = [];
  const otherColumns: TableColumn[] = [];
  for (const column of columns) {
    const split =
      column.isMetric && !column.sparkline ? splitColumnKey(column.key, options.metrics) : null;
    if (split) metricColumns.push({ column, ...split });
    else if (!column.isMetric) otherColumns.push(column);
  }

  const slotOrder: string[] = [];
  const slotColumns = new Map<
    string,
    TableColumn & { perMetric: Record<string, MetricRowFormat> }
  >();
  for (const { column, metric, slot } of metricColumns) {
    let target = slotColumns.get(slot);
    if (!target) {
      slotOrder.push(slot);
      target = {
        ...column,
        key: slotKey(slot),
        dataIndex: slotKey(slot),
        title: slot === '' ? options.valueLabel : column.title,
        baseMetric: undefined,
        sparkline: undefined,
        perMetric: {},
      };
      slotColumns.set(slot, target);
    }
    target.perMetric[metric] = {
      formatter: column.formatter,
      polarity: column.polarity,
      deltaBaseline: column.deltaBaseline,
      exportFormatted: column.exportFormatted,
    };
  }
  const slots = slotOrder;
  const usedMetrics = options.metrics.filter(m => metricColumns.some(c => c.metric === m));
  const ctx: RowContext = {
    metrics: usedMetrics,
    slots,
    dimensionCount: options.dimensionCount,
    subtotals: options.subtotals,
    position: options.position,
    labelFor: options.labelFor,
  };

  let data: TreeNode[];
  // In cima le righe metrica sono le radici: il loro valore è il totale, e il totale non si ripete.
  const atTop = usedMetrics.length > 0 && options.position <= 0;
  if (usedMetrics.length === 0) {
    data = tree;
  } else if (atTop) {
    const totals = options.grandTotal ?? sumOfRoots(tree);
    data = metricRowsFor(totals, 'root', 0, tree, ctx);
  } else {
    data = tree.map(root => rewriteAbove(root, 0, ctx));
  }

  if (options.grandTotal && usedMetrics.length > 0 && !atTop) {
    const totalNode: TreeNode = {
      key: 'grand-total',
      id: 'grand-total',
      name: options.grandTotalLabel,
      depth: 0,
      path: [],
      isLeaf: false,
      valueless: true,
      metrics: {},
      children: metricRowsFor(options.grandTotal, 'grand-total', 1, [], ctx),
    };
    data = options.grandTotalPosition === 'top' ? [totalNode, ...data] : [...data, totalNode];
  }

  const valueColumns = slots.map(slot => slotColumns.get(slot)!);
  return {
    data,
    columns: [...otherColumns, ...valueColumns],
  };
}
