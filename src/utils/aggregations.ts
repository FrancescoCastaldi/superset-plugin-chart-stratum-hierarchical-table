import { TreeNode, AggregationFunction } from '../types';
import { hasDiffToken } from './nameHeuristics';
import { isTimeMetricName } from './timeMetricRegistry';

const MEMO_LIMIT = 10000;

/** 'attesa' names that count people or bookings waiting (a volume), not a waiting time. */
const COUNT_OF_WAITING = /prenotazion|pazient|numero|conteggio|\bn\.|\bin attesa/;

/** Memoizes a pure function of a metric name; the classifiers below run once per distinct name. */
function memoizeByName<T>(fn: (name: string) => T): (name: string) => T {
  const cache = new Map<string, T>();
  return (name: string): T => {
    let value = cache.get(name);
    if (value === undefined) {
      if (cache.size >= MEMO_LIMIT) cache.clear();
      value = fn(name);
      cache.set(name, value);
    }
    return value;
  };
}

/**
 * Calculates aggregate values for a list of child numbers based on the aggregation function.
 */
export function calculateAggregation(
  values: number[],
  aggFunc: AggregationFunction = 'sum',
): number | null {
  if (!values || values.length === 0) return null;

  switch (aggFunc) {
    case 'sum':
      return values.reduce((acc, curr) => acc + curr, 0);
    case 'avg':
      return values.reduce((acc, curr) => acc + curr, 0) / values.length;
    case 'min':
      return Math.min(...values);
    case 'max':
      return Math.max(...values);
    case 'count':
      return values.length;
    default:
      return values.reduce((acc, curr) => acc + curr, 0);
  }
}

/**
 * Checks if a metric is a derived percentage/ratio metric that should not be summed.
 */
export const isDerivedMetric = memoizeByName(function isDerivedMetric(metricName: string): boolean {
  const m = metricName.toLowerCase();
  const { base } = splitMetricKey(metricName);
  return (
    m.includes('delta') ||
    hasDiffToken(m) ||
    (m.includes('variazione') || m.includes('change')) ||
    m.includes('pct') ||
    m.includes('percent') ||
    m.includes('tasso') ||
    m.includes('punti %') ||
    m.includes('punti percentuali') ||
    m.includes('p.p.') ||
    base.trim().startsWith('%')
  );
});

/**
 * Checks if a metric is an average, duration, or rate that should use weighted average rather than sum.
 */
const isRateMetricByName = memoizeByName(function isRateMetricByName(metricName: string): boolean {
  const m = metricName.toLowerCase();
  const isDelta = m.includes('delta') || (m.includes('variazione') || m.includes('change')) || hasDiffToken(m);
  const isAcceptanceRate =
    m.includes('acc_corr') ||
    m.includes('acc_conf') ||
    (m.includes('accettazione') &&
      !(m.includes('totale') || m.includes('total')) &&
      !m.includes('numero') &&
      !m.includes('conteggio'));
  return (
    m.includes('lt_off') ||
    isAcceptanceRate ||
    (m.includes('attesa') && !COUNT_OF_WAITING.test(m)) ||
    m.includes('tasso') ||
    (!isDelta && (m.includes('%') || m.includes('tempo') || m.includes('durata') || m.includes('media')))
  );
});

/**
 * Average, duration or rate: rolled up with a weighted average instead of a sum. The metrics that hold
 * times (read from the data, whatever their name) always are.
 */
export const isRateMetric = (metricName: string, timeMetrics?: ReadonlySet<string>): boolean =>
  isTimeMetricName(metricName, timeMetrics) || isRateMetricByName(metricName);

/**
 * Helper to extract base metric and pivot suffix (e.g. 'delta_richieste_pct___SSN' -> base: 'delta_richieste_pct', pivot: '___SSN')
 */
const splitMetricKey = memoizeByName(function splitMetricKey(key: string): { base: string; suffix: string } {
  const pivotIdx = key.indexOf('___');
  if (pivotIdx !== -1) {
    return {
      base: key.substring(0, pivotIdx),
      suffix: key.substring(pivotIdx),
    };
  }
  return { base: key, suffix: '' };
});

/**
 * Checks if a metric represents a count of distinct physical entities (e.g. 'Sportelli Attivi')
 * that should roll up via MAX at and below the entity's hierarchy depth, and via SUM above it.
 */
export const isDistinctEntityMetric = memoizeByName(function isDistinctEntityMetric(metricName: string): boolean {
  const { base } = splitMetricKey(metricName);
  const m = base.toLowerCase().trim();
  return (
    m.includes('sportelli attivi') ||
    m.includes('sportelli_attivi') ||
    m.includes('sedi attive') ||
    m.includes('sedi_attive') ||
    m.includes('stanze attive') ||
    m.includes('stanze_attive') ||
    m.includes('punti attivi') ||
    m.includes('punti_attivi') ||
    m.startsWith('distinct_') ||
    m.endsWith('_distinct')
  );
});

/**
 * Resolves the 0-based hierarchy depth corresponding to the entity counted by `metricName`
 * (e.g. depth = 1 for 'Sportello' in ['SedeDescrizione', 'Sportello', 'ServizioDescrizione', ...]).
 * Nodes with `depth >= entityDepth` represent a single entity (or its sub-slices) and roll up with MAX;
 * nodes with `depth < entityDepth` aggregate disjoint child entities with SUM.
 */
