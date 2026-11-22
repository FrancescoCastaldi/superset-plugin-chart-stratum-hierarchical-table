# Riferimento dei controlli del pannello Explore

Elenco di tutti i controlli di StratumTree, in ordine di comparsa. Il file è generato dalla
configurazione del pannello: non va modificato a mano. Per aggiornarlo si usa `npm run docs`.

## Dati

Struttura della gerarchia, dimensioni di riga e pivot, metriche, filtri e limiti.

| Controllo | Etichetta | Tipo | Predefinito | Descrizione |
| --- | --- | --- | --- | --- |
| `hierarchyType` | Modalità gerarchia | SelectControl | multi_dimension | Sceglie se costruire l'albero da colonne gerarchiche successive oppure da relazioni ID e Parent ID. Esempio: Regione → Provincia → Comune. |
| `groupby` | Dimensioni della gerarchia (in ordine) | SelectControl | [] | Colonne ordinate dal livello radice alle foglie dell'albero. Esempio: Dipartimento, Reparto, Medico. |
| `idColumn` | Colonna ID nodo | SelectControl | [] | Identificativo univoco di ogni nodo nella gerarchia padre-figlio. Esempio: id_voce. |
| `parentIdColumn` | Colonna ID padre | SelectControl | [] | Identificativo del nodo genitore (vuoto o NULL per le radici). Esempio: id_padre. |
| `labelColumn` | Colonna etichetta nodo (opzionale) | SelectControl | [] | Testo mostrato nell'albero al posto del codice ID. Esempio: descrizione_voce. |
| `metrics` | Metriche | MetricsControl | [] | Misure numeriche o di durata visualizzate come colonne della tabella. Esempio: Richieste, Ricavi, Tempo medio. |
| `columns` | Colonne pivot (matrice orizzontale) | SelectControl | [] | Distribuisce le metriche in orizzontale per i valori di una o due colonne. Lascia vuoto per una tabella piatta. Esempio: Mese per avere una colonna per ogni mese, oppure Anno e Trimestre per due livelli di intestazione. |
| `combineMetric` | Raggruppa metriche sotto ogni valore pivot | CheckboxControl | true | Con il pivot a una colonna sceglie se raggruppare le metriche sotto ogni periodo oppure i periodi sotto ogni metrica. Esempio: attivo mostra Gen [Richieste, Ricavi], Feb [Richieste, Ricavi]; disattivo mostra Richieste [Gen, Feb], Ricavi [Gen, Feb]. |
| `pivotSortOrder` | Ordine colonne pivot | SelectControl | desc | Direzione con cui disporre le intestazioni delle colonne pivot. Esempio: Crescente per leggere i trend temporali da sinistra a destra. |

## Confronto tra periodi

Confronto con Calendar Filter, delta tra colonne pivot, badge di varianza e titoli periodo.

