import { isSafeRegexPattern, MAX_REGEX_PATTERN_LENGTH, normalizeConditionalFormatting } from '../../utils/conditionalFormatting';
import { normalizeDimensionLimits } from '../../utils/dimensionLimits';
import { normalizeGoals } from '../../utils/goalBenchmark';
import { normalizeMetricDefinitions } from '../../utils/metricSemantics';
import { normalizeTableCalculations } from '../../utils/tableCalculations';
import { ListRow, toNumberOrUndefined } from './listModel';
import type { FieldSpec } from './RowListControl';

/**
 * Impostazioni passate ai controlli a elenco dal pannello. Gli esempi sono gli stessi riportati
 * nelle descrizioni dei controlli: un test verifica che il grafico li interpreti.
 */

const num = (text: string): unknown => toNumberOrUndefined(text) ?? text;

export const CONDITIONAL_FORMATTING_FIELDS: FieldSpec[] = [
  { key: 'metric', label: 'Metrica', kind: 'metric', placeholder: 'es. attesa' },
  {
    key: 'operator',
    label: 'Condizione',
    kind: 'select',
    options: [
      ['>', 'maggiore di'],
      ['>=', 'maggiore o uguale a'],
      ['<', 'minore di'],
      ['<=', 'minore o uguale a'],
      ['==', 'uguale a'],
      ['between', 'compreso tra'],
      ['regex', 'testo corrisponde a (regex)'],
    ],
  },
  {
    key: 'targetValue',
    label: 'Valore',
    kind: 'text',
    placeholder: 'es. 30',
    parse: (text, row) => (row.operator === 'regex' ? text : num(text)),
  },
  {
    key: 'targetValue2',
    label: 'Fino a',
    kind: 'number',
    placeholder: 'es. 60',
    showWhen: row => row.operator === 'between',
  },
  { key: 'backgroundColor', label: 'Colore di sfondo', kind: 'color' },
  { key: 'textColor', label: 'Colore del testo', kind: 'color' },
  {
    key: 'scope',
    label: 'Si applica a',
    kind: 'select',
    options: [
      ['cell', 'la cella'],
      ['row', 'tutta la riga'],
      ['column', 'tutta la colonna'],
    ],
  },
  {
    key: 'icon',
    label: 'Icona',
    kind: 'select',
    options: [
      ['arrow_up', 'freccia in su'],
      ['arrow_down', 'freccia in giù'],
      ['dot', 'punto'],
      ['flag', 'bandiera'],
      ['check', 'spunta'],
      ['warning', 'avviso'],
    ],
  },
];

export const CONDITIONAL_FORMATTING_EXAMPLE: ListRow[] = [
  { metric: 'attesa', operator: '>', targetValue: 30, backgroundColor: '#fee2e2' },
];

export function conditionalFormattingWarning(row: ListRow): string | null {
  if (!row.operator) return 'Scegli la condizione: senza, la regola non scatta mai.';
  if (row.operator === 'between' && toNumberOrUndefined(String(row.targetValue2 ?? '')) === undefined) {
    return 'Per "compreso tra" indica anche il valore finale.';
  }
  if (row.operator === 'regex') {
    const pattern = String(row.targetValue ?? '');
    if (pattern.length > MAX_REGEX_PATTERN_LENGTH) return `Il testo da cercare supera ${MAX_REGEX_PATTERN_LENGTH} caratteri.`;
    if (pattern && !isSafeRegexPattern(pattern)) return 'Questa espressione regolare non è ammessa perché potrebbe bloccare il browser.';
  } else if (row.targetValue !== undefined && typeof row.targetValue !== 'number') {
    return 'Il valore deve essere un numero.';
  }
  return null;
}

export const conditionalFormattingNormalize = (entries: unknown[]): unknown[] =>
  normalizeConditionalFormatting(entries);

export const GOALS_FIELDS: FieldSpec[] = [
  { key: 'metric', label: 'Metrica', kind: 'metric', placeholder: 'es. accessi' },
  { key: 'target', label: 'Obiettivo (numero)', kind: 'number', placeholder: 'es. 1000' },
  {
    key: 'direction',
    label: 'Quando è meglio',
    kind: 'select',
    options: [
      ['higher_is_better', 'il valore è alto'],
      ['lower_is_better', 'il valore è basso'],
    ],
  },
];

export const GOALS_EXAMPLE: ListRow[] = [{ metric: 'accessi', target: 1000, direction: 'higher_is_better' }];

