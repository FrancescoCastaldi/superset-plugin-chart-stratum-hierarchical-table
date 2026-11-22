import { ComparisonReferencePeriod, ComparisonStrategy } from '../types';

/**
 * Migrazione dei controlli sostituiti da versioni precedenti.
 *
 * Superset scarta, al salvataggio in Explore, le chiavi che non hanno più un controllo; sulle
 * dashboard invece le chiavi salvate restano. Per questo ogni controllo nuovo si legge in due
 * modi: dalla chiave nuova e, se manca, da quelle vecchie (`resolve*`), e in Explore si
 * precompila dalle chiavi vecchie con `initialValue` (`*Seed`), così il salvataggio successivo
 * scrive già la chiave nuova.
 */

/** Base del confronto di fine serie nel pivot singolo. */
export type EndOfSeriesBaseline =
  | 'none'
  | 'previous_period'
  | 'ytd_average'
  | 'same_period_last_year'
  | 'budget_target';

export const END_OF_SERIES_BASELINES: readonly EndOfSeriesBaseline[] = [
  'none',
  'previous_period',
  'ytd_average',
  'same_period_last_year',
  'budget_target',
];

type FormDataLike = Record<string, unknown> | null | undefined;

const isBaseline = (value: unknown): value is EndOfSeriesBaseline =>
  END_OF_SERIES_BASELINES.includes(value as EndOfSeriesBaseline);

/**
 * Strategia e periodo di riferimento dei controlli precedenti (`comparisonType` e
 * `referencePeriod`, o i nomi interni `comparisonStrategy` e `comparisonReferencePeriod`).
 * Con la strategia "periodo precedente" il periodo di riferimento "attivo" non produceva
 * nessuna colonna: equivale a nessun confronto.
 */
export function baselineFromLegacy(formData: FormDataLike): EndOfSeriesBaseline {
  const fd = formData ?? {};
  const strategy = fd.comparisonStrategy ?? fd.comparisonType;
  const referencePeriod = fd.comparisonReferencePeriod ?? fd.referencePeriod;
  if (strategy === 'budget_target') return 'budget_target';
  if (strategy === 'prev_year_same_period') return 'same_period_last_year';
  if (referencePeriod === 'previous') return 'previous_period';
  if (referencePeriod === 'ytd') return 'ytd_average';
  return 'none';
}

/** Base scelta: la chiave nuova se valida, altrimenti quelle dei controlli precedenti. */
export function resolveEndOfSeriesBaseline(formData: FormDataLike): EndOfSeriesBaseline {
  const value = formData?.endOfSeriesBaseline;
  return isBaseline(value) ? value : baselineFromLegacy(formData);
}

/** Valori interni che il calcolo delle colonne di confronto si aspetta. */
export function baselineToStrategy(baseline: EndOfSeriesBaseline): {
  strategy: ComparisonStrategy;
  referencePeriod: ComparisonReferencePeriod;
} {
  switch (baseline) {
    case 'previous_period':
      return { strategy: 'prev_period', referencePeriod: 'previous' };
    case 'ytd_average':
      return { strategy: 'prev_period', referencePeriod: 'ytd' };
    case 'same_period_last_year':
      return { strategy: 'prev_year_same_period', referencePeriod: 'current' };
    case 'budget_target':
      return { strategy: 'budget_target', referencePeriod: 'current' };
    default:
      return { strategy: 'prev_period', referencePeriod: 'current' };
  }
}

/** Valore iniziale del controllo in Explore: parte dai controlli precedenti del grafico salvato. */
export function endOfSeriesBaselineSeed(
  controlState: { value?: unknown } | null | undefined,
  panelState: { form_data?: FormDataLike } | null | undefined,
): EndOfSeriesBaseline | undefined {
  if (isBaseline(controlState?.value)) return undefined;
  const legacy = baselineFromLegacy(panelState?.form_data);
  // "none" è già il valore predefinito: non serve forzarlo.
  return legacy === 'none' ? undefined : legacy;
}

/** Colore come lo salva il selettore di Superset (canali 0-255, trasparenza 0-1). */
export interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a?: number;
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const isRgba = (value: unknown): value is RgbaColor => {
  if (!value || typeof value !== 'object') return false;
  const { r, g, b } = value as Record<string, unknown>;
  return [r, g, b].every(c => typeof c === 'number' && Number.isFinite(c));
};

const channelToHex = (channel: number): string =>
  Math.min(255, Math.max(0, Math.round(channel))).toString(16).padStart(2, '0');

/**
 * Colore salvato come #RRGGBB (grafici esistenti) o come {r,g,b,a} (selettore colori) letto
 * sempre come stringa. Un testo non valido resta com'è, così il tema può segnalarlo.
 */
export function colorToHex(value: unknown): string {
  if (isRgba(value)) {
    return `#${channelToHex(value.r)}${channelToHex(value.g)}${channelToHex(value.b)}`;
  }
  return typeof value === 'string' ? value.trim() : '';
}

/** #RRGGBB nel formato del selettore colori di Superset, oppure undefined. */
export function hexToColor(value: unknown): RgbaColor | undefined {
  if (typeof value !== 'string' || !HEX_COLOR.test(value.trim())) return undefined;
  const hex = value.trim();
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
    a: 1,
  };
}

/** Valore iniziale dei selettori colore: converte il #RRGGBB dei grafici già salvati. */
export function colorSeed(controlState: { value?: unknown } | null | undefined): RgbaColor | undefined {
  return typeof controlState?.value === 'string' ? hexToColor(controlState.value) : undefined;
}