| Controllo | Etichetta | Tipo | Predefinito | Descrizione |
| --- | --- | --- | --- | --- |
| `show_calendar_comparison` | Attiva confronto del filtro Calendar | CheckboxControl | true | Quando la dashboard usa il filtro Calendar con un periodo di confronto, mostra accanto ai valori il periodo di confronto e le variazioni. Esempio: con il filtro su 2026 e confronto 2025 compare ogni cella anche per il 2025. |
| `calendar_comparison_mode` | Layout del confronto Calendar | SelectControl | paired | Coppia: mostra il confronto accanto a ogni valore o colonna pivot. Totale di riga: aggiunge una sola colonna delta sul totale orizzontale. Esempio: Coppia per confrontare ogni reparto. |
| `calendar_comparison_label` | Titolo colonne di confronto | TextControl | {periodo} | Intestazione delle colonne T2; {periodo} inserisce il periodo effettivo del filtro Calendar. Esempio: Anno precedente ({periodo}). |
| `calendar_comparison_formats` | Formati di delta da mostrare | SelectControl | ["pct"] | Colonne delta generate accanto al valore di confronto; lascia vuoto per mostrare solo i due periodi. Esempio: Delta percentuale. |
| `pivotTimeDeltaMode` | Variazione tra colonne pivot | SelectControl | none | Calcola lo scostamento tra colonne pivot temporali senza window function SQL. Esempio: con Gen e Feb su colonne, Variazione percentuale aggiunge la colonna Feb su Gen in percentuale. |
| `pivotTimeDeltaLag` | Passo di confronto (periodi indietro) | SelectControl | 1 | Numero di colonne pivot indietro da usare come base del confronto. Esempio: 1 per MoM o 12 per YoY su serie mensili. |
| `endOfSeriesBaseline` | Confronto di fine serie (ultimo periodo) | SelectControl | none | Aggiunge, dopo le colonne pivot, la variazione dell'ultimo periodo rispetto alla base scelta. Esempio: Stesso periodo dell'anno precedente per un confronto annuale su serie mensili. |
| `timeGrain` | Granularità temporale del pivot | SelectControl | year | Durata dei periodi sulle colonne pivot (YYYY, YYYY-MM, YYYY-Qn), necessaria per trovare il periodo precedente. Esempio: Mese su colonne 2026-01, 2026-02. |
| `showVarianceDelta` | Variazione % tra periodi consecutivi | CheckboxControl | false | Calcola la variazione percentuale tra periodi consecutivi: tra righe cronologiche nella tabella piatta, tra colonne pivot nel pivot singolo (salvo precedenza del confronto del filtro Calendar). Esempio: +14,2% accanto al valore. |
| `showVarianceBadges` | Mostra la variazione come badge nelle celle | CheckboxControl | true | Disegna la variazione come pillola colorata dentro la cella invece che solo in una colonna separata. Esempio: accanto a 1.250 compare un badge +14,2% verde. |
| `showPeriodInMetricLabel` | Mostra intervallo periodo nel nome metrica | CheckboxControl | false | Aggiunge l'arco temporale della query accanto al titolo della metrica, utile quando la dashboard cambia periodo. Esempio: Richieste (set - ott 2026). |
| `periodLabelsFromFilters` | Leggi anno e mese da colonne dei filtri | CheckboxControl | false | Ricava i periodi di riferimento e confronto dalle colonne del dataset indicate sotto, quando i periodi arrivano da una vista filtro della dashboard. Esempio: ANNO_CORRENTE = 2026 e ANNO_CONFRONTO = 2025 danno i titoli 2026 e 2025. |
| `periodReferenceYearColumn` | Colonna anno corrente (T1) | TextControl | ANNO_CORRENTE | Colonna del dataset contenente l'anno del periodo di riferimento. Esempio: ANNO_CORRENTE. |
| `periodReferenceMonthColumn` | Colonna mese corrente (T1) | TextControl | MESE_CORRENTE | Colonna del dataset contenente il mese del periodo di riferimento. Esempio: MESE_CORRENTE. |
| `periodComparisonYearColumn` | Colonna anno confronto (T2) | TextControl | ANNO_CONFRONTO | Colonna del dataset contenente l'anno di confronto. Esempio: ANNO_CONFRONTO. |
| `periodComparisonMonthColumn` | Colonna mese confronto (T2) | TextControl | MESE_CONFRONTO | Colonna del dataset contenente il mese di confronto. Esempio: MESE_CONFRONTO. |

## Formato dei valori

Formato numerico D3, simbolo valuta, gestione automatica e formato delle durate Time.

| Controllo | Etichetta | Tipo | Predefinito | Descrizione |
| --- | --- | --- | --- | --- |
| `numberFormat` | Formato dei numeri | SelectControl | SMART_NUMBER | Stringa di formattazione D3 per le metriche numeriche. Esempi: SMART_NUMBER, ,.0f, .1%, ~s. |
| `currencySymbol` | Simbolo valuta (prefisso) | TextControl | (vuoto) | Prefisso aggiunto ai valori numerici formattati (lascia vuoto per nessun simbolo). Esempio: €. |
| `timeDetection` | Metriche Time e durate | SelectControl | auto | Converte valori hh:mm:ss in secondi per calcolare correttamente medie, differenze e formattazioni. Esempio: Automatico per tempi d'attesa. |
| `timeRollup` | Roll-up durate su padri e totali | SelectControl | mean | Come combinare le durate Time nei subtotali gerarchici e nel totale generale. Esempio: Media evita di sommare ore d'attesa tra reparti. |
| `timeDisplayFormat` | Formato delle durate | SelectControl | auto | Come scrivere i campi Time in celle, totali e tooltip. Esempio: "1:05:30" oppure "65,5 min". |
| `timeFractionDigits` | Decimali delle durate | SelectControl | 0 | Cifre decimali mostrate sui secondi (formati orologio) o sui formati decimali. Esempio: 0 scrive 12:54, 2 scrive 12:54.43. |

## Totali

Visibilità di subtotali e Grand Total, funzione di roll-up, pesi e totali di riga pivot.