export function resolveDistinctEntityDepth(
  metricName: string,
  dimensions?: string[],
  nodes?: TreeNode[],
): number {
  const { base } = splitMetricKey(metricName);
  const m = base.toLowerCase();
  const targetKeywords =
    m.includes('sedi') || m.includes('sede')
      ? ['sede', 'presidio', 'struttura']
      : ['sportell', 'stanz', 'idroom', 'punto'];

  if (dimensions && dimensions.length > 0) {
    const idx = dimensions.findIndex(d =>
      targetKeywords.some(kw => d.toLowerCase().includes(kw)),
    );
    if (idx >= 0) return idx;
    if (dimensions.length === 1) return 0;
  }

  if (nodes && nodes.length > 0) {
    let curr: TreeNode | undefined = nodes[0];
    while (curr) {
      if (
        curr.dimension &&
        targetKeywords.some(kw => curr!.dimension!.toLowerCase().includes(kw))
      ) {
        return curr.depth;
      }
      curr = curr.children && curr.children.length > 0 ? curr.children[0] : undefined;
    }
    if (nodes.some(n => n.children && n.children.length > 0)) {
      return 1;
    }
    return 0;
  }

  return 1;
}

function numericValues(nodes: TreeNode[], metric: string): number[] {
  const values: number[] = [];
  for (const node of nodes) {
    const val = node.metrics[metric];
    if (typeof val === 'number' && !isNaN(val)) values.push(val);
  }
  return values;
}

/**
 * Mean of `metric` over `nodes` weighted by `weightKey`. Values without a positive weight only
 * count towards the arithmetic-mean fallback used when the weights sum to zero.
 */
export function weightedMean(nodes: TreeNode[], metric: string, weightKey: string): number | null {
  let weightedSum = 0;
  let totalWeight = 0;
  let unweightedSum = 0;
  let count = 0;
  for (const node of nodes) {
    const val = node.metrics[metric];
    if (typeof val === 'number' && !isNaN(val)) {
      const weight = node.metrics[weightKey];
      if (typeof weight === 'number' && weight > 0) {
        weightedSum += val * weight;
        totalWeight += weight;
      }
      unweightedSum += val;
      count++;
    }
  }
  if (totalWeight > 0) return weightedSum / totalWeight;
  return count > 0 ? unweightedSum / count : null;
}

const roundTenth = (val: number | null): number | null =>
  val === null ? null : Math.round(val * 10) / 10;

/**
 * Weighted average of `metric` over the children of `node`, weighted by the `weightColumn`
 * metric with the same pivot suffix (`price___2024` is weighted by `qty___2024`).
 * Falls back to the arithmetic mean when the weights sum to zero.
 */
export function weightedAvgOnNode(
  node: TreeNode,
  weightColumn: string,
  metric: string,
): number | null {
  return weightedMean(node.children ?? [], metric, weightColumn + splitMetricKey(metric).suffix);
}

const STANDARD_AGG_FUNCS = new Set(['sum', 'avg', 'min', 'max', 'count']);

/**
 * Roll-up function of the parent rows: a resolved weight column means weighted_avg; otherwise
 * the chosen avg, min, max or count applies, and sum is the default.
 */
export const rollupFunction = (weightColumn: string, mode: AggregationFunction = 'sum'): AggregationFunction => {
  if (weightColumn && !STANDARD_AGG_FUNCS.has(weightColumn.toLowerCase())) return 'weighted_avg';
  return mode === 'avg' || mode === 'min' || mode === 'max' || mode === 'count' ? mode : 'sum';
};

/** weighted_avg roll-up of one metric: the weight metric itself is summed so it can weight the next level. */
function explicitWeightedValue(nodes: TreeNode[], metric: string, weightColumn: string): number | null {
  const { base, suffix } = splitMetricKey(metric);
  return base === weightColumn
    ? calculateAggregation(numericValues(nodes, metric), 'sum')
    : weightedMean(nodes, metric, weightColumn + suffix);
}

/** Weight for derived metrics that could not be recomputed from their operands. */
function derivedFallbackWeightKey(metric: string, metricNames: string[], explicitWeight: string): string {
  const { suffix } = splitMetricKey(metric);
  if (explicitWeight) return explicitWeight + suffix;
  // Match 'total' on the base name only: pivot suffixes such as ___SUBTOTAL and ___ROW_TOTAL contain it too.
  const isTotalName = (k: string): boolean => splitMetricKey(k).base.toLowerCase().includes('total');
  return (
    metricNames.find(
      k =>
        k.endsWith(suffix) &&
        (isTotalName(k) || k.toLowerCase().includes('volume')) &&
        !isDerivedMetric(k),
    ) ||
    metricNames.find(
      k =>
        (k.toLowerCase().includes('richieste') || k.toLowerCase().includes('volume') || k.toLowerCase().includes('corr')) &&
        !isDerivedMetric(k),
    ) ||
    metricNames.find(
      k =>
        k.endsWith(suffix) &&
        (k.toLowerCase().includes('operatore') || k.toLowerCase().includes('serviti')) &&
        !isDerivedMetric(k),
    ) ||
    metricNames.find(k => isTotalName(k) && !isDerivedMetric(k)) ||
    `Total${suffix}`
  );
}

