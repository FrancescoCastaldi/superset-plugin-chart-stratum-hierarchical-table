import { CSSProperties, RefObject, useLayoutEffect, useState } from 'react';

export interface HostColors {
  /** Il fondo del punto in cui il grafico è inserito è scuro. */
  dark: boolean;
  text: string;
  background: string;
}

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const LIGHT_TEXT: Rgba = { r: 31, g: 41, b: 55, a: 1 };
const LIGHT_BACKGROUND: Rgba = { r: 255, g: 255, b: 255, a: 1 };

/** Colore da `rgb(0, 0, 0)`, `rgba(0, 0, 0, 0.5)` o `rgb(0 0 0 / 50%)`, come lo restituisce getComputedStyle. */
export function parseCssColor(value: string): Rgba | null {
  const m = value.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)/i);
  if (!m) return null;
  const alpha = m[4] === undefined ? 1 : m[5] === '%' ? Number(m[4]) / 100 : Number(m[4]);
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: alpha };
}

/** Luminanza relativa WCAG di un colore, da 0 (nero) a 1 (bianco). */
export function luminance({ r, g, b }: Rgba): number {
  const [lr, lg, lb] = [r, g, b].map(channel => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

const asCss = ({ r, g, b }: Rgba): string => `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;

const LIGHT: HostColors = { dark: false, text: asCss(LIGHT_TEXT), background: asCss(LIGHT_BACKGROUND) };

/**
 * Colori della pagina che ospita il grafico: il testo ereditato e il primo fondo non trasparente
 * risalendo dall'elemento. Servono per adattarsi a un tema scuro senza conoscere il tema di Superset.
 */
export function sampleHostColors(element: Element | null): HostColors {
  const start = element?.parentElement;
  if (!start || typeof window === 'undefined') return LIGHT;
  const text = parseCssColor(window.getComputedStyle(start).color) ?? LIGHT_TEXT;

  let background: Rgba | null = null;
  for (let node: Element | null = start; node; node = node.parentElement) {
    const color = parseCssColor(window.getComputedStyle(node).backgroundColor);
    if (color && color.a > 0.5) {
      background = color;
      break;
    }
  }
  const bg = background ?? LIGHT_BACKGROUND;
  return { dark: luminance(bg) < 0.35 && luminance(text) > luminance(bg), text: asCss(text), background: asCss(bg) };
}

/**
 * Misura i colori dell'ospite e li tiene aggiornati quando la pagina cambia tema (classe o
 * attributi di html e body, preferenza di sistema). Restituisce la classe e le variabili CSS da
 * mettere sul contenitore: senza tema scuro non cambia nulla rispetto ai colori di partenza.
 */
export function useHostColors(ref: RefObject<HTMLElement>): { className: string | undefined; style: CSSProperties } {
  const [colors, setColors] = useState<HostColors>(LIGHT);

  useLayoutEffect(() => {
    const measure = () =>
      setColors(prev => {
        const next = sampleHostColors(ref.current);
        return prev.dark === next.dark && prev.text === next.text && prev.background === next.background ? prev : next;
      });
    measure();

    const observers: MutationObserver[] = [];
    if (typeof MutationObserver !== 'undefined') {
      for (const target of [document.documentElement, document.body]) {
        if (!target) continue;
        const observer = new MutationObserver(measure);
        observer.observe(target, { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-bs-theme'] });
        observers.push(observer);
      }
    }
    const media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    media?.addEventListener?.('change', measure);
    return () => {
      observers.forEach(observer => observer.disconnect());
      media?.removeEventListener?.('change', measure);
    };
  }, [ref]);

  return {
    className: colors.dark ? 'st-dark' : undefined,
    style: { '--st-host-text': colors.text, '--st-host-bg': colors.background } as CSSProperties,
  };
}
