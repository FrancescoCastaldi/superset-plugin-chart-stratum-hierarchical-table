import { jsonSyntaxValidator } from '../controls/listModel';
import {
  DIMENSION_LIMITS_EXAMPLE,
  DIMENSION_LIMITS_FIELDS,
  GOALS_EXAMPLE,
  GOALS_FIELDS,
  METRIC_DEFINITIONS_EXAMPLE,
  METRIC_DEFINITIONS_SCHEMA,
  TABLE_CALCULATIONS_EXAMPLE,
  TABLE_CALCULATIONS_SCHEMA,
  dimensionLimitWarning,
  dimensionLimitsNormalize,
  goalsNormalize,
  metricDefinitionsNormalize,
  tableCalculationsNormalize,
} from '../controls/specs';
import {
  choicesFromExplore,
  metricNamesOf,
  subsectionDivider,
  subsectionHeader,
} from './helpers';
import { ControlPanelConfig } from '@superset-ui/chart-controls';
import RowListControl from '../controls/RowListControl';
import JsonTextControl from '../controls/JsonTextControl';

type Section = ControlPanelConfig['controlPanelSections'][number];

const avanzateSection: Section = {
  label: 'Avanzate',
  expanded: false,
  tabOverride: 'customize',
  description: 'Definizioni metriche, calcoli tabellari, obiettivi, oscuramento privacy e limiti di rendering.',
  controlSetRows: [
    [subsectionHeader('Definizioni semantiche, calcoli e obiettivi (JSON)')],
    [
      {
        name: 'metricDefinitions',
        config: {
          type: JsonTextControl as any,
          normalize: metricDefinitionsNormalize,
          exampleRows: METRIC_DEFINITIONS_EXAMPLE,
          schemaLines: METRIC_DEFINITIONS_SCHEMA,
          validators: [jsonSyntaxValidator],
          label: 'Definizioni semantiche metriche',
          default: '',
          renderTrigger: true,
          description:
            'Array JSON che specifica il significato delle metriche (sum, mean, ratio, delta_pct, diff) e la polarità (higher_is_better / lower_is_better). Esempio: [{"metric":"tasso","type":"ratio","numerator":"num","denominator":"den"}].',
        },
      },
    ],
    [
      {
        name: 'tableCalculations',
        config: {
          type: JsonTextControl as any,
          normalize: tableCalculationsNormalize,
          exampleRows: TABLE_CALCULATIONS_EXAMPLE,
          schemaLines: TABLE_CALCULATIONS_SCHEMA,
          validators: [jsonSyntaxValidator],
          label: 'Calcoli tabellari e colonne derivate',
          default: '',
          renderTrigger: true,
          description:
            'Array JSON per aggiungere colonne calcolate lato client. Tipi: pct_of_total (% sul totale), pct_of_parent (% sul padre), running_total (cumulativo), diff_from_previous, diff_from_previous_pct, rank (classifica). Esempio: [{"type":"pct_of_total","metric":"ricavi"}].',
        },
      },
    ],
    [
      {
        name: 'goals',
        config: {
          type: RowListControl as any,
          storedAs: 'json',
          fields: GOALS_FIELDS,
          exampleRows: GOALS_EXAMPLE,
          newRow: () => ({ direction: 'higher_is_better' }),
          normalize: goalsNormalize,
          aliases: { metricKey: 'metric' },
          addLabel: 'Aggiungi obiettivo',
          rowTitle: 'Obiettivo',
          emptyHint: 'Nessun obiettivo: non compaiono scostamenti dal target.',
          mapStateToProps: choicesFromExplore,
          label: 'Obiettivi e target per metrica',
          default: '',
          renderTrigger: true,
          description:
            'Un obiettivo per metrica: mostra lo scostamento dal target e il badge raggiunto o non raggiunto. Aggiungilo con il pulsante qui sotto. Campi: metric (nome della metrica), target (numero), direction (higher_is_better oppure lower_is_better, facoltativo). Esempio: [{"metric":"accessi","target":1000}].',
        },
      },
    ],
    [subsectionDivider()],
    [subsectionHeader('Oscuramento privacy per piccoli numeri')],
    [
      {
        name: 'suppressionThreshold',
        config: {
          type: 'TextControl',
          isInt: true,
          label: 'Oscura conteggi inferiori a (0 = disattivato)',
          default: 0,
          renderTrigger: true,
          description:
            'Sostituisce con un segnaposto i valori positivi inferiori alla soglia, per tutela della privacy. Esempio: con soglia 5 i valori da 1 a 4 diventano <5; 0 disattiva.',
        },
      },
      {
        name: 'suppressionLabel',
        config: {
          type: 'TextControl',
          label: 'Testo celle oscurate',
          default: '<{k}',
          renderTrigger: true,
          description:
            'Segnaposto mostrato nelle celle oscurate; {k} viene sostituito con la soglia configurata. Esempio: "<5" oppure "***".',
          visibility: ({ controls }: { controls: any }) =>
            Number(controls?.suppressionThreshold?.value) > 0,
        },
      },
    ],
    [
      {
        name: 'suppressionMetrics',
        config: {
          type: 'SelectControl',
          freeForm: true,
          multi: true,
          clearable: true,
          label: 'Metriche da oscurare (vuoto = tutte)',
          default: [],
          renderTrigger: true,
          mapStateToProps: (explore: any) => ({
            choices: metricNamesOf(explore).map(v => [v, v]),
          }),
          description:
            'Seleziona le sole metriche soggette a oscuramento; lascia vuoto per applicarlo a tutte. Esempio: Pazienti.',
          visibility: ({ controls }: { controls: any }) =>
            Number(controls?.suppressionThreshold?.value) > 0,
        },
      },
      {
        name: 'complementarySuppression',
        config: {
          type: 'CheckboxControl',
          label: 'Oscuramento complementare anti-ricostruzione',
          default: true,
          renderTrigger: true,
          description:
            'Oscura anche la seconda cella più piccola di un gruppo quando una sola cella era oscurata, così non si ricava per differenza dal totale. Esempio: con 2 e 30 su totale 32, anche 30 viene nascosto.',
          visibility: ({ controls }: { controls: any }) =>
            Number(controls?.suppressionThreshold?.value) > 0,
        },
      },
    ],
    [subsectionDivider()],
    [subsectionHeader('Prestazioni, virtualizzazione e limiti Top N')],
    [
      {
        name: 'virtualizationThreshold',
        config: {
          type: 'TextControl',
          isInt: true,
          label: 'Attiva virtualizzazione oltre N righe',
          default: 500,
          renderTrigger: true,
          description:
            'Oltre questo numero di righe la tabella disegna solo quelle visibili mentre si scorre, per restare fluida; la finestra si adatta all\'altezza del grafico. Esempio: 500.',
        },
      },
    ],
    [
      {
        name: 'dimensionLimits',
        config: {
          type: RowListControl as any,
          storedAs: 'json',
          fields: DIMENSION_LIMITS_FIELDS,
          exampleRows: DIMENSION_LIMITS_EXAMPLE,
          newRow: () => ({ limit: 10, mode: 'top' }),
          normalize: dimensionLimitsNormalize,
          rowWarning: dimensionLimitWarning,
          addLabel: 'Aggiungi limite',
          rowTitle: 'Limite',
          emptyHint: 'Nessun limite: vengono mostrati tutti gli elementi.',
          mapStateToProps: choicesFromExplore,
          label: 'Limiti Top N per dimensione (opzionale)',
          default: '',
          renderTrigger: true,
          description:
            'Mostra solo i primi N elementi di un livello gerarchico e raggruppa il resto in una riga "Altri (n)" aggregata come i nodi padre. Indica la dimensione oppure il livello. Esempio: [{"dimension":"reparto","limit":10}].',
        },
      },
    ],
  ],
};

export default avanzateSection;
