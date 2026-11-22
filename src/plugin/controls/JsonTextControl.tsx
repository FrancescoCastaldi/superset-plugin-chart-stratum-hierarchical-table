import { useEffect, useRef, useState } from 'react';
import { ControlHeader } from '@superset-ui/chart-controls';
import { ListRow, ignoredMessage, ignoredPositions, jsonSyntaxMessage, parseList } from './listModel';

export interface JsonTextControlProps {
  label?: string;
  description?: unknown;
  value?: unknown;
  onChange?: (value: unknown, errors?: string[]) => void;
  validationErrors?: string[];
  hovered?: boolean;
  /** Come il grafico interpreta le voci: serve per segnalare quelle che ignorerebbe. */
  normalize: (entries: unknown[]) => unknown[];
  exampleRows: ListRow[];
  /** Campi accettati, in una riga per campo: "metric: nome della metrica". */
  schemaLines: string[];
  rows?: number;
}

const note = { fontSize: 12, opacity: 0.8, margin: '4px 0 0' } as const;
const warningStyle = { fontSize: 12, margin: '4px 0 0', color: '#b45309' } as const;
const errorStyle = { fontSize: 12, margin: '4px 0 0', color: '#b91c1c' } as const;

const asText = (value: unknown): string =>
  typeof value === 'string' ? value : value === undefined || value === null ? '' : JSON.stringify(value, null, 2);

/**
 * Campo JSON con messaggi in linea: un errore di sintassi blocca Run e Save (con il suo
 * messaggio), le voci che il grafico ignorerebbe sono solo un avviso, perché i grafici già
 * salvati con voci non valide devono restare eseguibili.
 */
export default function JsonTextControl(props: JsonTextControlProps) {
  const { value, onChange, normalize, exampleRows, schemaLines, rows = 8 } = props;
  const [text, setText] = useState<string>(() => asText(value));
  const lastEmitted = useRef<string>(asText(value));

  useEffect(() => {
    const incoming = asText(value);
    if (incoming !== lastEmitted.current) {
      lastEmitted.current = incoming;
      setText(incoming);
    }
  }, [value]);

  const emit = (next: string) => {
    setText(next);
    lastEmitted.current = next;
    const error = jsonSyntaxMessage(next);
    onChange?.(next, error ? [error] : []);
  };

  const syntax = jsonSyntaxMessage(text);
  const ignored = syntax ? [] : ignoredPositions(parseList(text).rows, normalize);
  const summary = ignoredMessage(ignored);

  return (
    <div className="stratum-jsontext">
      <ControlHeader {...(props as object)} />
      <textarea
        rows={rows}
        value={text}
        spellCheck={false}
        aria-label={props.label}
        aria-invalid={syntax ? true : undefined}
        style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }}
        onChange={e => emit(e.target.value)}
      />
      {syntax && (
        <p role="alert" style={errorStyle}>
          {syntax}
        </p>
      )}
      {summary && <p style={warningStyle}>{summary}</p>}
      {text.trim() === '' && <p style={note}>Vuoto: la funzione non è attiva.</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        {text.trim() === '' && (
          <button type="button" onClick={() => emit(JSON.stringify(exampleRows, null, 2))}>
            Inserisci esempio
          </button>
        )}
      </div>
      <details style={{ marginTop: 6 }}>
        <summary>Campi accettati</summary>
        <ul style={{ fontSize: 12, paddingLeft: 18, margin: '4px 0' }}>
          {schemaLines.map(line => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap' }}>{JSON.stringify(exampleRows, null, 2)}</pre>
      </details>
    </div>
  );
}