export const DIMENSION_LIMITS_FIELDS: FieldSpec[] = [
  { key: 'dimension', label: 'Dimensione', kind: 'dimension', placeholder: 'es. reparto' },
  { key: 'level', label: 'Oppure livello (da 0)', kind: 'number', placeholder: 'es. 1' },
  { key: 'limit', label: 'Quanti elementi mostrare', kind: 'number', placeholder: 'es. 10' },
  {
    key: 'mode',
    label: 'Quali',
    kind: 'select',
    options: [
      ['top', 'i maggiori'],
      ['bottom', 'i minori'],
    ],
  },
  { key: 'metric', label: 'Ordinati per la metrica', kind: 'metric', placeholder: 'prima metrica' },
  { key: 'othersLabel', label: 'Titolo del resto', kind: 'text', placeholder: 'Altri ({k})' },
];

export const DIMENSION_LIMITS_EXAMPLE: ListRow[] = [{ dimension: 'reparto', limit: 10, mode: 'top', othersLabel: 'Altri ({k})' }];

export function dimensionLimitWarning(row: ListRow): string | null {
  const hasTarget = (row.dimension !== undefined && row.dimension !== '') || row.level !== undefined;
  if (!hasTarget) return 'Indica la dimensione oppure il livello a cui applicare il limite.';
  return null;
}

export const METRIC_DEFINITIONS_EXAMPLE: ListRow[] = [
  { metric: 'tasso', type: 'ratio', numerator: 'num', denominator: 'den' },
];

export const METRIC_DEFINITIONS_SCHEMA = [
  'metric: nome della metrica (obbligatorio)',
  'type: sum, mean, distinct_count, ratio, delta_pct, diff, formula, none (obbligatorio)',
  'formula: espressione sulle altre metriche, es. ([ricavi] - costi) / ricavi * 100 (obbligatoria per type formula); label: titolo della colonna',
  'ratio: numerator e denominator (obbligatori), scale, ci (none, wilson, poisson), ciLevel, compareTo (parent, total, goal)',
  'delta_pct e diff: current e baseline (obbligatori)',
  'mean: weight (metrica peso); distinct_count: entityDimension',
  'format: integer, decimal, percent, duration, days, currency; decimals: da 0 a 6',
  'polarity: higher_is_better oppure lower_is_better',
  'calculation: pct_of_total, pct_of_parent, running_total, diff_from_previous, diff_from_previous_pct, rank',
];

/** Metriche calcolate: righe che il grafico unisce alle definizioni di metrica come `type: formula`. */
export const CALCULATED_METRICS_FIELDS: FieldSpec[] = [
  { key: 'metric', label: 'Nome della metrica', kind: 'text', placeholder: 'es. margine' },
  {
    key: 'formula',
    label: 'Formula',
    kind: 'formula',
    placeholder: 'es. ([ricavi] - [costi]) / [ricavi] * 100',
    hint: 'Trascina una metrica nel riquadro o cliccala. Operatori: + - * /, parentesi, abs, min, max, round.',
  },
  { key: 'label', label: 'Titolo della colonna', kind: 'text', placeholder: 'es. Margine %' },
  {
    key: 'format',
    label: 'Formato',
    kind: 'select',
    options: [
      ['integer', 'numero intero'],
      ['decimal', 'numero con decimali'],
      ['percent', 'percentuale'],
      ['currency', 'valuta'],
      ['duration', 'durata'],
      ['days', 'giorni'],
    ],
  },
  { key: 'decimals', label: 'Decimali', kind: 'number', placeholder: 'es. 1' },
];

export const CALCULATED_METRICS_EXAMPLE: ListRow[] = [
  {
    metric: 'margine',
    type: 'formula',
    formula: '([ricavi] - [costi]) / [ricavi] * 100',
    label: 'Margine %',
    format: 'percent',
    decimals: 1,
  },
];

export const calculatedMetricsNormalize = (entries: unknown[]): unknown[] => normalizeMetricDefinitions(entries);

export const TABLE_CALCULATIONS_EXAMPLE: ListRow[] = [{ type: 'pct_of_total', metric: 'ricavi' }];

export const TABLE_CALCULATIONS_SCHEMA = [
  'metric: nome della metrica (obbligatorio)',
  'type: pct_of_total, pct_of_parent, running_total, diff_from_previous, diff_from_previous_pct, rank (obbligatorio)',
  'scope: hierarchy oppure periods',
  'rankMethod: competition oppure dense; rankOrder: desc oppure asc',
  'displayMode: companion_column (colonna in più) oppure replace (sostituisce il valore)',
  'customTitle: titolo della colonna',
];

export const goalsNormalize = (entries: unknown[]): unknown[] => normalizeGoals(entries);
export const dimensionLimitsNormalize = (entries: unknown[]): unknown[] => normalizeDimensionLimits(entries);
export const metricDefinitionsNormalize = (entries: unknown[]): unknown[] => normalizeMetricDefinitions(entries);
export const tableCalculationsNormalize = (entries: unknown[]): unknown[] => normalizeTableCalculations(entries);
