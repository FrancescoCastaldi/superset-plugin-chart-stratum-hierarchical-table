import { ControlPanelConfig } from '@superset-ui/chart-controls';

type Section = ControlPanelConfig['controlPanelSections'][number];

const interazioneSection: Section = {
  label: 'Interazione',
  expanded: false,
  tabOverride: 'customize',
  description: 'Ricerca, ordinamento interattivo, esportazione CSV, menu contestuale, cross-filter e simulazione What-If.',
  controlSetRows: [
    [
      {
        name: 'enableSearch',
        config: {
          type: 'CheckboxControl',
          label: 'Mostra barra di ricerca nell\'albero',
          renderTrigger: true,
          default: true,
          description:
            'Mostra una barra di ricerca per trovare un nodo, mantenendo visibili i suoi antenati. Esempio: digitando \'Cardiologia\' resta il ramo Dipartimento, Reparto, Cardiologia.',
        },
      },
      {
        name: 'enableHierarchicalSort',
        config: {
          type: 'CheckboxControl',
          label: 'Ordinamento cliccando le intestazioni',
          renderTrigger: true,
          default: true,
          description:
            'Abilita il clic sulle intestazioni per ordinare ogni livello dell\'albero mantenendo le righe figlie sotto il proprio padre. Esempio: clic su Richieste ordina i reparti dentro ogni dipartimento.',
        },
      },
    ],
    [
      {
        name: 'enableExport',
        config: {
          type: 'CheckboxControl',
          label: 'Abilita esportazione CSV gerarchica',
          renderTrigger: true,
          default: true,
          description:
            'Mostra il pulsante Esporta CSV per scaricare la tabella con livelli, subtotali e totali. Esempio: un file con una riga per nodo e la colonna Livello.',
        },
      },
      {
        name: 'enableContextMenu',
        config: {
          type: 'CheckboxControl',
          label: 'Abilita menu contestuale su clic destro',
          renderTrigger: true,
          default: true,
          description:
            'Con il tasto destro su una cella apre le azioni di dettaglio, copia del valore e filtro rapido. Esempio: tasto destro su Radiologia, Visualizza dettaglio.',
        },
      },
    ],
    [
      {
        name: 'emit_filter',
        config: {
          type: 'CheckboxControl',
          label: 'Emetti filtri cross-filter in dashboard',
          renderTrigger: true,
          default: true,
          description:
            'Cliccando una riga filtra gli altri grafici della dashboard collegati alla stessa dimensione. Esempio: clic su Cardiologia aggiorna i grafici dei medici di quel reparto.',
        },
      },
      {
        name: 'crossFilterAppliesToSelf',
        config: {
          type: 'CheckboxControl',
          label: 'Applica il filtro anche a questa tabella',
          renderTrigger: true,
          default: false,
          description:
            'Se attivo restringe anche questa tabella al ramo selezionato; altrimenti evidenzia soltanto la riga scelta. Esempio: attivo, dopo il clic su un dipartimento restano visibili solo i suoi reparti.',
          visibility: ({ controls }: { controls: any }) =>
            controls?.emit_filter?.value !== false,
        },
      },
    ],
    [
      {
        name: 'enableWhatIf',
        config: {
          type: 'CheckboxControl',
          label: 'Abilita barra di simulazione What-If',
          renderTrigger: true,
          default: false,
          description:
            'Mostra sopra la tabella una barra per simulare variazioni percentuali sulle metriche, con ricalcolo di subtotali, medie ponderate e rapporti. Esempio: +10% sugli accessi per vedere l\'effetto sul totale.',
        },
      },
    ],
  ],
};

export default interazioneSection;
