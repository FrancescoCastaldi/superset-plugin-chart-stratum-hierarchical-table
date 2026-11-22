jest.mock('@superset-ui/core', () => ({
  ensureIsArray: (value: unknown) => (Array.isArray(value) ? value : value == null ? [] : [value]),
  getNumberFormatter: (fmt: string) => (val: number) => `${fmt}(${val})`,
}));

import controlPanel from '../src/plugin/controlPanel';
import { resolveTransformOptions } from '../src/plugin/formDataOptions';
import {
  baselineFromLegacy,
  baselineToStrategy,
  colorSeed,
  colorToHex,
  endOfSeriesBaselineSeed,
  hexToColor,
  resolveEndOfSeriesBaseline,
} from '../src/plugin/legacyMigration';

const control = (name: string): any =>
  (controlPanel.controlPanelSections as any[])
    .flatMap(section => section.controlSetRows.flat())
    .find((item: any) => item && typeof item === 'object' && item.name === name);

const STRATEGIES = ['prev_period', 'prev_year_same_period', 'budget_target'];
const REFERENCES = ['current', 'previous', 'ytd'];

describe('base del confronto di fine serie', () => {
  it('ogni coppia dei controlli precedenti dà lo stesso confronto di prima', () => {
    for (const comparisonType of STRATEGIES) {
      for (const referencePeriod of REFERENCES) {
        const options = resolveTransformOptions({ comparisonType, referencePeriod });
        // Regola precedente: periodo precedente con periodo attivo non produceva nessuna colonna.
        const producedNothing = comparisonType === 'prev_period' && referencePeriod === 'current';
        const baseline = baselineFromLegacy({ comparisonType, referencePeriod });
        expect(baseline === 'none').toBe(producedNothing);
        expect(options.comparisonStrategy).toBe(comparisonType);
        // Il periodo di riferimento conta solo con la strategia "periodo precedente".
        if (comparisonType === 'prev_period') {
          expect(options.comparisonReferencePeriod).toBe(referencePeriod);
        }
      }
    }
  });

  it('le combinazioni dei 32 grafici IDI (default) restano senza confronto', () => {
    expect(resolveEndOfSeriesBaseline({ comparisonType: 'prev_period', referencePeriod: 'current' })).toBe('none');
    expect(resolveEndOfSeriesBaseline({})).toBe('none');
  });

  it('la chiave nuova vince su quelle vecchie, un valore sconosciuto torna alle vecchie', () => {
    expect(
      resolveEndOfSeriesBaseline({ endOfSeriesBaseline: 'ytd_average', comparisonType: 'budget_target' }),
    ).toBe('ytd_average');
    expect(
      resolveEndOfSeriesBaseline({ endOfSeriesBaseline: 'boh', comparisonType: 'budget_target' }),
    ).toBe('budget_target');
  });

  it('i valori interni corrispondono a ogni base', () => {
    expect(baselineToStrategy('none')).toEqual({ strategy: 'prev_period', referencePeriod: 'current' });
    expect(baselineToStrategy('previous_period')).toEqual({ strategy: 'prev_period', referencePeriod: 'previous' });
    expect(baselineToStrategy('ytd_average')).toEqual({ strategy: 'prev_period', referencePeriod: 'ytd' });
    expect(baselineToStrategy('same_period_last_year').strategy).toBe('prev_year_same_period');
    expect(baselineToStrategy('budget_target').strategy).toBe('budget_target');
  });

  it('il controllo in Explore parte dai valori del grafico salvato', () => {
    const seed = control('endOfSeriesBaseline').config.initialValue;
    expect(seed).toBe(endOfSeriesBaselineSeed);
    const saved = { form_data: { comparisonType: 'prev_year_same_period', referencePeriod: 'current' } };
    expect(seed({ value: undefined }, saved)).toBe('same_period_last_year');
    // già scelto: non si sovrascrive
    expect(seed({ value: 'previous_period' }, saved)).toBeUndefined();
    // niente da migrare, oppure nessuno stato del pannello (dashboard)
    expect(seed({ value: undefined }, { form_data: {} })).toBeUndefined();
    expect(seed({ value: undefined }, null)).toBeUndefined();
  });
});

describe('colori personalizzati', () => {
  it('converte tra #RRGGBB e il formato del selettore', () => {
    expect(hexToColor('#059669')).toEqual({ r: 5, g: 150, b: 105, a: 1 });
    expect(colorToHex({ r: 5, g: 150, b: 105, a: 1 })).toBe('#059669');
    expect(colorToHex('  #DC2626 ')).toBe('#DC2626');
    expect(colorToHex(undefined)).toBe('');
    expect(hexToColor('rosso')).toBeUndefined();
    expect(colorToHex({ r: 999, g: -5, b: 0 })).toBe('#ff0000');
  });

  it('il tema legge sia il testo salvato sia il selettore', () => {
    const fromText = resolveTransformOptions({ themeProfile: 'custom', customPositiveHex: '#059669' });
    const fromPicker = resolveTransformOptions({
      themeProfile: 'custom',
      customPositiveHex: { r: 5, g: 150, b: 105, a: 1 },
    });
    expect(fromText.theme.positive).toBe('#059669');
    expect(fromPicker.theme.positive).toBe('#059669');
  });

  it('un testo non valido continua a generare l\'avviso del tema', () => {
    const { theme } = resolveTransformOptions({ themeProfile: 'custom', customNegativeHex: 'rosso' });
    expect(theme.warnings.join(' ')).toContain('customNegativeHex');
  });

  it('i tre controlli sono selettori colore che convertono il valore salvato', () => {
    for (const name of ['customPositiveHex', 'customNegativeHex', 'customNeutralHex']) {
      expect(control(name).config.type).toBe('ColorPickerControl');
      expect(control(name).config.initialValue).toBe(colorSeed);
    }
    expect(colorSeed({ value: '#0284c7' })).toEqual({ r: 2, g: 132, b: 199, a: 1 });
    expect(colorSeed({ value: { r: 1, g: 2, b: 3 } })).toBeUndefined();
  });
});

describe('visibilità dei controlli di ordinamento', () => {
  const state = (enableHierarchicalSort: boolean) => ({ controls: { enableHierarchicalSort: { value: enableHierarchicalSort } } });

  it('si vedono solo con l\'ordinamento attivo', () => {
    for (const name of ['defaultSortColumn', 'defaultSortOrder', 'nullHandling']) {
      expect(control(name).config.visibility(state(true))).toBe(true);
      expect(control(name).config.visibility(state(false))).toBe(false);
    }
  });
});

describe('alias non più letti', () => {
  it('le chiavi snake_case irraggiungibili non cambiano nulla', () => {
    const base = resolveTransformOptions({});
    expect(resolveTransformOptions({ show_grand_total: false }).showGrandTotal).toBe(base.showGrandTotal);
    expect(resolveTransformOptions({ grand_total_enabled: false }).showGrandTotal).toBe(base.showGrandTotal);
    expect(resolveTransformOptions({ subtotals_enabled: false }).showSubtotals).toBe(base.showSubtotals);
    expect(resolveTransformOptions({ initial_expand_depth: 4 }).initialExpandDepth).toBe(base.initialExpandDepth);
  });

  it('expandAllByDefault resta un alias attivo', () => {
    expect(resolveTransformOptions({ expandAllByDefault: true }).initialExpandDepth).toBe(-1);
  });
});
