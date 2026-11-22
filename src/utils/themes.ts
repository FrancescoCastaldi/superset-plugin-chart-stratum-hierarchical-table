/** Pre-existing palette styles: the `theme-*` CSS classes and the heatmap colours in formatters.ts. */
export type ThemeStyle = 'stratum' | 'emerald' | 'ocean' | 'sunset';

export type ThemeProfileName = 'standard' | 'colorblind' | 'stratum-warm' | 'stratum-cool' | 'custom';

export interface ThemeProfile {
  style: ThemeStyle;
  positive: string;
  negative: string;
  neutral: string;
}

export interface ResolvedTheme extends ThemeProfile {
  name: ThemeProfileName;
  warnings: string[];
}

export interface CustomThemeColors {
  customPositiveHex?: string;
  customNegativeHex?: string;
  customNeutralHex?: string;
}

const STANDARD: ThemeProfile = {
  style: 'stratum',
  positive: '#16a34a',
  negative: '#dc2626',
  neutral: '#6b7280',
};

export const THEME_PROFILES: Record<ThemeProfileName, ThemeProfile> = {
  standard: STANDARD,
  // Okabe-Ito blue/vermillion stay distinguishable under the common colour vision deficiencies.
  colorblind: { style: 'ocean', positive: '#0072b2', negative: '#d55e00', neutral: '#6b7280' },
  'stratum-warm': { style: 'sunset', positive: '#b45309', negative: '#dc2626', neutral: '#78716c' },
  'stratum-cool': { style: 'emerald', positive: '#047857', negative: '#1d4ed8', neutral: '#64748b' },
  // The base that empty or invalid custom overrides fall back to.
  custom: STANDARD,
};

const CUSTOM_FIELDS = [
  ['positive', 'customPositiveHex'],
  ['negative', 'customNegativeHex'],
  ['neutral', 'customNeutralHex'],
] as const;

export const isValidHex = (value: string): boolean => /^#[0-9a-fA-F]{6}$/.test(value);

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio between two #RRGGBB colours, from 1 to 21. */
export function contrastRatio(hex: string, against = '#ffffff'): number {
  const [hi, lo] = [luminance(hex), luminance(against)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Resolves a palette profile. Custom hex overrides apply only to `custom`; empty values keep
 * the base colour, invalid ones keep it too and add a warning, as do colours below 3:1 on white.
 */
export function getTheme(name?: string, custom: CustomThemeColors = {}): ResolvedTheme {
  const profileName = (name && name in THEME_PROFILES ? name : 'standard') as ThemeProfileName;
  const theme: ResolvedTheme = { ...THEME_PROFILES[profileName], name: profileName, warnings: [] };
  if (profileName !== 'custom') return theme;

  CUSTOM_FIELDS.forEach(([key, field]) => {
    const value = String(custom[field] ?? '').trim();
    if (!value) return;
    if (!isValidHex(value)) {
      theme.warnings.push(`${field}: colore non valido (${value})`);
      return;
    }
    theme[key] = value;
    const ratio = contrastRatio(value);
    if (ratio < 3) {
      theme.warnings.push(`${field}: contrasto ${ratio.toFixed(2)}:1, inferiore a 3:1`);
    }
  });
  return theme;
}
