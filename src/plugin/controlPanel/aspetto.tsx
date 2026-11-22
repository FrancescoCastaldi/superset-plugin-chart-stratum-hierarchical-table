import {
  CONDITIONAL_FORMATTING_EXAMPLE,
  CONDITIONAL_FORMATTING_FIELDS,
  conditionalFormattingNormalize,
  conditionalFormattingWarning,
} from '../controls/specs';
import {
  choicesFromExplore,
  customColorControl,
  isFlatLayout,
  isSinglePivot,
  metricNamesOf,
  sortingEnabled,
  subsectionDivider,
  subsectionHeader,
} from './helpers';
import { ControlPanelConfig } from '@superset-ui/chart-controls';
import RowListControl from '../controls/RowListControl';

type Section = ControlPanelConfig['controlPanelSections'][number];

const aspettoSection: Section = {
  label: 'Aspetto',
  expanded: false,
  tabOverride: 'customize',
  description: 'Espansione iniziale, stile righe e colonne, ordinamento, evidenziazioni min/max, tema e sparkline.',
  controlSetRows: [
    [
      {
        name: 'initialExpandDepth',
        config: {
          type: 'SelectControl',
          label: 'Livelli espansi all\'apertura',
          default: 1,
          clearable: false,
          renderTrigger: true,
          choices: [
            [-1, 'Espandi tutti i livelli'],
            [0, 'Chiudi tutto (solo radici)'],
            [1, 'Livello 1'],
            [2, 'Livello 2'],
            [3, 'Livello 3'],
            [4, 'Livello 4'],
          ],
          description:
            'Profondità iniziale dell\'albero al caricamento della tabella. Esempio: Livello 1.',
        },
      },
      {
        name: 'valueDisplayMode',
        config: {
          type: 'SelectControl',
          label: 'Livelli su cui mostrare i valori',
          default: 'all',
          clearable: false,
          renderTrigger: true,
          choices: [
            ['all', 'Tutti i livelli (predefinito)'],
            ['leaves_only', 'Solo foglie'],
            ['parents_only', 'Solo padri / subtotali'],
          ],
          description:
            'Decide su quali livelli della gerarchia mostrare le cifre nelle celle. Esempio: Solo foglie per evitare doppie letture su rapporti non sommabili.',
        },
      },
    ],
    [
      {
        name: 'compactMode',
        config: {
          type: 'CheckboxControl',
          label: 'Modalità compatta (spaziatura ridotta)',
          renderTrigger: true,
          default: false,
          description:
            'Riduce altezza e spaziatura delle righe per mostrare più dati nello schermo; utile su tabelle lunghe. Esempio: circa il 30% di righe in più visibili nella stessa card.',
        },
      },
      {
        name: 'stripedRows',
        config: {
          type: 'CheckboxControl',
          label: 'Righe alternate zebrate',
          renderTrigger: true,
          default: true,
          description:
            'Alterna una leggera ombreggiatura di sfondo tra una riga e la successiva per facilitare la lettura lungo la riga. Esempio: righe dispari bianche e pari grigio chiaro.',
        },
      },
    ],
    [
      {
        name: 'stickyHeader',
        config: {
          type: 'CheckboxControl',
          label: 'Intestazione fissa allo scorrimento',
          renderTrigger: true,
          default: true,
          description:
            'Mantiene visibili i titoli delle colonne in cima alla tabella quando si scorre verso il basso. Esempio: scorrendo 200 righe si leggono sempre i nomi delle metriche.',
        },
      },
      {
        name: 'wrapHeaderLabels',
        config: {
          type: 'CheckboxControl',
          label: 'A capo automatico su intestazioni lunghe',
          renderTrigger: true,
          default: false,
          description:
            'Permette ai titoli lunghi delle colonne di andare a capo invece di essere troncati con i puntini. Esempio: \'Tempo medio di attesa\' su due righe.',
        },
      },
    ],
    [
      {
        name: 'resizableColumns',
        config: {
          type: 'CheckboxControl',
          label: 'Colonne ridimensionabili manualmente',
          renderTrigger: true,
          default: false,
          description:
            'Permette di trascinare il bordo destro delle intestazioni per allargare o stringere le colonne; il doppio clic ripristina la larghezza. Esempio: allarga la colonna dei nomi per leggere etichette lunghe.',
        },
      },
      {
        name: 'reorderColumnsByDrag',
        config: {
          type: 'CheckboxControl',
          label: 'Riordino colonne con trascinamento (tabella piatta)',
          renderTrigger: true,
          default: false,
          description:
            'Consente di spostare le colonne trascinando l\'intestazione, solo nella tabella piatta (senza pivot). Esempio: porta Ricavi accanto a Richieste.',
          visibility: isFlatLayout,
        },
      },
    ],
    [subsectionDivider()],
    [subsectionHeader('Ordinamento e formattazione condizionale')],
    [
      {
        name: 'defaultSortColumn',
        config: {
          type: 'SelectControl',
          freeForm: true,
          label: 'Colonna di ordinamento iniziale',
          default: '__hierarchy_tree__',
          renderTrigger: true,
          choices: [['__hierarchy_tree__', 'Categoria gerarchia (nome)']],
          mapStateToProps: (explore: any) => {
            const rawMetrics = explore?.controls?.metrics?.value || explore?.controls?.metric?.value || [];
            const metrics = Array.isArray(rawMetrics) ? rawMetrics : rawMetrics ? [rawMetrics] : [];
            const names: string[] = metrics.map((m: any) =>
              typeof m === 'string' ? m : m?.label || m?.metric_name || String(m),
            );
            const deltas = names
              .map(n => n.match(/^(.+)_corr$/)?.[1])
              .filter(Boolean)
              .map(b => `delta_${b}_pct`);
            return {
              choices: [
                ['__hierarchy_tree__', 'Categoria gerarchia (nome)'],
                ['__tree_level__', 'Livello albero'],
                ['__leaf_count__', 'Numero foglie'],
                ...[...names, ...deltas].map(v => [v, v]),
              ],
            };
          },
          description:
            'Colonna strutturale o metrica usata per ordinare l\'albero al caricamento. Esempio: Richieste o Categoria gerarchia.',
          visibility: sortingEnabled,
        },
      },
      {
        name: 'defaultSortOrder',
        config: {
          type: 'SelectControl',
          label: 'Direzione ordinamento iniziale',
          default: 'none',
          clearable: false,
          renderTrigger: true,
          choices: [
            ['none', 'Ordine della query (nessuno)'],
            ['asc', 'Crescente / A-Z'],
            ['desc', 'Decrescente / Z-A'],
          ],
          description:
            'Direzione dell\'ordinamento applicato all\'apertura del grafico. Esempio: Decrescente con la colonna Richieste per vedere prima i reparti più carichi.',
          visibility: sortingEnabled,
        },
      },
    ],
    [
      {
        name: 'nullHandling',
        config: {
          type: 'SelectControl',
          label: 'Posizione dei valori vuoti in ordinamento',
          default: 'bottom',
          clearable: false,
          renderTrigger: true,
          choices: [
            ['bottom', 'Sempre in fondo'],
            ['top', 'Sempre in cima'],
            ['exclude', 'Escludi righe vuote durante il sort'],
          ],
          description:
            'Dove collocare i nodi senza valore quando si ordina una metrica. Esempio: Sempre in fondo.',
          visibility: sortingEnabled,
        },
      },
    ],
    [
      {
        name: 'minMaxDisplayMode',
        config: {
          type: 'SelectControl',
          label: 'Evidenziazione visiva min/max nelle celle',
          default: 'none',
          clearable: false,
          renderTrigger: true,
          choices: [
            ['none', 'Disattivata'],
            ['badges', 'Badge MIN / MAX'],
            ['heatmap', 'Gradiente heatmap di cella'],
            ['diverging_heatmap', 'Heatmap divergente (3 colori)'],
            ['data_bars', 'Barre orizzontali nelle celle'],
            ['bipolar_data_bars', 'Barre bipolari centrate su zero'],
          ],
          description:
            'Evidenzia i valori minimi e massimi o l\'intensità relativa in ogni colonna numerica. Esempio: Barre orizzontali per confrontare volumi.',
        },
      },
      {
        name: 'minMaxScope',
        config: {
          type: 'SelectControl',
          label: 'Ambito di calcolo min/max',
          default: 'leaves_only',
          clearable: false,
          renderTrigger: true,
          choices: [
            ['leaves_only', 'Solo nodi foglia (consigliato)'],
            ['level_aware', 'Per singolo livello gerarchico'],
            ['all_nodes', 'Tutti i nodi (escluso Grand Total)'],
          ],
          description:
            'Decide quali righe partecipano al calcolo della scala min/max. Esempio: Solo nodi foglia evita che i subtotali, molto più grandi, falsino i colori.',
          visibility: ({ controls }: { controls: any }) =>
            controls?.minMaxDisplayMode?.value && controls?.minMaxDisplayMode?.value !== 'none',
        },
      },
    ],
    [
      {
        name: 'heatmapPalette',
        config: {
          type: 'SelectControl',
          label: 'Palette heatmap divergente',
          default: 'red_white_green',
          clearable: false,
          renderTrigger: true,
          choices: [
            ['red_white_green', 'Rosso - Bianco - Verde'],
            ['red_yellow_green', 'Rosso - Giallo - Verde'],
            ['blue_white_red', 'Blu - Bianco - Rosso (daltonici)'],
            ['custom', 'Colori personalizzati del tema'],
          ],
          description:
            'Scala continua a 3 colori per la modalità "Heatmap divergente". Esempio: Blu - Bianco - Rosso.',
          visibility: ({ controls }: { controls: any }) =>
            controls?.minMaxDisplayMode?.value === 'diverging_heatmap',
        },
      },
      {
        name: 'divergingMidpoint',
        config: {
          type: 'TextControl',
          label: 'Punto centrale divergente (opzionale)',
          default: '',
          renderTrigger: true,
          description:
            'Valore numerico associato al colore neutro; se vuoto usa 0 (se presenti negativi e positivi) o la media tra min e max. Esempio: 0.',
          visibility: ({ controls }: { controls: any }) =>
            controls?.minMaxDisplayMode?.value === 'diverging_heatmap',
        },
      },
    ],
    [
      {
        name: 'conditionalFormatting',
        config: {
          type: RowListControl as any,
          storedAs: 'array',
          fields: CONDITIONAL_FORMATTING_FIELDS,
          exampleRows: CONDITIONAL_FORMATTING_EXAMPLE,
          newRow: () => ({ operator: '>' }),
          normalize: conditionalFormattingNormalize,
          rowWarning: conditionalFormattingWarning,
          addLabel: 'Aggiungi regola',
          rowTitle: 'Regola',
          emptyHint: 'Nessuna regola: le celle non hanno colori personalizzati.',
          mapStateToProps: choicesFromExplore,
          label: 'Regole di formattazione condizionale',
          default: [],
          renderTrigger: true,
          description:
            'Regole per colorare o aggiungere icone a celle, righe o colonne quando un valore supera una soglia. Aggiungi una regola con il pulsante qui sotto. Operatori: >, >=, <, <=, ==, between, regex. Esempio: [{"metric":"attesa","operator":">","targetValue":30,"backgroundColor":"#fee2e2"}].',
        },
      },
    ],
    [subsectionDivider()],
    [subsectionHeader('Tema, colori e sparkline')],
    [
      {
        name: 'themeProfile',
        config: {
          type: 'SelectControl',
          label: 'Tema colori',
          default: 'standard',
          clearable: false,
          renderTrigger: true,
          choices: [
            ['standard', 'Standard (verde acqua)'],
            ['colorblind', 'Adatto ai daltonici (blu)'],
            ['stratum-warm', 'Stratum caldo (tramonto)'],
            ['stratum-cool', 'Stratum freddo (smeraldo)'],
            ['custom', 'Colori personalizzati (selettore colori)'],
          ],
          description:
            'Palette cromatica usata per badge min/max, heatmap e data bar. Esempio: Adatto ai daltonici.',
        },
      },
    ],
    [
      customColorControl('customPositiveHex', 'Colore positivo / MAX', '#059669'),
      customColorControl('customNegativeHex', 'Colore negativo / MIN', '#dc2626'),
    ],
    [customColorControl('customNeutralHex', 'Colore neutro / data bar', '#0284c7')],
    [
      {
        name: 'showSparklines',
        config: {
          type: 'CheckboxControl',
          label: 'Mostra mini-grafici sparkline (pivot singolo)',
          default: false,
          renderTrigger: true,
          description:
            'Aggiunge una colonna Trend con il mini-grafico dell\'andamento di ciascuna riga lungo le colonne pivot. Esempio: con i mesi su colonne, una piccola linea mostra la tendenza di ogni reparto.',
          visibility: isSinglePivot,
        },
      },
      {
        name: 'sparklineMetrics',
        config: {
          type: 'SelectControl',
          freeForm: true,
          multi: true,
          clearable: true,
          label: 'Metriche con sparkline (vuoto = tutte)',
          default: [],
          renderTrigger: true,
          mapStateToProps: (explore: any) => ({
            choices: metricNamesOf(explore).map(v => [v, v]),
          }),
          description:
            'Sceglie su quali metriche generare il mini-grafico sparkline; lascia vuoto per mostrarle tutte. Esempio: Richieste.',
          visibility: ({ controls }: { controls: any }) =>
            isSinglePivot({ controls }) && Boolean(controls?.showSparklines?.value),
        },
      },
    ],
  ],
};

export default aspettoSection;
