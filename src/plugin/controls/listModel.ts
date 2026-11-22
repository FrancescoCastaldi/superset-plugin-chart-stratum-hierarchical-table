/**
 * Modello comune dei controlli a elenco (formattazione condizionale, obiettivi, limiti Top N,
 * definizioni di metrica, calcoli di tabella). Funzioni pure, senza React.
 *
 * Il valore salvato non cambia rispetto alle versioni precedenti: un array (formattazione
 * condizionale) o un testo JSON (gli altri), così i parser e i grafici esistenti restano validi.
 */

export type StoredAs = 'array' | 'json';

export type ListRow = Record<string, unknown>;

export interface ParsedList {
  rows: ListRow[];
  /** Voci che non sono oggetti: non si possono modificare e vengono rimosse alla prima modifica. */
  invalidCount: number;
  /** Testo JSON non valido, o valido ma non un elenco. */
  syntaxError?: string;
}

const isRow = (value: unknown): value is ListRow =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** Elenco di righe dal valore salvato (testo JSON oppure array già letto). */
export function parseList(raw: unknown): ParsedList {
  let entries: unknown = raw;
  if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
    return { rows: [], invalidCount: 0 };
  }
  if (typeof raw === 'string') {
    try {
      entries = JSON.parse(raw);
    } catch (error) {
      return { rows: [], invalidCount: 0, syntaxError: (error as Error).message };
    }
  }
  if (!Array.isArray(entries)) {
    return { rows: [], invalidCount: 0, syntaxError: 'Deve essere un elenco tra parentesi quadre [ ].' };
  }
  const rows = entries.filter(isRow);
  return { rows, invalidCount: entries.length - rows.length };
}

/** Valore da salvare: array, oppure testo JSON (vuoto quando non ci sono righe). */
export function serializeList(rows: ListRow[], storedAs: StoredAs): unknown {
  if (storedAs === 'array') return rows;
  return rows.length === 0 ? '' : JSON.stringify(rows, null, 2);
}

/** Chiave stabile per confrontare due valori senza badare al formato (testo o array). */
export const listKey = (raw: unknown): string => JSON.stringify(parseList(raw).rows);

/** Rinomina le chiavi alias (es. metricKey -> metric) senza toccare le altre. */
export function applyAliases(row: ListRow, aliases: Record<string, string> = {}): ListRow {
  const next: ListRow = { ...row };
  for (const [from, to] of Object.entries(aliases)) {
    if (from in next && !(to in next)) next[to] = next[from];
    if (from in next) delete next[from];
  }
  return next;
}

/** Posizioni (da 1) delle righe che il normalizzatore del grafico scarterebbe. */
export function ignoredPositions(rows: ListRow[], normalize: (entries: unknown[]) => unknown[]): number[] {
  const ignored: number[] = [];
  rows.forEach((row, index) => {
    if (normalize([row]).length === 0) ignored.push(index + 1);
  });
  return ignored;
}

/** Messaggio che blocca Run e Save: solo per il testo non interpretabile come elenco JSON. */
export function jsonSyntaxMessage(raw: unknown): string | false {
  const { syntaxError } = parseList(raw);
  return syntaxError ? `JSON non valido: ${syntaxError}` : false;
}

/** Validatore Superset: solo errori di sintassi, mai voci ignorate (non devono bloccare grafici esistenti). */
export const jsonSyntaxValidator = (value: unknown): string | false => jsonSyntaxMessage(value);

/** Testo di avviso, non bloccante, sulle voci che il grafico ignorerebbe. */
export function ignoredMessage(positions: number[]): string | null {
  if (positions.length === 0) return null;
  const list = positions.join(', ');
  return positions.length === 1
    ? `La voce ${list} verrà ignorata dal grafico: controlla i campi obbligatori.`
    : `Le voci ${list} verranno ignorate dal grafico: controlla i campi obbligatori.`;
}

/** Converte il testo di un campo numerico: vuoto o non numerico significa campo assente. */
export function toNumberOrUndefined(text: string): number | undefined {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

/** Copia della riga con il campo impostato; un valore undefined o vuoto toglie il campo. */
export function withField(row: ListRow, key: string, value: unknown): ListRow {
  const next = { ...row };
  if (value === undefined || value === '' || value === null) delete next[key];
  else next[key] = value;
  return next;
}
