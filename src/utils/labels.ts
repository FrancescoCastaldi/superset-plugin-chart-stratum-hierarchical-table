import { msg } from '../i18n';
import { EMPTY_DIMENSION_VALUE } from './dimensionValue';

/**
 * Identificatori interni che compaiono nei dati dell'albero: non si traducono, perché chiavi,
 * percorsi, ordinamenti e filtri li confrontano per valore. Si traducono solo quando si mostrano.
 */
export const GRAND_TOTAL_NAME = 'Grand Total';

/** Valore di una variazione senza base di confronto (confronto uguale a zero). */
export const NEW_VALUE = 'Nuovo';

/** Testo da mostrare per il nome di un nodo. */
export function displayName(name: string): string {
  if (name === GRAND_TOTAL_NAME) return msg('label.grandTotal');
  if (name === EMPTY_DIMENSION_VALUE) return msg('label.empty');
  return name;
}
