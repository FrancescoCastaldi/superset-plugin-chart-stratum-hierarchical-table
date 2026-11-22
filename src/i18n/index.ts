import { MESSAGES, MessageKey } from './messages';

export type { MessageKey };
export { MESSAGES };

export type MessageParams = Record<string, string | number>;

/**
 * Testo italiano per una chiave, con i segnaposto `{nome}` sostituiti dai parametri.
 * Un segnaposto senza parametro resta com'è, così l'errore si nota subito.
 */
export function msg(key: MessageKey, params?: MessageParams): string {
  const template: string = MESSAGES[key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}
