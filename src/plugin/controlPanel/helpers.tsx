import { colorSeed } from '../legacyMigration';

export const subsectionHeader = (label: string) => <h4 className="section-header">{label}</h4>;
export const subsectionDivider = () => <hr />;

// Selettore colori nativo di Superset: salva {r,g,b,a}; i grafici già salvati con #RRGGBB
// vengono convertiti all'apertura (initialValue) e letti in entrambi i formati dal tema.
export const customColorControl = (name: string, label: string, exampleHex: string) => ({
  name,
  config: {
    type: 'ColorPickerControl',
    label,
    renderTrigger: true,
    default: undefined,
    initialValue: colorSeed,
    description: `Colore personalizzato; se non lo imposti vale quello standard. Mantieni un contrasto di almeno 3:1 su sfondo bianco. Esempio: ${exampleHex}.`,
    visibility: ({ controls }: { controls: any }) => controls?.themeProfile?.value === 'custom',
  },
});

export const metricNamesOf = (explore: any): string[] => {
  const raw = explore?.controls?.metrics?.value || explore?.controls?.metric?.value || [];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const seen = new Set<string>();
  const names: string[] = [];
  for (const m of list) {
    const name = typeof m === 'string' ? m : m?.label || m?.metric_name || String(m || '');
    const clean = name.trim();
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      names.push(clean);
    }
  }
  return names;
};

export const dimensionNamesOf = (explore: any): string[] => {
  const raw = explore?.controls?.groupby?.value || [];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list
    .map((d: any) => (typeof d === 'string' ? d : d?.label || d?.column_name || d?.sqlExpression || ''))
    .map((name: string) => name.trim())
    .filter(Boolean);
};

/** Metriche del grafico e metriche calcolate, nell'ordine in cui compaiono nella tabella. */
export const tableMetricNamesOf = (explore: any): string[] => {
  const raw = explore?.controls?.calculatedMetrics?.value;
  let rows: any[] = [];
  try {
    const parsed = typeof raw === 'string' && raw.trim() !== '' ? JSON.parse(raw) : raw;
    rows = Array.isArray(parsed) ? parsed : [];
  } catch {
    rows = [];
  }
  const calculated = rows
    .map((row: any) => (typeof row?.metric === 'string' ? row.metric.trim() : ''))
    .filter(Boolean);
  return Array.from(new Set([...metricNamesOf(explore), ...calculated]));
};

/** Metriche salvate del dataset (tutte, anche quelle non ancora scelte nel grafico). */
export const savedMetricNamesOf = (explore: any): string[] => {
  const raw = explore?.datasource?.metrics;
  const list: any[] = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const names: string[] = [];
  for (const m of list) {
    const name = typeof m === 'string' ? m : String(m?.metric_name ?? '');
    const clean = name.trim();
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      names.push(clean);
    }
  }
  return names;
};

// Metriche e dimensioni scelte in Dati: suggerimenti e controlli dei campi nei controlli a elenco.
export const choicesFromExplore = (explore: any) => ({
  metricChoices: metricNamesOf(explore),
  dimensionChoices: dimensionNamesOf(explore),
  datasetMetricChoices: savedMetricNamesOf(explore),
});

export const isMultiDim = ({ controls }: { controls: any }) =>
  controls?.hierarchyType?.value === 'multi_dimension';

export const isParentChild = ({ controls }: { controls: any }) =>
  controls?.hierarchyType?.value === 'parent_child';

export const pivotCountOf = (controls: any): number =>
  Array.isArray(controls?.columns?.value) ? controls.columns.value.length : 0;

export const hasPivot = ({ controls }: { controls: any }) =>
  isMultiDim({ controls }) && pivotCountOf(controls) > 0;

export const isSinglePivot = ({ controls }: { controls: any }) =>
  isMultiDim({ controls }) && pivotCountOf(controls) === 1;

export const isTwoWayPivot = ({ controls }: { controls: any }) =>
  isMultiDim({ controls }) && pivotCountOf(controls) >= 2;

export const isFlatLayout = ({ controls }: { controls: any }) =>
  !hasPivot({ controls });

// Con l'ordinamento disattivato (Interazione) nessun ordinamento viene applicato, nemmeno quello iniziale.
export const sortingEnabled = ({ controls }: { controls: any }) =>
  controls?.enableHierarchicalSort?.value !== false;

export const CUSTOM_D3_FORMAT_OPTIONS: [string, string][] = [
  ['SMART_NUMBER', 'Formattazione adattiva (Smart Number)'],
  [',d', '1,234 (Intero)'],
  ['.2f', '1234.56 (2 decimali)'],
  [',.2f', '1,234.56 (2 decimali)'],
  [',.1f', '1,234.6 (1 decimale)'],
  ['.2%', '12.34% (Percentuale)'],
  ['.1%', '12.3% (Percentuale)'],
  ['~s', '1.2k (Prefisso SI)'],
];

