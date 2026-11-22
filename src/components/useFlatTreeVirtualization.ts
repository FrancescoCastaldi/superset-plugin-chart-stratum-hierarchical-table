import { useMemo } from 'react';

export interface VirtualizationOptions {
  threshold?: number;
  pageSize?: number;
  scrollTop?: number;
  rowHeight?: number;
  buffer?: number;
}

export interface RenderWindow {
  start: number;
  end: number;
  padTop: number;
  padBottom: number;
}

/**
 * Pure, DOM-free visible window over a flat tree. Above the threshold it keeps pageSize rows
 * from the first visible one plus a buffer on each side; the paddings stand in for the
 * skipped rows so the scroll height stays stable.
 */
export function computeRenderWindow(
  total: number,
  { threshold = 500, pageSize = 100, scrollTop = 0, rowHeight = 32, buffer = 20 }: VirtualizationOptions,
): RenderWindow {
  if (total <= threshold) return { start: 0, end: total, padTop: 0, padBottom: 0 };
  const first = Math.min(Math.floor(scrollTop / rowHeight), Math.max(0, total - pageSize));
  const start = Math.max(0, first - buffer);
  const end = Math.min(total, first + pageSize + buffer);
  return { start, end, padTop: start * rowHeight, padBottom: (total - end) * rowHeight };
}

export function sliceRenderWindow<T>(tree: T[], options: VirtualizationOptions) {
  const renderWindow = computeRenderWindow(tree.length, options);
  return { renderWindow, rows: tree.slice(renderWindow.start, renderWindow.end) };
}

export function useFlatTreeVirtualization<T>(tree: T[], options: VirtualizationOptions) {
  const { threshold, pageSize, scrollTop, rowHeight, buffer } = options;
  return useMemo(
    () => sliceRenderWindow(tree, { threshold, pageSize, scrollTop, rowHeight, buffer }),
    [tree, threshold, pageSize, scrollTop, rowHeight, buffer],
  );
}