/**
 * Detects whether a metric represents a difference in percentage points (p.p. / punti percentuali),
 * which requires arithmetic subtraction (corr - conf) rather than relative percentage change ((corr - conf) / conf * 100).
 */
export function isPercentagePointsDiff(metricName: string): boolean {
  const m = metricName.toLowerCase();
  return (
    m.includes('punti') ||
    m.includes('p.p') ||
    m.endsWith('_pp') ||
    m.endsWith(' pp') ||
    (
      (m.includes('delta') || (m.includes('variazione') || m.includes('change')) || hasDiffToken(m)) &&
      (m.includes('acc') || m.includes('accettazione')) &&
      !m.includes('pct') &&
      !m.includes('percent') &&
      !m.includes('% su') &&
      !m.includes('/conf')
    )
  );
}

/**
 * Positional heuristic: finds the nearest preceding pair of (corr, conf) metrics
 * before currentIndex in allMetricKeys that share the same suffix and are not delta/diff metrics.
 */
function findPrecedingMetricPair(
  allMetricKeys: string[],
  currentIndex: number,
  suffix: string,
): { corrKey?: string; confKey?: string } {
  let foundCorr: string | undefined;
  let foundConf: string | undefined;

  for (let i = currentIndex - 1; i >= 0; i--) {
    const candidate = allMetricKeys[i];
    if (!candidate.endsWith(suffix)) continue;
    const cLower = splitMetricKey(candidate).base.toLowerCase();
    const isExcluded =
      cLower.includes('delta') ||
      (cLower.includes('variazione') || cLower.includes('change')) ||
      hasDiffToken(cLower) ||
      cLower.includes('punti') ||
      cLower.includes('p.p') ||
      cLower.endsWith('_pp');

    if (isExcluded) {
      if (foundCorr || foundConf) break;
      continue;
    }

    if (!foundCorr && (cLower.includes('corr') || (cLower.includes('corrente') || cLower.includes('current')) || cLower.includes('1ª') || cLower.includes('1a'))) {
      foundCorr = candidate;
    } else if (!foundConf && (cLower.includes('conf') || (cLower.includes('confronto') || cLower.includes('comparison')) || cLower.includes('prec'))) {
      foundConf = candidate;
    }

    if (foundCorr && foundConf) {
      return { corrKey: foundCorr, confKey: foundConf };
    }
  }

  return { corrKey: foundCorr, confKey: foundConf };
}

/**
 * Helper to find matching current and comparison metric keys for a given topic/domain.
 */
function findMetricPair(
  allMetricKeys: string[],
  domainKeywords: string[],
  suffix: string,
  fallbackCorr: string,
  fallbackConf: string,
): { corrKey: string; confKey: string } {
  const isExcluded = (k: string) => {
    const l = k.toLowerCase();
    return l.includes('delta') || (l.includes('variazione') || l.includes('change')) || hasDiffToken(l);
  };

  const matchesDomain = (k: string) => {
    const l = k.toLowerCase();
    return domainKeywords.some(kw => l.includes(kw));
  };

  const corrKey =
    allMetricKeys.find(
      k =>
        k.endsWith(suffix) &&
        matchesDomain(k) &&
        (k.toLowerCase().includes('corr') || (k.toLowerCase().includes('corrente') || k.toLowerCase().includes('current'))) &&
        !isExcluded(k),
    ) || fallbackCorr;

  const confKey =
    allMetricKeys.find(
      k =>
        k.endsWith(suffix) &&
        matchesDomain(k) &&
        (k.toLowerCase().includes('conf') || (k.toLowerCase().includes('confronto') || k.toLowerCase().includes('comparison'))) &&
        !isExcluded(k),
    ) || fallbackConf;

  return { corrKey, confKey };
}

/**
 * Calculates percentage variation between current and comparison values:
 * ((corr - conf) * 100) / conf
 */
function computePercentageVariation(
  metrics: Record<string, number | string | null>,
  key: string,
  corrKey: string,
  confKey: string,
): void {
  const rawCorr = metrics[corrKey];
  const rawConf = metrics[confKey];

  if (typeof rawCorr === 'number' && typeof rawConf === 'number') {
    if (rawConf > 0) {
      metrics[key] = Math.round(((rawCorr - rawConf) * 1000.0) / rawConf) / 10;
    } else if (rawConf === 0 && rawCorr > 0) {
      metrics[key] = 'Nuovo';
    } else if (rawConf === 0 && rawCorr === 0) {
      metrics[key] = 0;
    } else {
      metrics[key] = null;
    }
  } else if (typeof rawCorr === 'number' && rawConf === 0) {
    if (rawCorr > 0) {
      metrics[key] = 'Nuovo';
    } else {
      metrics[key] = 0;
    }
  } else if (metrics[key] === undefined) {
    metrics[key] = null;
  }
}

/**
 * Recomputes derived metrics for a node (leaf, parent, or grand total) based on its base metrics.
 */
