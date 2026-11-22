import React, { useCallback, useRef, useState } from 'react';
import { reorderMetricsWithPosition } from '../../utils/metricReorder';

export type DropPosition = 'before' | 'after';

export interface MetricDragState {
  dragged: string | null;
  dropTarget: { metric: string; position: DropPosition } | null;
}

/**
 * Trascinamento delle colonne delle metriche con riordino tramite la dashboard
 * (`onReorderMetrics`). `isDraggingRef` evita che il clic che chiude il trascinamento ordini la colonna.
 */
export function useMetricDrag(baseMetrics: string[], onReorderMetrics?: (metrics: string[]) => void) {
  const [dragged, setDragged] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<MetricDragState['dropTarget']>(null);
  const isDraggingRef = useRef(false);

  const finish = useCallback(() => {
    setDragged(null);
    setDropTarget(null);
    setTimeout(() => {
      isDraggingRef.current = false;
    }, 100);
  }, []);

  const onDragStart = useCallback((e: React.DragEvent, metricKey: string) => {
    isDraggingRef.current = true;
    setDragged(metricKey);
    e.dataTransfer.setData('text/plain', metricKey);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const onDragOver = useCallback((e: React.DragEvent, targetMetricKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const isBefore = e.clientX < rect.left + rect.width / 2;
    setDropTarget({ metric: targetMetricKey, position: isBefore ? 'before' : 'after' });
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent, targetMetricKey: string) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDropTarget(prev => (prev?.metric === targetMetricKey ? null : prev));
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent, targetMetricKey: string) => {
      e.preventDefault();
      const sourceMetric = e.dataTransfer.getData('text/plain') || dragged;
      const rect = e.currentTarget.getBoundingClientRect();
      const isBefore = e.clientX < rect.left + rect.width / 2;
      const position: DropPosition =
        dropTarget && dropTarget.metric === targetMetricKey ? dropTarget.position : isBefore ? 'before' : 'after';

      if (
        sourceMetric &&
        targetMetricKey &&
        sourceMetric !== targetMetricKey &&
        onReorderMetrics &&
        baseMetrics.length > 0
      ) {
        onReorderMetrics(reorderMetricsWithPosition(baseMetrics, sourceMetric, targetMetricKey, position));
      }
      finish();
    },
    [baseMetrics, dragged, dropTarget, onReorderMetrics, finish],
  );

  return { dragged, dropTarget, isDraggingRef, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd: finish };
}
