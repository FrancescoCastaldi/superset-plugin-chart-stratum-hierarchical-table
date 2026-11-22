import { RefObject, useEffect, useState } from 'react';

/** Larghezza utile dell'elemento, aggiornata quando il riquadro cambia misura (`dep` riavvia l'osservazione). */
export function useContainerWidth(ref: RefObject<HTMLElement>, dep?: unknown): number {
  const [width, setWidth] = useState<number>(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    const measure = () => {
      const clientWidth = el.clientWidth;
      if (clientWidth > 0) setWidth(prev => (prev !== clientWidth ? clientWidth : prev));
    };

    measure();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => measure());
      observer.observe(el);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [ref, dep]);

  return width;
}
