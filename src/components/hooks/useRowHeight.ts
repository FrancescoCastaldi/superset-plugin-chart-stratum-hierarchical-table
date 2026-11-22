import { RefObject, useLayoutEffect, useState } from 'react';

/** Altezze di riga usate finché la riga vera non è stata misurata (e nei test, senza layout). */
export const DEFAULT_ROW_HEIGHT = 40;
export const COMPACT_ROW_HEIGHT = 28;

/**
 * Altezza reale di una riga dell'albero, letta dalla prima riga disegnata. La finestra virtuale
 * calcola con questa le righe saltate: con un valore sbagliato la barra di scorrimento salta.
 * `dep` fa rimisurare quando cambia qualcosa che può cambiare l'altezza (colonne, tema).
 */
export function useRowHeight(bodyRef: RefObject<HTMLElement>, compact: boolean, dep?: unknown): number {
  const fallback = compact ? COMPACT_ROW_HEIGHT : DEFAULT_ROW_HEIGHT;
  const [measured, setMeasured] = useState<number | null>(null);

  useLayoutEffect(() => {
    const row = bodyRef.current?.querySelector('tr[data-tree-row]');
    const height = row ? row.getBoundingClientRect().height : 0;
    setMeasured(height > 0 ? Math.round(height * 10) / 10 : null);
  }, [bodyRef, compact, dep]);

  return measured ?? fallback;
}
