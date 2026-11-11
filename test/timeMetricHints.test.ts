import { hasTimeMetric } from '../src/plugin/timeMetricHints';

const dataset = {
  columns: [
    { column_name: 'Data', type: 'DATE' },
    { column_name: 'TempoAttesa', type: 'TIME' },
    { column_name: 'Durata', type: 'INTERVAL DAY TO SECOND' },
    { column_name: 'Richieste', type: 'INTEGER' },
  ],
  metrics: [
    { metric_name: 'Attesa Sportello', expression: 'AVG([TempoAttesa])' },
    { metric_name: 'Numero', expression: 'COUNT(*)' },
    { metric_name: 'Pazienti', expression: 'SUM(Richieste)' },
  ],
};

const panel = (controls: Record<string, unknown>) => ({
  controls: { datasource: { datasource: dataset }, ...controls },
});

describe('hasTimeMetric', () => {
  it('is false with nothing picked', () => {
    expect(hasTimeMetric(panel({ metrics: { value: [] } }))).toBe(false);
    expect(hasTimeMetric({})).toBe(false);
  });

  it('finds a saved metric whose expression uses a Time column', () => {
    expect(hasTimeMetric(panel({ metrics: { value: ['Attesa Sportello'] } }))).toBe(true);
  });

  it('finds a saved metric by the words of its name', () => {
    expect(hasTimeMetric(panel({ metrics: { value: ['Durata Prelievo'] } }))).toBe(true);
  });

  it('finds a simple metric on a Time or interval column', () => {
    const metric = { expressionType: 'SIMPLE', aggregate: 'AVG', column: { column_name: 'X', type: 'TIME' } };
    expect(hasTimeMetric(panel({ metrics: { value: [metric] } }))).toBe(true);
    const interval = { expressionType: 'SIMPLE', column: { column_name: 'Durata', type: 'INTERVAL DAY TO SECOND' } };
    expect(hasTimeMetric(panel({ metrics: { value: [interval] } }))).toBe(true);
  });

  it('finds a custom SQL metric that names a Time column', () => {
    const sql = { expressionType: 'SQL', sqlExpression: 'AVG("TempoAttesa")', label: 'M1' };
    expect(hasTimeMetric(panel({ metrics: { value: [sql] } }))).toBe(true);
  });

  it('looks at the secondary, comparison and target metrics too', () => {
    expect(hasTimeMetric(panel({ metrics: { value: ['Numero'] }, secondary_metrics: { value: ['Attesa Sportello'] } }))).toBe(true);
    expect(hasTimeMetric(panel({ comparison_metric: { value: 'Attesa Sportello' } }))).toBe(true);
  });

  it('is false for counts and sums', () => {
    expect(hasTimeMetric(panel({ metrics: { value: ['Numero', 'Pazienti'] } }))).toBe(false);
    const count = { expressionType: 'SIMPLE', aggregate: 'SUM', column: { column_name: 'Richieste', type: 'INTEGER' } };
    expect(hasTimeMetric(panel({ metrics: { value: [count] } }))).toBe(false);
  });

  it('does not take TIMESTAMP and DATE columns for times', () => {
    const ts = { expressionType: 'SIMPLE', column: { column_name: 'Quando', type: 'TIMESTAMP' } };
    expect(hasTimeMetric(panel({ metrics: { value: [ts] } }))).toBe(false);
  });

  it('reads the dataset from the metrics control when the datasource control has none', () => {
    expect(hasTimeMetric({ controls: { metrics: { value: ['Attesa Sportello'], datasource: dataset } } })).toBe(true);
  });
});
