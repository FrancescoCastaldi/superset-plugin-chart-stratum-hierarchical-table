# Codemap: Modulo Funzionale: StratumTree Hierarchical Table Plugin

Mappa architetturale e funzionale di dettaglio per la sottocartella `03_Sviluppo_Software/Repositories/superset-plugins/superset-plugin-chart-stratum-hierarchical-table`.

---

## 🎯 Responsabilita del Modulo

Plugin di visualizzazione tabellare gerarchica per Apache Superset (chiave `hierarchical_table`): aggregazioni multi-livello, pivot a una o due colonne, drill-down ed espansione nodi ad albero, confronto temporale e confronto accoppiato con il periodo di confronto del filtro Calendar.

---

## 🌳 Albero & Componenti

| Percorso | Ruolo Tecnico |
|:---|:---|
| `src/plugin/buildQuery.ts` | Costruisce la query; passa `time_offsets` quando il filtro Calendar manda un periodo di confronto (T2) |
| `src/plugin/transformProps.ts` | Pipeline dati: albero, layout colonne, totale generale, definizioni di metrica |
| `src/plugin/formDataOptions.ts` | Normalizza i controlli del pannello (`TransformOptions`) |
| `src/plugin/controlPanel.tsx` | Pannello di controllo di Explore, quattro macro-sezioni |
| `src/plugin/metricLayout.ts` | Sceglie e costruisce le colonne: piatto, pivot singolo, pivot a due livelli |
| `src/plugin/columnBuilders.ts` | Costruttori delle colonne e delle intestazioni raggruppate |
| `src/plugin/pairedComparison.ts` | **Confronto accoppiato** (v0.16.0): colonne confronto e Δ accanto a ogni cella, calcolo di `___diff`, `___delta`, `___pp`, `___ratio` |
| `src/plugin/grandTotal.ts` | Riga del totale generale e relative variazioni |
| `src/utils/treeBuilder.ts` | Albero da record; salva anche il valore del periodo di confronto di ogni cella (`___comp`) |
| `src/utils/timeComparison.ts` | Variazioni tra periodi, offset nativi di Superset (`metrica__1 year ago`), `COMPARISON_SUFFIX` |
| `src/utils/aggregations.ts` | Rollup, metriche derivate, totali di riga del pivot |
| `src/components/HierarchicalTable.tsx` | Rendering della tabella, badge Δ colorati per polarità |
| `test/` | Suite Jest (53 file); `pairedComparison.test.ts` copre il confronto accoppiato su tre layout |
| `dev-studio/`, `examples/`, `docs/` | Banco prove interattivo, esempi, documentazione e immagini |
| `install-plugin.ps1`, `install.bat` | Installer verso `MainPreset.ts` di Superset |

---

## 🔁 Confronto con il periodo del filtro Calendar

Le colonne `metrica__<offset>` della query diventano, per ogni cella `K`, la chiave `K___comp` sul nodo; poi `K___diff`, `K___delta`, `K___pp`, `K___ratio` secondo i formati scelti (`calendar_comparison_formats`). Modalità `paired` (default) oppure `row_total` (un solo Δ per riga, comportamento della 0.15). Dettagli e limiti in `../AGENTS.md` §5.3.1.

---

## 🚢 Pubblicazione

Remote `origin` = GitHub (fonte di verità). Il remote `bitbucket` di questo repo non è utilizzabile: su Bitbucket il plugin va solo nel monorepo `../../superset-extensions`, cartella `plugins/superset-plugin-chart-stratum-hierarchical-table`, con la procedura mirror di `superset-extensions/AGENTS.md` §2.7.

---

## 🔄 Integrazione con i Moduli Genitori

Questo modulo funzionale e orchestrato e referenziato dal manifest e dalla codemap della cartella genitore.
