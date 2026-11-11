jest.mock('@superset-ui/core', () => ({
  getNumberFormatter: (fmt: string) => (val: any) => `fmt[${fmt}](${val})`,
  ensureIsArray: (val: any) =>
    val === null || val === undefined ? [] : Array.isArray(val) ? val : [val],
}));

import * as fs from 'node:fs';
import * as path from 'node:path';
import { isValidElement, ReactElement } from 'react';
import controlPanel from '../src/plugin/controlPanel';
import { resolveTransformOptions } from '../src/plugin/formDataOptions';
import transformProps from '../src/plugin/transformProps';

type RowItem = string | { name: string; config?: any } | ReactElement;
type Section = { label: string; expanded?: boolean; description?: string; controlSetRows: RowItem[][] };

const sections = controlPanel.controlPanelSections as Section[];

// Every control name preserved from baseline + newly exposed enableWhatIf.
const EXPECTED_CONTROL_NAMES = [
  'hierarchyType',
  'groupby',
  'idColumn',
  'parentIdColumn',
  'labelColumn',
  'metrics',
  'columns',
  'combineMetric',
  'pivotSortOrder',
  'pivotRowTotalsPosition',
  'pivotRowTotalsLabel',
  'showPivotColumnSubtotals',
  'pivotColumnSubtotalLabel',
  'pivotTimeDeltaMode',
  'pivotTimeDeltaLag',
  'show_calendar_comparison',
  'calendar_comparison_mode',
  'calendar_comparison_formats',
  'calendar_comparison_label',
  'adhoc_filters',
  'row_limit',
  'initialExpandDepth',
  'valueDisplayMode',
  'showSubtotals',
  'showGrandTotal',
  'stickyHeader',
  'enableSearch',
  'compactMode',
  'wrapHeaderLabels',
  'resizableColumns',
  'reorderColumnsByDrag',
  'enableHierarchicalSort',
  'enableExport',
  'defaultSortColumn',
  'defaultSortOrder',
  'nullHandling',
  'minMaxDisplayMode',
  'minMaxScope',
  'heatmapPalette',
  'divergingMidpoint',
  'conditionalFormatting',
  'numberFormat',
  'timeDetection',
  'timeDisplayFormat',
  'timeFractionDigits',
  'timeRollup',
  'currencySymbol',
  'stripedRows',
  'themeProfile',
  'customPositiveHex',
  'customNegativeHex',
  'customNeutralHex',
  'showVarianceDelta',
  'showVarianceBadges',
  'showPeriodInMetricLabel',
  'periodLabelsFromFilters',
  'periodReferenceYearColumn',
  'periodReferenceMonthColumn',
  'periodComparisonYearColumn',
  'periodComparisonMonthColumn',
  'timeGrain',
  'referencePeriod',
  'comparisonType',
  'goals',
  'metricDefinitions',
  'tableCalculations',
  'suppressionThreshold',
  'suppressionMetrics',
  'complementarySuppression',
  'suppressionLabel',
  'showSparklines',
  'sparklineMetrics',
  'aggregationMode',
  'weightColumn',
  'emit_filter',
  'crossFilterAppliesToSelf',
  'enableContextMenu',
  'enableWhatIf',
  'pageSize',
  'virtualizationThreshold',
  'dimensionLimits',
];

const controlName = (item: unknown): string | null => {
  if (typeof item === 'string') return item;
  if (item && typeof item === 'object' && !isValidElement(item) && 'name' in item) {
    return String((item as { name: unknown }).name);
  }
  return null;
};

type ControlEntry = { name: string; config: Record<string, any> };

const flattenControls = (): ControlEntry[] =>
  sections
    .flatMap(s => s.controlSetRows.flat())
    .filter((i): i is ControlEntry => Boolean(i && typeof i === 'object' && !isValidElement(i) && 'name' in i));

const controlByName = (name: string): ControlEntry => {
  const found = flattenControls().find(c => c.name === name);
  if (!found) throw new Error(`Missing control: ${name}`);
  return found;
};

const namesIn = (section: Section): string[] =>
  section.controlSetRows.flat().map(controlName).filter((n): n is string => n !== null);

