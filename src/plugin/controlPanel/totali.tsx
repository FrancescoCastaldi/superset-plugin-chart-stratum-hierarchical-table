import { hasPivot, isTwoWayPivot, metricNamesOf } from './helpers';
import { ControlPanelConfig } from '@superset-ui/chart-controls';

type Section = ControlPanelConfig['controlPanelSections'][number];

const totaliSection: Section = {
  label: 'Totali',
  expanded: false,
  tabOverride: 'customize',
  description: 'Visibilità di subtotali e Grand Total, funzione di roll-up, pesi e totali di riga pivot.',
  controlSetRows: [
    [
      {
        name: 'showSubtotals',
        config: {
          type: 'CheckboxControl',
          label: 'Mostra subtotali sui nodi padri',
          renderTrigger: true,
          default: true,
          description:
            'Calcola e mostra i valori aggregati sulle righe di livello superiore dell\'albero. Disattivalo se i padri non devono mostrare cifre. Esempio: la riga Dipartimento mostra la somma dei suoi reparti.',
        },
      },
      {
        name: 'showGrandTotal',
        config: {
          type: 'CheckboxControl',
          label: 'Mostra riga Grand Total',
          renderTrigger: true,
          default: true,
          description:
            'Aggiunge la riga riepilogativa complessiva di tutta la gerarchia, in cima o in fondo secondo la posizione scelta. Esempio: una riga Grand Total con le somme di tutti i dipartimenti.',
        },
      },
    ],
    [
      {
        name: 'grandTotalPosition',
        config: {
          type: 'SelectControl',
          label: 'Posizione del Grand Total',
          default: 'top',
          clearable: false,
          renderTrigger: true,
          choices: [
            ['top', 'In cima alla tabella'],
            ['bottom', 'In fondo alla tabella'],
          ],
          description:
            'Dove collocare la riga del totale generale. Esempio: In fondo per leggere prima i dettagli e poi il totale.',
          visibility: ({ controls }: { controls: any }) =>
            controls?.showGrandTotal?.value !== false,
        },
      },
    ],
    [
      {
        name: 'aggregationMode',
        config: {
          type: 'SelectControl',
          label: 'Funzione di aggregazione (roll-up e totali di riga)',
          default: 'sum',
          clearable: false,
          renderTrigger: true,
          choices: [
            ['sum', 'Somma (cumulativa)'],
            ['avg', 'Media aritmetica dei figli'],
            ['min', 'Minimo'],
            ['max', 'Massimo'],
            ['count', 'Conteggio dei figli'],
            ['weighted_avg', 'Media ponderata (con metrica peso)'],
          ],
          description:
            'Regola con cui aggregare padri, totali generali e totali di riga pivot per metriche standard. Esempio: Media ponderata per prezzi medi o tassi.',
        },
      },
      {
        name: 'weightColumn',
        config: {
          type: 'SelectControl',
          freeForm: true,
          clearable: true,
          label: 'Metrica peso (per media ponderata)',
          default: '',
          renderTrigger: true,
          mapStateToProps: (explore: any) => ({
            choices: metricNamesOf(explore).map(v => [v, v]),
          }),
          description:
            'Metrica usata come denominatore/peso nei subtotali e totali di riga con "Media ponderata". Esempio: richieste_corr oppure qty.',
          visibility: ({ controls }: { controls: any }) =>
            controls?.aggregationMode?.value === 'weighted_avg',
        },
      },
    ],
    [
      {
        name: 'pivotRowTotalsPosition',
        config: {
          type: 'SelectControl',
          label: 'Posizione totali orizzontali di riga (pivot)',
          default: 'none',
          clearable: false,
          renderTrigger: true,
          choices: [
            ['none', 'Nessuno (nascondi totali di riga)'],
            ['left', 'A sinistra (prima delle colonne pivot)'],
            ['right', 'A destra (in fondo alla tabella)'],
          ],
          description:
            'Aggiunge una macro-colonna che aggrega tutte le colonne pivot sulla stessa riga (secondo l\'aggregazione scelta). Esempio: A destra stile Excel.',
          visibility: hasPivot,
        },
      },
      {
        name: 'pivotRowTotalsLabel',
        config: {
          type: 'TextControl',
          label: 'Etichetta totali di riga pivot',
          default: 'Totals',
          renderTrigger: true,
          description:
            'Titolo della macro-colonna dei totali orizzontali. Esempio: Totale Complessivo.',
          visibility: ({ controls }: { controls: any }) =>
            hasPivot({ controls }) &&
            controls?.pivotRowTotalsPosition?.value !== 'none',
        },
      },
    ],
    [
      {
        name: 'showPivotColumnSubtotals',
        config: {
          type: 'CheckboxControl',
          label: 'Mostra subtotali colonna pivot (2 dimensioni)',
          renderTrigger: true,
          default: true,
          description:
            'Nei pivot a due dimensioni aggiunge una colonna di subtotale alla fine di ogni gruppo del primo livello. Esempio: sotto Anno e Trimestre, dopo Q1 Q2 Q3 Q4 di ogni anno compare la colonna Totale dell\'anno.',
          visibility: isTwoWayPivot,
        },
      },
      {
        name: 'pivotColumnSubtotalLabel',
        config: {
          type: 'TextControl',
          label: 'Etichetta subtotale colonna pivot',
          default: 'Total',
          renderTrigger: true,
          description:
            'Titolo della colonna subtotale nei pivot a due dimensioni. Esempio: Totale gruppo.',
          visibility: ({ controls }: { controls: any }) =>
            isTwoWayPivot({ controls }) &&
            controls?.showPivotColumnSubtotals?.value !== false,
        },
      },
    ],
  ],
};

export default totaliSection;
