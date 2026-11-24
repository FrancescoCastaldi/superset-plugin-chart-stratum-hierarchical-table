import { useEffect, useId, useRef, useState } from 'react';
import { ControlHeader } from '@superset-ui/chart-controls';
import { parseFormula } from '../../utils/formulaEngine';
import {
  ListRow,
  StoredAs,
  applyAliases,
  ignoredMessage,
  ignoredPositions,
  listKey,
  parseList,
  serializeList,
  toNumberOrUndefined,
  withField,
} from './listModel';

/** 'formula': area di testo con le metriche del dataset come elementi da trascinare o cliccare. */
export type FieldKind = 'metric' | 'dimension' | 'select' | 'number' | 'text' | 'color' | 'formula';

/** Segnaposto di una metrica dentro una formula: sempre tra parentesi quadre, anche con spazi o simboli. */
export const metricToken = (name: string): string => `[${name}]`;

/** Testo con `token` al posto della selezione, e la posizione del cursore dopo l'inserimento. */
export function insertToken(
  text: string,
  token: string,
  selectionStart: number,
  selectionEnd: number,
): { text: string; caret: number } {
  const start = Math.max(0, Math.min(selectionStart, text.length));
  const end = Math.max(start, Math.min(selectionEnd, text.length));
  return { text: text.slice(0, start) + token + text.slice(end), caret: start + token.length };
}

/** Metriche citate da una formula che sono salvate nel dataset: vanno chieste alla query. */
export function operandsOf(formula: string, datasetMetrics: string[]): string[] {
  const parsed = parseFormula(formula);
  if (!parsed.ok) return [];
  return parsed.refs.filter(ref => datasetMetrics.includes(ref));
}

export interface FieldSpec {
  key: string;
  label: string;
  kind: FieldKind;
  /** Scelte di un campo `select`: [valore, etichetta]. */
  options?: [string, string][];
  placeholder?: string;
  /** Suggerimento breve sotto al campo. */
  hint?: string;
  /** Campo mostrato solo per certe righe (es. il secondo valore di "tra"). */
  showWhen?: (row: ListRow) => boolean;
  /** Campo secondario: sta in "Altre opzioni", chiuso finché non serve. */
  advanced?: boolean;
  /** Dal testo digitato al valore salvato (default: il testo senza spazi ai lati). */
  parse?: (text: string, row: ListRow) => unknown;
}

export interface RowListControlProps {
  label?: string;
  description?: unknown;
  value?: unknown;
  onChange?: (value: unknown) => void;
  validationErrors?: string[];
  hovered?: boolean;
  /** Impostazioni del controllo, passate dal pannello. */
  fields: FieldSpec[];
  storedAs: StoredAs;
  /** Esempio inserito con il pulsante e mostrato nel riquadro "Esempio". */
  exampleRows: ListRow[];
  newRow: () => ListRow;
  /** Come il grafico interpreta le righe: serve per segnalare quelle che ignorerebbe. */
  normalize: (entries: unknown[]) => unknown[];
  /** Avvisi specifici di una riga, oltre a quelli del normalizzatore. */
  rowWarning?: (row: ListRow) => string | null;
  /** Nomi alternativi dei campi nei grafici già salvati (es. metricKey). */
  aliases?: Record<string, string>;
  addLabel?: string;
  rowTitle?: string;
  emptyHint?: string;
  /** Da mapStateToProps: metriche e dimensioni scelte nella sezione Dati. */
  metricChoices?: string[];
  dimensionChoices?: string[];
  /** Da mapStateToProps: tutte le metriche salvate del dataset. */
  datasetMetricChoices?: string[];
  /** Un campo per riga invece della griglia: per i pannelli stretti con testi lunghi. */
  stack?: boolean;
}

const box = {
  border: '1px solid rgba(128, 128, 128, 0.4)',
  borderRadius: 4,
  padding: 8,
  marginBottom: 8,
} as const;

const fieldGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
  gap: 8,
} as const;

const stackGrid = { display: 'grid', gridTemplateColumns: '1fr', gap: 8 } as const;

// Campi larghi quanto la colonna: senza, il campo esce dalla cella e copre il titolo accanto.
const inputStyle = { width: '100%', boxSizing: 'border-box' } as const;

const note = { fontSize: 12, opacity: 0.8, margin: '4px 0 0' } as const;
const warningStyle = { fontSize: 12, margin: '4px 0 0', color: '#b45309' } as const;

/**
 * Editor a righe per i controlli che prima chiedevano un testo JSON. Salva lo stesso valore di
 * prima (array o testo JSON), quindi i grafici già salvati e i parser non cambiano.
 */
export default function RowListControl(props: RowListControlProps) {
  const {
    value,
    onChange,
    fields,
    storedAs,
    exampleRows,
    newRow,
    normalize,
    rowWarning,
    aliases,
    addLabel = 'Aggiungi voce',
    rowTitle = 'Voce',
    emptyHint = 'Nessuna voce.',
    metricChoices = [],
    dimensionChoices = [],
    datasetMetricChoices = [],
    stack = false,
  } = props;
  const uid = useId();
  // Per le formule: le metriche scelte nel grafico e quelle salvate nel dataset, senza doppioni.
  const formulaChoices = Array.from(new Set([...metricChoices, ...datasetMetricChoices]));

  const parsed = parseList(value);
  const toRows = (rows: ListRow[]) => rows.map(row => applyAliases(row, aliases));
  const [rows, setRows] = useState<ListRow[]>(() => toRows(parsed.rows));
  const lastEmitted = useRef<string>(listKey(toRows(parsed.rows)));

  // Un valore cambiato da fuori (annulla, ripristino) rimpiazza le righe; il nostro no.
  useEffect(() => {
    const incoming = parseList(value);
    const key = listKey(toRows(incoming.rows));
    if (key !== lastEmitted.current) {
      lastEmitted.current = key;
      setRows(toRows(incoming.rows));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const commit = (next: ListRow[]) => {
    setRows(next);
    lastEmitted.current = listKey(next);
    onChange?.(serializeList(next, storedAs));
  };

  const setField = (index: number, key: string, fieldValue: unknown) =>
    commit(rows.map((row, i) => (i === index ? withField(row, key, fieldValue) : row)));

  // Salva la formula e, accanto, le metriche del dataset che cita: la query le chiede anche se non sono scelte nel grafico.
  const setFormula = (
    index: number,
    key: string,
    text: string,
    caret?: number,
    textareaId?: string,
  ) => {
    const operands = operandsOf(text, datasetMetricChoices);
    commit(
      rows.map((row, i) =>
        i === index
          ? withField(
              withField(row, key, text.trim()),
              'operands',
              operands.length > 0 ? operands : undefined,
            )
          : row,
      ),
    );
    if (caret !== undefined && textareaId) {
      requestAnimationFrame(() => {
        const el = document.getElementById(textareaId) as HTMLTextAreaElement | null;
        if (!el) return;
        el.focus();
        el.setSelectionRange(caret, caret);
      });
    }
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  };

  const ignored = ignoredPositions(rows, normalize);
  const summary = ignoredMessage(ignored);

  const renderField = (row: ListRow, index: number, spec: FieldSpec) => {
    const id = `${uid}-${index}-${spec.key}`;
    const current = row[spec.key];
    const text = current === undefined || current === null ? '' : String(current);
    let input;
    if (spec.kind === 'select') {
      input = (
        <select
          id={id}
          style={inputStyle}
          value={text}
          onChange={e => setField(index, spec.key, e.target.value)}
        >
          <option value="">(non impostato)</option>
          {(spec.options ?? []).map(([optionValue, optionLabel]) => (
            <option key={optionValue} value={optionValue}>
              {optionLabel}
            </option>
          ))}
        </select>
      );
    } else if (spec.kind === 'formula') {
      const insertFromChip = (name: string) => {
        const el = document.getElementById(id) as HTMLTextAreaElement | null;
        const base = el ? el.value : text;
        const start = el ? el.selectionStart : base.length;
        const end = el ? el.selectionEnd : base.length;
        const next = insertToken(base, metricToken(name), start, end);
        setFormula(index, spec.key, next.text, next.caret, id);
      };
      input = (
        <>
          {formulaChoices.length > 0 && (
            <div
              role="group"
              aria-label="Metriche disponibili"
              style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}
            >
              {formulaChoices.map(name => (
                <button
                  key={name}
                  type="button"
                  draggable
                  title="Trascina nella formula o clicca per inserire"
                  onDragStart={e => {
                    e.dataTransfer.setData('text/plain', metricToken(name));
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  onClick={() => insertFromChip(name)}
                  style={{ cursor: 'grab', fontSize: 12, padding: '1px 6px', borderRadius: 10 }}
                >
                  {name}
                </button>
              ))}
            </div>
          )}
          <textarea
            id={id}
            rows={3}
            defaultValue={text}
            key={`${id}-${text}`}
            placeholder={spec.placeholder}
            style={inputStyle}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              const token = e.dataTransfer.getData('text/plain');
              if (!token) return;
              const el = e.currentTarget;
              const next = insertToken(el.value, token, el.selectionStart, el.selectionEnd);
              setFormula(index, spec.key, next.text, next.caret, id);
            }}
            onBlur={e => {
              if (e.target.value.trim() !== text.trim())
                setFormula(index, spec.key, e.target.value);
            }}
          />
        </>
      );
    } else if (spec.kind === 'number') {
      input = (
        <input
          id={id}
          type="text"
          style={inputStyle}
          inputMode="decimal"
          defaultValue={text}
          key={`${id}-${text}`}
          placeholder={spec.placeholder}
          onBlur={e => setField(index, spec.key, toNumberOrUndefined(e.target.value))}
        />
      );
    } else if (spec.kind === 'color') {
      input = (
        <input
          id={id}
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(text) ? text : '#ffffff'}
          onChange={e => setField(index, spec.key, e.target.value)}
        />
      );
    } else {
      const choices =
        spec.kind === 'metric' ? metricChoices : spec.kind === 'dimension' ? dimensionChoices : [];
      const listId = choices.length > 0 ? `${id}-list` : undefined;
      input = (
        <>
          <input
            id={id}
            type="text"
            style={inputStyle}
            list={listId}
            defaultValue={text}
            key={`${id}-${text}`}
            placeholder={spec.placeholder}
            onBlur={e =>
              setField(
                index,
                spec.key,
                spec.parse ? spec.parse(e.target.value.trim(), row) : e.target.value.trim(),
              )
            }
          />
          {listId && (
            <datalist id={listId}>
              {choices.map(choice => (
                <option key={choice} value={choice} />
              ))}
            </datalist>
          )}
        </>
      );
    }
    return (
      <div key={spec.key}>
        <label htmlFor={id} style={{ display: 'block', fontSize: 12, marginBottom: 2 }}>
          {spec.label}
        </label>
        {input}
        {spec.hint && <p style={note}>{spec.hint}</p>}
      </div>
    );
  };

  // Campi principali sempre visibili; quelli secondari in "Altre opzioni", chiuso finché non servono.
  const renderRowFields = (row: ListRow, index: number) => {
    const visible = fields.filter(spec => !spec.showWhen || spec.showWhen(row));
    const main = visible.filter(spec => !spec.advanced);
    const more = visible.filter(spec => spec.advanced);
    const grid = stack ? stackGrid : fieldGrid;
    return (
      <>
        <div style={grid}>{main.map(spec => renderField(row, index, spec))}</div>
        {more.length > 0 && (
          <details style={{ marginTop: 6 }}>
            <summary>Altre opzioni</summary>
            <div style={{ ...grid, marginTop: 6 }}>
              {more.map(spec => renderField(row, index, spec))}
            </div>
          </details>
        )}
      </>
    );
  };

  const rowMessages = (row: ListRow, index: number): string[] => {
    const messages: string[] = [];
    const custom = rowWarning?.(row);
    if (custom) messages.push(custom);
    if (ignored.includes(index + 1) && !custom) {
      messages.push('Questa voce verrà ignorata dal grafico: compila i campi obbligatori.');
    }
    const metric = row.metric;
    const hasFormulaField = fields.some(spec => spec.kind === 'formula');
    // Le righe con formula nominano una metrica nuova: non deve essere tra quelle scelte.
    if (
      !hasFormulaField &&
      typeof metric === 'string' &&
      metric &&
      metricChoices.length > 0 &&
      !metricChoices.includes(metric)
    ) {
      messages.push('La metrica non è tra quelle scelte nella sezione Dati.');
    }
    const formula = row.formula;
    if (hasFormulaField && typeof formula === 'string' && formula.trim() !== '') {
      const parsedFormula = parseFormula(formula);
      if (!parsedFormula.ok) {
        messages.push(
          `Formula non valida: ${parsedFormula.error} (posizione ${parsedFormula.position + 1}).`,
        );
      } else if (formulaChoices.length > 0) {
        const missing = parsedFormula.refs.filter(
          ref => !formulaChoices.includes(ref) && !rows.some(r => r.metric === ref),
        );
        if (missing.length > 0) {
          messages.push(
            `Metriche non trovate tra quelle del dataset o del grafico: ${missing.join(', ')}.`,
          );
        }
      }
    }
    return messages;
  };

  return (
    <div className="stratum-rowlist">
      <ControlHeader {...(props as object)} />
      {parsed.syntaxError && (
        <p role="alert" style={warningStyle}>
          Il valore salvato non è un elenco valido ({parsed.syntaxError}). Aggiungendo una voce
          verrà sostituito.
        </p>
      )}
      {parsed.invalidCount > 0 && (
        <p style={warningStyle}>
          {parsed.invalidCount} voci non sono oggetti: verranno rimosse alla prossima modifica.
        </p>
      )}
      {rows.length === 0 && <p style={note}>{emptyHint}</p>}
      {rows.map((row, index) => {
        const messages = rowMessages(row, index);
        return (
          <div key={index} style={box} role="group" aria-label={`${rowTitle} ${index + 1}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <strong>
                {rowTitle} {index + 1}
              </strong>
              <span>
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={`Sposta su ${rowTitle} ${index + 1}`}
                >
                  Su
                </button>{' '}
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === rows.length - 1}
                  aria-label={`Sposta giù ${rowTitle} ${index + 1}`}
                >
                  Giù
                </button>{' '}
                <button
                  type="button"
                  onClick={() => commit(rows.filter((_, i) => i !== index))}
                  aria-label={`Rimuovi ${rowTitle} ${index + 1}`}
                >
                  Rimuovi
                </button>
              </span>
            </div>
            {renderRowFields(row, index)}
            {messages.map(message => (
              <p key={message} style={warningStyle}>
                {message}
              </p>
            ))}
          </div>
        );
      })}
      {summary && rows.length > 0 && <p style={warningStyle}>{summary}</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => commit([...rows, newRow()])}>
          {addLabel}
        </button>
        {rows.length === 0 && (
          <button type="button" onClick={() => commit(exampleRows.map(row => ({ ...row })))}>
            Inserisci esempio
          </button>
        )}
      </div>
      <details style={{ marginTop: 6 }}>
        <summary>Esempio di configurazione</summary>
        <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap' }}>
          {JSON.stringify(exampleRows, null, 2)}
        </pre>
      </details>
    </div>
  );
}