const allNames = (): string[] => sections.flatMap(namesIn);

const controlsWith = (overrides: Record<string, unknown> = {}) => {
  const map: Record<string, { value: unknown }> = {};
  for (const c of flattenControls()) {
    map[c.name] = { value: c.config?.default };
  }
  for (const [k, v] of Object.entries(overrides)) {
    map[k] = { value: v };
  }
  return map;
};

describe('controlPanel layout', () => {
  it('exposes the 7 Italian StratumBar sections with only Dati expanded, descriptions and no emojis', () => {
    expect(sections.map(s => s.label)).toEqual([
      'Dati',
      'Confronto tra periodi',
      'Formato dei valori',
      'Totali',
      'Aspetto',
      'Interazione',
      'Avanzate',
    ]);
    expect(sections[0].expanded).toBe(true);
    for (const s of sections.slice(1)) {
      expect(s.expanded).toBe(false);
    }

    const emojiPattern = /\p{Extended_Pictographic}/u;
    for (const s of sections) {
      expect(typeof s.description).toBe('string');
      expect((s.description || '').trim().length).toBeGreaterThan(10);
      expect(emojiPattern.test(s.label)).toBe(false);
      for (const row of s.controlSetRows) {
        expect(row.length).toBeLessThanOrEqual(2);
      }
    }

    for (const { config } of flattenControls()) {
      expect(typeof config.label).toBe('string');
      expect(config.label.trim().length).toBeGreaterThan(0);
      expect(emojiPattern.test(config.label)).toBe(false);
      expect(typeof config.description).toBe('string');
      expect(config.description.trim().length).toBeGreaterThan(10);
      if (Array.isArray(config.choices)) {
        for (const [, lbl] of config.choices) {
          expect(emojiPattern.test(String(lbl))).toBe(false);
        }
      }
    }
  });

  it('keeps sections as a flat array without nested section data', () => {
    sections.forEach(section => {
      expect(section).not.toHaveProperty('controlPanelSections');
      expect(Array.isArray(section.controlSetRows)).toBe(true);
      section.controlSetRows.flat().forEach(item => {
        expect(item).not.toHaveProperty('controlSetRows');
      });
    });
  });

  it('enforces progressive disclosure for layouts, comparisons, durations, selectors and What-If', () => {
    const vis = (name: string, overrides: Record<string, unknown> = {}) =>
      Boolean(controlByName(name).config.visibility?.({ controls: controlsWith(overrides) }));

    // Single pivot vs flat vs multi pivot
    expect(vis('pivotTimeDeltaMode', { columns: [] })).toBe(false);
    expect(vis('pivotTimeDeltaMode', { columns: ['mese'] })).toBe(true);
    expect(vis('pivotTimeDeltaMode', { columns: ['anno', 'mese'] })).toBe(false);

    expect(vis('showSparklines', { columns: [] })).toBe(false);
    expect(vis('showSparklines', { columns: ['mese'] })).toBe(true);
    expect(vis('showSparklines', { columns: ['anno', 'mese'] })).toBe(false);
    expect(vis('sparklineMetrics', { columns: ['mese'], showSparklines: false })).toBe(false);
    expect(vis('sparklineMetrics', { columns: ['mese'], showSparklines: true })).toBe(true);

    expect(vis('reorderColumnsByDrag', { columns: [] })).toBe(true);
    expect(vis('reorderColumnsByDrag', { columns: ['mese'] })).toBe(false);

    expect(vis('showPivotColumnSubtotals', { columns: ['mese'] })).toBe(false);
    expect(vis('showPivotColumnSubtotals', { columns: ['anno', 'mese'] })).toBe(true);

    // Duration controls: visible if hasTimeMetric OR customized away from default
    expect(vis('timeDisplayFormat', { metrics: ['accessi'] })).toBe(false);
    expect(vis('timeDisplayFormat', { metrics: ['tempo_attesa'] })).toBe(true);
    expect(vis('timeDisplayFormat', { metrics: ['accessi'], timeDisplayFormat: 'minutes' })).toBe(true);
    expect(vis('timeFractionDigits', { metrics: ['accessi'], timeFractionDigits: 2 })).toBe(true);
    expect(vis('timeDetection', { metrics: ['accessi'], timeDetection: 'off' })).toBe(true);
    expect(vis('timeRollup', { metrics: ['accessi'], timeRollup: 'general' })).toBe(true);

    // Client-side aggregationMode + exposed enableWhatIf + metric selectors
    expect(controlByName('aggregationMode').config.renderTrigger).toBe(true);
    expect(controlByName('enableWhatIf').config.default).toBe(false);

    for (const metricListCtrl of ['weightColumn', 'sparklineMetrics', 'suppressionMetrics']) {
      const cfg = controlByName(metricListCtrl).config;
      expect(cfg.type).toBe('SelectControl');
      expect(cfg.freeForm).toBe(true);
      expect(
        cfg.mapStateToProps({ controls: { metrics: { value: ['accessi', { label: 'ricavi' }] } } }).choices,
      ).toEqual([
        ['accessi', 'accessi'],
        ['ricavi', 'ricavi'],
      ]);
    }
  });

  it('preserves every expected control name exactly once and wires every control to runtime code', () => {
    const names = allNames();
    expect(new Set(names).size).toBe(names.length);
    EXPECTED_CONTROL_NAMES.forEach(name => {
      expect(names.filter(n => n === name)).toHaveLength(1);
    });

    const sourceFiles = [
      '../src/plugin/formDataOptions.ts',
      '../src/plugin/buildQuery.ts',
      '../src/plugin/transformProps.ts',
      '../src/components/HierarchicalTable.tsx',
      '../src/utils/dynamicPeriodLabels.ts',
      '../src/utils/themes.ts',
    ].map(rel => fs.readFileSync(path.join(__dirname, rel), 'utf8'));
    const combinedSrc = sourceFiles.join('\n');

    const unwired = flattenControls()
      .map(c => c.name)
      .filter(name => !combinedSrc.includes(name));
    expect(unwired).toEqual([]);

    // Verify panel defaults match resolved formDataOptions / transformProps defaults
    const opts = resolveTransformOptions({});
    expect(opts.hierarchyType).toBe(controlByName('hierarchyType').config.default);
    expect(opts.combineMetric).toBe(controlByName('combineMetric').config.default);
    expect(opts.pivotSortOrder).toBe(controlByName('pivotSortOrder').config.default);
    expect(opts.pivotRowTotalsPosition).toBe(controlByName('pivotRowTotalsPosition').config.default);
    expect(opts.pivotRowTotalsLabel).toBe(controlByName('pivotRowTotalsLabel').config.default);
    expect(opts.showPivotColumnSubtotals).toBe(controlByName('showPivotColumnSubtotals').config.default);
    expect(opts.pivotColumnSubtotalLabel).toBe(controlByName('pivotColumnSubtotalLabel').config.default);
    expect(opts.pivotTimeDeltaMode).toBe(controlByName('pivotTimeDeltaMode').config.default);
    expect(opts.pivotTimeDeltaLag).toBe(controlByName('pivotTimeDeltaLag').config.default);
    expect(opts.showCalendarComparison).toBe(controlByName('show_calendar_comparison').config.default);
    expect(opts.calendarComparisonMode).toBe(controlByName('calendar_comparison_mode').config.default);
    expect(opts.comparisonLabel).toBe(controlByName('calendar_comparison_label').config.default);
    expect(opts.initialExpandDepth).toBe(controlByName('initialExpandDepth').config.default);
    expect(opts.valueDisplayMode).toBe(controlByName('valueDisplayMode').config.default);
    expect(opts.showSubtotals).toBe(controlByName('showSubtotals').config.default);
    expect(opts.showGrandTotal).toBe(controlByName('showGrandTotal').config.default);
    expect(opts.stickyHeader).toBe(controlByName('stickyHeader').config.default);
    expect(opts.enableSearch).toBe(controlByName('enableSearch').config.default);
    expect(opts.compactMode).toBe(controlByName('compactMode').config.default);
    expect(opts.wrapHeaderLabels).toBe(controlByName('wrapHeaderLabels').config.default);
    expect(opts.resizableColumns).toBe(controlByName('resizableColumns').config.default);
    expect(opts.reorderColumnsByDrag).toBe(controlByName('reorderColumnsByDrag').config.default);
    expect(opts.enableHierarchicalSort).toBe(controlByName('enableHierarchicalSort').config.default);
    expect(opts.enableExport).toBe(controlByName('enableExport').config.default);
    expect(opts.defaultSortColumn).toBe(controlByName('defaultSortColumn').config.default);
    expect(opts.defaultSortOrder).toBe(controlByName('defaultSortOrder').config.default);
    expect(opts.minMaxDisplayMode).toBe(controlByName('minMaxDisplayMode').config.default);
    expect(opts.minMaxScope).toBe(controlByName('minMaxScope').config.default);
    expect(opts.heatmapPalette).toBe(controlByName('heatmapPalette').config.default);
    expect(opts.numberFormat).toBe(controlByName('numberFormat').config.default);
    expect(opts.timeDetection).toBe(controlByName('timeDetection').config.default);
    expect(opts.timeDisplayFormat).toBe(controlByName('timeDisplayFormat').config.default);
    expect(opts.timeFractionDigits).toBe(controlByName('timeFractionDigits').config.default);
    expect(opts.timeRollup).toBe(controlByName('timeRollup').config.default);
    expect(opts.currencySymbol).toBe(controlByName('currencySymbol').config.default);
    expect(opts.stripedRows).toBe(controlByName('stripedRows').config.default);
    expect(opts.showVarianceDelta).toBe(controlByName('showVarianceDelta').config.default);
    expect(opts.showVarianceBadges).toBe(controlByName('showVarianceBadges').config.default);
    expect(opts.showPeriodInMetricLabel).toBe(controlByName('showPeriodInMetricLabel').config.default);
    expect(opts.periodLabelsFromFilters).toBe(controlByName('periodLabelsFromFilters').config.default);
    expect(opts.comparisonTimeGrain).toBe(controlByName('timeGrain').config.default);
    expect(opts.comparisonReferencePeriod).toBe(controlByName('referencePeriod').config.default);
    expect(opts.comparisonStrategy).toBe(controlByName('comparisonType').config.default);
    expect(opts.showSparklines).toBe(controlByName('showSparklines').config.default);
    expect(opts.sparklineMetrics).toEqual(controlByName('sparklineMetrics').config.default);
    expect(opts.aggregationMode).toBe(controlByName('aggregationMode').config.default);
    expect(opts.weightColumn).toBe(controlByName('weightColumn').config.default);
    expect(opts.isCrossFilterActive).toBe(controlByName('emit_filter').config.default);
    expect(opts.crossFilterAppliesToSelf).toBe(controlByName('crossFilterAppliesToSelf').config.default);
    expect(opts.enableContextMenu).toBe(controlByName('enableContextMenu').config.default);
    expect(opts.enableWhatIf).toBe(controlByName('enableWhatIf').config.default);
    expect(opts.suppression.threshold).toBe(controlByName('suppressionThreshold').config.default);
    expect(opts.suppression.metrics).toEqual(controlByName('suppressionMetrics').config.default);
    expect(opts.suppression.complementary).toBe(controlByName('complementarySuppression').config.default);
    expect(opts.suppression.label).toBe(controlByName('suppressionLabel').config.default);

    // Calendar comparison default formats aligned across panel and transformProps (['pct'])
    const flatWithOffset = transformProps({
      width: 800,
      height: 400,
      formData: { groupby: ['sede'], metrics: ['visite'] },
      queriesData: [{ data: [{ sede: 'A', visite: 10, 'visite__1 year ago': 8 }] }],
    } as any);
    expect(flatWithOffset.columns.filter(c => c.key.startsWith('visite___') && c.key !== 'visite___comp').map(c => c.key)).toEqual(['visite___delta']);
    expect(controlByName('calendar_comparison_formats').config.default).toEqual(['pct']);
  });
});