export function recomputeDerivedMetrics(
  metrics: Record<string, number | string | null>,
  allMetricKeys: string[],
): void {
  for (let keyIdx = 0; keyIdx < allMetricKeys.length; keyIdx++) {
    const key = allMetricKeys[keyIdx];
    const { base, suffix } = splitMetricKey(key);
    const mLower = base.toLowerCase();

    // 1. Delta / Variazione Richieste (Percentage)
    if (
      (mLower.includes('delta') || (mLower.includes('variazione') || mLower.includes('change')) || hasDiffToken(mLower)) &&
      (mLower.includes('richieste') || mLower.includes('volume'))
    ) {
      const { corrKey, confKey } = findMetricPair(
        allMetricKeys,
        ['richieste', 'volume'],
        suffix,
        `richieste_corr${suffix}`,
        `richieste_conf${suffix}`,
      );
      computePercentageVariation(metrics, key, corrKey, confKey);
    }

    // 1a. Delta / Variazione Accesso Diretto (Percentage)
    else if (
      (mLower.includes('delta') || (mLower.includes('variazione') || mLower.includes('change')) || hasDiffToken(mLower)) &&
      (mLower.includes('accesso') || mLower.includes('diretto'))
    ) {
      const { corrKey, confKey } = findMetricPair(
        allMetricKeys,
        ['accesso', 'diretto'],
        suffix,
        `accesso_diretto${suffix}`,
        `accesso_diretto_conf${suffix}`,
      );
      computePercentageVariation(metrics, key, corrKey, confKey);
    }

    // 1b. Delta / Variazione Programmata (Percentage)
    else if (
      (mLower.includes('delta') || (mLower.includes('variazione') || mLower.includes('change')) || hasDiffToken(mLower)) &&
      (mLower.includes('programmata') || mLower.includes('programmazione'))
    ) {
      const { corrKey, confKey } = findMetricPair(
        allMetricKeys,
        ['programmata', 'programmazione'],
        suffix,
        `programmata${suffix}`,
        `programmata_conf${suffix}`,
      );
      computePercentageVariation(metrics, key, corrKey, confKey);
    }

    // 1c. Delta / Variazione Prime Visite (Percentage)
    else if (
      (mLower.includes('delta') || (mLower.includes('variazione') || mLower.includes('change')) || hasDiffToken(mLower)) &&
      (mLower.includes('prime') || mLower.includes('visite')) &&
      !mLower.includes('su totale') &&
      !mLower.includes('% su')
    ) {
      const { corrKey, confKey } = findMetricPair(
        allMetricKeys,
        ['prime', 'visite'],
        suffix,
        `prime_visite${suffix}`,
        `prime_visite_conf${suffix}`,
      );
      computePercentageVariation(metrics, key, corrKey, confKey);
    }

    // 1d. Delta / Variazione Controlli (Percentage)
    else if (
      (mLower.includes('delta') || (mLower.includes('variazione') || mLower.includes('change')) || hasDiffToken(mLower)) &&
      mLower.includes('controlli')
    ) {
      const { corrKey, confKey } = findMetricPair(
        allMetricKeys,
        ['controlli'],
        suffix,
        `controlli${suffix}`,
        `controlli_conf${suffix}`,
      );
      computePercentageVariation(metrics, key, corrKey, confKey);
    }

    // 1e. Generic fallback: delta_X_pct: derive operand keys from metric name
    else if (mLower.startsWith('delta_') && mLower.endsWith('_pct')) {
      const baseName = mLower.slice(6, -4);
      const corrKey =
        allMetricKeys.find(k => k === `${baseName}_corr${suffix}` || k === `${baseName}_attuale${suffix}`) ||
        `${baseName}${suffix}`;
      const confKey =
        allMetricKeys.find(k => k === `${baseName}_conf${suffix}` || k === `${baseName}_confronto${suffix}`) ||
        `${baseName}_conf${suffix}`;
      computePercentageVariation(metrics, key, corrKey, confKey);
    }

    // 2. Prime Visite Ratio (% su totale richieste, non delta confronto)
    else if (mLower.includes('pct') && mLower.includes('prime_visite')) {
      const pvKey = `prime_visite${suffix}`;
      const totKey = `richieste_corr${suffix}`;
      const ctrlKey = `controlli${suffix}`;

      const pv = typeof metrics[pvKey] === 'number' ? (metrics[pvKey] as number) : 0;
      const tot = typeof metrics[totKey] === 'number' ? (metrics[totKey] as number) : 0;
      const ctrl = typeof metrics[ctrlKey] === 'number' ? (metrics[ctrlKey] as number) : 0;

      const denom = tot > 0 ? tot : pv + ctrl;
      if (denom > 0) {
        metrics[key] = Math.round((pv * 1000.0) / denom) / 10;
      } else {
        metrics[key] = null;
      }
    }

    // 3. Delta Acceptance / Percentage Points difference (delta_acc = acc_corr - acc_conf) in p.p.
    else if (
      (mLower.includes('delta') || (mLower.includes('variazione') || mLower.includes('change')) || hasDiffToken(mLower) || mLower.includes('punti %') || mLower.includes('p.p.')) &&
      (
        mLower.includes('acc') ||
        mLower.includes('accettazione') ||
        mLower.includes('punti') ||
        mLower.includes('p.p') ||
        mLower.endsWith('_pp') ||
        mLower.endsWith(' pp')
      ) &&
      !mLower.includes('richieste') &&
      !mLower.includes('volume')
    ) {
      const preceding = findPrecedingMetricPair(allMetricKeys, keyIdx, suffix);
      const accCorrKey =
        (preceding.corrKey && preceding.confKey ? preceding.corrKey : undefined) ||
        allMetricKeys.find(
          k =>
            k.endsWith(suffix) &&
            (k.toLowerCase().includes('acc') || k.toLowerCase().includes('accettazione') || k.toLowerCase().includes('tasso') || k.toLowerCase().includes('quota')) &&
            (k.toLowerCase().includes('corr') || k.toLowerCase().includes('1ª') || k.toLowerCase().includes('1a') || (k.toLowerCase().includes('corrente') || k.toLowerCase().includes('current'))) &&
            !k.toLowerCase().includes('delta') &&
            !k.toLowerCase().includes('diff') &&
            !k.toLowerCase().includes('conf'),
        ) ||
        preceding.corrKey ||
        `acc_corr${suffix}`;

      const accConfKey =
        (preceding.corrKey && preceding.confKey ? preceding.confKey : undefined) ||
        allMetricKeys.find(
          k =>
            k.endsWith(suffix) &&
            (k.toLowerCase().includes('acc') || k.toLowerCase().includes('accettazione') || k.toLowerCase().includes('tasso') || k.toLowerCase().includes('quota')) &&
            (k.toLowerCase().includes('conf') || (k.toLowerCase().includes('confronto') || k.toLowerCase().includes('comparison'))) &&
            !k.toLowerCase().includes('delta') &&
            !k.toLowerCase().includes('diff') &&
            !k.toLowerCase().includes('corr'),
        ) ||
        preceding.confKey ||
        `acc_conf${suffix}`;

      const rawAccCorr = metrics[accCorrKey];
      const rawAccConf = metrics[accConfKey];

      if (typeof rawAccCorr === 'number' && typeof rawAccConf === 'number') {
        metrics[key] = Math.round((rawAccCorr - rawAccConf) * 10) / 10;
      } else if (metrics[key] === undefined) {
        metrics[key] = null;
      }
    }

    // 4. Delta Lead Time (delta_lt_off = lt_off_corr - lt_off_conf) in gg
    else if (
      (mLower.includes('delta') || (mLower.includes('variazione') || mLower.includes('change')) || hasDiffToken(mLower)) &&
      (mLower.includes('attesa') || mLower.includes('lt_off') || mLower.includes('lead') || (mLower.includes('giorni') && !mLower.includes('settimana'))) &&
      !mLower.includes('acc')
    ) {
      const ltCorrKey =
        allMetricKeys.find(
          k =>
            k.endsWith(suffix) &&
            (k.toLowerCase().includes('attesa') || k.toLowerCase().includes('lt_off') || k.toLowerCase().includes('lead')) &&
            (k.toLowerCase().includes('corr') || k.toLowerCase().includes('media')) &&
            !k.toLowerCase().includes('delta') &&
            !k.toLowerCase().includes('diff') &&
            !k.toLowerCase().includes('conf'),
        ) || `lt_off_corr${suffix}`;

      const ltConfKey =
        allMetricKeys.find(
          k =>
            k.endsWith(suffix) &&
            (k.toLowerCase().includes('attesa') || k.toLowerCase().includes('lt_off') || k.toLowerCase().includes('lead')) &&
            (k.toLowerCase().includes('conf') || (k.toLowerCase().includes('confronto') || k.toLowerCase().includes('comparison'))) &&
            !k.toLowerCase().includes('delta') &&
            !k.toLowerCase().includes('diff') &&
            !k.toLowerCase().includes('corr'),
        ) || `lt_off_conf${suffix}`;

      const rawLtCorr = metrics[ltCorrKey];
      const rawLtConf = metrics[ltConfKey];

      if (typeof rawLtCorr === 'number' && typeof rawLtConf === 'number') {
        metrics[key] = Math.round((rawLtCorr - rawLtConf) * 10) / 10;
      } else if (metrics[key] === undefined) {
        metrics[key] = null;
      }
    }

    // 5. Generic fallback for ANY percentage variation
    else if (
      (mLower.includes('delta') || (mLower.includes('variazione') || mLower.includes('change')) || hasDiffToken(mLower)) &&
      (mLower.includes('%') || mLower.includes('pct') || mLower.includes('percent'))
    ) {
      const preceding = findPrecedingMetricPair(allMetricKeys, keyIdx, suffix);
      const corrKey =
        (preceding.corrKey && preceding.confKey ? preceding.corrKey : undefined) ||
        allMetricKeys.find(
          k =>
            k.endsWith(suffix) &&
            (k.toLowerCase().includes('corr') || (k.toLowerCase().includes('corrente') || k.toLowerCase().includes('current'))) &&
            !k.toLowerCase().includes('delta') &&
            !(k.toLowerCase().includes('variazione') || k.toLowerCase().includes('change')) &&
            !k.toLowerCase().includes('diff'),
        ) ||
        preceding.corrKey;
      const confKey =
        (preceding.corrKey && preceding.confKey ? preceding.confKey : undefined) ||
        allMetricKeys.find(
          k =>
            k.endsWith(suffix) &&
            (k.toLowerCase().includes('conf') || (k.toLowerCase().includes('confronto') || k.toLowerCase().includes('comparison'))) &&
            !k.toLowerCase().includes('delta') &&
            !(k.toLowerCase().includes('variazione') || k.toLowerCase().includes('change')) &&
            !k.toLowerCase().includes('diff'),
        ) ||
        preceding.confKey;
      if (corrKey && confKey) {
        computePercentageVariation(metrics, key, corrKey, confKey);
      }
    }

    // 6a. Self-Acceptance share (% Self vs Operatore = Self / Accettazione Totale * 100)
    else if (
      mLower.startsWith('%') &&
      mLower.includes('self') &&
      !mLower.includes('fallit')
    ) {
      const selfKey =
        allMetricKeys.find(
          k => k.endsWith(suffix) && k.toLowerCase() === `self${suffix.toLowerCase()}`,
        ) || `Self${suffix}`;
      const totKey =
        allMetricKeys.find(
          k => k.endsWith(suffix) && k.toLowerCase() === `accettazione totale${suffix.toLowerCase()}`,
        ) || `Accettazione Totale${suffix}`;
      const opKey =
        allMetricKeys.find(
          k => k.endsWith(suffix) && k.toLowerCase() === `operatore${suffix.toLowerCase()}`,
        ) || `Operatore${suffix}`;

      const selfVal = metrics[selfKey];
      const totVal = metrics[totKey];
      const opVal = metrics[opKey];

      if (typeof selfVal === 'number') {
        const denom =
          typeof totVal === 'number' && totVal > 0
            ? totVal
            : typeof opVal === 'number'
              ? selfVal + opVal
              : 0;
        if (denom > 0) {
          metrics[key] = Math.round((selfVal * 1000.0) / denom) / 10;
        }
      }
    }

    // 6b. Failed Self-Acceptance vs Operator (%Self fallite vs Operatore = Self - Fallite / Operatore * 100)
    else if (mLower.startsWith('%') && mLower.includes('fallit')) {
      const fallKey =
        allMetricKeys.find(
          k =>
            k.endsWith(suffix) &&
            k.toLowerCase().includes('fallit') &&
            !k.toLowerCase().startsWith('%'),
        ) || `Self - Fallite${suffix}`;
      const opKey =
        allMetricKeys.find(
          k => k.endsWith(suffix) && k.toLowerCase() === `operatore${suffix.toLowerCase()}`,
        ) || `Operatore${suffix}`;

      const fallVal = metrics[fallKey];
      const opVal = metrics[opKey];

      if (typeof fallVal === 'number' && typeof opVal === 'number' && opVal > 0) {
        metrics[key] = Math.round((fallVal * 1000.0) / opVal) / 10;
      }
    }

    // 6c. Generic percentage share / ratio (% <MetricName> = <MetricName> / Totale * 100)
    else if (base.trim().startsWith('%')) {
      const targetName = base.replace(/^\s*%/, '').trim().toLowerCase();
      const numKey =
        allMetricKeys.find(
          k =>
            k.endsWith(suffix) &&
            splitMetricKey(k).base.trim().toLowerCase() === targetName &&
            !isDerivedMetric(k),
        ) || `${targetName}${suffix}`;

      const totKey =
        allMetricKeys.find(
          k =>
            k.endsWith(suffix) &&
            ['totale', 'total', 'volume', 'tot'].includes(splitMetricKey(k).base.trim().toLowerCase()) &&
            !isDerivedMetric(k),
        ) || `Total${suffix}`;

      const numVal = metrics[numKey];
      const totVal = metrics[totKey];

      if (typeof numVal === 'number' && typeof totVal === 'number') {
        metrics[key] = totVal > 0 ? Math.round((numVal * 1000.0) / totVal) / 10 : null;
      }
    }
  }
}

