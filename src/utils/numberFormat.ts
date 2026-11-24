/**
 * Numeri in formato italiano: punto per le migliaia (1.234), virgola per i decimali (7,03).
 * Il pivot, le celle, le variazioni e l'export scrivono allo stesso modo.
 */

/** Scambia i separatori di un numero scritto all'americana: "1,234.56" diventa "1.234,56". */
export function italianNumber(text: string): string {
  return text.replace(/[.,]/g, separator => (separator === ',' ? '.' : ','));
}

const decimalFormats = new Map<string, Intl.NumberFormat>();

/** Punto ogni tre cifre della parte intera: "1234567" diventa "1.234.567". */
const groupThousands = (digits: string): string => digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/**
 * Numero con al massimo `maxDecimals` decimali e le migliaia separate, anche le quattro cifre
 * (che l'italiano da solo non raggruppa). Con `minDecimals` i decimali sono sempre quelli.
 */
export function formatNumber(value: number, maxDecimals = 2, minDecimals = 0): string {
  const key = `${minDecimals}-${maxDecimals}`;
  let format = decimalFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat('it-IT', {
      useGrouping: false,
      minimumFractionDigits: minDecimals,
      maximumFractionDigits: maxDecimals,
    });
    decimalFormats.set(key, format);
  }
  return format.format(value).replace(/^(-?)(\d+)/, (_whole, sign: string, digits: string) => sign + groupThousands(digits));
}
