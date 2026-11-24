/**
 * Tutti i testi visibili del grafico, in italiano. Le chiavi sono stabili: per aggiungere
 * un'altra lingua basta un secondo dizionario con le stesse chiavi (vedi `index.ts`).
 * I segnaposto si scrivono `{nome}`.
 */
export const MESSAGES = {
  // Albero
  'table.label': 'Tabella gerarchica',
  'tree.expand': 'Espandi',
  'tree.collapse': 'Comprimi',
  'tree.selectNode': 'Seleziona {name} per filtrare gli altri grafici',
  'tree.filterAdd': 'Clic per filtrare la dashboard per {name} ({path})',
  'tree.filterRemove': 'Clic per rimuovere il filtro su {name} ({path})',

  // Etichette dei dati
  'label.grandTotal': 'Totale generale',
  'label.empty': '(Vuoto)',
  'label.hierarchy': 'Gerarchia',
  'label.hierarchyTree': 'Albero gerarchico',
  'label.new': 'Nuovo',
  'label.trend': 'Andamento',
  'label.trendOfMetric': 'Andamento {metric}',
  'label.others': 'Altri ({k})',

  // Celle e badge
  'cell.deltaPct': 'Variazione %: {value}',
  'cell.change': 'Variazione: {value}',
  'cell.suppressed': 'Valore nascosto per tutela della privacy (numero piccolo)',
  'cell.max': 'Valore massimo: {value}',
  'cell.min': 'Valore minimo: {value}',
  'cell.simulated': 'Simulato: {current} (Base: {base}, Scostamento: {pct})',
  'cell.goalVsTarget': '{status}: {comparison} rispetto all\'obiettivo {target}',
  'cell.ciRange': 'IC {level}%: da {lower} a {upper}',
  'cell.signalAbove': 'Significativamente sopra il riferimento. {range}',
  'cell.signalBelow': 'Significativamente sotto il riferimento. {range}',
  'total.change': 'Variazione totale: {value}',
  'total.deltaPct': 'Variazione % totale: {value}',
  'total.simulated': 'Totale simulato: {current} (Base: {base}, Scostamento: {pct})',

  // Obiettivi
  'goal.achieved': 'Raggiunto',
  'goal.onTrack': 'In linea',
  'goal.atRisk': 'A rischio',
  'goal.missed': 'Mancato',

  // Intestazioni
  'header.resize': 'Trascina per ridimensionare, doppio clic per ripristinare',
  'header.sorted': 'Ordinato in modo {direction}',
  'header.asc': 'crescente',
  'header.desc': 'decrescente',
  'header.dragMetric': 'Trascina la metrica per riordinarla',

  // Stati
  'state.noData': 'Nessun dato da mostrare per la tabella gerarchica.',
  'state.noMetrics': 'Scegli almeno una metrica nella sezione Dati per vedere i valori.',
  'state.noDimensions': 'Scegli almeno una dimensione nella sezione Dati per costruire la gerarchia.',
  'state.noSearchResults': 'Nessun nodo corrisponde alla ricerca.',
  'state.error': 'Impossibile mostrare la tabella.',
  'state.errorDetails': 'Dettagli tecnici',
  'state.configIgnored': 'Alcune impostazioni non sono valide e sono state ignorate.',

  // Barra degli strumenti
  'toolbar.searchPlaceholder': 'Cerca nella gerarchia...',
  'toolbar.searchLabel': 'Cerca nella gerarchia',
  'toolbar.clearSearch': 'Cancella la ricerca',
  'toolbar.removeFilter': 'Rimuovi il filtro {value}',
  'toolbar.clearAllFilters': 'Rimuovi tutti i filtri',
  'toolbar.clearAll': 'Rimuovi tutti ({count})',
  'toolbar.values': 'Valori:',
  'toolbar.valuesMode': 'Livelli su cui mostrare i valori',
  'toolbar.modeAll': 'Tutti i livelli',
  'toolbar.modeLeaves': 'Solo foglie',
  'toolbar.modeParents': 'Solo padri',
  'toolbar.restoreColumns': 'Ripristina colonne',
  'toolbar.restoreColumnsTitle': 'Ripristina larghezza e ordine delle colonne',
  'toolbar.exportCsv': 'Esporta CSV',
  'toolbar.exportCsvTitle': 'Scarica il CSV della gerarchia con ordine e subtotali',
  'toolbar.expandAll': 'Espandi tutto',
  'toolbar.collapseAll': 'Comprimi tutto',

  // What-If
  'whatif.toggleTitle': 'Apri o chiudi il pannello What-If',
  'whatif.title': 'Simulazione What-If',
  'whatif.active': 'Simulazione attiva ({count} metriche)',
  'whatif.reset': 'Ripristina i dati storici',
  'whatif.resetTitle': 'Annulla tutte le variazioni simulate e ripristina i dati storici',
  'whatif.exportCsv': 'Esporta CSV simulato',
  'whatif.exportCsvTitle': 'Scarica il CSV con le colonne base, simulato e variazione %',
  'whatif.metricSlider': 'Variazione percentuale di {metric}',
  'whatif.metricNumber': 'Variazione percentuale di {metric} (valore)',
  'whatif.saveScenario': 'Salva scenario',
  'whatif.saveScenarioTitle': 'Salva la configurazione corrente con un nome',
  'whatif.scenarioPlaceholder': 'Nome dello scenario (es. Ottimistico +10%)...',
  'whatif.scenarioName': 'Nome dello scenario',
  'whatif.save': 'Salva',
  'whatif.cancel': 'Annulla',
  'whatif.loadScenario': 'Carica scenario ({count})...',
  'whatif.loadScenarioTitle': 'Carica uno scenario salvato in precedenza',
  'whatif.footnote': '* Le percentuali agiscono sui record foglia e riaggregano l\'intero albero',

  // Sparkline
  'sparkline.label': 'Andamento sui periodi',
  'sparkline.range': '{metric}: da {from} a {to}',
  'metricRows.value': 'Valore',
  'metricRows.total': 'Totale',

  // Esportazione CSV
  'csv.base': '{title} (Base)',
  'csv.simulated': '{title} (Simulato)',
  'csv.delta': '{title} (Δ%)',

  // Titoli delle colonne di confronto
  'comparison.budget': 'Δ vs obiettivo',
  'comparison.samePeriodLastYear': 'Δ vs stesso periodo dell\'anno precedente',
  'comparison.ytd': 'Δ vs media YTD',
  'comparison.year': 'Δ vs anno precedente (YoY)',
  'comparison.month': 'Δ vs mese precedente (MoM)',
  'comparison.quarter': 'Δ vs trimestre precedente (QoQ)',
  'comparison.day': 'Δ vs giorno precedente (DoD)',
  'comparison.week': 'Δ vs settimana precedente (WoW)',
  'comparison.previous': 'Δ vs periodo precedente',

  // Valori predefiniti dei titoli dei totali
  'totals.rowLabel': 'Totale',
  'totals.columnSubtotalLabel': 'Totale gruppo',
} as const;

export type MessageKey = keyof typeof MESSAGES;