/**
 * Recursively rolls up metric calculations from leaves to parent nodes.
 */
export function rollupTreeMetrics(
  nodes: TreeNode[],
  metricNames: string[],
  aggFunc: AggregationFunction = 'sum',
  weightColumn = '',
  dimensions?: string[],
  timeMetrics?: ReadonlySet<string>,
): void {
  // An explicit weight metric replaces every volume-based weight heuristic below.
  const explicitWeight = aggFunc === 'weighted_avg' ? weightColumn : '';

  function rollupNodes(nodeList: TreeNode[]): void {
    for (const node of nodeList) {
      if (node.children && node.children.length > 0) {
        // Rollup children first (post-order traversal)
        rollupNodes(node.children);

        // Aggregate each metric for the current parent node
        for (const metric of metricNames) {
          // Derived percentage/delta metrics will be recalculated afterwards, skip direct sum
          if (isDerivedMetric(metric)) {
            continue;
          }

          let aggregatedVal: number | null;
          if (isDistinctEntityMetric(metric)) {
            const entityDepth = resolveDistinctEntityDepth(metric, dimensions, nodes);
            const effectiveAgg: AggregationFunction = node.depth >= entityDepth ? 'max' : 'sum';
            aggregatedVal = calculateAggregation(numericValues(node.children, metric), effectiveAgg);
          } else if (explicitWeight) {
            aggregatedVal = explicitWeightedValue(node.children, metric, explicitWeight);
          } else if (isRateMetric(metric, timeMetrics)) {
            // For rate/average metrics, compute weighted average using volume if possible
            const { suffix } = splitMetricKey(metric);
            const isConf = metric.toLowerCase().includes('conf') || (metric.toLowerCase().includes('confronto') || metric.toLowerCase().includes('comparison'));
            const weightKey =
              metricNames.find(
                k =>
                  (k.toLowerCase().includes('richieste') || k.toLowerCase().includes('volume')) &&
                  (isConf
                    ? k.toLowerCase().includes('conf') || (k.toLowerCase().includes('confronto') || k.toLowerCase().includes('comparison'))
                    : k.toLowerCase().includes('corr') || (k.toLowerCase().includes('corrente') || k.toLowerCase().includes('current'))),
              ) || (isConf ? `richieste_conf${suffix}` : `richieste_corr${suffix}`);
            aggregatedVal = roundTenth(weightedMean(node.children, metric, weightKey));
          } else {
            // Standard additive metric (e.g. volume, count)
            aggregatedVal = calculateAggregation(numericValues(node.children, metric), aggFunc);
          }

          node.metrics[metric] = aggregatedVal;
          if (!node.subtotals) {
            node.subtotals = {};
          }
          node.subtotals[metric] = aggregatedVal;
        }

        // Recalculate derived metrics on parent node from its aggregated totals
        recomputeDerivedMetrics(node.metrics, metricNames);
        if (node.subtotals) {
          recomputeDerivedMetrics(node.subtotals, metricNames);
        }

        // Fallback: for any derived metrics still missing (e.g. table without comparison column),
        // compute a weighted average from children using a volume metric if available, else simple average.
        for (const metric of metricNames) {
          if (isDerivedMetric(metric) && (node.metrics[metric] === null || node.metrics[metric] === undefined)) {
            const derivedVal = roundTenth(
              weightedMean(node.children, metric, derivedFallbackWeightKey(metric, metricNames, explicitWeight)),
            );

            if (derivedVal !== null) {
              node.metrics[metric] = derivedVal;
              if (node.subtotals) node.subtotals[metric] = derivedVal;
            }
          }
        }
      } else {
        // Leaf node: ensure derived metrics are cleanly computed (e.g. 'Nuovo' when conf === 0)
        recomputeDerivedMetrics(node.metrics, metricNames);
        if (node.subtotals) {
          recomputeDerivedMetrics(node.subtotals, metricNames);
        }
      }
    }
  }

  rollupNodes(nodes);
}

