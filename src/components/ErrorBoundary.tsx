import React from 'react';
import { msg } from '../i18n';

interface Props {
  children: React.ReactNode;
  /** Quando cambia (nuovi dati o impostazioni) l'errore precedente viene dimenticato e si riprova. */
  resetKey?: unknown;
}

interface State {
  error: Error | null;
}

/**
 * Se il disegno della tabella solleva un errore (dati inattesi, impostazioni non valide) mostra un
 * messaggio al posto del grafico invece di lasciare vuota l'intera scheda della dashboard.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(previous: Props) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="superset-hierarchical-table-container" role="alert">
        <div className="empty-state">
          <p>{msg('state.error')}</p>
          <details>
            <summary>{msg('state.errorDetails')}</summary>
            <pre style={{ whiteSpace: 'pre-wrap', textAlign: 'left' }}>{error.message}</pre>
          </details>
        </div>
      </div>
    );
  }
}
