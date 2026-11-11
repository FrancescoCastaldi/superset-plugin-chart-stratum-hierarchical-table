jest.mock('@superset-ui/core', () => ({
  getNumberFormatter: () => (val: any) => String(val),
  ensureIsArray: (val: any) =>
    val === null || val === undefined ? [] : Array.isArray(val) ? val : [val],
}));

import { isValidElement } from 'react';
import controlPanel from '../src/plugin/controlPanel';
import { buildColumnConditionalFormat, buildSinglePivotColumns } from '../src/plugin/columnBuilders';
import { resolveTransformOptions } from '../src/plugin/formDataOptions';
import transformProps from '../src/plugin/transformProps';
import {
  MAX_REGEX_INPUT_LENGTH,
  MAX_REGEX_PATTERN_LENGTH,
  applyConditionalFormatting,
  firstByPriority,
  isSafeRegexPattern,
  normalizeConditionalFormatting,
} from '../src/utils/conditionalFormatting';
import { buildColumnMetaMap } from '../src/utils/tableColumns';
import { ConditionalFormattingRule, HierarchicalTableChartProps, TableColumn } from '../src/types';

const rule = (overrides: Partial<ConditionalFormattingRule>): ConditionalFormattingRule => ({
  metric: 'ricavi',
  operator: '>',
  targetValue: 0,
  colorScheme: 'custom',
  ...overrides,
});

const regexRule = (pattern: string) => rule({ operator: 'regex', targetValue: pattern, priority: 1 });

describe('conditionalFormatting priority', () => {
  it('resolves conflicts by priority ascending, so priority 1 beats priority 2 on the same target', () => {
    const p1 = rule({ operator: '>', targetValue: 10, priority: 1 });
    const p2 = rule({ operator: '>', targetValue: 0, priority: 2 });

    for (const rules of [
      [p1, p2],
      [p2, p1],
    ]) {
      const match = applyConditionalFormatting(50, 'ricavi', rules);
      expect(match?.rule).toBe(p1);
      expect(match?.className).toBe('ht-cond-1');
    }

    // The first match wins only among rules that match: p1 does not apply to 5.
    expect(applyConditionalFormatting(5, 'ricavi', [p1, p2])?.rule).toBe(p2);
    expect(applyConditionalFormatting(5, 'ricavi', [p1, p2])?.className).toBe('ht-cond-2');
  });

  it('keeps the declaration order between equal priorities and ignores other metrics', () => {
    const first = rule({ targetValue: 0, priority: 2, backgroundColor: '#111111' });
    const second = rule({ targetValue: 0, priority: 2, backgroundColor: '#222222' });
    expect(applyConditionalFormatting(1, 'ricavi', [first, second])?.rule).toBe(first);
    expect(applyConditionalFormatting(1, 'costi', [first, second])).toBeNull();
  });

  it('picks the lowest priority among several matches (row scope across cells)', () => {
    const a = applyConditionalFormatting(1, 'ricavi', [rule({ priority: 3, scope: 'row' })]);
    const b = applyConditionalFormatting(1, 'ricavi', [rule({ priority: 2, scope: 'row' })]);
    expect(firstByPriority([null, a, b, undefined])).toBe(b);
    expect(firstByPriority([null, undefined])).toBeNull();
  });
});

describe('conditionalFormatting operators and scope', () => {
  it('evaluates the comparison operators and between on numbers and numeric strings', () => {
    const matches = (overrides: Partial<ConditionalFormattingRule>, value: unknown) =>
      applyConditionalFormatting(value, 'ricavi', [rule(overrides)]) !== null;

    expect(matches({ operator: '<', targetValue: 10 }, 9)).toBe(true);
    expect(matches({ operator: '<', targetValue: 10 }, 10)).toBe(false);
    expect(matches({ operator: '<=', targetValue: 10 }, 10)).toBe(true);
    expect(matches({ operator: '==', targetValue: 10 }, '10')).toBe(true);
    expect(matches({ operator: '==', targetValue: 10 }, 11)).toBe(false);
    expect(matches({ operator: '>=', targetValue: 10 }, 10)).toBe(true);
    expect(matches({ operator: '>', targetValue: 10 }, 10)).toBe(false);
    expect(matches({ operator: 'between', targetValue: 20, targetValue2: 10 }, 15)).toBe(true);
    expect(matches({ operator: 'between', targetValue: 10, targetValue2: 20 }, 21)).toBe(false);
    expect(matches({ operator: 'between', targetValue: 10 }, 15)).toBe(false);
    expect(matches({ operator: '>', targetValue: 0 }, null)).toBe(false);
    expect(matches({ operator: '>', targetValue: 0 }, 'Nuovo')).toBe(false);
  });

  it('resolves the scope and the inline colours of the winning rule', () => {
    expect(applyConditionalFormatting(1, 'ricavi', [rule({ priority: 1 })])?.scope).toBe('cell');
    expect(
      applyConditionalFormatting(1, 'ricavi', [rule({ priority: 1, highlightRow: true })])?.scope,
    ).toBe('row');
    const match = applyConditionalFormatting(1, 'ricavi', [
      rule({ priority: 7, scope: 'column', backgroundColor: '#fee2e2', textColor: '#991b1b' }),
    ]);
    expect(match?.scope).toBe('column');
    expect(match?.className).toBe('ht-cond-3');
    expect(match?.style).toEqual({ backgroundColor: '#fee2e2', color: '#991b1b' });
  });
});