/**
 * Computes a Grand Total node aggregating all top-level roots.
 */
export function computeGrandTotal(
  rootNodes: TreeNode[],
  metricNames: string[],
  aggFunc: AggregationFunction = 'sum',
  weightColumn = '',
  timeMetrics?: ReadonlySet<string>,
): TreeNode {
  const grandTotalMetrics: Record<string, number | string | null> = {};
  const explicitWeight = aggFunc === 'weighted_avg' ? weightColumn : '';

  for (const metric of metricNames) {
    if (isDerivedMetric(metric)) {
      continue;
    }

    if (isDistinctEntityMetric(metric)) {
      grandTotalMetrics[metric] = calculateAggregation(numericValues(rootNodes, metric), 'sum');
    } else if (explicitWeight) {
      grandTotalMetrics[metric] = explicitWeightedValue(rootNodes, metric, explicitWeight);
    } else if (isRateMetric(metric, timeMetrics)) {
      const { suffix } = splitMetricKey(metric);
      const weightKey = metric.toLowerCase().includes('conf')
        ? `richieste_conf${suffix}`
        : `richieste_corr${suffix}`;
      grandTotalMetrics[metric] = roundTenth(weightedMean(rootNodes, metric, weightKey));
    } else {
      grandTotalMetrics[metric] = calculateAggregation(numericValues(rootNodes, metric), aggFunc);
    }
  }

  // Recalculate derived metrics for Grand Total
  recomputeDerivedMetrics(grandTotalMetrics, metricNames);

  for (const metric of metricNames) {
    if (isDerivedMetric(metric) && (grandTotalMetrics[metric] === null || grandTotalMetrics[metric] === undefined)) {
      const derivedVal = roundTenth(
        weightedMean(rootNodes, metric, derivedFallbackWeightKey(metric, metricNames, explicitWeight)),
      );
      if (derivedVal !== null) {
        grandTotalMetrics[metric] = derivedVal;
      }
    }
  }

  return {
    key: '__grand_total__',
    id: '__grand_total__',
    name: 'Grand Total',
    depth: 0,
    path: ['Grand Total'],
    isLeaf: true,
    metrics: grandTotalMetrics,
    subtotals: grandTotalMetrics,
  };
}

