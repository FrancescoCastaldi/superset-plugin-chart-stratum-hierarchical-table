jest.mock('@superset-ui/core', () => ({
  getNumberFormatter: (fmt: string) => (val: any) => `fmt[${fmt}](${val})`,
}));

import {
  buildFlatColumns,
  buildHierarchyColumn,
  buildMultiPivotColumns,
  buildSinglePivotColumns,
  createMetricFormatter,
  formatSignedPercent,
  isComparisonOperandMetric,
} from '../src/plugin/columnBuilders';

const format = { numberFormat: 'SMART_NUMBER', currencySymbol: '' };

describe('columnBuilders', () => {
  it('detects comparison operands that are not rendered as columns', () => {
    expect(isComparisonOperandMetric('richieste_conf')).toBe(true);
    expect(isComparisonOperandMetric('Accesso Diretto (Confronto)')).toBe(true);
    expect(isComparisonOperandMetric('delta_richieste_pct')).toBe(false);
    expect(isComparisonOperandMetric('variazione_conf')).toBe(false);
    expect(isComparisonOperandMetric('richieste_corr')).toBe(false);
  });

  it('formats signed percentages and metric values', () => {
    expect(formatSignedPercent(null)).toBe('-');
    expect(formatSignedPercent(undefined)).toBe('-');
    expect(formatSignedPercent(12.5)).toBe('+12,5%');
    expect(formatSignedPercent(-3)).toBe('-3%');
    expect(formatSignedPercent(0)).toBe('0%');
    expect(createMetricFormatter(format, 'delta_richieste_pct')(20)).toBe('+20,0%');
    expect(createMetricFormatter({ numberFormat: ',.2f', currencySymbol: '€' }, 'sales')(5)).toBe('€ fmt[.,2f](5)');
  });

  it('builds the hierarchy column title from the dimensions', () => {
    expect(buildHierarchyColumn('multi_dimension', ['regione', 'asl'])).toEqual({
      key: '__hierarchy_tree__',
      title: 'regione / asl',
      dataIndex: 'name',
      isMetric: false,
      isHierarchyDimension: true,
      align: 'left',
      width: 280,
    });
    expect(buildHierarchyColumn('multi_dimension', []).title).toBe('Gerarchia');
    expect(buildHierarchyColumn('parent_child', ['x']).title).toBe('Albero gerarchico');
  });

  describe('buildFlatColumns', () => {
    it('renders one column per metric, unhides comparison operands to support side-by-side comparison', () => {
      const layout = buildFlatColumns(
        ['richieste_corr', 'richieste_conf', 'delta_richieste_pct', 'richieste_corr___delta'],
        format,
      );
      expect(layout.metricKeys).toEqual([
        'richieste_corr',
        'richieste_conf',
        'delta_richieste_pct',
        'richieste_corr___delta',
      ]);
      expect(layout.columns.map(c => [c.key, c.title])).toEqual([
        ['richieste_corr', 'richieste_corr'],
        ['richieste_conf', 'richieste_conf'],
        ['delta_richieste_pct', 'delta_richieste_pct'],
        ['richieste_corr___delta', 'Δ% richieste_corr'],
      ]);
      expect(layout.pivotHeaderGroups).toEqual([]);
      expect(layout.columns[0]).toMatchObject({ isMetric: true, align: 'right', width: 135 });
    });
  });

  describe('buildMultiPivotColumns', () => {
    const base = {
      metrics: ['totale', 'totale_conf'],
      displayDim1Values: ['08', '09'],
      dim2Values: ['SSN', 'PRIV'],
      rowTotalsLabel: 'Totals',
      columnSubtotalLabel: 'Totale',
      format,
    };

    it('builds subtotal + per-channel columns under each first-level header', () => {
      const layout = buildMultiPivotColumns({ ...base, rowTotalsPosition: 'none', showColumnSubtotals: true });
      expect(layout.pivotHeaderGroups).toEqual([
        { title: '08', key: '08', colSpan: 3 },
        { title: '09', key: '09', colSpan: 3 },
      ]);
      expect(layout.columns.map(c => c.key)).toEqual([
        'totale___08___SUBTOTAL',
        'totale___08___SSN',
        'totale___08___PRIV',
        'totale___09___SUBTOTAL',
        'totale___09___SSN',
        'totale___09___PRIV',
      ]);
      expect(layout.columns[0]).toMatchObject({ title: 'Totale (totale)', baseMetric: '08 Totale', pivotValue: '08' });
      expect(layout.columns[1]).toMatchObject({ title: 'SSN (totale)', baseMetric: '08 SSN' });
    });

    it('registers row totals keys first and places the totals block left or right', () => {
      const right = buildMultiPivotColumns({ ...base, metrics: ['totale'], rowTotalsPosition: 'right', showColumnSubtotals: false });
      expect(right.metricKeys).toEqual([
        'totale___ROW_TOTAL___SSN',
        'totale___ROW_TOTAL___PRIV',
        'totale___08___SSN',
        'totale___08___PRIV',
        'totale___09___SSN',
        'totale___09___PRIV',
      ]);
      expect(right.columns.map(c => c.key).slice(-2)).toEqual(['totale___ROW_TOTAL___SSN', 'totale___ROW_TOTAL___PRIV']);
      expect(right.pivotHeaderGroups[right.pivotHeaderGroups.length - 1]).toEqual({
        title: 'Totals',
        key: '__pivot_row_totals__',
        colSpan: 2,
      });
      expect(right.columns[0].title).toBe('SSN');

      const left = buildMultiPivotColumns({ ...base, rowTotalsPosition: 'left', showColumnSubtotals: true });
      expect(left.pivotHeaderGroups[0]).toEqual({ title: 'Totals', key: '__pivot_row_totals__', colSpan: 3 });
      expect(left.columns.slice(0, 3).map(c => c.key)).toEqual([
        'totale___ROW_TOTAL',
        'totale___ROW_TOTAL___SSN',
        'totale___ROW_TOTAL___PRIV',
      ]);
      expect(left.columns[0]).toMatchObject({ pivotValue: 'Totals', baseMetric: 'Totals Totale' });
    });
  });

  describe('buildSinglePivotColumns', () => {
    const base = {
      metrics: ['totale', 'totale_conf'],
      displayPivotValues: ['2026-09', '2026-08'],
      rowTotalsLabel: 'Totals',
      format,
    };

    it('combined layout groups metric and deltas under each pivot value', () => {
      const layout = buildSinglePivotColumns({
        ...base,
        combineMetric: true,
        rowTotalsPosition: 'left',
        deltaMode: 'both',
      });
      expect(layout.pivotHeaderGroups).toEqual([
        { title: 'Totals', key: '__pivot_row_totals__', colSpan: 1 },
        { title: '2026-09', key: '2026-09', colSpan: 3 },
        { title: '2026-08', key: '2026-08', colSpan: 3 },
      ]);
      expect(layout.columns.map(c => [c.key, c.title])).toEqual([
        ['totale___ROW_TOTAL', 'totale'],
        ['totale___2026-09', 'totale'],
        ['totale___delta___2026-09', 'Δ totale'],
        ['totale___delta_pct___2026-09', 'Δ% totale'],
        ['totale___2026-08', 'totale'],
        ['totale___delta___2026-08', 'Δ totale'],
        ['totale___delta_pct___2026-08', 'Δ% totale'],
      ]);
      expect(layout.columns[2].formatter?.(5)).toBe('+5');
      expect(layout.columns[3].formatter?.(5)).toBe('+5%');
    });

    it('combined layout with a single metric uses short delta titles', () => {
      const layout = buildSinglePivotColumns({
        ...base,
        metrics: ['totale'],
        combineMetric: true,
        rowTotalsPosition: 'none',
        deltaMode: 'both',
      });
      expect(layout.columns.map(c => c.title)).toEqual(['totale', 'Delta', 'Δ%', 'totale', 'Delta', 'Δ%']);
    });

    it('separated layout groups pivot values under each metric and registers row totals twice', () => {
      const layout = buildSinglePivotColumns({
        ...base,
        combineMetric: false,
        rowTotalsPosition: 'right',
        deltaMode: 'absolute',
      });
      expect(layout.pivotHeaderGroups).toEqual([
        { title: 'totale', key: 'totale', colSpan: 3 },
        { title: 'Delta totale', key: 'delta___totale', colSpan: 2 },
      ]);
      expect(layout.columns.map(c => [c.key, c.title])).toEqual([
        ['totale___2026-09', '2026-09'],
        ['totale___2026-08', '2026-08'],
        ['totale___ROW_TOTAL', 'Totals'],
        ['totale___delta___2026-09', '2026-09'],
        ['totale___delta___2026-08', '2026-08'],
      ]);
      expect(layout.metricKeys).toEqual([
        'totale___ROW_TOTAL',
        'totale___2026-09',
        'totale___2026-08',
        'totale___ROW_TOTAL',
        'totale___delta___2026-09',
        'totale___delta___2026-08',
      ]);
    });

    it('separated layout with percentage delta and left totals', () => {
      const layout = buildSinglePivotColumns({
        ...base,
        metrics: ['totale'],
        combineMetric: false,
        rowTotalsPosition: 'left',
        deltaMode: 'percentage',
      });
      expect(layout.pivotHeaderGroups.map(g => g.key)).toEqual(['totale', 'delta_pct___totale']);
      expect(layout.columns.map(c => c.key)).toEqual([
        'totale___ROW_TOTAL',
        'totale___2026-09',
        'totale___2026-08',
        'totale___delta_pct___2026-09',
        'totale___delta_pct___2026-08',
      ]);
      expect(layout.columns[0]).toMatchObject({ title: 'Totals', width: 140, baseMetric: 'Totals totale' });
    });
  });
});
