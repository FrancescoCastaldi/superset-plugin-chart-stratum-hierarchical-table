import {
  ControlPanelConfig,
  sharedControls,
  D3_FORMAT_OPTIONS,
} from '@superset-ui/chart-controls';
import { showDurationControl } from './timeMetricHints';
import { isValidHex } from '../utils/themes';

const subsectionHeader = (label: string) => <h4 className="section-header">{label}</h4>;
const subsectionDivider = () => <hr />;

// Explore accetta un componente React personalizzato: la lista viene modificata come JSON
// e salvata in formData come array reale; testo non valido non sovrascrive il valore salvato.
function ArrayControl({
  label,
  description,
  value,
  onChange,
}: {
  label?: string;
  description?: string;
  value?: unknown[];
  onChange?: (value: unknown[]) => void;
}) {
  return (
    <label title={description}>
      {label}
      <textarea
        rows={6}
        style={{ width: '100%' }}
        defaultValue={JSON.stringify(value ?? [], null, 2)}
        onChange={e => {
          try {
            const parsed = JSON.parse(e.target.value);
            if (Array.isArray(parsed)) onChange?.(parsed);
          } catch {
            // JSON incompleto durante la digitazione: resta salvato l'ultimo elenco valido.
          }
        }}
      />
    </label>
  );
}

const customHexControl = (name: string, label: string, exampleHex: string) => ({
  name,
  config: {
    type: 'TextControl',
    label,
    renderTrigger: true,
    default: '',
    description: `Codice esadecimale #RRGGBB o vuoto per usare il colore standard; mantenere contrasto almeno 3:1 su bianco. Esempio: ${exampleHex}.`,
    validators: [(v: string) => (!v || isValidHex(v) ? false : 'Usa il formato #RRGGBB')],
    visibility: ({ controls }: { controls: any }) => controls?.themeProfile?.value === 'custom',
  },
});

