import { ControlPanelConfig, sharedControls } from '@superset-ui/chart-controls';
import { hasPivot, isMultiDim, isParentChild, isSinglePivot } from './helpers';

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