describe('conditionalFormatting regex fallback', () => {
  it('evaluates a pattern of at most 256 characters and rejects a longer one', () => {
    const atLimit = `^${'a'.repeat(MAX_REGEX_PATTERN_LENGTH - 1)}`;
    expect(MAX_REGEX_PATTERN_LENGTH).toBe(256);
    expect(atLimit).toHaveLength(256);
    expect(applyConditionalFormatting('a'.repeat(300), 'ricavi', [regexRule(atLimit)])).not.toBeNull();

    const overLimit = `${atLimit}a`;
    expect(applyConditionalFormatting('a'.repeat(300), 'ricavi', [regexRule(overLimit)])).toBeNull();
  });

  it('considers an input of at most 1000 characters and falls back to neutral beyond it', () => {
    expect(MAX_REGEX_INPUT_LENGTH).toBe(1000);
    const rules = [regexRule('^x+$')];
    expect(applyConditionalFormatting('x'.repeat(1000), 'ricavi', rules)).not.toBeNull();
    expect(applyConditionalFormatting('x'.repeat(1001), 'ricavi', rules)).toBeNull();
  });

  it('falls back to neutral on invalid patterns without throwing', () => {
    for (const pattern of ['(', '[a-', '*a', '']) {
      expect(() => applyConditionalFormatting('abc', 'ricavi', [regexRule(pattern)])).not.toThrow();
      expect(applyConditionalFormatting('abc', 'ricavi', [regexRule(pattern)])).toBeNull();
    }
  });

  it('statically rejects nested or redundant quantifiers before compiling them', () => {
    for (const pattern of ['(a+)+b', '(a|a)*', '(a*)*', '((ab)+)*', '(\\w+\\s?)*$', '(?:a+){2,}']) {
      expect(isSafeRegexPattern(pattern)).toBe(false);
      expect(applyConditionalFormatting('aaaaaaaaaaaaaaaaaaaaaaaaaaaa!', 'ricavi', [regexRule(pattern)])).toBeNull();
    }
    for (const pattern of ['^\\d{3}-\\d+$', '(ab)+', '^(Nord|Sud)$', '[(+*)]+', '\\(a+\\)+']) {
      expect(isSafeRegexPattern(pattern)).toBe(true);
    }
    expect(applyConditionalFormatting('Nord', 'ricavi', [regexRule('^(Nord|Sud)$')])).not.toBeNull();
    expect(applyConditionalFormatting(2026, 'ricavi', [regexRule('^20\\d{2}$')])).not.toBeNull();
  });
});

describe('conditionalFormatting control and options', () => {
  it('exposes the conditionalFormatting ArrayControl in Aspetto', () => {
    const customize = controlPanel.controlPanelSections.find(
      (s: { label: string }) => s.label === 'Aspetto',
    );
    const items: unknown[] = customize.controlSetRows.flat();
    const heading = items.findIndex(
      i => isValidElement(i) && (i.props as any).children === 'Ordinamento e formattazione condizionale',
    );
    const index = items.findIndex(i => (i as any)?.name === 'conditionalFormatting');
    const nextHeading = items.findIndex((i, n) => n > heading && isValidElement(i) && i.type === 'h4');
    expect(index).toBeGreaterThan(heading);
    expect(index).toBeLessThan(nextHeading);

    const { config } = items[index] as any;
    expect(typeof config.type).toBe('function');
    expect(config.type.name).toBe('ArrayControl');
    expect(config.default).toEqual([]);
  });

  it('normalizes the rules: drops entries without a metric, defaults priority and scope', () => {
    const rules = normalizeConditionalFormatting([
      { metric: 'ricavi', operator: '>', targetValue: '10' },
      { metric: 'ricavi', operator: 'regex', targetValue: '^N', priority: 1, scope: 'row' },
      { metric: 'costi', operator: 'between', targetValue: 1, targetValue2: 5, highlightRow: true },
      { metric: '', operator: '>', targetValue: 1 },
      { metric: 'ricavi', operator: '!=', targetValue: 1 },
      { metric: 'ricavi', operator: '>', targetValue: 'abc' },
      { metric: 'ricavi', operator: '>', targetValue: 1, scope: 'table', priority: '4' },
      null,
      'ricavi',
    ]);
    expect(rules.map(r => [r.metric, r.priority, r.scope])).toEqual([
      ['ricavi', 1, 'cell'],
      ['ricavi', 1, 'row'],
      ['costi', 3, 'row'],
      ['ricavi', 5, 'cell'],
      ['ricavi', 6, 'cell'],
      ['ricavi', 4, 'cell'],
    ]);
    // A numeric text threshold is compared as a number; unknown operators and non-numeric
    // thresholds are kept but never match.
    expect(applyConditionalFormatting(11, 'ricavi', [rules[0]])).not.toBeNull();
    expect(applyConditionalFormatting(100, 'ricavi', [rules[3], rules[4]])).toBeNull();
    expect(normalizeConditionalFormatting(undefined)).toEqual([]);
    expect(normalizeConditionalFormatting('[]')).toEqual([]);
    expect(resolveTransformOptions({ conditionalFormatting: [rule({ priority: 2 })] }).conditionalFormatting)
      .toEqual([expect.objectContaining({ metric: 'ricavi', priority: 2, scope: 'cell' })]);
    expect(resolveTransformOptions({}).conditionalFormatting).toEqual([]);
  });
});

