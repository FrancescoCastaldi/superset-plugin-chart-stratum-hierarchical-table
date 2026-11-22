import { useEffect, useId, useRef, useState } from 'react';
import { ControlHeader } from '@superset-ui/chart-controls';
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

export type FieldKind = 'metric' | 'dimension' | 'select' | 'number' | 'text' | 'color';

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
  } = props;
  const uid = useId();

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
        <select id={id} value={text} onChange={e => setField(index, spec.key, e.target.value)}>
          <option value="">(non impostato)</option>
          {(spec.options ?? []).map(([optionValue, optionLabel]) => (
            <option key={optionValue} value={optionValue}>
              {optionLabel}
            </option>
          ))}
        </select>
      );
    } else if (spec.kind === 'number') {
      input = (
        <input
          id={id}
          type="text"
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
      const choices = spec.kind === 'metric' ? metricChoices : spec.kind === 'dimension' ? dimensionChoices : [];
      const listId = choices.length > 0 ? `${id}-list` : undefined;
      input = (
        <>
          <input
            id={id}
            type="text"
            list={listId}
            defaultValue={text}
            key={`${id}-${text}`}
            placeholder={spec.placeholder}
            onBlur={e => setField(index, spec.key, spec.parse ? spec.parse(e.target.value.trim(), row) : e.target.value.trim())}
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

  const rowMessages = (row: ListRow, index: number): string[] => {
    const messages: string[] = [];
    const custom = rowWarning?.(row);
    if (custom) messages.push(custom);
    if (ignored.includes(index + 1) && !custom) {
      messages.push('Questa voce verrà ignorata dal grafico: compila i campi obbligatori.');
    }
    const metric = row.metric;
    if (typeof metric === 'string' && metric && metricChoices.length > 0 && !metricChoices.includes(metric)) {
      messages.push('La metrica non è tra quelle scelte nella sezione Dati.');
    }
    return messages;
  };

  return (
    <div className="stratum-rowlist">
      <ControlHeader {...(props as object)} />
      {parsed.syntaxError && (
        <p role="alert" style={warningStyle}>
          Il valore salvato non è un elenco valido ({parsed.syntaxError}). Aggiungendo una voce verrà sostituito.
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
                <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Sposta su ${rowTitle} ${index + 1}`}>
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
            <div style={fieldGrid}>
              {fields.filter(spec => !spec.showWhen || spec.showWhen(row)).map(spec => renderField(row, index, spec))}
            </div>
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
        <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap' }}>{JSON.stringify(exampleRows, null, 2)}</pre>
      </details>
    </div>
  );
}