| Controllo | Etichetta | Tipo | Predefinito | Descrizione |
| --- | --- | --- | --- | --- |
| `showSubtotals` | Mostra subtotali sui nodi padri | CheckboxControl | true | Calcola e mostra i valori aggregati sulle righe di livello superiore dell'albero. Disattivalo se i padri non devono mostrare cifre. Esempio: la riga Dipartimento mostra la somma dei suoi reparti. |
| `showGrandTotal` | Mostra riga Grand Total | CheckboxControl | true | Aggiunge la riga riepilogativa complessiva di tutta la gerarchia, in cima o in fondo secondo la posizione scelta. Esempio: una riga Grand Total con le somme di tutti i dipartimenti. |
| `grandTotalPosition` | Posizione del Grand Total | SelectControl | top | Dove collocare la riga del totale generale. Esempio: In fondo per leggere prima i dettagli e poi il totale. |
| `aggregationMode` | Funzione di aggregazione (roll-up e totali di riga) | SelectControl | sum | Regola con cui aggregare padri, totali generali e totali di riga pivot per metriche standard. Esempio: Media ponderata per prezzi medi o tassi. |
| `weightColumn` | Metrica peso (per media ponderata) | SelectControl | (vuoto) | Metrica usata come denominatore/peso nei subtotali e totali di riga con "Media ponderata". Esempio: richieste_corr oppure qty. |
| `pivotRowTotalsPosition` | Posizione totali orizzontali di riga (pivot) | SelectControl | none | Aggiunge una macro-colonna che aggrega tutte le colonne pivot sulla stessa riga (secondo l'aggregazione scelta). Esempio: A destra stile Excel. |
| `pivotRowTotalsLabel` | Etichetta totali di riga pivot | TextControl | Totale | Titolo della macro-colonna dei totali orizzontali. Esempio: Totale Complessivo. |
| `showPivotColumnSubtotals` | Mostra subtotali colonna pivot (2 dimensioni) | CheckboxControl | true | Nei pivot a due dimensioni aggiunge una colonna di subtotale alla fine di ogni gruppo del primo livello. Esempio: sotto Anno e Trimestre, dopo Q1 Q2 Q3 Q4 di ogni anno compare la colonna Totale dell'anno. |
| `pivotColumnSubtotalLabel` | Etichetta subtotale colonna pivot | TextControl | Totale gruppo | Titolo della colonna subtotale nei pivot a due dimensioni. Esempio: Totale gruppo. |

## Aspetto

Espansione iniziale, stile righe e colonne, ordinamento, evidenziazioni min/max, tema e sparkline.

| Controllo | Etichetta | Tipo | Predefinito | Descrizione |
| --- | --- | --- | --- | --- |
| `initialExpandDepth` | Livelli espansi all'apertura | SelectControl | 1 | Profondità iniziale dell'albero al caricamento della tabella. Esempio: Livello 1. |
| `valueDisplayMode` | Livelli su cui mostrare i valori | SelectControl | all | Decide su quali livelli della gerarchia mostrare le cifre nelle celle. Esempio: Solo foglie per evitare doppie letture su rapporti non sommabili. |
| `compactMode` | Modalità compatta (spaziatura ridotta) | CheckboxControl | false | Riduce altezza e spaziatura delle righe per mostrare più dati nello schermo; utile su tabelle lunghe. Esempio: circa il 30% di righe in più visibili nella stessa card. |
| `stripedRows` | Righe alternate zebrate | CheckboxControl | true | Alterna una leggera ombreggiatura di sfondo tra una riga e la successiva per facilitare la lettura lungo la riga. Esempio: righe dispari bianche e pari grigio chiaro. |
| `stickyHeader` | Intestazione fissa allo scorrimento | CheckboxControl | true | Mantiene visibili i titoli delle colonne in cima alla tabella quando si scorre verso il basso. Esempio: scorrendo 200 righe si leggono sempre i nomi delle metriche. |
| `wrapHeaderLabels` | A capo automatico su intestazioni lunghe | CheckboxControl | false | Permette ai titoli lunghi delle colonne di andare a capo invece di essere troncati con i puntini. Esempio: 'Tempo medio di attesa' su due righe. |
| `resizableColumns` | Colonne ridimensionabili manualmente | CheckboxControl | false | Permette di trascinare il bordo destro delle intestazioni per allargare o stringere le colonne; il doppio clic ripristina la larghezza. Esempio: allarga la colonna dei nomi per leggere etichette lunghe. |
| `reorderColumnsByDrag` | Riordino colonne con trascinamento (tabella piatta) | CheckboxControl | false | Consente di spostare le colonne trascinando l'intestazione, solo nella tabella piatta (senza pivot). Esempio: porta Ricavi accanto a Richieste. |
| `defaultSortColumn` | Colonna di ordinamento iniziale | SelectControl | __hierarchy_tree__ | Colonna strutturale o metrica usata per ordinare l'albero al caricamento. Esempio: Richieste o Categoria gerarchia. |
| `defaultSortOrder` | Direzione ordinamento iniziale | SelectControl | none | Direzione dell'ordinamento applicato all'apertura del grafico. Esempio: Decrescente con la colonna Richieste per vedere prima i reparti più carichi. |
| `nullHandling` | Posizione dei valori vuoti in ordinamento | SelectControl | bottom | Dove collocare i nodi senza valore quando si ordina una metrica. Esempio: Sempre in fondo. |
| `minMaxDisplayMode` | Evidenziazione visiva min/max nelle celle | SelectControl | none | Evidenzia i valori minimi e massimi o l'intensità relativa in ogni colonna numerica. Esempio: Barre orizzontali per confrontare volumi. |
| `minMaxScope` | Ambito di calcolo min/max | SelectControl | leaves_only | Decide quali righe partecipano al calcolo della scala min/max. Esempio: Solo nodi foglia evita che i subtotali, molto più grandi, falsino i colori. |
| `heatmapPalette` | Palette heatmap divergente | SelectControl | red_white_green | Scala continua a 3 colori per la modalità "Heatmap divergente". Esempio: Blu - Bianco - Rosso. |
| `divergingMidpoint` | Punto centrale divergente (opzionale) | TextControl | (vuoto) | Valore numerico associato al colore neutro; se vuoto usa 0 (se presenti negativi e positivi) o la media tra min e max. Esempio: 0. |
| `conditionalFormatting` | Regole di formattazione condizionale | RowListControl | [] | Regole per colorare o aggiungere icone a celle, righe o colonne quando un valore supera una soglia. Aggiungi una regola con il pulsante qui sotto. Operatori: >, >=, <, <=, ==, between, regex. Esempio: [{"metric":"attesa","operator":">","targetValue":30,"backgroundColor":"#fee2e2"}]. |
| `themeProfile` | Tema colori | SelectControl | standard | Palette cromatica usata per badge min/max, heatmap e data bar. Esempio: Adatto ai daltonici. |
| `customPositiveHex` | Colore positivo / MAX | ColorPickerControl |  | Colore personalizzato; se non lo imposti vale quello standard. Mantieni un contrasto di almeno 3:1 su sfondo bianco. Esempio: #059669. |
| `customNegativeHex` | Colore negativo / MIN | ColorPickerControl |  | Colore personalizzato; se non lo imposti vale quello standard. Mantieni un contrasto di almeno 3:1 su sfondo bianco. Esempio: #dc2626. |
| `customNeutralHex` | Colore neutro / data bar | ColorPickerControl |  | Colore personalizzato; se non lo imposti vale quello standard. Mantieni un contrasto di almeno 3:1 su sfondo bianco. Esempio: #0284c7. |
| `showSparklines` | Mostra mini-grafici sparkline (pivot singolo) | CheckboxControl | false | Aggiunge una colonna Trend con il mini-grafico dell'andamento di ciascuna riga lungo le colonne pivot. Esempio: con i mesi su colonne, una piccola linea mostra la tendenza di ogni reparto. |
| `sparklineMetrics` | Metriche con sparkline (vuoto = tutte) | SelectControl | [] | Sceglie su quali metriche generare il mini-grafico sparkline; lascia vuoto per mostrarle tutte. Esempio: Richieste. |

## Interazione

Ricerca, ordinamento interattivo, esportazione CSV, menu contestuale, cross-filter e simulazione What-If.

| Controllo | Etichetta | Tipo | Predefinito | Descrizione |
| --- | --- | --- | --- | --- |
| `enableSearch` | Mostra barra di ricerca nell'albero | CheckboxControl | true | Mostra una barra di ricerca per trovare un nodo, mantenendo visibili i suoi antenati. Esempio: digitando 'Cardiologia' resta il ramo Dipartimento, Reparto, Cardiologia. |
| `enableHierarchicalSort` | Ordinamento cliccando le intestazioni | CheckboxControl | true | Abilita il clic sulle intestazioni per ordinare ogni livello dell'albero mantenendo le righe figlie sotto il proprio padre. Esempio: clic su Richieste ordina i reparti dentro ogni dipartimento. |
| `enableExport` | Abilita esportazione CSV gerarchica | CheckboxControl | true | Mostra il pulsante Esporta CSV per scaricare la tabella con livelli, subtotali e totali. Esempio: un file con una riga per nodo e la colonna Livello. |
| `enableContextMenu` | Abilita menu contestuale su clic destro | CheckboxControl | true | Con il tasto destro su una cella apre le azioni di dettaglio, copia del valore e filtro rapido. Esempio: tasto destro su Radiologia, Visualizza dettaglio. |
| `emit_filter` | Emetti filtri cross-filter in dashboard | CheckboxControl | true | Cliccando una riga filtra gli altri grafici della dashboard collegati alla stessa dimensione. Esempio: clic su Cardiologia aggiorna i grafici dei medici di quel reparto. |
| `crossFilterAppliesToSelf` | Applica il filtro anche a questa tabella | CheckboxControl | false | Se attivo restringe anche questa tabella al ramo selezionato; altrimenti evidenzia soltanto la riga scelta. Esempio: attivo, dopo il clic su un dipartimento restano visibili solo i suoi reparti. |
| `enableWhatIf` | Abilita barra di simulazione What-If | CheckboxControl | false | Mostra sopra la tabella una barra per simulare variazioni percentuali sulle metriche, con ricalcolo di subtotali, medie ponderate e rapporti. Esempio: +10% sugli accessi per vedere l'effetto sul totale. |

## Avanzate

Definizioni metriche, calcoli tabellari, obiettivi, oscuramento privacy e limiti di rendering.

| Controllo | Etichetta | Tipo | Predefinito | Descrizione |
| --- | --- | --- | --- | --- |
| `metricDefinitions` | Definizioni semantiche metriche | JsonTextControl | (vuoto) | Array JSON che specifica il significato delle metriche (sum, mean, ratio, delta_pct, diff) e la polarità (higher_is_better / lower_is_better). Esempio: [{"metric":"tasso","type":"ratio","numerator":"num","denominator":"den"}]. |
| `tableCalculations` | Calcoli tabellari e colonne derivate | JsonTextControl | (vuoto) | Array JSON per aggiungere colonne calcolate lato client. Tipi: pct_of_total (% sul totale), pct_of_parent (% sul padre), running_total (cumulativo), diff_from_previous, diff_from_previous_pct, rank (classifica). Esempio: [{"type":"pct_of_total","metric":"ricavi"}]. |
| `goals` | Obiettivi e target per metrica | RowListControl | (vuoto) | Un obiettivo per metrica: mostra lo scostamento dal target e il badge raggiunto o non raggiunto. Aggiungilo con il pulsante qui sotto. Campi: metric (nome della metrica), target (numero), direction (higher_is_better oppure lower_is_better, facoltativo). Esempio: [{"metric":"accessi","target":1000}]. |
| `suppressionThreshold` | Oscura conteggi inferiori a (0 = disattivato) | TextControl | 0 | Sostituisce con un segnaposto i valori positivi inferiori alla soglia, per tutela della privacy. Esempio: con soglia 5 i valori da 1 a 4 diventano <5; 0 disattiva. |
| `suppressionLabel` | Testo celle oscurate | TextControl | <{k} | Segnaposto mostrato nelle celle oscurate; {k} viene sostituito con la soglia configurata. Esempio: "<5" oppure "***". |
| `suppressionMetrics` | Metriche da oscurare (vuoto = tutte) | SelectControl | [] | Seleziona le sole metriche soggette a oscuramento; lascia vuoto per applicarlo a tutte. Esempio: Pazienti. |
| `complementarySuppression` | Oscuramento complementare anti-ricostruzione | CheckboxControl | true | Oscura anche la seconda cella più piccola di un gruppo quando una sola cella era oscurata, così non si ricava per differenza dal totale. Esempio: con 2 e 30 su totale 32, anche 30 viene nascosto. |
| `virtualizationThreshold` | Attiva virtualizzazione oltre N righe | TextControl | 500 | Oltre questo numero di righe la tabella disegna solo quelle visibili mentre si scorre, per restare fluida; la finestra si adatta all'altezza del grafico. Esempio: 500. |
| `dimensionLimits` | Limiti Top N per dimensione (opzionale) | RowListControl | (vuoto) | Mostra solo i primi N elementi di un livello gerarchico e raggruppa il resto in una riga "Altri (n)" aggregata come i nodi padre. Indica la dimensione oppure il livello. Esempio: [{"dimension":"reparto","limit":10}]. |
