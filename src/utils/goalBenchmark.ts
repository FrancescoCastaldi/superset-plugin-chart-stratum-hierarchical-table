import { GoalDelta, GoalDirection, GoalStatus, MetricGoal } from '../types';
import { msg } from '../i18n';
import { formatNumber } from '../utils/numberFormat';

/** Minimum attainment ratio (actual vs target, inverted for lower_is_better) of each band. */
export const DEFAULT_GOAL_THRESHOLDS = {
  achieved: 1,
  onTrack: 0.9,
  atRisk: 0.75,
} as const;

const GOAL_DIRECTIONS: readonly GoalDirection[] = ['higher_is_better', 'lower_is_better'];

function statusFromAttainment(attainment: number): GoalStatus {
  if (attainment >= DEFAULT_GOAL_THRESHOLDS.achieved) return 'achieved';
  if (attainment >= DEFAULT_GOAL_THRESHOLDS.onTrack) return 'on_track';
  if (attainment >= DEFAULT_GOAL_THRESHOLDS.atRisk) return 'at_risk';
  return 'missed';
}

/**
 * Compares a node value with its metric goal. Attainment is actual / target for
 * higher_is_better and target / actual for lower_is_better; zero operands never reach a
 * division, so the status is always one of the four bands.
 */
export function computeGoalDelta(nodeValue: number, goal: MetricGoal): GoalDelta {
  const { target, direction } = goal;
  const deltaAbsolute = nodeValue - target;
  const deltaPct = target === 0 ? null : (deltaAbsolute * 100) / Math.abs(target);
  const lowerIsBetter = direction === 'lower_is_better';

  const goalMet = lowerIsBetter ? nodeValue <= target : nodeValue >= target;
  if (goalMet || (lowerIsBetter && nodeValue === 0)) {
    return { deltaAbsolute, deltaPct, status: 'achieved' };
  }

  // With a non-positive target an unmet goal has no meaningful ratio (zero divisor or
  // inverted signs that would read as over-achievement).
  if (target <= 0) {
    return { deltaAbsolute, deltaPct, status: 'missed' };
  }

  const attainment = lowerIsBetter ? target / nodeValue : nodeValue / target;
  return { deltaAbsolute, deltaPct, status: statusFromAttainment(attainment) };
}

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  achieved: msg('goal.achieved'),
  on_track: msg('goal.onTrack'),
  at_risk: msg('goal.atRisk'),
  missed: msg('goal.missed'),
};

/**
 * Short signed comparison shown next to the value: the percentage of the target, or the
 * absolute gap when the target is zero.
 */
export function formatGoalDelta(
  delta: GoalDelta,
  formatValue: (val: number) => string = String,
): string {
  if (delta.deltaPct !== null) {
    return `${delta.deltaPct > 0 ? '+' : ''}${formatNumber(delta.deltaPct, 1, 1)}%`;
  }
  return `${delta.deltaAbsolute > 0 ? '+' : ''}${formatValue(delta.deltaAbsolute)}`;
}

export function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Accepts the `goals` control value (a JSON text or an already parsed array) and keeps only
 * well-formed entries. The metric is read from `metricKey` or, as an alias, from `metric` (the
 * name used by the other JSON controls). A missing direction defaults to higher_is_better; any
 * other unknown direction drops the entry.
 */
export function normalizeGoals(raw: unknown): MetricGoal[] {
  return inspectGoals(raw).goals;
}

export interface GoalsInspection {
  goals: MetricGoal[];
  /** Human-readable reason for every entry that was dropped, with its 1-based position. */
  dropped: string[];
  /** Set when the text is not valid JSON or not an array. */
  syntaxError?: string;
}

/** Same rules as `normalizeGoals`, but reports why each entry was dropped. */
export function inspectGoals(raw: unknown): GoalsInspection {
  let entries: unknown = raw;
  if (typeof raw === 'string') {
    if (raw.trim() === '') return { goals: [], dropped: [] };
    try {
      entries = JSON.parse(raw);
    } catch (error) {
      return { goals: [], dropped: [], syntaxError: (error as Error).message };
    }
  }
  if (!Array.isArray(entries)) {
    return { goals: [], dropped: [], syntaxError: 'Deve essere un elenco tra parentesi quadre [ ].' };
  }

  const goals: MetricGoal[] = [];
  const dropped: string[] = [];
  entries.forEach((entry, index) => {
    const position = index + 1;
    if (!entry || typeof entry !== 'object') {
      dropped.push(`Obiettivo ${position}: non è un oggetto.`);
      return;
    }
    const record = entry as Record<string, unknown>;
    const metricKey = record.metricKey ?? record.metric;
    const direction = record.direction ?? 'higher_is_better';
    const numericTarget = toFiniteNumber(record.target);
    if (typeof metricKey !== 'string' || metricKey.trim() === '') {
      dropped.push(`Obiettivo ${position}: manca "metric" (nome della metrica).`);
      return;
    }
    if (numericTarget === null) {
      dropped.push(`Obiettivo ${position}: "target" deve essere un numero.`);
      return;
    }
    if (!GOAL_DIRECTIONS.includes(direction as GoalDirection)) {
      dropped.push(`Obiettivo ${position}: "direction" deve essere higher_is_better o lower_is_better.`);
      return;
    }
    goals.push({ metricKey, target: numericTarget, direction: direction as GoalDirection });
  });
  return { goals, dropped };
}

/**
 * Goal benchmarked by a column: plain metric columns match on their key, pivot cells on their
 * base metric. Delta and total columns carry a composite base metric and never match.
 */
export function findColumnGoal(
  column: { key: string; baseMetric?: string },
  goals: MetricGoal[],
): MetricGoal | undefined {
  if (goals.length === 0) return undefined;
  const metricKey = column.baseMetric ?? column.key;
  return goals.find(goal => goal.metricKey === metricKey);
}