describe('conditionalFormatting column metadata', () => {
  const columns = buildSinglePivotColumns({
    metrics: ['ricavi', 'costi'],
    displayPivotValues: ['2026', '2025'],
    combineMetric: true,
    rowTotalsPosition: 'none',
    rowTotalsLabel: 'Totals',
    deltaMode: 'none',
    format: { numberFormat: 'SMART_NUMBER', currencySymbol: '' },
  }).columns;
  const byKey = (key: string) => columns.find(c => c.key === key) as TableColumn;

  const rules = normalizeConditionalFormatting([
    { metric: 'ricavi', operator: 'regex', targetValue: '^2026$', scope: 'column', priority: 3 },
    { metric: 'ricavi', operator: '>', targetValue: 100, priority: 1 },
    { metric: 'ricavi', operator: '<', targetValue: 0, priority: 2, scope: 'row' },
  ]);

  it('derives the conditional format of the generated columns from the rules of their metric', () => {
    const format2026 = buildColumnConditionalFormat(byKey('ricavi___2026'), rules);
    const format2025 = buildColumnConditionalFormat(byKey('ricavi___2025'), rules);

    // Column scope is resolved once against the pivot value of the column.
    expect(format2026?.(50)?.className).toBe('ht-cond-3');
    expect(format2025?.(50)).toBeNull();
    // Cell and row rules are evaluated on the cell value and win by priority.
    expect(format2026?.(150)?.className).toBe('ht-cond-1');
    expect(format2025?.(150)?.scope).toBe('cell');
    expect(format2025?.(-5)?.scope).toBe('row');
    expect(buildColumnConditionalFormat(byKey('costi___2026'), rules)).toBeUndefined();
    expect(buildColumnConditionalFormat(byKey('ricavi___2026'), [])).toBeUndefined();
  });

  it('carries the metadata into ColumnMeta through buildColumnMetaMap', () => {
    const map = buildColumnMetaMap(columns, [], col => buildColumnConditionalFormat(col, rules));
    expect(map.get('ricavi___2026')?.conditionalFormat?.(150)?.className).toBe('ht-cond-1');
    expect(map.get('costi___2026')?.conditionalFormat).toBeUndefined();
    expect(buildColumnMetaMap(columns).get('ricavi___2026')).not.toHaveProperty('conditionalFormat');
  });

  it('passes the resolved rules to the component props only when configured', () => {
    const build = (formData: any) =>
      transformProps({
        width: 400,
        height: 300,
        formData: { groupby: ['area'], metrics: ['ricavi'], ...formData },
        queriesData: [{ data: [{ area: 'Nord', ricavi: 120 }] }],
      } as unknown as HierarchicalTableChartProps);

    expect(build({ conditionalFormatting: [rule({ priority: 1 })] }).conditionalFormatting).toEqual([
      expect.objectContaining({ metric: 'ricavi', priority: 1, scope: 'cell' }),
    ]);
    expect(build({})).not.toHaveProperty('conditionalFormatting');
  });
});

describe('rule indicators', () => {
  it('keeps a known icon on a normalized rule and drops an unknown one', () => {
    const [warn, bad, none] = normalizeConditionalFormatting([
      { metric: 'attesa', operator: '>', targetValue: 30, colorScheme: 'custom', icon: 'warning' },
      { metric: 'attesa', operator: '>', targetValue: 60, colorScheme: 'custom', icon: 'skull' },
      { metric: 'attesa', operator: '>', targetValue: 90, colorScheme: 'custom' },
    ]);
    expect(warn.icon).toBe('warning');
    expect(bad.icon).toBeUndefined();
    expect(none.icon).toBeUndefined();
  });

  it('exposes the icon of the winning rule in the match', () => {
    const rules = normalizeConditionalFormatting([
      { metric: 'attesa', operator: '>', targetValue: 30, colorScheme: 'custom', icon: 'arrow_up' },
    ]);
    expect(applyConditionalFormatting(45, 'attesa', rules)?.rule.icon).toBe('arrow_up');
    expect(applyConditionalFormatting(10, 'attesa', rules)).toBeNull();
  });
});
