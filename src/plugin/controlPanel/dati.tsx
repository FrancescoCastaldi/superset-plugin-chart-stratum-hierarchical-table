import { ControlPanelConfig, sharedControls } from '@superset-ui/chart-controls';
import { choicesFromExplore, hasPivot, isMultiDim, isParentChild, isSinglePivot, isTwoWayPivot } from './helpers';
import RowListControl from '../controls/RowListControl';
import { jsonSyntaxValidator } from '../controls/listModel';
import {
  CALCULATED_METRICS_EXAMPLE,
  CALCULATED_METRICS_FIELDS,
  calculatedMetricsNormalize,
} from '../controls/specs';

// Le metriche sulle righe valgono per la tabella piatta e per il pivot a una colonna.
const isMetricsRowsAvailable = (args: { controls: any }) => isMultiDim(args) && !isTwoWayPivot(args);
const isMetricsRowsOn = (args: { controls: any }) =>
  isMetricsRowsAvailable(args) && Boolean(args.controls?.metricsOnRows?.value);

type Section = ControlPanelConfig['controlPanelSections'][number];

const datiSection: Section = {
  label: 'Dati',
  expanded: true,
  tabOverride: 'data',
  description: 'Struttura della gerarchia, dimensioni di riga e pivot, metriche, filtri e limiti.',
  controlSetRows: [
    [
      {
        name: 'hierarchyType',
        config: {
          type: 'SelectControl',
          label: 'Modalità gerarchia',
          default: 'multi_dimension',
          clearable: false,
          choices: [
            ['multi_dimension', 'Multi-dimensione (livelli da colonne ordinate)'],
            ['parent_child', 'Padre-figlio (tabella ID / Parent ID)'],
          ],
          renderTrigger: false,
          description:
            'Sceglie se costruire l\'albero da colonne gerarchiche successive oppure da relazioni ID e Parent ID. Esempio: Regione → Provincia → Comune.',
        },
      },
    ],
    [
      {
        name: 'groupby',
        config: {
          ...sharedControls.groupby,
          label: 'Dimensioni della gerarchia (in ordine)',
          description:
            'Colonne ordinate dal livello radice alle foglie dell\'albero. Esempio: Dipartimento, Reparto, Medico.',
          visibility: isMultiDim,
        },
      },
    ],
    [
      {
        name: 'idColumn',
        config: {
          ...sharedControls.groupby,
          label: 'Colonna ID nodo',
          multi: false,
          clearable: false,
          description:
            'Identificativo univoco di ogni nodo nella gerarchia padre-figlio. Esempio: id_voce.',
          visibility: isParentChild,
        },
      },
      {
        name: 'parentIdColumn',
        config: {
          ...sharedControls.groupby,
          label: 'Colonna ID padre',
          multi: false,
          clearable: true,
          description:
            'Identificativo del nodo genitore (vuoto o NULL per le radici). Esempio: id_padre.',
          visibility: isParentChild,
        },
      },
    ],
    [
      {
        name: 'labelColumn',
        config: {
          ...sharedControls.groupby,
          label: 'Colonna etichetta nodo (opzionale)',
          multi: false,
          clearable: true,
          description:
            'Testo mostrato nell\'albero al posto del codice ID. Esempio: descrizione_voce.',
          visibility: isParentChild,
        },
      },
    ],
    [
      {
        name: 'metrics',
        config: {
          ...sharedControls.metrics,
          label: 'Metriche',
          description:
            'Misure numeriche o di durata visualizzate come colonne della tabella. Esempio: Richieste, Ricavi, Tempo medio.',
          validators: [],
        },
      },
    ],
    [
      {
        name: 'calculatedMetrics',
        config: {
          type: RowListControl as any,
          storedAs: 'json',
          fields: CALCULATED_METRICS_FIELDS,
          exampleRows: CALCULATED_METRICS_EXAMPLE,
          newRow: () => ({ type: 'formula' }),
          normalize: calculatedMetricsNormalize,
          addLabel: 'Aggiungi metrica calcolata',
          rowTitle: 'Metrica calcolata',
          emptyHint: 'Nessuna metrica calcolata: aggiungine una per calcolare un valore da altre metriche.',
          mapStateToProps: choicesFromExplore,
          validators: [jsonSyntaxValidator],
          label: 'Metriche calcolate',
          default: '',
          renderTrigger: false,
          description:
            'Aggiungi metriche calcolate con una formula tra altre metriche, ricalcolata su ogni riga della gerarchia, totali compresi. Trascina nel riquadro della formula le metriche del dataset oppure cliccale. Campi: metric (nome), formula, label (titolo), format, decimals. Esempio: margine = ([ricavi] - [costi]) / [ricavi] * 100.',
        },
      },
    ],
    [
      {
        name: 'columns',
        config: {
          ...sharedControls.groupby,
          label: 'Colonne pivot (matrice orizzontale)',
          multi: true,
          clearable: true,
          description:
            'Distribuisce le metriche in orizzontale per i valori di una o due colonne. Lascia vuoto per una tabella piatta. Esempio: Mese per avere una colonna per ogni mese, oppure Anno e Trimestre per due livelli di intestazione.',
          visibility: isMultiDim,
        },
      },
    ],
    [
      {
        name: 'metricsOnRows',
        config: {
          type: 'CheckboxControl',
          label: 'Metriche sulle righe',
          renderTrigger: true,
          default: false,
          description:
            "Mette le metriche come righe dell'albero invece che come colonne: ogni riga metrica ha i propri valori sotto la struttura. Esempio: Sede > Ambulatorio > [Ricavi, Costi], dove le colonne diventano i periodi del pivot oppure una sola colonna Valore. Non disponibile con il pivot a due colonne.",
          visibility: isMetricsRowsAvailable,
        },
      },
    ],
    [
      {
        name: 'metricsRowLevel',
        config: {
          type: 'SelectControl',
          label: 'Livello delle metriche',
          default: 'last',
          clearable: false,
          renderTrigger: true,
          choices: [
            ['last', "Dopo l'ultimo livello"],
            ['top', 'Prima del primo livello'],
            ['after_1', 'Dopo il primo livello'],
            ['after_2', 'Dopo il secondo livello'],
            ['after_3', 'Dopo il terzo livello'],
          ],
          description:
            "Dove inserire il livello delle metriche nell'albero. Esempio: Dopo l'ultimo livello dà Sede > Ambulatorio > Metrica; Prima del primo livello dà Metrica > Sede > Ambulatorio, con i valori di ogni metrica sotto la sua riga.",
          visibility: isMetricsRowsOn,
        },
      },
      {
        name: 'metricsRowSubtotals',
        config: {
          type: 'CheckboxControl',
          label: 'Metriche anche sui livelli superiori',
          renderTrigger: true,
          default: true,
          description:
            'Mostra sotto ogni nodo padre le righe metrica con il suo subtotale. Esempio: la riga Sede Roma ha Ricavi e Costi con i totali della sede prima dei suoi ambulatori.',
          visibility: isMetricsRowsOn,
        },
      },
    ],
    [
      {
        name: 'combineMetric',
        config: {
          type: 'CheckboxControl',
          label: 'Raggruppa metriche sotto ogni valore pivot',
          renderTrigger: true,
          default: true,
          description:
            'Con il pivot a una colonna sceglie se raggruppare le metriche sotto ogni periodo oppure i periodi sotto ogni metrica. Esempio: attivo mostra Gen [Richieste, Ricavi], Feb [Richieste, Ricavi]; disattivo mostra Richieste [Gen, Feb], Ricavi [Gen, Feb].',
          visibility: isSinglePivot,
        },
      },
      {
        name: 'pivotSortOrder',
        config: {
          type: 'SelectControl',
          label: 'Ordine colonne pivot',
          default: 'desc',
          clearable: false,
          renderTrigger: true,
          choices: [
            ['desc', 'Decrescente / più recente prima (es. Ott 2026 → Gen 2026)'],
            ['asc', 'Crescente / cronologico (es. Gen 2026 → Ott 2026)'],
            ['none', 'Ordine restituito dalla query'],
          ],
          description:
            'Direzione con cui disporre le intestazioni delle colonne pivot. Esempio: Crescente per leggere i trend temporali da sinistra a destra.',
          visibility: hasPivot,
        },
      },
    ],
    ['adhoc_filters'],
    ['row_limit'],
  ],
};

export default datiSection;
