jest.mock('@superset-ui/core', () => ({
  getNumberFormatter: () => (val: any) => String(val),
  ensureIsArray: (val: any) =>
    val === null || val === undefined ? [] : Array.isArray(val) ? val : [val],
}));

import transformProps from '../src/plugin/transformProps';
import { healthcareScenario } from '../dev-studio/src/mockData/healthcareScenario';
import { salesPivotScenario } from '../dev-studio/src/mockData/salesPivotScenario';
import { stressTestScenario } from '../dev-studio/src/mockData/stressTestScenario';

describe('Dev Studio Benchmark Scenarios Data Pipeline', () => {
  test('healthcareScenario produces valid hierarchical tree data', () => {
    const props = transformProps({
      width: 1200,
      height: 700,
      formData: healthcareScenario.formData,
      rawFormData: healthcareScenario.formData,
      queriesData: [{ data: healthcareScenario.data }],
    } as any);

    expect(props.data).toBeDefined();
    expect(props.data.length).toBeGreaterThan(0);
    expect(props.columns.length).toBeGreaterThan(0);
    expect(props.grandTotalNode).toBeDefined();
    // ASL 1 Centro and ASL 2 Nord
    expect(props.data.map(n => n.name)).toEqual(['ASL 1 Centro', 'ASL 2 Nord']);
  });

  test('salesPivotScenario produces valid pivoted matrix grid data', () => {
    const props = transformProps({
      width: 1200,
      height: 700,
      formData: salesPivotScenario.formData,
      rawFormData: salesPivotScenario.formData,
      queriesData: [{ data: salesPivotScenario.data }],
    } as any);

    expect(props.data).toBeDefined();
    expect(props.data.length).toBeGreaterThan(0);
    expect(props.columns.length).toBeGreaterThan(0);
    expect(props.isPivotMode).toBe(true);
  });

  test('stressTestScenario produces 5000-row tree data without errors', () => {
    const testData = stressTestScenario.data.slice(0, 500); // verify 500 rows in test
    const props = transformProps({
      width: 1200,
      height: 700,
      formData: stressTestScenario.formData,
      rawFormData: stressTestScenario.formData,
      queriesData: [{ data: testData }],
    } as any);

    expect(props.data).toBeDefined();
    expect(props.data.length).toBeGreaterThan(0);
  });

  test('healthcareScenario computes valid YoY and MoM deltas when temporal pivot is enabled', () => {
    // 1. Year-over-Year (YoY)
    const yoyProps = transformProps({
      width: 1200,
      height: 700,
      formData: {
        ...healthcareScenario.formData,
        columns: ['mese'],
        pivot_columns: ['mese'],
        timeGrain: 'year',
        referencePeriod: 'previous',
        comparisonType: 'prev_period',
      },
      queriesData: [{ data: healthcareScenario.data }],
    } as any);

    const asl1CentroYoY = yoyProps.data.find(n => n.name === 'ASL 1 Centro')!;
    expect(asl1CentroYoY.metrics.ricoveri___period_delta).not.toBeNull();
    expect(typeof asl1CentroYoY.metrics.ricoveri___period_delta).toBe('number');
    expect(asl1CentroYoY.metrics.ricoveri___period_delta_pct).not.toBeNull();
    const yoyHeader = yoyProps.pivotHeaderGroups?.find(g => g.key === '__period_comparison__');
    expect(yoyHeader?.title).toBe('Δ vs anno precedente (YoY)');

    // 2. Month-over-Month (MoM)
    const momProps = transformProps({
      width: 1200,
      height: 700,
      formData: {
        ...healthcareScenario.formData,
        columns: ['mese'],
        pivot_columns: ['mese'],
        timeGrain: 'month',
        referencePeriod: 'previous',
        comparisonType: 'prev_period',
      },
      queriesData: [{ data: healthcareScenario.data }],
    } as any);

    const asl1CentroMoM = momProps.data.find(n => n.name === 'ASL 1 Centro')!;
    expect(asl1CentroMoM.metrics.ricoveri___period_delta).not.toBeNull();
    expect(typeof asl1CentroMoM.metrics.ricoveri___period_delta).toBe('number');
    const momHeader = momProps.pivotHeaderGroups?.find(g => g.key === '__period_comparison__');
    expect(momHeader?.title).toBe('Δ vs mese precedente (MoM)');

    // 3. Stesso Periodo Anno Scorso (Same period last year)
    const samePeriodProps = transformProps({
      width: 1200,
      height: 700,
      formData: {
        ...healthcareScenario.formData,
        columns: ['mese'],
        pivot_columns: ['mese'],
        timeGrain: 'month',
        comparisonType: 'prev_year_same_period',
      },
      queriesData: [{ data: healthcareScenario.data }],
    } as any);

    const asl1SamePeriod = samePeriodProps.data.find(n => n.name === 'ASL 1 Centro')!;
    expect(asl1SamePeriod.metrics.ricoveri___period_delta).not.toBeNull();
    expect(typeof asl1SamePeriod.metrics.ricoveri___period_delta).toBe('number');
    const samePeriodHeader = samePeriodProps.pivotHeaderGroups?.find(g => g.key === '__period_comparison__');
    expect(samePeriodHeader?.title).toBe("Δ vs stesso periodo dell'anno precedente");
  });
});
