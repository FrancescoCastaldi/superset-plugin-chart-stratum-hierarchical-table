import classNames from 'classnames';
import { msg } from '../../i18n';
import { MetricGoal, MetricPolarity, TableColumn, CellInterval } from '../../types';
import { GOAL_STATUS_LABELS, computeGoalDelta, formatGoalDelta } from '../../utils/goalBenchmark';
import { computeWhatIfDelta } from '../../utils/whatIfEngine';
import { arrowOf, deltaClassName, signedPercent } from './cellUtils';

/** Scostamento dall'obiettivo di una metrica, con il suo stato (raggiunto, in linea, a rischio, mancato). */
export function GoalBadge({
  value,
  goal,
  formatter,
}: {
  value: number;
  goal: MetricGoal;
  formatter?: (val: any) => string;
}) {
  const delta = computeGoalDelta(value, goal);
  const comparison = formatGoalDelta(delta, formatter);
  const target = formatter ? formatter(goal.target) : String(goal.target);
  return (
    <span
      className={`goal-badge goal-${delta.status}`}
      aria-label={msg('cell.goalVsTarget', { status: GOAL_STATUS_LABELS[delta.status], comparison, target })}
    >
      {comparison}
    </span>
  );
}

/** Intervallo di confidenza di un rapporto, con la freccia se è significativamente sopra o sotto il riferimento. */
export function SignalMarker({
  interval,
  polarity,
  formatter,
}: {
  interval: CellInterval;
  polarity?: MetricPolarity;
  formatter?: (val: any) => any;
}) {
  const show = (v: number) => (formatter ? formatter(v) : String(Math.round(v * 10) / 10));
  const range = msg('cell.ciRange', {
    level: Math.round(interval.level * 1000) / 10,
    lower: show(interval.lower),
    upper: show(interval.upper),
  });
  if (!interval.signal) {
    return <span className="ci-range" title={range} aria-label={range} />;
  }
  const good = (interval.signal === 'above') === (polarity !== 'lower_is_better');
  const label = msg(interval.signal === 'above' ? 'cell.signalAbove' : 'cell.signalBelow', { range });
  return (
    <span className={`signal-marker ${good ? 'signal-good' : 'signal-bad'}`} title={label} aria-label={label}>
      {interval.signal === 'above' ? '▲' : '▼'}
    </span>
  );
}

/** Pillola colorata con una variazione %. `titleKey` distingue le righe dal totale generale. */
export function DeltaPill({
  value,
  className,
  titleKey,
}: {
  value: number;
  className: string;
  titleKey: 'cell.deltaPct' | 'cell.change' | 'total.deltaPct' | 'total.change';
}) {
  return (
    <span className={classNames('delta-badge', className)} title={msg(titleKey, { value: signedPercent(value) })}>
      {arrowOf(value)}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

/** Badge "Nuovo": variazione senza base di confronto. */
export const NewBadge = () => <span className="badge-delta-nuovo">{msg('label.new')}</span>;

/** Contenuto di una colonna di variazione: la pillola per le variazioni %, il numero colorato per le altre. */
export function DeltaColumnValue({
  value,
  col,
  titleKey,
}: {
  value: number;
  col: TableColumn;
  titleKey: 'cell.deltaPct' | 'total.deltaPct';
}) {
  const className = deltaClassName(value - (col.deltaBaseline ?? 0), col.polarity);
  if (col.key.endsWith('___delta')) {
    return <DeltaPill value={value} className={className} titleKey={titleKey} />;
  }
  return <span className={className}>{col.formatter ? col.formatter(value) : String(value ?? '-')}</span>;
}

/** Badge della simulazione What-If: variazione del valore rispetto alla base storica. */
export function WhatIfPill({
  value,
  baseline,
  col,
  titleKey,
}: {
  value: number;
  baseline: number;
  col: TableColumn;
  titleKey: 'cell.simulated' | 'total.simulated';
}) {
  const delta = computeWhatIfDelta(value, baseline);
  if (delta.pct === null) return null;
  const isPositive = delta.pct > 0;
  const isGood = col.polarity === 'lower_is_better' ? !isPositive : isPositive;
  return (
    <span
      className={classNames('whatif-delta-badge', isGood ? 'whatif-delta-good' : 'whatif-delta-bad')}
      title={msg(titleKey, {
        current: col.formatter ? col.formatter(value) : String(value),
        base: col.formatter ? col.formatter(baseline) : String(baseline),
        pct: signedPercent(delta.pct),
      })}
    >
      {isPositive ? '▲ +' : '▼ '}
      {Math.abs(delta.pct).toFixed(1)}%
    </span>
  );
}
