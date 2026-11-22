jest.mock('@superset-ui/core', () => ({
  getNumberFormatter: () => (val: any) => String(val),
  ensureIsArray: (val: any) =>
    val === null || val === undefined ? [] : Array.isArray(val) ? val : [val],
}));

import {
  THEME_PROFILES,
  contrastRatio,
  getTheme,
  isValidHex,
} from '../src/utils/themes';
import { resolveTransformOptions } from '../src/plugin/formDataOptions';
import transformProps from '../src/plugin/transformProps';

const EXISTING_STYLES = ['stratum', 'emerald', 'ocean', 'sunset'];

describe('theme palette profiles', () => {
  it('exposes the five profiles mapped onto the existing CSS theme styles', () => {
    expect(Object.keys(THEME_PROFILES)).toEqual([
      'standard',
      'colorblind',
      'stratum-warm',
      'stratum-cool',
      'custom',
    ]);
    Object.values(THEME_PROFILES).forEach(profile => {
      expect(EXISTING_STYLES).toContain(profile.style);
    });
    expect(getTheme('standard').style).toBe('stratum');
    expect(getTheme('colorblind').style).toBe('ocean');
    expect(getTheme('stratum-warm').style).toBe('sunset');
    expect(getTheme('stratum-cool').style).toBe('emerald');
  });

  it('falls back to standard for missing or unknown profile names', () => {
    expect(getTheme().name).toBe('standard');
    expect(getTheme('neon').name).toBe('standard');
    expect(getTheme('neon').style).toBe('stratum');
  });

  it('keeps every built-in profile colour at or above 3:1 against white', () => {
    (['standard', 'colorblind', 'stratum-warm', 'stratum-cool'] as const).forEach(name => {
      const theme = getTheme(name);
      expect(theme.warnings).toEqual([]);
      [theme.positive, theme.negative, theme.neutral].forEach(hex => {
        expect(contrastRatio(hex)).toBeGreaterThanOrEqual(3);
      });
    });
  });
});

describe('palette hex validation', () => {
  it('accepts only #RRGGBB values', () => {
    expect(isValidHex('#1a2B3c')).toBe(true);
    expect(isValidHex('#FFFFFF')).toBe(true);
    ['', '#fff', '1a2b3c', '#1a2b3g', '#1a2b3c4', ' #1a2b3c', 'red'].forEach(value => {
      expect(isValidHex(value)).toBe(false);
    });
  });

  it('applies valid custom hex values only to the custom profile', () => {
    const custom = getTheme('custom', {
      customPositiveHex: '#004d40',
      customNegativeHex: '#b71c1c',
      customNeutralHex: '#37474F',
    });
    expect(custom).toMatchObject({
      name: 'custom',
      style: 'stratum',
      positive: '#004d40',
      negative: '#b71c1c',
      neutral: '#37474F',
      warnings: [],
    });
    expect(getTheme('colorblind', { customPositiveHex: '#004d40' }).positive).toBe(
      THEME_PROFILES.colorblind.positive,
    );
  });

  it('falls back to the base profile for empty values and warns on invalid ones', () => {
    const theme = getTheme('custom', {
      customPositiveHex: '',
      customNegativeHex: 'not-a-colour',
      customNeutralHex: '#37474f',
    });
    expect(theme.positive).toBe(THEME_PROFILES.standard.positive);
    expect(theme.negative).toBe(THEME_PROFILES.standard.negative);
    expect(theme.neutral).toBe('#37474f');
    expect(theme.warnings).toHaveLength(1);
    expect(theme.warnings[0]).toContain('customNegativeHex');
    expect(getTheme('custom').warnings).toEqual([]);
  });
});

describe('contrast ratio', () => {
  it('computes the WCAG ratio against white', () => {
    expect(contrastRatio('#ffffff')).toBeCloseTo(1, 5);
    expect(contrastRatio('#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#767676')).toBeCloseTo(4.54, 2);
    expect(contrastRatio('#000000', '#000000')).toBeCloseTo(1, 5);
  });

  it('warns when a custom colour is below 3:1 against white', () => {
    const theme = getTheme('custom', {
      customPositiveHex: '#a7f3d0',
      customNegativeHex: '#b71c1c',
      customNeutralHex: '#a0a0a0',
    });
    expect(contrastRatio('#a0a0a0')).toBeLessThan(3);
    expect(theme.positive).toBe('#a7f3d0');
    expect(theme.warnings).toHaveLength(2);
    expect(theme.warnings[0]).toMatch(/customPositiveHex.*inferiore a 3:1/);
    expect(theme.warnings[1]).toMatch(/customNeutralHex.*inferiore a 3:1/);
  });
});

describe('theme wiring', () => {
  it('resolves the palette controls into the transform options', () => {
    expect(resolveTransformOptions({}).theme.name).toBe('standard');
    const options = resolveTransformOptions({
      themeProfile: 'custom',
      customPositiveHex: '#004d40',
    });
    expect(options.theme.name).toBe('custom');
    expect(options.theme.positive).toBe('#004d40');
  });

  const chartProps = (formData: Record<string, unknown>) =>
    ({
      width: 400,
      height: 300,
      formData: { groupby: ['region'], metrics: ['sales'], ...formData },
      queriesData: [{ data: [{ region: 'North', sales: 10 }] }],
      hooks: {},
    } as any);

  it('passes the selected theme to the table props and omits the default', () => {
    expect(transformProps(chartProps({}))).not.toHaveProperty('theme');
    expect(transformProps(chartProps({ themeProfile: 'stratum-cool' })).theme).toMatchObject({
      name: 'stratum-cool',
      style: 'emerald',
    });
  });
});
