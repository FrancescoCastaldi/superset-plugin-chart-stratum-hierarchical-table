jest.mock('@superset-ui/core', () => ({
  ensureIsArray: (value: unknown) => (Array.isArray(value) ? value : value == null ? [] : [value]),
  getNumberFormatter: (fmt: string) => (val: number) => `${fmt}(${val})`,
}));

import controlPanel from '../src/plugin/controlPanel';

interface Control {
  name: string;
  config: Record<string, any>;
}

const controls: Control[] = (controlPanel.controlPanelSections as any[])
  .flatMap(section => section.controlSetRows.flat())
  .filter(
    (item: any): item is Control =>
      !!item && typeof item === 'object' && typeof item.name === 'string' && 'config' in item,
  );

// Trattino lungo, trattino medio e doppio trattino usato come separatore.
const banned = /[–—]| -- /;

describe('qualità dei controlli del pannello', () => {
  it('ogni descrizione dice cosa fa e porta un esempio', () => {
    const without = controls.filter(c => !/Esempi?[o:]/.test(String(c.config.description))).map(c => c.name);
    expect(without).toEqual([]);
  });

  it('nessun trattino lungo né doppio trattino nei testi visibili', () => {
    const offenders: string[] = [];
    for (const { name, config } of controls) {
      const texts = [config.label, config.description, ...(config.choices ?? []).map((c: [unknown, string]) => c[1])];
      if (texts.some(t => typeof t === 'string' && banned.test(t))) offenders.push(name);
    }
    expect(offenders).toEqual([]);
  });

  it('i valori predefiniti dei menu a scelta chiusa sono tra le scelte', () => {
    const wrong: string[] = [];
    for (const { name, config } of controls) {
      if (config.type !== 'SelectControl' || config.freeForm || !Array.isArray(config.choices)) continue;
      const values = config.choices.map((c: [unknown, string]) => c[0]);
      const defaults = Array.isArray(config.default) ? config.default : [config.default];
      if (!defaults.every((d: unknown) => d === undefined || d === '' || values.includes(d))) wrong.push(name);
    }
    expect(wrong).toEqual([]);
  });

  it('le scelte hanno etichette non vuote e valori unici', () => {
    const wrong: string[] = [];
    for (const { name, config } of controls) {
      if (!Array.isArray(config.choices)) continue;
      const values = config.choices.map((c: [unknown, string]) => c[0]);
      const labels = config.choices.map((c: [unknown, string]) => String(c[1]).trim());
      if (new Set(values).size !== values.length || labels.some((l: string) => l === '')) wrong.push(name);
    }
    expect(wrong).toEqual([]);
  });

  it('i controlli a elenco dichiarano come salvano e cosa mostrare di esempio', () => {
    for (const name of ['conditionalFormatting', 'goals', 'dimensionLimits']) {
      const { config } = controls.find(c => c.name === name) as Control;
      expect(['array', 'json']).toContain(config.storedAs);
      expect(config.exampleRows.length).toBeGreaterThan(0);
      expect(typeof config.normalize).toBe('function');
    }
    for (const name of ['metricDefinitions', 'tableCalculations']) {
      const { config } = controls.find(c => c.name === name) as Control;
      expect(config.validators).toHaveLength(1);
      expect(config.schemaLines.length).toBeGreaterThan(0);
    }
  });
});