const metricNamesOf = (explore: any): string[] => {
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

const isMultiDim = ({ controls }: { controls: any }) =>
  controls?.hierarchyType?.value === 'multi_dimension';

const isParentChild = ({ controls }: { controls: any }) =>
  controls?.hierarchyType?.value === 'parent_child';

const pivotCountOf = (controls: any): number =>
  Array.isArray(controls?.columns?.value) ? controls.columns.value.length : 0;

const hasPivot = ({ controls }: { controls: any }) =>
  isMultiDim({ controls }) && pivotCountOf(controls) > 0;

const isSinglePivot = ({ controls }: { controls: any }) =>
  isMultiDim({ controls }) && pivotCountOf(controls) === 1;

const isTwoWayPivot = ({ controls }: { controls: any }) =>
  isMultiDim({ controls }) && pivotCountOf(controls) >= 2;

const isFlatLayout = ({ controls }: { controls: any }) =>
  !hasPivot({ controls });

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

const config: ControlPanelConfig = {
  controlPanelSections: [
    {
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
                'Distribuisce le metriche in orizzontale per i valori di una o due colonne (es. Mese oppure Anno e Trimestre). Lascia vuoto per una tabella piatta.',
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
                'Se attivo mostra tutte le metriche affiancate sotto ogni periodo pivot (es. Gen [A, B], Feb [A, B]); altrimenti raggruppa per metrica.',
              visibility: hasPivot,
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
    },
    {
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
                'Mostra automaticamente periodo di confronto e variazioni quando la dashboard usa il filtro Calendar (es. 2026 vs 2025).',
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
                'Calcola lo scostamento tra colonne pivot temporali (es. Feb vs Gen) senza window function SQL.',
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
                'Durata dei periodi sulle colonne pivot (YYYY, YYYY-MM, YYYY-Qn). Esempio: Mese su colonne 2026-01, 2026-02.',
              visibility: isSinglePivot,
            },
          },
          {
            name: 'comparisonType',
            config: {
              type: 'SelectControl',
              label: 'Strategia base di confronto',
              default: 'prev_period',
              clearable: false,
              renderTrigger: true,
              choices: [
                ['prev_period', 'Periodo immediatamente precedente'],
                ['prev_year_same_period', 'Stesso periodo dell\'anno precedente'],
                ['budget_target', 'Budget / obiettivo pianificato'],
              ],
              description:
                'Base usata per calcolare la variazione di fine serie nel pivot singolo. Esempio: Stesso periodo anno precedente per YoY.',
              visibility: isSinglePivot,
            },
          },
        ],
        [
          {
            name: 'referencePeriod',
            config: {
              type: 'SelectControl',
              label: 'Periodo di riferimento della strategia',
              default: 'current',
              clearable: false,
              renderTrigger: true,
              choices: [
                ['current', 'Periodo attivo corrente'],
                ['previous', 'Periodo completo precedente'],
                ['ytd', 'Media progressiva anno (YTD)'],
              ],
              description:
                'Baseline dell\'ultimo periodo rispetto a se stesso, al periodo chiuso precedente o alla media YTD. Esempio: Periodo completo precedente.',
              visibility: (state: { controls: any }) =>
                isSinglePivot(state) &&
                (state.controls?.comparisonType?.value ?? 'prev_period') === 'prev_period',
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
              label: 'Abilita badge / delta di varianza',
              renderTrigger: true,
              default: false,
              description:
                'Calcola delta percentuale cronologico su tabella piatta o tra periodi pivot (salvo precedenza del filtro Calendar). Esempio: +14,2% accanto al valore.',
              visibility: ({ controls }: { controls: any }) =>
                isMultiDim({ controls }) && !isTwoWayPivot({ controls }),
            },
          },
          {
            name: 'showVarianceBadges',
            config: {
              type: 'CheckboxControl',
              label: 'Mostra badge delta % nei valori',
              renderTrigger: true,
              default: true,
              description:
                'Disegna la pillola colorata con la variazione % dentro le celle numeriche invece della sola colonna separata.',
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
                'Aggiunge l\'arco temporale della query tra parentesi accanto al titolo della metrica (es. Richieste (set - ott 2026)).',
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
                'Ricava i periodi di riferimento e confronto direttamente dalle colonne configurate sotto (es. da viste filtro dashboard).',
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
    },
    {
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
    },
    {
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
                'Calcola e mostra i valori aggregati sulle righe di livello superiore dell\'albero (es. totale per Dipartimento).',
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
                'Aggiunge la riga riepilogativa complessiva di tutta la gerarchia in cima alla tabella.',
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
                'Nei pivot a due dimensioni aggiunge la colonna di subtotale alla fine di ogni gruppo del primo livello.',
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
    },
    {
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
                'Riduce l\'altezza e il padding delle righe per mostrare più dati nello schermo.',
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
                'Alterna una leggera ombreggiatura di sfondo tra una riga e la successiva per facilitare la lettura.',
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
                'Mantiene visibili i titoli delle colonne in cima alla tabella quando si scorre verso il basso.',
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
                'Permette ai nomi lunghi di andare a capo su più righe invece di troncarli con i puntini.',
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
                'Permette di trascinare il bordo destro delle intestazioni per allargare o stringere le colonne.',
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
                'Consente di spostare le colonne trascinando l\'intestazione in modalità tabella piatta (non pivot).',
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
                'Direzione dell\'ordinamento applicato all\'apertura del grafico.',
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
              visibility: ({ controls }: { controls: any }) =>
                controls?.enableHierarchicalSort?.value !== false ||
                (controls?.defaultSortOrder?.value && controls.defaultSortOrder.value !== 'none'),
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
                'Determina quali righe partecipano al calcolo della scala min/max; "Solo nodi foglia" evita che i subtotali falsino i colori.',
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
              type: ArrayControl as any,
              label: 'Regole di formattazione condizionale',
              default: [],
              renderTrigger: true,
              description:
                'Elenco JSON di soglie personalizzate per colorare o aggiungere icone a celle e righe. Esempio: [{"metric":"attesa","operator":">","targetValue":30,"bgHex":"#fee2e2"}].',
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
                ['custom', 'Colori personalizzati (#RRGGBB)'],
              ],
              description:
                'Palette cromatica usata per badge min/max, heatmap e data bar. Esempio: Adatto ai daltonici.',
            },
          },
        ],
        [
          customHexControl('customPositiveHex', 'Colore positivo / MAX', '#059669'),
          customHexControl('customNegativeHex', 'Colore negativo / MIN', '#dc2626'),
        ],
        [customHexControl('customNeutralHex', 'Colore neutro / data bar', '#0284c7')],
        [
          {
            name: 'showSparklines',
            config: {
              type: 'CheckboxControl',
              label: 'Mostra mini-grafici sparkline (pivot singolo)',
              default: false,
              renderTrigger: true,
              description:
                'Aggiunge una colonna Trend con l\'andamento temporale di ciascuna riga lungo le colonne pivot.',
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
    },
    {
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
                'Consente all\'utente finale di cercare rapidamente un nodo mantenendo visibili i suoi antenati.',
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
                'Abilita il clic sulle intestazioni di colonna per ordinare ogni livello dell\'albero in modo gerarchico.',
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
                'Mostra il pulsante Export CSV per scaricare la tabella completa di livelli, subtotali e totali.',
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
                'Al tasto destro su una cella apre le azioni di drill-to-detail, copia valore e filtro rapido.',
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
                'Cliccando una riga gerarchica filtra tutti gli altri grafici della dashboard collegati alla stessa dimensione.',
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
                'Se attivo restringe i nodi della tabella stessa al ramo selezionato; altrimenti evidenzia solo la riga selezionata.',
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
                'Mostra una barra interattiva sopra la tabella per simulare variazioni percentuali sulle metriche (es. +10% accessi) con ricalcolo di subtotali, medie ponderate e rapporti.',
            },
          },
        ],
      ],
    },
    {
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
              type: 'TextAreaControl',
              language: 'json',
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
              type: 'TextAreaControl',
              language: 'json',
              label: 'Calcoli tabellari e colonne derivate',
              default: '',
              renderTrigger: true,
              description:
                'Array JSON per aggiungere colonne calcolate lato client (% sul totale, % sul padre, ranking, delta dal totale). Esempio: [{"type":"pct_of_total","metric":"ricavi"}].',
            },
          },
        ],
        [
          {
            name: 'goals',
            config: {
              type: 'TextAreaControl',
              language: 'json',
              label: 'Obiettivi e target per metrica',
              default: '',
              renderTrigger: true,
              description:
                'Array JSON di target per ciascuna metrica per mostrare scostamento dall\'obiettivo e badge raggiunto/non raggiunto. Esempio: [{"metric":"accessi","target":1000}].',
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
                'Sostituisce con un segnaposto i valori strettamente positivi minori della soglia per tutela privacy (es. 5 oscura da 1 a 4).',
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
                'Oscura automaticamente la seconda cella più piccola di uno stesso gruppo se solo un figlio era oscurato (impedisce di ricavarlo per differenza dal totale).',
              visibility: ({ controls }: { controls: any }) =>
                Number(controls?.suppressionThreshold?.value) > 0,
            },
          },
        ],
        [subsectionDivider()],
        [subsectionHeader('Prestazioni, virtualizzazione e limiti Top N')],
        [
          {
            name: 'pageSize',
            config: {
              type: 'SliderControl',
              label: 'Dimensione finestra (righe visibili)',
              default: 100,
              min: 50,
              max: 2000,
              step: 50,
              renderTrigger: true,
              description:
                'Numero massimo di righe rese contemporaneamente nel DOM quando la virtualizzazione è attiva. Esempio: 100.',
            },
          },
          {
            name: 'virtualizationThreshold',
            config: {
              type: 'TextControl',
              isInt: true,
              label: 'Attiva virtualizzazione oltre N righe',
              default: 500,
              renderTrigger: true,
              description:
                'Soglia di righe visibili oltre cui la tabella usa lo scrolling virtuale per restare fluida. Esempio: 500.',
            },
          },
        ],
        [
          {
            name: 'dimensionLimits',
            config: {
              type: 'TextAreaControl',
              language: 'json',
              label: 'Limiti Top N per dimensione (opzionale)',
              default: '',
              renderTrigger: true,
              description:
                'Array JSON per mostrare solo i primi N elementi per livello gerarchico raggruppando il resto in "Altro". Esempio: [{"dimension":"reparto","limit":10}].',
            },
          },
        ],
      ],
    },
  ],
};

export default config;
