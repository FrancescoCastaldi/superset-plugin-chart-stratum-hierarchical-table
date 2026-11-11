/**
 * Does the chart being set up use a Time metric? Read in Explore from what is picked in the Data
 * section, so that the controls of the durations (format, decimals, roll-up) show up only when they
 * matter. It is a hint: the data decide at render time (a column whose values are all times is read as
 * a duration whatever this says), so a wrong answer only hides or shows controls, never changes a chart.
 */

/** Column types of the databases that mean a time of day or an interval */
const TIME_TYPE = /^(time(\(\d+\))?( with(out)? time zone)?|timetz|interval.*)$/i;

/** Names that say a metric is a duration */
const DURATION_NAME = /(^|[^a-z])(tempo|tempi|durata|attesa|lead ?time|leadtime|wait(ing)?|duration|latency|elapsed)([^a-z]|$)/i;

const METRIC_CONTROLS = ['metrics', 'metric', 'secondary_metrics', 'comparison_metric', 'target_metric'];

const text = (v: unknown): string => (typeof v === 'string' ? v : '');

const isTimeType = (type: unknown): boolean => TIME_TYPE.test(text(type).trim());

/** Quotes and brackets around a name in an expression are dropped, so `[Tempo]` finds `Tempo` */
const mentions = (expression: string, name: string): boolean => {
  if (!expression || !name) return false;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\w])[\\[\\"\`']?${escaped}[\\]\\"\`']?($|[^\\w])`, 'i').test(expression);
};

/**
 * The dataset of the chart: Explore hands it to the control panel as `datasource` (the same as the
 * Donut reads it). The datasource control keeps only the id, so it is the fallback.
 */
function datasetOf(props: any): any {
  const controls = props?.controls;
  return props?.datasource ?? controls?.datasource?.datasource ?? controls?.metrics?.datasource ?? controls?.metric?.datasource;
}

function isTimeLikeMetric(metric: unknown, dataset: any): boolean {
  const columns: any[] = Array.isArray(dataset?.columns) ? dataset.columns : [];
  const timeColumns = columns.filter(c => isTimeType(c?.type)).map(c => text(c.column_name));
  const usesTimeColumn = (expression: string) => timeColumns.some(name => mentions(expression, name));

  if (typeof metric === 'string') {
    const saved = (Array.isArray(dataset?.metrics) ? dataset.metrics : []).find(
      (m: any) => m?.metric_name === metric || m?.verbose_name === metric,
    );
    return (
      usesTimeColumn(text(saved?.expression)) ||
      DURATION_NAME.test(metric) ||
      DURATION_NAME.test(text(saved?.verbose_name))
    );
  }
  if (metric && typeof metric === 'object') {
    const m = metric as any;
    return (
      isTimeType(m.column?.type) ||
      timeColumns.includes(text(m.column?.column_name)) ||
      usesTimeColumn(text(m.sqlExpression)) ||
      DURATION_NAME.test(text(m.label)) ||
      DURATION_NAME.test(text(m.column?.column_name))
    );
  }
  return false;
}

/** True when any metric picked in the Data section looks like a Time field */
export function hasTimeMetric(props: { controls?: any }): boolean {
  const controls = props?.controls;
  if (!controls) return false;
  const dataset = datasetOf(props);
  return METRIC_CONTROLS.some(name => {
    const value = controls[name]?.value;
    const list = Array.isArray(value) ? value : value ? [value] : [];
    return list.some(metric => isTimeLikeMetric(metric, dataset));
  });
}
