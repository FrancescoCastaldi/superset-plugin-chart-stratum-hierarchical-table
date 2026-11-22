import React from 'react';
import { msg } from '../../i18n';
import {
  HeatmapDivergingPalette,
  MetricPolarity,
  MinMaxBound,
  MinMaxDisplayMode,
} from '../../types';
import { computeBipolarDataBar, computeDivergingColor } from '../../utils/advancedCellVisuals';
import { getHeatmapBgColor } from '../../utils/formatters';
import { ResolvedTheme } from '../../utils/themes';

/** Posizione di un valore nella scala della sua colonna, per i colori e le barre. */
export interface CellScale {
  mode: MinMaxDisplayMode;
  /** La riga partecipa al calcolo della scala (vedi "Ambito di calcolo min/max"). */
  inScope: boolean;
  /** Valore numerico della cella, null se non è un numero. */
  numeric: number | null;
  bound?: MinMaxBound;
  /** Valore normalizzato da 0 a 1 nella scala, 0 se la scala è piatta. */
  normalized: number;
  polarity?: MetricPolarity;
  palette?: HeatmapDivergingPalette;
  midpoint?: number;
  dataBarZeroAxis?: boolean;
  theme: ResolvedTheme;
}

const spansRange = (bound?: MinMaxBound): bound is MinMaxBound => Boolean(bound && bound.max > bound.min);

/** Sfondo (e colore del testo) della cella per le modalità heatmap; vuoto per le altre. */
export function heatmapStyle(scale: CellScale): React.CSSProperties {
  const { mode, inScope, numeric, bound, theme } = scale;
  const style: React.CSSProperties = {};
  const isCustom = theme.name === 'custom';
  if (mode === 'heatmap' && inScope && numeric !== null && spansRange(bound)) {
    style.backgroundColor = getHeatmapBgColor(scale.normalized, theme.style);
  } else if (mode === 'diverging_heatmap' && inScope && numeric !== null && bound) {
    const result = computeDivergingColor(numeric, bound.min, bound.max, {
      polarity: scale.polarity,
      palette: scale.palette,
      midpoint: scale.midpoint,
      positiveColor: isCustom ? theme.positive : undefined,
      negativeColor: isCustom ? theme.negative : undefined,
      neutralColor: isCustom ? theme.neutral : undefined,
    });
    style.backgroundColor = result.bgColor;
    style.color = result.textColor;
  }
  return style;
}

/** Cornice della cella: badge MIN e MAX, barre di dati, oppure il solo contenuto. */
export function CellVisual({ scale, content }: { scale: CellScale; content: React.ReactNode }) {
  const { mode, inScope, numeric, bound, theme } = scale;
  const themeClass = `theme-${theme.style}`;
  const isCustom = theme.name === 'custom';
  const hasScale = inScope && numeric !== null && spansRange(bound);

  if (mode === 'badges') {
    const isMax = hasScale && numeric === bound.max;
    const isMin = hasScale && numeric === bound.min;
    return (
      <div className="metric-cell-badges-wrapper">
        <span className="metric-val">{content}</span>
        {isMax && (
          <span
            className={`minmax-badge minmax-max ${themeClass}`}
            style={isCustom ? { background: theme.positive } : undefined}
            title={msg('cell.max', { value: String(numeric) })}
          >
            MAX
          </span>
        )}
        {isMin && (
          <span
            className={`minmax-badge minmax-min ${themeClass}`}
            style={isCustom ? { color: theme.negative, borderColor: theme.negative } : undefined}
            title={msg('cell.min', { value: String(numeric) })}
          >
            MIN
          </span>
        )}
      </div>
    );
  }

  if (mode === 'data_bars' || mode === 'bipolar_data_bars') {
    let bar: React.ReactNode = null;
    if (inScope && numeric !== null && bound && mode === 'bipolar_data_bars') {
      const result = computeBipolarDataBar(numeric, bound.min, bound.max, {
        polarity: scale.polarity,
        positiveColor: isCustom ? theme.positive : undefined,
        negativeColor: isCustom ? theme.negative : undefined,
      });
      const crossesZero = bound.min < 0 && bound.max > 0;
      const zeroPct = crossesZero ? (Math.abs(bound.min) / (Math.abs(bound.min) + bound.max)) * 100 : 0;
      bar = (
        <>
          {crossesZero && scale.dataBarZeroAxis !== false && (
            <div className="data-bar-zero-line" style={{ left: `${zeroPct}%` }} />
          )}
          <div
            className="data-bar-fill bipolar"
            style={{
              left: `${result.leftPct}%`,
              width: `${result.widthPct}%`,
              backgroundColor: result.color,
            }}
          />
        </>
      );
    } else if (hasScale) {
      bar = (
        <div
          className={`data-bar-fill ${themeClass}`}
          style={{
            width: `${Math.round(scale.normalized * 100)}%`,
            ...(isCustom ? { backgroundColor: theme.neutral } : {}),
          }}
        />
      );
    }
    return (
      <div className="data-bar-container">
        {bar}
        <span className="data-bar-value">{content}</span>
      </div>
    );
  }

  return <>{content}</>;
}
