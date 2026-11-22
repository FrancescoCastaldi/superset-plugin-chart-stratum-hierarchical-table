jest.mock('@superset-ui/core', () => ({
  ensureIsArray: (val: any) =>
    val === null || val === undefined ? [] : Array.isArray(val) ? val : [val],
}));

import {
  getColumnName,
  getColumnNames,
  getDimensionColumns,
  getMetricNames,
  resolveTransformOptions,
} from '../src/plugin/formDataOptions';

describe('formDataOptions', () => {
  describe('getDimensionColumns', () => {
    it('is empty for plain columns', () => {
      expect(getDimensionColumns(['regione', { column_name: 'regione', label: 'regione' }])).toEqual({});
      expect(getDimensionColumns(undefined)).toEqual({});
    });

    it('maps the label of a custom SQL column to the column it holds', () => {
      expect(
        getDimensionColumns([
          { expressionType: 'SQL', label: 'Mese di Riferimento', sqlExpression: 'MESE_SLOT' },
          { expressionType: 'SQL', label: 'Sede', sqlExpression: ' SEDE ' },
        ]),
      ).toEqual({ 'Mese di Riferimento': 'MESE_SLOT', Sede: 'SEDE' });
    });

    it('carries the expression for anything that is not a plain column', () => {
      expect(
        getDimensionColumns([
          { expressionType: 'SQL', label: 'Fascia', sqlExpression: "CONCAT(A, '-', B)" },
        ]),
      ).toEqual({
        Fascia: { expressionType: 'SQL', sqlExpression: "CONCAT(A, '-', B)", label: 'Fascia' },
      });
    });

    it('uses the column name of a physical column shown under another label', () => {
      expect(getDimensionColumns([{ column_name: 'MESE_SLOT', label: 'Mese' }])).toEqual({ Mese: 'MESE_SLOT' });
    });

    it('is resolved with the other options', () => {
      const options = resolveTransformOptions({
        groupby: [{ expressionType: 'SQL', label: 'Sede', sqlExpression: 'SEDE' }, 'regione'],
        metrics: ['m'],
      });
      expect(options.dimensions).toEqual(['Sede', 'regione']);
      expect(options.dimensionColumns).toEqual({ Sede: 'SEDE' });
    });
  });

  it('extracts metric names from saved metrics and adhoc metric objects', () => {
    expect(
      getMetricNames(['accesso_diretto', { label: 'Accesso Diretto (Corrente)' }, { metric_name: 'accesso_diretto_conf' }]),
    ).toEqual(['accesso_diretto', 'Accesso Diretto (Corrente)', 'accesso_diretto_conf']);
    expect(getMetricNames(undefined)).toEqual([]);
  });

  it('extracts column names from strings, physical and adhoc columns', () => {
    expect(
      getColumnNames(['regione', { column_name: 'asl' }, { label: 'L' }, { sqlExpression: 'UPPER(x)' }]),
    ).toEqual(['regione', 'asl', 'L', 'UPPER(x)']);
    expect(getColumnName({ column_name: 'id' })).toBe('id');
    expect(getColumnName({ label: 'parent' })).toBe('parent');
    expect(getColumnName(undefined)).toBe('');
  });

  it('applies the documented defaults', () => {
    const o = resolveTransformOptions({});
    expect(o).toMatchObject({
      hierarchyType: 'multi_dimension',
      dimensions: [],
      pivotDimensions: [],
      metrics: [],
      isPivotMode: false,
      initialExpandDepth: 1,
      valueDisplayMode: 'all',
      showSubtotals: true,
      showGrandTotal: true,
      grandTotalPosition: 'top',
      numberFormat: 'SMART_NUMBER',
      currencySymbol: '',
      isCrossFilterActive: true,
      enableHierarchicalSort: true,
      defaultSortColumn: '__hierarchy_tree__',
      defaultSortOrder: 'none',
      minMaxDisplayMode: 'none',
      minMaxScope: 'leaves_only',
      enableExport: true,
      combineMetric: true,
      pivotSortOrder: 'desc',
      pivotRowTotalsPosition: 'none',
      pivotRowTotalsLabel: 'Totale',
      showPivotColumnSubtotals: true,
      pivotColumnSubtotalLabel: 'Totale gruppo',
      pivotTimeDeltaMode: 'none',
      pivotTimeDeltaLag: 1,
    });
  });

  it('resolves dimensions from groupby, then hierarchyDimensions, then hierarchy_dimensions', () => {
    expect(resolveTransformOptions({ groupby: ['a'], hierarchyDimensions: ['b'] }).dimensions).toEqual(['a']);
    expect(resolveTransformOptions({ hierarchyDimensions: ['b'], hierarchy_dimensions: ['c'] }).dimensions).toEqual(['b']);
    expect(resolveTransformOptions({ hierarchy_dimensions: ['c'] }).dimensions).toEqual(['c']);
  });

  it('enables pivot mode only for multi_dimension with pivot columns', () => {
    expect(resolveTransformOptions({ columns: ['mese'] }).isPivotMode).toBe(true);
    expect(resolveTransformOptions({ pivot_columns: ['mese'] }).pivotDimensions).toEqual(['mese']);
    expect(resolveTransformOptions({ hierarchyType: 'parent_child', columns: ['mese'] }).isPivotMode).toBe(false);
  });

  it('expands everything when expand all is requested', () => {
    expect(resolveTransformOptions({ expandAllByDefault: true, initialExpandDepth: 3 }).initialExpandDepth).toBe(-1);
    expect(resolveTransformOptions({ expand_all_by_default: true }).initialExpandDepth).toBe(-1);
  });

  it('falls back to snake_case aliases when camelCase values are empty', () => {
    const o = resolveTransformOptions({
      valueDisplayMode: '',
      value_display_mode: 'parents_only',
      grandTotalPosition: '',
      grand_total_position: 'bottom',
      pivotSortOrder: '',
      pivot_sort_order: 'asc',
      pivotTimeDeltaLag: 0,
      pivot_time_delta_lag: '3',
    });
    expect(o.valueDisplayMode).toBe('parents_only');
    expect(o.grandTotalPosition).toBe('bottom');
    expect(o.pivotSortOrder).toBe('asc');
    expect(o.pivotTimeDeltaLag).toBe(3);
  });

  it('uses nullish precedence for boolean toggles', () => {
    expect(resolveTransformOptions({ emitFilter: false, emit_filter: true }).isCrossFilterActive).toBe(false);
    expect(resolveTransformOptions({ enable_cross_filtering: false }).isCrossFilterActive).toBe(false);
    expect(resolveTransformOptions({ enable_sorting: false }).enableHierarchicalSort).toBe(false);
    expect(resolveTransformOptions({ enableContextMenu: false, enable_context_menu: true }).enableContextMenu).toBe(false);
    expect(resolveTransformOptions({ enable_context_menu: false }).enableContextMenu).toBe(false);
    expect(resolveTransformOptions({}).enableContextMenu).toBe(true);
  });

  it('lets camelCase destructuring defaults shadow the snake_case aliases', () => {
    expect(resolveTransformOptions({ enable_export: false }).enableExport).toBe(true);
    expect(resolveTransformOptions({ combine_metric: false }).combineMetric).toBe(true);
    expect(resolveTransformOptions({ show_rollup_totals: false }).showSubtotals).toBe(true);
    expect(resolveTransformOptions({ show_pivot_column_subtotals: false }).showPivotColumnSubtotals).toBe(true);
  });
});