/**
 * Computes horizontal row totals across all pivot values for each metric in the tree.
 * Populates `${metric}___ROW_TOTAL` on each node (leaves, parents, and Grand Total).
 */
export function computeHorizontalRowTotals(
  nodes: TreeNode[],
  metrics: string[],
  pivotValues: string[],
  aggFunc: AggregationFunction = 'sum',
  dimensions?: string[],
  weightColumn = '',
  timeMetrics?: ReadonlySet<string>,
): void {
  if (!nodes || nodes.length === 0 || !metrics || metrics.length === 0 || !pivotValues || pivotValues.length === 0) {
    return;
  }

  const rowTotalKeys: string[] = [];
  for (const m of metrics) {
    rowTotalKeys.push(`${m}___ROW_TOTAL`);
  }

  function traverse(nodeList: TreeNode[]) {
    for (const node of nodeList) {
      if (node.children && node.children.length > 0) {
        traverse(node.children);
      }

      if (!node.metrics) {
        node.metrics = {};
      }

      const readCellNumber = (metricName: string, pVal: string): number | null => {
        const compKey = `${metricName}___${pVal}`;
        const subtotalKey = `${metricName}___${pVal}___SUBTOTAL`;
        const rawVal =
          node.metrics[compKey] ??
          node.metrics[subtotalKey] ??
          (node.subtotals ? (node.subtotals[compKey] ?? node.subtotals[subtotalKey]) : null);
        return typeof rawVal === 'number' && Number.isFinite(rawVal) ? rawVal : null;
      };

      for (const m of metrics) {
        if (isDerivedMetric(m)) {
          continue;
        }

        const rowTotalKey = `${m}___ROW_TOTAL`;

        if (isDistinctEntityMetric(m)) {
          const entityDepth = resolveDistinctEntityDepth(m, dimensions, nodes);
          if (node.depth < entityDepth && node.children && node.children.length > 0) {
            const childRowTotals = numericValues(node.children, rowTotalKey);
            const sumChildren = calculateAggregation(childRowTotals, 'sum');
            node.metrics[rowTotalKey] = sumChildren;
            if (node.subtotals) {
              node.subtotals[rowTotalKey] = sumChildren;
            }
            continue;
          }

          let rowMax = -Infinity;
          let hasDistinctVal = false;
          for (const pVal of pivotValues) {
            const rawVal = readCellNumber(m, pVal);
            if (rawVal !== null) {
              if (rawVal > rowMax) rowMax = rawVal;
              hasDistinctVal = true;
            }
          }

          const finalVal = hasDistinctVal ? rowMax : null;
          node.metrics[rowTotalKey] = finalVal;
          if (node.subtotals) {
            node.subtotals[rowTotalKey] = finalVal;
          }
          continue;
        }

        // Times are not added across the pivot values: the row total is their average
        if (isTimeMetricName(m, timeMetrics)) {
          const cells = pivotValues
            .map(pVal => readCellNumber(m, pVal))
            .filter((v): v is number => v !== null);
          const mean = cells.length > 0 ? cells.reduce((a, b) => a + b, 0) / cells.length : null;
          node.metrics[rowTotalKey] = mean;
          if (node.subtotals) node.subtotals[rowTotalKey] = mean;
          continue;
        }

        let rowTotalVal: number | null = null;
        if (aggFunc === 'weighted_avg' && weightColumn) {
          if (m === weightColumn) {
            const weights = pivotValues
              .map(pVal => readCellNumber(m, pVal))
              .filter((v): v is number => v !== null);
            rowTotalVal = calculateAggregation(weights, 'sum');
          } else {
            let weightedSum = 0;
            let totalWeight = 0;
            let unweightedSum = 0;
            let count = 0;
            for (const pVal of pivotValues) {
              const val = readCellNumber(m, pVal);
              if (val !== null) {
                const weight = readCellNumber(weightColumn, pVal);
                if (weight !== null && weight > 0) {
                  weightedSum += val * weight;
                  totalWeight += weight;
                }
                unweightedSum += val;
                count += 1;
              }
            }
            if (totalWeight > 0) rowTotalVal = weightedSum / totalWeight;
            else if (count > 0) rowTotalVal = unweightedSum / count;
          }
        } else {
          const values = pivotValues
            .map(pVal => readCellNumber(m, pVal))
            .filter((v): v is number => v !== null);
          rowTotalVal = calculateAggregation(values, aggFunc);
        }

        if (rowTotalVal !== null) {
          node.metrics[rowTotalKey] = rowTotalVal;
          if (node.subtotals) {
            node.subtotals[rowTotalKey] = rowTotalVal;
          }
        } else if (node.metrics[rowTotalKey] === undefined) {
          node.metrics[rowTotalKey] = null;
          if (node.subtotals) {
            node.subtotals[rowTotalKey] = null;
          }
        }
      }

      // Recompute derived metrics for ROW_TOTAL suffix
      recomputeDerivedMetrics(node.metrics, rowTotalKeys);
      if (node.subtotals) {
        recomputeDerivedMetrics(node.subtotals, rowTotalKeys);
      }

      // Fallback for any derived metric not covered by operand pairs: average across pivot columns
      for (const m of metrics) {
        if (!isDerivedMetric(m)) continue;
        const rowTotalKey = `${m}___ROW_TOTAL`;
        if (node.metrics[rowTotalKey] === undefined || node.metrics[rowTotalKey] === null) {
          let sum = 0;
          let count = 0;
          for (const pVal of pivotValues) {
            const compKey = `${m}___${pVal}`;
            const subtotalKey = `${m}___${pVal}___SUBTOTAL`;
            const rawVal =
              node.metrics[compKey] ??
              node.metrics[subtotalKey] ??
              (node.subtotals ? (node.subtotals[compKey] ?? node.subtotals[subtotalKey]) : null);
            if (typeof rawVal === 'number' && Number.isFinite(rawVal)) {
              sum += rawVal;
              count++;
            }
          }
          const avgVal = count > 0 ? roundTenth(sum / count) : null;
          node.metrics[rowTotalKey] = avgVal;
          if (node.subtotals) {
            node.subtotals[rowTotalKey] = avgVal;
          }
        }
      }
    }
  }

  traverse(nodes);
}



