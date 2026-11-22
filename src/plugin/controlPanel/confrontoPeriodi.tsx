import { endOfSeriesBaselineSeed } from '../legacyMigration';
import {
  isMultiDim,
  isSinglePivot,
  isTwoWayPivot,
  subsectionDivider,
  subsectionHeader,
} from './helpers';
import { ControlPanelConfig } from '@superset-ui/chart-controls';

type Section = ControlPanelConfig['controlPanelSections'][number];

const confrontoPeriodiSection: Section = {
  label: 'Confronto tra periodi',
  expanded: false,
  tabOverride: 'data',
  description: 'Confronto con Calendar Filter, delta tra colonne pivot, badge di varianza e titoli periodo.',
  controlSetRows: [
    [subsectionHeader('Confronto con filtro Calendar')],
    [
      {
        name: 'show_calendar_comparison',
        config: {
          type: 'CheckboxControl',
          label: 'Attiva confronto del filtro Calendar',
          description:
            'Quando la dashboard usa il filtro Calendar con un periodo di confronto, mostra accanto ai valori il periodo di confronto e le variazioni. Esempio: con il filtro su 2026 e confronto 2025 compare ogni cella anche per il 2025.',
          default: true,
          renderTrigger: true,
          visibility: isMultiDim,
        },
      },
    ],
    [
      {
        name: 'calendar_comparison_mode',
        config: {
          type: 'SelectControl',
          label: 'Layout del confronto Calendar',
          default: 'paired',
          clearable: false,
          renderTrigger: true,
          choices: [
            ['paired', 'Coppia per ogni cella (corrente | confronto | delta)'],
            ['row_total', 'Solo delta del totale di riga (pivot singolo)'],
          ],
          description:
            'Coppia: mostra il confronto accanto a ogni valore o colonna pivot. Totale di riga: aggiunge una sola colonna delta sul totale orizzontale. Esempio: Coppia per confrontare ogni reparto.',
          visibility: ({ controls }: { controls: any }) =>
            isMultiDim({ controls }) &&
            controls?.show_calendar_comparison?.value !== false,
        },
      },
      {
        name: 'calendar_comparison_label',
        config: {
          type: 'TextControl',
          label: 'Titolo colonne di confronto',
          default: '{periodo}',
          renderTrigger: true,
          description:
            'Intestazione delle colonne T2; {periodo} inserisce il periodo effettivo del filtro Calendar. Esempio: Anno precedente ({periodo}).',
          visibility: ({ controls }: { controls: any }) =>
            isMultiDim({ controls }) &&
            controls?.show_calendar_comparison?.value !== false,
        },
      },
    ],
    [
      {
        name: 'calendar_comparison_formats',
        config: {
          type: 'SelectControl',
          label: 'Formati di delta da mostrare',
          default: ['pct'],
          multi: true,
          clearable: true,
          renderTrigger: true,
          choices: [
            ['abs', 'Delta assoluto (corrente - confronto)'],
            ['pct', 'Delta percentuale ((corrente - confronto) / confronto)'],
            ['pp', 'Punti percentuali (per tassi già espressi in %)'],
            ['ratio', 'Rapporto (corrente / confronto, es. 1,12x)'],
          ],
          description:
            'Colonne delta generate accanto al valore di confronto; lascia vuoto per mostrare solo i due periodi. Esempio: Delta percentuale.',
          visibility: ({ controls }: { controls: any }) =>
            isMultiDim({ controls }) &&
            controls?.show_calendar_comparison?.value !== false &&
            controls?.calendar_comparison_mode?.value !== 'row_total',
        },
      },
    ],
    [subsectionDivider()],
    [subsectionHeader('Variazione automatica tra colonne pivot (pivot singolo)')],
    [
      {
        name: 'pivotTimeDeltaMode',
        config: {
          type: 'SelectControl',
          label: 'Variazione tra colonne pivot',
          default: 'none',
          clearable: false,
          renderTrigger: true,
          choices: [
            ['none', 'Nessuna variazione tra colonne pivot'],
            ['absolute', 'Variazione assoluta (valore - precedente)'],
            ['percentage', 'Variazione percentuale (delta %)'],
            ['both', 'Entrambe (delta assoluto e delta %)'],
          ],
          description:
            'Calcola lo scostamento tra colonne pivot temporali senza window function SQL. Esempio: con Gen e Feb su colonne, Variazione percentuale aggiunge la colonna Feb su Gen in percentuale.',
          visibility: isSinglePivot,
        },
      },
      {
        name: 'pivotTimeDeltaLag',
        config: {
          type: 'SelectControl',
          label: 'Passo di confronto (periodi indietro)',
          default: 1,
          clearable: false,
          renderTrigger: true,
          choices: [
            [1, '1 periodo (mese o anno precedente)'],
            [2, '2 periodi indietro'],
            [3, '3 periodi (trimestre precedente)'],
            [12, '12 periodi (stesso mese anno precedente)'],
          ],
          description:
            'Numero di colonne pivot indietro da usare come base del confronto. Esempio: 1 per MoM o 12 per YoY su serie mensili.',
          visibility: ({ controls }: { controls: any }) =>
            isSinglePivot({ controls }) &&
            controls?.pivotTimeDeltaMode?.value !== 'none',
        },
      },
    ],
    [
      {
        name: 'endOfSeriesBaseline',
        config: {
          type: 'SelectControl',
          label: 'Confronto di fine serie (ultimo periodo)',
          default: 'none',
          clearable: false,
          renderTrigger: true,
          choices: [
            ['none', 'Nessuno (nessuna colonna di confronto)'],
            ['previous_period', 'Periodo completo precedente'],
            ['ytd_average', 'Media progressiva dell\'anno (YTD)'],
            ['same_period_last_year', 'Stesso periodo dell\'anno precedente'],
            ['budget_target', 'Obiettivo (usa il campo Obiettivi, in Avanzate)'],
          ],
          // Parte dai controlli delle versioni precedenti (comparisonType e referencePeriod).
          initialValue: endOfSeriesBaselineSeed,
          description:
            'Aggiunge, dopo le colonne pivot, la variazione dell\'ultimo periodo rispetto alla base scelta. Esempio: Stesso periodo dell\'anno precedente per un confronto annuale su serie mensili.',
          visibility: isSinglePivot,
        },
      },
      {
        name: 'timeGrain',
        config: {
          type: 'SelectControl',
          label: 'Granularità temporale del pivot',
          default: 'year',
          clearable: false,
          renderTrigger: true,
          choices: [
            ['auto', 'Automatica (rileva dai dati)'],
            ['day', 'Giorno (DoD)'],
            ['week', 'Settimana (WoW)'],
            ['month', 'Mese (MoM)'],
            ['quarter', 'Trimestre (QoQ)'],
            ['year', 'Anno (YoY)'],
          ],
          description:
            'Durata dei periodi sulle colonne pivot (YYYY, YYYY-MM, YYYY-Qn), necessaria per trovare il periodo precedente. Esempio: Mese su colonne 2026-01, 2026-02.',
          visibility: ({ controls }: { controls: any }) =>
            isSinglePivot({ controls }) &&
            (controls?.endOfSeriesBaseline?.value ?? 'none') !== 'none',
        },
      },
    ],
    [subsectionDivider()],
    [subsectionHeader('Badge di varianza e titoli dinamici dei periodi')],
    [
      {
        name: 'showVarianceDelta',
        config: {
          type: 'CheckboxControl',
          label: 'Variazione % tra periodi consecutivi',
          renderTrigger: true,
          default: false,
          description:
            'Calcola la variazione percentuale tra periodi consecutivi: tra righe cronologiche nella tabella piatta, tra colonne pivot nel pivot singolo (salvo precedenza del confronto del filtro Calendar). Esempio: +14,2% accanto al valore.',
          visibility: ({ controls }: { controls: any }) =>
            isMultiDim({ controls }) && !isTwoWayPivot({ controls }),
        },
      },
      {
        name: 'showVarianceBadges',
        config: {
          type: 'CheckboxControl',
          label: 'Mostra la variazione come badge nelle celle',
          renderTrigger: true,
          default: true,
          description:
            'Disegna la variazione come pillola colorata dentro la cella invece che solo in una colonna separata. Esempio: accanto a 1.250 compare un badge +14,2% verde.',
          visibility: ({ controls }: { controls: any }) =>
            isMultiDim({ controls }) &&
            !isTwoWayPivot({ controls }) &&
            Boolean(controls?.showVarianceDelta?.value),
        },
      },
    ],
    [
      {
        name: 'showPeriodInMetricLabel',
        config: {
          type: 'CheckboxControl',
          label: 'Mostra intervallo periodo nel nome metrica',
          renderTrigger: true,
          default: false,
          description:
            'Aggiunge l\'arco temporale della query accanto al titolo della metrica, utile quando la dashboard cambia periodo. Esempio: Richieste (set - ott 2026).',
        },
      },
      {
        name: 'periodLabelsFromFilters',
        config: {
          type: 'CheckboxControl',
          label: 'Leggi anno e mese da colonne dei filtri',
          renderTrigger: true,
          default: false,
          description:
            'Ricava i periodi di riferimento e confronto dalle colonne del dataset indicate sotto, quando i periodi arrivano da una vista filtro della dashboard. Esempio: ANNO_CORRENTE = 2026 e ANNO_CONFRONTO = 2025 danno i titoli 2026 e 2025.',
        },
      },
    ],
    [
      {
        name: 'periodReferenceYearColumn',
        config: {
          type: 'TextControl',
          label: 'Colonna anno corrente (T1)',
          renderTrigger: true,
          default: 'ANNO_CORRENTE',
          description:
            'Colonna del dataset contenente l\'anno del periodo di riferimento. Esempio: ANNO_CORRENTE.',
          visibility: ({ controls }: { controls: any }) =>
            Boolean(controls?.periodLabelsFromFilters?.value),
        },
      },
      {
        name: 'periodReferenceMonthColumn',
        config: {
          type: 'TextControl',
          label: 'Colonna mese corrente (T1)',
          renderTrigger: true,
          default: 'MESE_CORRENTE',
          description:
            'Colonna del dataset contenente il mese del periodo di riferimento. Esempio: MESE_CORRENTE.',
          visibility: ({ controls }: { controls: any }) =>
            Boolean(controls?.periodLabelsFromFilters?.value),
        },
      },
    ],
    [
      {
        name: 'periodComparisonYearColumn',
        config: {
          type: 'TextControl',
          label: 'Colonna anno confronto (T2)',
          renderTrigger: true,
          default: 'ANNO_CONFRONTO',
          description:
            'Colonna del dataset contenente l\'anno di confronto. Esempio: ANNO_CONFRONTO.',
          visibility: ({ controls }: { controls: any }) =>
            Boolean(controls?.periodLabelsFromFilters?.value),
        },
      },
      {
        name: 'periodComparisonMonthColumn',
        config: {
          type: 'TextControl',
          label: 'Colonna mese confronto (T2)',
          renderTrigger: true,
          default: 'MESE_CONFRONTO',
          description:
            'Colonna del dataset contenente il mese di confronto. Esempio: MESE_CONFRONTO.',
          visibility: ({ controls }: { controls: any }) =>
            Boolean(controls?.periodLabelsFromFilters?.value),
        },
      },
    ],
  ],
};

export default confrontoPeriodiSection;
