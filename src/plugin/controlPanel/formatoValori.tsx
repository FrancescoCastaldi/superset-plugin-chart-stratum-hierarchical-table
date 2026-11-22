import { ControlPanelConfig, D3_FORMAT_OPTIONS } from '@superset-ui/chart-controls';
import { showDurationControl } from '../timeMetricHints';
import { CUSTOM_D3_FORMAT_OPTIONS } from './helpers';

type Section = ControlPanelConfig['controlPanelSections'][number];

const formatoValoriSection: Section = {
  label: 'Formato dei valori',
  expanded: false,
  tabOverride: 'customize',
  description: 'Formato numerico D3, simbolo valuta, gestione automatica e formato delle durate Time.',
  controlSetRows: [
    [
      {
        name: 'numberFormat',
        config: {
          type: 'SelectControl',
          freeForm: true,
          label: 'Formato dei numeri',
          renderTrigger: true,
          default: 'SMART_NUMBER',
          choices: CUSTOM_D3_FORMAT_OPTIONS || D3_FORMAT_OPTIONS,
          description:
            'Stringa di formattazione D3 per le metriche numeriche. Esempi: SMART_NUMBER, ,.0f, .1%, ~s.',
        },
      },
      {
        name: 'currencySymbol',
        config: {
          type: 'TextControl',
          label: 'Simbolo valuta (prefisso)',
          renderTrigger: true,
          default: '',
          description:
            'Prefisso aggiunto ai valori numerici formattati (lascia vuoto per nessun simbolo). Esempio: €.',
        },
      },
    ],
    [
      {
        name: 'timeDetection',
        config: {
          type: 'SelectControl',
          label: 'Metriche Time e durate',
          renderTrigger: true,
          visibility: showDurationControl('timeDetection', 'auto'),
          clearable: false,
          default: 'auto',
          choices: [
            ['auto', 'Automatico (leggi metriche Time come durate)'],
            ['off', 'Disattivato (lascia come testo)'],
          ],
          description:
            'Converte valori hh:mm:ss in secondi per calcolare correttamente medie, differenze e formattazioni. Esempio: Automatico per tempi d\'attesa.',
        },
      },
      {
        name: 'timeRollup',
        config: {
          type: 'SelectControl',
          label: 'Roll-up durate su padri e totali',
          renderTrigger: true,
          visibility: showDurationControl('timeRollup', 'mean'),
          clearable: false,
          default: 'mean',
          choices: [
            ['mean', 'Media dei nodi figli / celle (consigliato)'],
            ['general', 'Usa aggregazione generale della tabella'],
          ],
          description:
            'Come combinare le durate Time nei subtotali gerarchici e nel totale generale. Esempio: Media evita di sommare ore d\'attesa tra reparti.',
        },
      },
    ],
    [
      {
        name: 'timeDisplayFormat',
        config: {
          type: 'SelectControl',
          label: 'Formato delle durate',
          renderTrigger: true,
          visibility: showDurationControl('timeDisplayFormat', 'auto'),
          clearable: false,
          default: 'auto',
          choices: [
            ['auto', 'Automatico (mm:ss, oppure h:mm:ss da un\'ora)'],
            ['hms', 'Ore, minuti e secondi (1:05:30)'],
            ['ms', 'Minuti e secondi (65:30)'],
            ['minutes', 'Minuti decimali (65,5 min)'],
            ['hours', 'Ore decimali (1,09 h)'],
            ['seconds', 'Secondi (3930 s)'],
          ],
          description:
            'Come scrivere i campi Time in celle, totali e tooltip. Esempio: "1:05:30" oppure "65,5 min".',
        },
      },
      {
        name: 'timeFractionDigits',
        config: {
          type: 'SelectControl',
          label: 'Decimali delle durate',
          renderTrigger: true,
          visibility: showDurationControl('timeFractionDigits', 0),
          clearable: false,
          default: 0,
          choices: [
            [0, 'Nessuno (0)'],
            [1, 'Uno (1)'],
            [2, 'Due (2)'],
            [3, 'Tre (3)'],
          ],
          description:
            'Cifre decimali mostrate sui secondi (formati orologio) o sui formati decimali. Esempio: 0 scrive 12:54, 2 scrive 12:54.43.',
        },
      },
    ],
  ],
};

export default formatoValoriSection;
