# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.18.0] - 2026-11-11

### Fixed
- **What-If simulation with metric definitions**: `HierarchicalTable` now normalizes `metricDefinitions`, resolves `aggregationMode`, and passes `weightColumn` only for `weighted_avg`, preventing crashes when opening What-If with JSON metric definitions.
- **Multi-table state isolation**: eliminated module-level mutable state in `timeMetricRegistry.ts` and passed `timeMetrics` explicitly through `rollupTreeMetrics`, `computeGrandTotal`, `computeHorizontalRowTotals`, and `isRateMetric` so What-If scenarios and multiple tables on the same dashboard do not cross-contaminate.
- **Flat Calendar comparison toggle and `___delta` collision**: flat layout now respects `show_calendar_comparison = false`, and flat Calendar comparison takes explicit precedence over `applyVarianceDelta` so `___delta` columns never collide or duplicate.
- **Legacy rollup precision**: `columnBuilders.ts` detects comparison columns strictly via `${metric}__`, preserves missing baselines as `null` (`Nuovo` badge instead of `0`), and avoids overwriting precomputed weighted averages or custom metric definition values.
- **Option alignment**: aligned `calendar_comparison_formats` fallback default (`['pct']`) with the control panel and fixed `formDataOptions.showVarianceDelta` boolean resolution.

### Changed
- **Behavior change in pivot row totals**: `metricLayout.ts` and `computeHorizontalRowTotals` now evaluate pivot row totals using the configured `aggregationMode` (with cell-paired weights when `weighted_avg`) instead of always summing (`'sum'`). Charts using non-sum aggregations (`avg`, `min`, `max`, `count`, `weighted_avg`) with pivot row totals will now reflect that aggregation.
- **What-If exposure and client re-render trigger**: exposed `enableWhatIf` in the Explore panel and switched `aggregationMode` to `renderTrigger: true` for instant client-side recalculation.
- **Italian StratumBar-aligned control panel**: reorganized into 7 Italian sections (`Dati` expanded by default, `Confronto tra periodi`, `Formato dei valori`, `Totali`, `Aspetto`, `Interazione`, `Avanzate`), with progressive disclosure by layout (flat, single pivot, two-way pivot), `SelectControl` pickers for `weightColumn`, `sparklineMetrics`, and `suppressionMetrics`, shared `showDurationControl`, split rows (max 2 controls per row), zero emojis, and full wiring plus default-parity tests.

## [0.17.1] - 2026-11-11

### Fixed
- **The Time controls did not show up for saved metrics.** The rule that decides whether to show the duration controls looked for the dataset in the datasource control, where Explore keeps only its id. It now reads the dataset that Explore passes to the control panel, as the Donut does. Saved metrics on a TIME or INTERVAL column are recognized again, and so are the metrics with a duration name.

## [0.17.0] - 2026-11-11

### Added
- **Time and duration metrics.** A metric of type Time (SQL Server `time`, an average waiting time such as `00:12:54.425000`) arrives as text and the tree read it with `parseFloat`, which turned every cell into `0` without any error. The table now recognizes these metrics on its own, converts them to seconds before the tree is built and writes them as durations: cells, pivot cells, row totals, parent rows, grand total and the comparison period of the calendar filter.
- **Differences of durations are durations.** The absolute delta of the paired comparison and of the period delta is written with its sign (`+05:00`, `-00:30`); percentage, percentage points and ratio stay numbers.
- Accepted texts: `HH:MM:SS`, `H:MM:SS.ffffff`, more than 24 hours (`26:10:00`), `1 day, 2:03:04`, `0 days 00:12:54.425000` and ISO 8601 durations (`PT12M54S`). Two-part values such as `12:54` are not read (hours and minutes, or minutes and seconds).
- Four controls in *Formatting & Aesthetics*: `timeDetection` (automatic or off), `timeDisplayFormat` (automatic `mm:ss` or `h:mm:ss`, hours minutes seconds, minutes and seconds, decimal minutes, decimal hours, seconds), `timeFractionDigits` (0 to 3) and `timeRollup` (average, or like the other metrics).
- `test/timeMetrics.test.ts`: 18 tests on parsing, formats, roll-up, row totals, comparison and pivot.
- **The Time controls show up on their own.** In Explore the controls of the durations appear only when a metric picked in the Data section looks like a Time field (a saved metric whose expression uses a TIME or INTERVAL column, a simple metric on such a column, a custom SQL naming one, or a name such as attesa, durata, tempo, lead time, wait, duration). Otherwise they stay hidden. It is only a hint for the panel: the data still decide at render time, so a chart is never changed by it.
- `test/timeMetricHints.test.ts`: 9 tests.

### Changed
- **Parent rows, grand total and pivot row totals average the durations** instead of adding them (a sum of waiting times means nothing). The average uses the *Weight Metric* when the roll-up is Weighted Average, the plain average of the children otherwise; `timeRollup` = `general` brings back the table roll-up. The period delta of a pivot table with a native comparison averages current and comparison over the pivot values.
- Only the metric columns (and the `<metric>__<offset>` columns of the comparison) are converted: a dimension that looks like a time, such as `08:00:00`, stays text. A metric whose definition sets its own `format` keeps it.
- Conditional formatting rules and goals on a Time metric are written in seconds (`600` is `10:00`).

### Known limits
- Several records on the same leaf and the same pivot cell are still added together for every metric; for a Time metric that sum is not an average.
- The average of the parents is the average of the averages of the children unless a weight metric is set: it is exact only with a weight (for example the number of requests).

## [0.16.1] - 2026-11-10

### Added
- **Dynamic title of the comparison columns.** The control `calendar_comparison_label` is now a template: `{periodo}` becomes the comparison period in month and year (`ott 2025`, `lug 2025 – set 2025`, `2025` for a whole year), `{corrente}` the current period and `{offset}` the offset (`1 anno fa`). The period is the time range of the query moved back by the offset of the calendar filter, so the title follows the filter. The default is `{periodo}`; a chart that saved a fixed text keeps it. Without a range the title falls back to the offset and then to `Confronto`.

## [0.16.0] - 2026-11-10

### Added
- **Paired calendar comparison** (`calendar_comparison_mode` = `paired`, the new default): when the dashboard's calendar filter sends a comparison period (T2), every value cell gets the same cell computed on T2 next to it, followed by its deltas. It works on every metric and on every layout: flat tables, one pivot column (Monday 2026 next to Monday 2025, per row, per pivot value) and two pivot columns (every combination, the subtotal of the first pivot value and the row totals). The comparison of a row is the Superset offset of the metric on the same row and the same pivot values, rolled up to the parent rows and the grand total like the current values; a pivot value with no current value still counts in the comparison.
- **Delta formats** (`calendar_comparison_formats`): absolute (Δ), percentage (Δ%, `Nuovo` when the comparison is zero), percentage points (Δ pp) and ratio (Δ×, neutral at 1). Any combination, shown in a fixed order; none shows only the two values. The deltas are green when the metric improves and red when it worsens, and the polarity of the metric definition (lower is better) swaps the colours.
- `calendar_comparison_label`: the word in the title of the comparison columns (default `Confronto`).

### Changed
- The calendar filter comparison control is no longer limited to single pivot tables. The previous behaviour, one Δ of the row total for single pivot tables, is the `row_total` mode.
- Flat tables with a comparison period keep value, comparison, Δ and Δ% unless the formats are chosen; their Δ% is now `Nuovo` (not 0) when the comparison is zero and the value is positive.

## [0.15.1] - 2026-11-09

### Fixed
- The calendar filter comparison in pivot tables left out the comparison of the pivot values whose current value is empty. The total of the comparison period of a row, and so the Δ of the grand total, was understated. Those values are now counted.

## [0.15.0] - 2026-11-09

### Added
- **Calendar filter comparison in pivot tables** (`show_calendar_comparison`, on by default): when the dashboard's calendar filter sends a comparison period (T2, `time_offsets`), a single-pivot table shows for every row the delta of the total of the current period against the total of the comparison period, in the columns "Δ vs periodo di confronto (filtro Calendar)" (Δ and Δ%). The baseline of each row is the sum of the offsets of its pivot values, rolled up to the parent rows and to the grand total. It takes precedence over the delta between pivot values. Without a comparison period in the filter nothing changes.

### Changed
- The comparison controls and the automatic pivot delta controls of the control panel are in Italian, with a clearer description for the calendar filter comparison. The rest of the control panel is still in English.

## [0.14.2] - 2026-11-01

### Changed
- The control panel is now English: a few labels were still Italian.
- README: how to turn cross-filtering on.

## [0.14.1] - 2026-11-01

### Changed
- **Screenshots of real charts**: every image in the README, the gallery image and the picker thumbnails are now screenshots of real charts in Chrome on a running Superset (example sales data), instead of images generated by the dev studio scripts. The animation is a recording of real interactions.
- The badge for a delta against a zero comparison reads `New` (was `Nuovo`).

## [0.14.0] - 2026-10-29
### Added
- **Also filter this table** (`crossFilterAppliesToSelf`, off by default): when a row is clicked, the cross-filter also applies to the table itself, which shows only the selected rows and the rows above them, with the totals recalculated on the filtered data only. A dashboard never applies the cross-filter to the chart that emits it, so the same filters are also kept in the chart's own state (`ownState.selfFilters`) and `buildQuery` adds them to the query. Removing the selection (including with "Pulisci tutto") brings the full table back. When off, nothing changes.

## [0.13.0] - 2026-10-29
### Added
- **Reference and comparison periods in the headers** (`periodLabelsFromFilters`, off by default): adds the reference month to the headers of the current values, the comparison month to the headers of the comparison values, and both to the variations, for example `Richieste (Corrente) · ott 2026`, `Richieste (Confronto) · set 2026`, `Variazione Richieste (%) · ott 2026 vs set 2026`. The periods are the ones the query really runs on: the query asks for the year and month columns of the dataset together with the data (`ANNO_CORRENTE`, `MESE_CORRENTE`, `ANNO_CONFRONTO`, `MESE_CONFRONTO`, names can be changed), so they follow the dashboard filters and, when no filter is applied, the default values of the dataset. Year and month go together as a pair: multiple selected values are not combined. The period columns do not appear in the table data. A column is a reference column if its name contains "corrente" or "riferimento", a comparison column if it contains "confronto", and a variation column if it contains "variazione" or "delta"; the others stay as they were. If the time span of the metrics is also on, this one takes precedence. When off, nothing changes.

## [0.12.1] - 2026-10-29
### Added
- **Dynamic full-width fit (100% width)**: the table columns expand proportionally to fill the whole horizontal space available in the container, removing the empty white space on the right in wide views (Explore and dashboard tiles).
- **Balancing of manual resizing**: if one or more columns are resized manually with `resizableColumns`, the remaining columns that were not customized keep absorbing the leftover space to keep the table full-screen. If the sum of the columns exceeds the container width, the sizes are preserved, allowing natural horizontal scrolling.
- **Reactive container detection**: via `ResizeObserver` the table recalculates and instantly adapts the column proportions when the browser window is resized or when the Explore controls sidebar collapses or expands.

## [0.12.0] - 2026-10-29
### Added
- **Automatic text wrapping** (`wrapHeaderLabels`, off by default): headers and row labels that are too long wrap onto several lines instead of being cut off or pushing the columns to the right (for example `Δ% Richieste (dic 2025 – ott 2026 vs mese precedente)`). The second row of the sticky header of pivot tables scales below the first one, which is taller when the text wraps.
- **Resizable columns** (`resizableColumns`, off by default): a draggable edge on the right of each header widens or narrows the column (from 56 to 900 px), and a double click on the edge restores it. The table takes the sum of the widths, so a narrower column really narrows the table and a wider one makes it scroll. Widths are kept in the browser, per chart.
- **Drag-to-reorder columns** (`reorderColumnsByDrag`, off by default): metric headers can be dragged wherever you want (including the Δ columns), with the header and the values moving together, without needing the control panel or a dashboard helper (before, it required the `onReorderMetrics` hook, which Superset does not provide). It applies to tables without pivot columns; the order is kept in the browser, per chart.
- **Restore columns**: with custom widths or order, the `Ripristina colonne` button appears in the toolbar and puts everything back as configured.
- With the three flags off, the table is identical to before.

## [0.11.1] - 2026-10-29
### Fixed
- **Cross-filtering: clicking a row now always updates the table**: the notification to the dashboard was sent from inside the `setState` updater, that is during the component render, and depending on the case the dashboard update was lost or arrived mid-render, leaving the table behind. Now the selection is also kept in a ref and the dashboard is notified by the click handler (`useCrossFilterSelection`): several quick clicks add up correctly.
- **The table follows the dashboard**: the selection made in the table is saved in the filter state (`selectedNodes`). If it is removed or changed elsewhere (filter bar, another chart, reset), the table shows the update, and a filter already active when the dashboard loads appears selected. The echo of its own clicks does not overwrite later clicks.
- **Correct columns in filters**: with groupings on custom SQL columns (for example "Mese di Riferimento" = `MESE_SLOT`), the filter named the label, which is not a column of the dataset, and the other charts did not react. Now the filter names the real column (or carries the expression if it is not a simple column) and uses the values stored in the database rather than the ones formatted by the table.

## [0.11.0] - 2026-10-29
### Added
- **"Show the period next to each metric" control** (`showPeriodInMetricLabel`, off by default): writes beside each metric name the time span it covers (for example `Richieste (nov 2025 – ott 2026)`), beside the comparison columns the period they are measured on (`Richieste (Confronto) (1 mese fa)`), and on the delta columns both (`Δ% Richieste (ott 2026 vs mese precedente)`). The span is read from the periods present in the data, from the native comparison offset (`time_compare`) or from the interval applied to the query, so it follows the dashboard filters. Pivot columns stay unchanged: their header already names the period.

## [0.10.5] - 2026-10-29
### Added
- **"Show Δ % labels next to values" control** (`showVarianceBadges`, on by default): when turned off, with "Show variations versus the period" on, the variation stays only in the Δ % columns, and the absolute values (for example Richieste) no longer carry the percentage label next to them. No change for existing charts.

## [0.10.4] - 2026-10-26
### Fixed
- **Non-blocking controls in Explore**: Removed the mandatory validation (`validators: []`) and added `clearable: true` for `groupby`, `columns` and `metrics`, to prevent save or run errors caused by missing parameters when navigating the Superset Explore view.

## [0.10.3] - 2026-10-26
### Added
- **Column width calibration for comparative views**: Calibrated the 9-column layout (1260px on a standard 1440px desktop) to prevent overflow and horizontal scrollbars.
- **Robust hierarchical aggregation engine**: Accurate handling of percentage points (Delta p.p.) in the calculation of node subtotals and of the grand total, preserving the tree hierarchy.

## [0.10.2] - 2026-10-25
### Added
- **Robust recalculation of deltas in percentage points (Delta (punti %), Delta p.p.)**: Extended the logic of recomputeDerivedMetrics in src/utils/aggregations.ts to compute the exact arithmetic difference (corr - conf) instead of the relative percentage change for all metrics expressed in percentage points (punti %, p.p., punti percentuali, _pp).
- **Positional proximity heuristic for multi-block tables**: Introduced findPrecedingMetricPair, which finds the operand columns (corr and conf) immediately preceding each delta column in the metrics list, ensuring that tables with several KPIs side by side link each delta to its own block.
- **Delta column formatting and recognition**: Updated isDeltaColumn in src/utils/tableColumns.ts and formatMetricValue in src/utils/formatters.ts to automatically recognize and format metrics in percentage points with the explicit p.p. suffix and sign (e.g. +4.5 p.p., -2.3 p.p.).

## [0.10.1] - 2026-10-24
### Added
- **Native Dashboard `PeriodCompare` filter support**: extracted and forwarded `extra_form_data.time_compare` to `query.time_offsets` in `buildQuery.ts`, enabling native dual-query execution without cartesian product views or SQL row duplication.

## [0.10.0] - 2026-10-22
### Added
- **New `diff` metric definition type** (`src/utils/metricSemantics.ts`, `src/types/index.ts`): computes `current - baseline` on every node (leaves, parent subtotal rows and the grand total) from the node-level aggregated values of the two operand metrics, never as a sum or average of child differences. Designed for difference columns between node-level ratios (e.g. acceptance % current vs comparison period in percentage points) and for additive delta columns (e.g. waiting time in days) that need exact parent values.
- **Operand ordering guarantee**: `ratio` and `delta_pct` definitions are always computed before `diff` definitions, so a diff may reference ratio metrics as operands regardless of the declaration order in `metricDefinitions`.
- **Polarity support on diff columns**: a diff definition accepts `polarity: "lower_is_better"` so the delta colour scale inverts (negative delta rendered green), e.g. for waiting-time deltas where a decrease is an improvement.
- **What-If engine awareness** (`src/utils/whatIfEngine.ts`): metrics declared as `diff` are excluded from direct leaf multiplication and are always recomputed from their operands, like `ratio` and `delta_pct`.

## [0.9.0] - 2026-10-18
### Added
- **Interactive What-If Simulation Engine (`whatIfEngine.ts`)**: Pure deterministic calculation engine applying percentage multipliers strictly to leaf nodes and recalculating parent rollups, weighted averages, and grand totals with mathematical rigor. Ratio metrics (like length of stay) recalculate from simulated operands rather than averaging averages.
- **Polarity-Aware In-Cell Delta Badges**: Directional delta badges (`▲`/`▼`) rendered directly inside simulated metric cells with polarity awareness (`higher_is_better` vs `lower_is_better`), baseline value tooltips, and distinct background highlighting.
- **Interactive What-If Toolbar (`WhatIfToolbar.tsx`)**: Responsive simulation control panel with metric range sliders (-50% to +50%), manual numeric percentage inputs, active simulation status badge, instant reset button, and collapsible preset scenario manager.
- **Scenario Manager (`whatIfScenarioManager.ts`)**: Persistence layer supporting saving, loading, and renaming up to 10 simulation presets in `sessionStorage` with graceful in-memory fallback.
- **Enriched CSV Export**: Automatic generation of Base, Simulato, and Delta % columns in CSV export when What-If simulation is active, preserving full auditability of simulated data.
- **Dev Studio Integration**: Added What-If simulation toggle in Explore Control Panel under Comparison & Analysis, with live event hook logging (`onWhatIfChange`) in Diagnostics Drawer.

## [0.8.4] - 2026-10-18
### Added
- **Responsive Viewport-Constrained Sizing**: Bound chart dimensions directly to the live viewport container in Dev Studio via `ResizeObserver`, ensuring `transformProps` receives exact pixel width and height without manual window resize events.
- **High-Contrast Bidirectional Scrollbars**: Enhanced native scrollbars in `src/components/HierarchicalTable.css` with 10px width and height, `#94a3b8` thumb with 2px `#f1f5f9` border padding, `#64748b` hover state, and Firefox `scrollbar-color: #94a3b8 #f1f5f9` for instant visual discovery across light and dark themes.

### Fixed
- **Dev Studio Scrollbar Clipping and Double Scrolling**: Removed unconstrained `overflow: auto` and hardcoded 1200x700px dimensions from `.chart-wrapper` and `.chart-canvas` in `studio.css`, locking scrolling exclusively to the authoritative `.table-scroll-wrapper` container. Both horizontal and vertical scrollbars now stay permanently visible and pinned within the visible viewport above the diagnostics drawer.

## [0.8.3] - 2026-10-18
### Added
- **Natural Time Grain Auto-Detection (`detectNaturalGrain`)**: Pure deterministic utility in `src/utils/timeComparison.ts` that automatically infers the natural temporal granularity (`year`, `quarter`, `month`, `week`, `day`) from active pivot period keys.
- **Auto Grain Mode in Control Panel and Dev Studio (`auto`)**: Added `auto` choice (`✨ Auto (Rileva automaticamente dai dati)`) across `ComparisonTimeGrain`, `TIME_GRAINS`, Superset `controlPanel.tsx`, and `PeriodComparisonEditor.tsx`.
- **Superset `time_grain_sqla` Mapping**: Transparently mapped native SQLA time grain codes (`P1D`, `P1W`, `P1M`, `P3M`, `P1Y`) to typed comparison grains in `formDataOptions.ts`.
- **Dynamic Informative Column Titles**: `periodComparisonTitle` generates explicit headers reflecting the selected grain (`Δ vs previous year (YoY)`, `Δ vs previous month (MoM)`, `Δ vs previous quarter (QoQ)`, `Δ vs previous day (DoD)`, `Δ vs previous week (WoW)`).
- **Proactive In-Editor Diagnostics Banner**: `PeriodComparisonEditor` validates whether the selected granularity and baseline strategy have preceding periods in the active dataset, displaying friendly alerts when baseline data is missing and confirming valid comparisons.
- **Multi-Year Mock Scenarios**: Enriched `healthcareScenario` with 2025 baseline data so that YoY, QoQ, MoM, and same-period last year comparisons compute real deltas out of the box.

### Fixed
- **Robust Period Key Parsing**: Hardened `parsePeriodKey` against non-string input, safely parsing numeric year keys (such as `2023`, `2024`) or timestamps without throwing runtime TypeError exceptions.
- **Safe Comparison Fallbacks**: Prevented empty dashes in period comparison tables by resolving `auto` grains against real pivot period keys.

## [0.8.2] - 2026-10-18
### Added
- **Drag and Drop Metrics Reordering (`onReorderMetrics`)**: Native HTML5 drag and drop metrics reordering supporting both interactive chips in the Explore Control Panel and direct column header reordering on the table grid.
- **Draggable Metric Chips in Control Panel**: Replaced simple button pills with rich, accessible chips featuring drag handles (`⠿`), numerical position badges (`#1`, `#2`...), move arrows (`◀`/`▶`) for keyboard and mobile accessibility, quick removal (`✕`), drop indicators, and quick-add buttons for remaining dataset metrics.
- **Direct Table Column Header Reordering**: Table metric headers (`<th>`) in flat and pivot modes become draggable when `onReorderMetrics` is configured, highlighting drop targets with clean visual drop indicators and seamlessly reordering metrics without triggering accidental sorting.
- **Pure Reordering Helpers (`src/utils/metricReorder.ts`)**: Added deterministic pure array and metric key reordering helpers (`reorderArray`, `reorderMetricsByKey`, `reorderMetricsWithPosition`, `getMetricKeyFromColumn`) with full unit test coverage.
- **Dev Studio Live Hook Integration**: Wired `onReorderMetrics` into Dev Studio `App.tsx` and `DiagnosticsDrawer`, providing live event logging and instantaneous chart grid synchronization across all scenarios.

### Fixed
- **Base Metrics Isolation**: Table drop handler now filters against pure base metrics (`props.formData.metrics`), preventing synthetic delta metrics (such as `${metric}___delta`) and table calculations from contaminating `formData.metrics`.
- **Metric Name Disambiguation in Column Resolution**: Hardened `getMetricKeyFromColumn` with word boundary matching and length-descending sorting, preventing collisions when a metric name is a substring or suffix of another metric.
- **Separated Pivot Header Drag Guard**: Restricted draggable headers in separated pivot mode (`combineMetric: false`) to Level 1 metric groups, preventing Level 2 period values from becoming erroneously draggable.
- **Drag Leave Bubbling and Position Loss**: Protected `onDragLeave` in both table headers and Control Panel chips against child element bubbling (`e.currentTarget.contains`), and added direct `clientX` drop position calculation fallback.
- **Cross-Component Drag and Drop**: Enabled dropping table headers dragged from the grid directly onto Control Panel chips.


## [0.8.1] - 2026-10-18
### Added
- **In-Cell Variance Badges (`showVarianceDelta`)**: Complete rendering pipeline for inline variation percentage badges (`.delta-badge`) displaying `▲ +X.X%` or `▼ -X.X%` directly beside numeric values across flat hierarchy tables, horizontal pivot matrices, and grand total rows.
- **Native Pivot Delta Columns and Metric Polarity Inheritance**: Fixed key collisions between flat variance delta metrics and native pivot time deltas (`pivotTimeDeltaMode`: `absolute`, `percentage`, `both`). Automatically propagates custom metric definitions and polarity (`higher_is_better` vs `lower_is_better`) to generated pivot delta columns.
- **On-Demand Add and Remove Time Comparison Architecture**: Redesigned `PeriodComparisonEditor` with 1-click removal of pivot comparison mode to return to flat tables, temporal candidate axis selection, and synchronized dispatch across camelCase and snake_case properties.
- **Visual Showcase and Headless Asset Capture**: High-resolution scenario screenshots (Healthcare, Sales Multi-Pivot, 5k-Row Virtualization Stress Test, Superset REST API Modal) and animated GIF demo (`docs/images/dev_studio_demo.gif`) embedded into repository documentation and README.md.
- **Live Dev Studio (Superset Explore Workbench)**: Interactive development and testing environment located in `dev-studio/` powered by Vite and React 18 with sub-50ms Hot Module Reloading (HMR).
- **Superset Explore Control Panel Replica**: 5 collapsible accordion sections (Data, Customize, Comparison & Analysis, Table Calculations & Cell Visuals, Performance & Limits) reflecting all Superset configuration controls with two-way state binding.
- **Diagnostics and Event Drawer**: Real-time monitor logging Superset `setDataMask` cross-filter payloads, Context Menu drill actions, and pipeline execution time in milliseconds.
- **Benchmark Scenarios**: Included out-of-the-box datasets for Healthcare and Sanita (with deltas and privacy suppression <5), Sales Multi-Pivot (with table calculations and bipolar bars), and High-Volume Stress Test (5,000-row tree).
- **Launcher Scripts**: Root `npm run dev`, `npm run dev:build`, and double-clickable `dev.bat` for Windows environments.
- **Superset REST API Integration (`POST /api/v1/chart/`)**: Support for programmatic chart creation conforming to official Superset `ChartPostSchema`. Includes CLI script `scripts/create_chart_api.py`, interactive modal dialog in Dev Studio with JSON payload export, copyable cURL, Python and PowerShell templates, and live in-browser REST client with automated JWT authentication and CSRF token management.
- **Interactive Metric Definitions Manager (`MetricDefinitionsEditor`)**: Replaced raw JSON textarea with an interactive visual builder in the Explore Control Panel. Automatically detects active chart metrics and provides visual cards to configure rollup semantics (sum, weighted mean, distinct count, ratio, delta %), weighting metrics, entity dimensions, Wilson/Poisson confidence intervals, number formatting, decimals, and ethical polarity (`higher_is_better` vs `lower_is_better`), featuring two-way synchronization with raw JSON mode and 1-click auto-suggestions.
- **Time Comparison and Database Datetime Manager (`PeriodComparisonEditor`)**: Interactive control in Explore Control Panel replacing confusing dropdowns with real-time requirements diagnostic. Automatically scans dataset for temporal/datetime columns (`date`, `data`, `time`, `timestamp`, `anno`, `mese`, `quarter`, `trimestre`, `__timestamp`), providing 1-click quick-set buttons to activate horizontal pivot mode, validation of period formats, selection of comparison baseline (`prev_period`, `prev_year_same_period`, `budget_target`), reference periods (`previous`, `ytd`), time grains (DoD, WoW, MoM, QoQ, YoY), in-grid pivot column deltas (`pivotTimeDeltaMode`), and live preview of generated columns.
- **Extended Database Datetime Parser (`parsePeriodKey`)**: Enhanced temporal parsing in `src/utils/timeComparison.ts` supporting quarter keys (`Q1` to `Q4`), slash dates (`YYYY/MM`, `MM/YYYY`, `YYYY/MM/DD`, `DD/MM/YYYY`), Italian and English month names (`Gennaio..Dicembre`, `Jan..Dec`), single-digit months (`2026-1` to `2026-9`), and Unix epoch timestamps in seconds and milliseconds.


## [0.8.0] - 2026-10-15
### Added
- **Diverging Heatmap with 3-Stop Continuous Gradient (`diverging_heatmap`)**: New visual rendering engine in `src/utils/advancedCellVisuals.ts` supporting continuous three-stop color scales (Min, Neutral Midpoint, Max) with automatic WCAG AA text contrast selection (`#ffffff` or `#212529`) based on calculated background relative luminance.
- **Polarity-Aware Color Mapping**: Heatmap colors and data bars strictly respect metric polarity (`higher_is_better` vs `lower_is_better`). For metrics where lower values represent positive outcomes (for example hospital waiting times or post-op complications), negative variances receive the positive palette color and positive variances receive the alert color.
- **Bipolar Zero-Centered In-Cell Data Bars (`bipolar_data_bars`)**: Bi-directional in-cell data bars anchored to a vertical zero axis line, extending positive values to the right in green and negative values to the left in red.
- **Explore Formatting Controls**: `minMaxDisplayMode` now includes `diverging_heatmap` and `bipolar_data_bars`, accompanied by `heatmapPalette` (`red_white_green`, `red_yellow_green`, `blue_white_red` for colorblind accessibility, and custom theme colors) and `divergingMidpoint`.

## [0.7.0] - 2026-10-15
### Added
- **Dimension Limits per Hierarchy Level (Top N and Bottom N with Synthetic Others Aggregation)**: New dimension limiting engine in `src/utils/dimensionLimits.ts` inspired by Qlik Sense dimension boundaries. Allows analysts to limit deep, high-cardinality trees (for example hospital diagnosis codes, clinical procedures, cost centers) to the most significant Top N or Bottom N contributors per level while aggregating remaining branches into an exact synthetic row.
- **Mathematical Additive Invariant Preservation**: The synthetic "Others" node (`isOthers: true`, `othersCount: K`) computes the exact metric sum of all excluded siblings, ensuring parent subtotals and the overall Grand Total remain mathematically identical to the full dataset down to the penny.
- **Configurable Labels and Placeholders**: Dimension limit rules support custom templated labels via `{k}` or `{count}` placeholders (defaulting to `Altri ({k})`).
- **Context Menu Protection on Synthetic Rows**: Right-clicking on an "Others" row in the tree automatically excludes the synthetic label from the leaf dimension filter, filtering instead by valid ancestor dimensions to prevent empty SQL drill queries.
- **Explore Control (`Dimension Limits & Top N (optional)`)**: JSON configuration control in `Performance & Limits` supporting level-specific or dimension-specific boundaries.

## [0.6.0] - 2026-10-15
### Added
- **Measure Modifiers and Table Calculations (`tableCalculations`)**: New analytical engine in `src/utils/tableCalculations.ts` providing standard business intelligence table calculations and dynamic measure modifiers.
- **Percent of Total (`pct_of_total`)**: Computes each node metric share relative to the overall Grand Total or scoped hierarchy total.
- **Percent of Parent (`pct_of_parent`)**: Evaluates the percentage contribution of each branch relative to its parent row subtotals, guaranteeing exact additive balance across sibling groups.
- **Running Total (`running_total`)**: Cumulative metric summation along ordered chronological pivot periods (`scope: "periods"`) or across hierarchical siblings (`scope: "siblings"`).
- **Difference from Previous (`diff_from_previous` and `diff_from_previous_pct`)**: Period-over-period absolute and percentage variances calculated across chronological pivot intervals without altering raw query metrics.
- **Sibling Ranking (`rank`)**: Computes competition (standard 1224) or dense (1223) rank order among sibling rows, sorted either descending or ascending.
- **Companion Column and Replace Display Modes**: Table calculations can be appended as companion columns with customized titles and dedicated formatters, or directly replace the underlying metric cells.
- **Explore Control (`Table Calculations (optional)`)**: Dedicated JSON control in `Comparison & Analysis` allowing analyst-driven configuration of calculations.

## [0.5.0] - 2026-10-15
### Added
- **Native Apache Superset Context Menu (`Behavior.DrillBy` and `Behavior.DrillToDetail`)**: Support for Superset native right-click context menu on tree cells and rows. Generates binary filter clauses (`buildContextMenuFilters` in `src/plugin/contextMenu.ts`) for drill to detail, drill by, and cross-filtering.
- **Hierarchical Path Preservation with `TreeNode.rawPath`**: Tree nodes record original database values along the dimension path (`TreeNode.rawPath`) to ensure accurate drill-down filters even when dimension values undergo string formatting or label transformations.
- **Pivot Dimension Context Filtering**: Right-clicking on pivoted metric cells adds exact filter clauses for single or composite pivot dimensions (for example `mese` and `canale`), while excluding `ROW_TOTAL` and `SUBTOTAL` columns.
- **Privacy-Preserving Drill Omission**: Cells suppressed by small-number privacy rules (`node.suppressed`) automatically omit drill to detail and drill by filters to prevent identification leaks.
- **Grand Total Context Menu**: Right-clicking on grand total cells retains applicable pivot filters while correctly omitting hierarchy dimension constraints.
- **Explore Control (`enableContextMenu`)**: Checkbox control in `Comparison & Analysis` allowing users to toggle contextual right-click menu actions dynamically.

## [0.4.1] - 2026-10-15
### Fixed
- **Share Metrics `% <Target>` on Parent Rows, Grand Total and Row Totals**: metrics named `% <Target>` (for example `% Totem`, `% Portale`) without a `metricDefinitions` entry were left empty (`-`) on parent rows, `Grand Total` and the horizontal `ROW_TOTAL` columns. `recomputeDerivedMetrics` now evaluates them as `Target / Totale * 100` from the aggregated operands, looking up the numerator by base name and the denominator among the metrics named `Totale`, `Total`, `Volume` or `Tot`; a zero denominator gives an empty cell. On leaf rows the value is recomputed too, so a SQL metric that returns a fraction (`0.4`) is shown on the same 0 to 100 scale as the parents. `% Self ...` metrics keep their dedicated rules, and an explicit `ratio` definition still wins. Covered by new scenarios in `test/aggregations.test.ts`.
- **Fallback Weight for Derived Metrics**: when a derived metric cannot be recomputed from its operands, the weighted mean of the children now prefers a `Totale`/`Total`/`Volume` metric of the same pivot column, and the last resort is `Totale` instead of `richieste_corr`. The match is made on the base metric name, so the `___SUBTOTAL` and `___ROW_TOTAL` pivot suffixes are not mistaken for a total metric.

## [0.4.0] - 2026-10-15
### Added
- **Metric Definitions (`metricDefinitions`)**: new JSON control in `Comparison & Analysis` that states what each metric means and wins over the name-based guesses. Types: `sum`, `mean` (optional `weight` metric), `distinct_count` (`entityDimension`: MAX at and below that level, SUM above), `ratio` (`numerator`, `denominator`, `scale`: parent rows, grand total and row totals are a ratio of sums, never an average of ratios), `delta_pct` (`current`, `baseline`) and `none` (empty on parent rows). Each entry can also set `format` (`integer`, `decimal`, `percent`, `duration` in seconds, `days`, `currency`), `decimals` and `polarity` (`higher_is_better`, `lower_is_better`). Malformed entries are dropped, and charts without definitions behave exactly as before. Logic in `src/utils/metricSemantics.ts`; covered by `test/metricSemantics.test.ts` and `test/transformPipeline.metricDefinitions.test.ts`.
- **Confidence Intervals and Significance Signal**: a `ratio` definition can declare `ci: "wilson"` (proportions, for example the share of bookings within the maximum waiting time) or `ci: "poisson"` (event rates over a population, with `scale` 1000 or 100000), a `ciLevel` (0.9, 0.95, 0.99 or 0.998) and `compareTo` (`parent`, `total` or `goal`). Every cell gets its interval, shown in the tooltip, and a marker (up or down) appears only when the whole interval lies on one side of the reference, so small units are not ranked better or worse by chance, the funnel plot logic of public health benchmarking inside the table. The marker colour follows the polarity. Pure functions in `src/utils/statistics.ts` (Wilson score, Byar approximation of the exact Poisson interval) and `src/utils/significance.ts`; covered by `test/significanceAndSuppression.test.ts`.
- **Small-Number Suppression (`Privacy (small numbers)`)**: `suppressionThreshold`, `suppressionMetrics`, `complementarySuppression` and `suppressionLabel`. Counts from 1 to threshold minus 1 are replaced by a label such as `<5`; the smallest visible nonzero sibling of a lone hidden cell is hidden too (complementary suppression, also among the root rows), so the value cannot be recovered by subtracting from the total; ratios and deltas built on a hidden cell are hidden; the grand total stays visible. Suppression runs last, so sorting, min/max colouring and the CSV export never see the hidden value, and the export writes the label. Logic in `src/utils/suppression.ts`.
- **Trend Sparklines**: `showSparklines` and `sparklineMetrics` add a `Trend` column per metric with a line over the periods in calendar order (single pivot dimension). The geometry is pure and deterministic (`computeSparkline` in `src/components/Sparkline.tsx`), gaps split the line and the colour follows the polarity.
- **Indicators in Conditional Formatting**: rules accept `icon` (`arrow_up`, `arrow_down`, `dot`, `flag`, `check`, `warning`) shown beside the value of a matching cell.
- **Benchmark Script**: `node scripts/bench.mjs [rows] [periods]` runs `transformProps` on a synthetic dataset. Results in `docs/BENCHMARK_v0.4.0.md`. The control audit of this release is in `docs/AUDIT_CONTROLLI_v0.4.0.md`.

### Changed
- **Calendar-Aware Period Order**: pivot periods that are Italian or English month names or weekday names follow the calendar, whole numbers compare numerically and composite keys compare part by part. ISO dates, quarters and free labels keep the lexicographic order.
- **Delta Colours Follow the Polarity**: a metric declared `lower_is_better` shows a decrease in green and an increase in red; without a definition the colours are unchanged.
- **`diff` Is Read as a Token**: names such as `Differibile` or `Prestazioni differite` (priority class D) are no longer taken for difference metrics, so they are summed and shown without a sign. Names with `Prenotazioni`, `Pazienti`, `Numero` or `in attesa` are no longer averaged as waiting times.
- **Control Label**: `Enable CSV / Excel Hierarchy Export` now reads `Enable CSV Hierarchy Export`, since only CSV exists.
- **Dependencies and Bundle**: removed the unused `d3-format` and `@types/lodash`, and the duplicate example image; `dist/index.esm.js` shrinks from 120.7 KB to 109.6 KB before the new features (121.6 KB with them).

### Fixed
- **Pivot Columns on Dates**: epoch timestamps used as pivot values were converted to ISO dates in the tree but not in the column keys, so the pivot cells, row totals and deltas came out empty. Tree and pivot now share one normalization (`src/utils/dimensionValue.ts`).
- **Derived Metrics on Pivoted Leaves**: a derived metric (for example a rate named `tasso_...`) received a value only for the first period of a leaf; every pivot cell now gets its own value.
- **`aggregationMode` avg, min, max and count**: the control offered them but the roll-up always summed. They are now applied to parent rows and the grand total (the weighted average keeps its explicit weight metric).
- **`showSubtotals`**: the option was resolved but never read; with it off, parent rows no longer show values.

### Performance
- Metric name classifiers are memoized, the tree path key is built incrementally, `Intl.NumberFormat` instances are created once, and the virtualization window updates once per block of 10 rows instead of on every scroll event. `transformProps` on 50,000 rows and 24 periods goes from 265 ms to about 180 ms (-30%).

## [0.3.3] - 2026-10-12
### Fixed
- **Volume Acceptance Count Exclusion in `formatMetricValue` and `isRateMetric`**: Additive volume count metrics containing `accettazione` combined with `totale`, `numero` or `conteggio` (such as `Accettazione Totale`) are no longer matched by the acceptance-rate heuristic (`acc_corr` / `acc_conf`), ensuring they are formatted as localized integers without a `%` suffix and summed rather than averaged in parent subtotals and `Grand Total`.
- **Leading-Percent Derived Metric Detection & Roll-up Recomputation (`isDerivedMetric`, `recomputeDerivedMetrics`, `computeHorizontalRowTotals`)**: Metrics whose base label starts with `%` (such as `% Self vs Operatore` and `%Self fallite vs Operatore`) are now recognized by `isDerivedMetric`, recomputed from aggregated `Self`, `Self - Fallite`, `Operatore` and `Accettazione Totale` operands on parent nodes, `Grand Total` and horizontal `ROW_TOTAL` columns, and protected from horizontal summation across pivot periods.
- **Temporal Dimension ISO Formatting in Tree Hierarchy and Pivots**: Epoch millisecond timestamps from database temporal/date columns in hierarchy dimensions and pivot keys are now automatically formatted as ISO date strings (`YYYY-MM-DD`) instead of displaying raw numeric timestamps.

## [0.3.2] - 2026-10-12
### Fixed
- **Distinct Entity Count Protection in `formatMetricValue`**: Physical entity count metrics identified by `isDistinctEntityMetric` (such as `Sportelli Attivi`, `Sedi Attive`, `Stanze Attive`) are now formatted strictly as localized integers (`Intl.NumberFormat('it-IT')`) even when the table-level `numberFormat` is set to `DURATION_COL` or `DURATION`, preventing active counter counts from displaying as `0:00` or sub-millisecond durations.
- **Duration vs Days Format Collision**: The heuristic rule for lead time in days (`gg`) in `formatMetricValue` no longer intercepts duration metrics containing `attesa` (such as `Attesa Media`, `Attesa Media Sportello`, `Attesa Media Preno Sportello`) when `formatterString` starts with `DURATION` or when the metric does not explicitly specify day units (`giorni`, ` gg`, `_gg`, `lt_off`), allowing queue waiting times to render in colon duration notation (`mm:ss`) rather than days (`gg`).

## [0.3.1] - 2026-10-12
### Added
- **Level-Aware Distinct Entity Roll-up (`isDistinctEntityMetric`, `resolveDistinctEntityDepth`)**: Metrics counting distinct physical units such as `Sportelli Attivi`, `Sedi Attive`, `Stanze Attive` and `Punti Attivi` now resolve the hierarchy depth of the counted entity (`entityDepth`, e.g. `depth = 1` for `Sportello` in `SedeDescrizione -> Sportello -> ServizioDescrizione -> GG Settimana -> FasciaOraria`) and apply a hybrid roll-up: `MAX` at and below `entityDepth` (including leaf record collisions and horizontal `ROW_TOTAL` across pivot months for a single desk) so an active unit evaluates to `1` rather than summing hourly/daily slices, and `SUM` above `entityDepth` (`SedeDescrizione` at `depth = 0` and `Grand Total`), yielding the exact count of distinct active units per facility and across the entire dataset while keeping `SUM` on additive volume metrics (`Arrivi`, `Serviti`, `Persi`, `Sportello Cup`, `Prenotazione Sportello`).
- **Duration Rate Metric Recognition (`isRateMetric`)**: Extended `isRateMetric` to match duration and mean metrics containing `tempo`, `durata` or `media` (such as `Tempo Gestione Sportello`), ensuring parent nodes and `Grand Total` compute the arithmetic/weighted average instead of summing averages.

## [0.3.0] - 2026-10-08
### Added
- **Per-Metric Goal Benchmarks**: A new `Goals (optional)` sub-group in `Comparison & Analysis` holds the `goals` control, a JSON list of `{ metricKey, target, direction }` entries where `direction` is `higher_is_better` (default) or `lower_is_better`. The resolved list becomes the typed `goals[]` field of the form data, the single goal model that later features such as the budget comparison read from. The pure engine `computeGoalDelta` in `src/utils/goalBenchmark.ts` returns the absolute and percentage gap to the target plus a status computed on the attainment ratio (actual / target, inverted for `lower_is_better`): `achieved` from 100%, `on_track` from 90%, `at_risk` from 75%, `missed` below. Zero targets and zero values are resolved without any division, so no `Infinity` or `NaN` can reach the table. Each metric cell whose column benchmarks a goal (plain metric columns and pivot value cells, never delta or total columns) shows a small badge with the signed gap, coloured by status. Malformed entries are ignored, and charts without goals render exactly as before. Covered by `test/transformPipeline.goals.test.ts`.
- **Time Comparison Controls Wired to the Pivot Periods**: The `timeGrain`, `referencePeriod` and `comparisonType` controls were saved with every chart but never read. They keep their names, so saved charts load unchanged, and `formDataOptions.ts` now resolves them to the typed fields `comparisonTimeGrain`, `comparisonReferencePeriod` and `comparisonStrategy`, falling back to `year`, `current` and `prev_period` for missing or unknown values. Periods come from the values of the single pivot column (`YYYY`, `YYYY-Qn`, `YYYY-MM`, `YYYY-MM-DD` or epoch timestamps), grouped by the selected grain; no query or time column control was added. The latest period is compared with a baseline chosen by `comparisonType`: with `prev_period` the `referencePeriod` decides it (`current` is the period itself, so the delta is 0; `previous` is the immediately preceding period; `ytd` is the average period of the current year to date), `prev_year_same_period` uses the period 12 months earlier, and `budget_target` uses the `target` of the matching `goals[]` entry. The pure functions `applyReferencePeriodDelta` and `computeTreeTimeDeltaByStrategy` in `src/utils/timeComparison.ts` write the absolute and percentage delta on every node, and the table shows them as a trailing column group, with the grand total recomputed from its own totals rather than summed. The default `current` and `prev_period` pair, and `budget_target` without goals, add nothing, so existing charts keep their layout. The three controls are shown only with exactly one pivot column, and `referencePeriod` only with `prev_period`. Covered by `test/timeComparison.referencePeriod.test.ts`.
- **Weighted Average Roll-up with an Explicit Weight Metric**: `AggregationFunction` now includes `weighted_avg`, and choosing `Weighted Average / Ratio` in the `aggregationMode` control (already offered but never applied) reveals a new `weightColumn` text control, shown only for that mode. When it names one of the query metrics, every parent subtotal and the grand total become `sum(value * weight) / sum(weight)` over the children, matched per pivot column (`price___2024` is weighted by `qty___2024`), while the weight metric itself is summed so each level weights the next one correctly. The explicit weight replaces the automatic `richieste`/`volume` weights that rate metrics used before; when every weight is zero the value falls back to the plain arithmetic mean instead of dividing by zero. Delta metrics are still recomputed from the aggregated operands. With `weightColumn` empty, or with any other aggregation mode, the roll-up is exactly the previous one, so existing charts are unaffected. The pure `weightedAvgOnNode(node, weightColumn, metric)` in `src/utils/aggregations.ts` exposes the calculation; covered by `test/weightedAvg.test.ts`.
- **Conditional Formatting Rules**: The `conditionalFormatting` form data field, typed since the first releases but never exposed, now has a control in the `Sorting & Conditional Formatting` sub-group: an `ArrayControl` that edits the rules as a JSON list and saves them as an array. The existing `ConditionalFormattingRule` model is extended rather than duplicated: `operator` adds `regex` to `<`, `<=`, `==`, `>=`, `>` and `between` (which reads `targetValue2` as the other bound), and the new `priority` and `scope` fields decide which rule applies and where. Rules are resolved by ascending priority and the first match wins, so priority 1 always beats priority 2 on the same value; a rule without a priority takes its position in the list. `cell` colours the matching cell, `row` colours every metric cell of the node row (the legacy `highlightRow` flag means the same), and `column` is tested once against the pivot value of each generated column, so a pattern such as `^2026` highlights every 2026 column. Matches get the `ht-cond-1`, `ht-cond-2` and `ht-cond-3` classes (success, warning and danger, priority 3 and beyond share the last), and `backgroundColor`/`textColor` override them. The regex operator stays deterministic without any execution timeout, since a running JS regex cannot be interrupted: patterns longer than 256 characters, values longer than 1000 characters, patterns that do not compile, and patterns with nested or redundant quantifiers such as `(a+)+b`, `(a|a)*` or `(a*)*` (rejected by a static check before compiling) simply leave the value unformatted, and no error reaches the table. The pure engine `applyConditionalFormatting` lives in `src/utils/conditionalFormatting.ts`; `columnBuilders.ts` turns the rules into per-column metadata that `buildColumnMetaMap` stores in `ColumnMeta`, and the existing row renderer applies it to the metric cells. Charts without rules render as before. Covered by `test/conditionalFormatting.test.ts`.
- **Theme & Palette Profiles**: The min/max badges, the heatmap and the data bars always used the `stratum` style, although the `emerald`, `ocean` and `sunset` styles already existed in the stylesheet and in `getHeatmapBgColor`. A new `Theme & Palette` sub-group at the end of `Formatting & Aesthetics` adds the `themeProfile` control with five profiles, each mapped onto one of those existing styles, which keep their names: `standard` (`stratum`, the default, so existing charts look the same), `colorblind` (`ocean`, with Okabe-Ito blue and vermillion colours), `stratum-warm` (`sunset`), `stratum-cool` (`emerald`) and `custom`. With `custom`, the `customPositiveHex`, `customNegativeHex` and `customNeutralHex` controls colour the MAX badge, the MIN badge and the data bars. Values must match `#RRGGBB`; an empty value keeps the standard colour, and an invalid one keeps it too and adds a warning. The contrast ratio of each custom colour against white is computed with the WCAG formula in plain arithmetic (no new dependency), and colours below 3:1 add a warning to the resolved theme. `getTheme(name, custom)` in `src/utils/themes.ts` resolves the profile, `transformProps` passes it to the table as the `theme` prop (omitted for `standard`), and `HierarchicalTable.tsx` applies the matching `theme-*` class. Covered by `test/themes.test.ts`.
- **Expression Sorting and Empty Value Placement**: The default sort could only target the hierarchy name or a query metric. `defaultSortColumn` now also accepts the structural keys `__tree_level__` (node depth) and `__leaf_count__` (number of leaves under a node) and virtual `delta_*_pct` expressions, and its choices list them dynamically: every `x_corr` metric in the query offers `delta_x_pct`. A delta expression missing from the node metrics is evaluated on a copy through the same `recomputeDerivedMetrics` rules that fill the delta columns, so the table data is never modified. A new `nullHandling` control (`Empty Values`) decides where null, NaN and undefined values go: `bottom` (the default, matching the previous behavior in both ascending and descending order), `top`, or `exclude`, which hides those rows while a metric sort is active and always keeps the grand total. The logic lives in `sortTreeByExpression` in `src/utils/treeBuilder.ts`, which now backs both `sortTreeHierarchy` and the existing sort call in `HierarchicalTable.tsx`, so there is still a single sorting path. Covered by new scenarios in `test/sortingAndMinMax.test.ts`.
- **Row Virtualization for Large Trees**: Expanding a large hierarchy rendered every visible node at once, which made scrolling slow on trees with thousands of rows. `Performance & Limits` now holds `pageSize` (`Page Size`, a slider from 50 to 2000, default 100; the field already existed in the form data but had no control) and `virtualizationThreshold` (`Virtualize Above Rows`, default 500). When the expanded tree has more rows than the threshold, the table renders only `pageSize` rows from the first visible one plus a 20 row buffer on each side, and two spacer rows keep the scroll height of the full tree. Smaller trees render exactly as before. The window comes from the pure, DOM-free `computeRenderWindow` in `src/components/useFlatTreeVirtualization.ts`, wrapped by the `useFlatTreeVirtualization(tree, options)` hook. Rendered rows keep using the click handlers owned by the table, so `onCrossFilter` and `onClearFilter` behave the same inside the window. Covered by `test/virtualization.test.ts`, whose deterministic cases include a 2000 node window calculation that must finish in under 250 ms; no browser paint is measured.
- **Control Panel Layout Test (`test/controlPanelLayout.test.ts`)**: Locks the four macro-sections and their order, the sub-group headings, the placement of each former section's controls and the full set of control `name` keys from v0.2.10, so later control additions cannot silently rename or drop a saved chart setting. The Node Jest environment has no runtime copy of `@superset-ui/chart-controls` (the host Superset provides it), so `jest.config.js` maps the module to a small local test mock (`test/__mocks__/chartControlsMock.ts`); no dependency was added.

### Changed
- **Explore Control Panel Reorganized into Four Macro-Sections**: The six flat sections are regrouped, in order, into `Data` (formerly `Query Configuration`), `Customize`, `Comparison & Analysis` and `Performance & Limits`, so the panel reads from query setup to presentation to analysis and leaves a dedicated place for upcoming performance settings. `Customize` gathers `Hierarchy & Tree Display Options`, `Sorting & Conditional Formatting` and `Formatting & Aesthetics` as sub-groups separated by heading and divider rows; `Comparison & Analysis` gathers `Time Comparison & Period-over-Period Variance` and `Advanced Rollup Calculations` the same way; `row_limit` moves to `Performance & Limits`. The section list stays a flat array and every control keeps its technical `name`, so existing saved charts load unchanged.
- **Single Minified ESM Bundle via esbuild**: New `scripts/build.mjs` (`npm run build:esm`) bundles `src/index.ts` into `dist/index.esm.js` (ES2020 target, minified, linked source map without embedded sources since `src/` ships with the package). React, `@superset-ui/core`, `@superset-ui/chart-controls` and the modular `echarts/*` paths stay external so the host Superset build provides them; `HierarchicalTable.css` is minified and injected at runtime so the bundle is self-contained. `main` and `module` now both point to the bundle and `tsc` emits declarations only, which brings `dist/` from 329,032 B to about 232 KB.
- **Build Chain**: `npm run build` keeps the `tsc || node ../../node_modules/typescript/lib/tsc.js || npx tsc` fallback chain (grouped so it also works under `cmd.exe`) and then runs `build:esm`. `esbuild` ^0.25 added to `devDependencies`.
- **Package Metadata**: `@superset-ui/chart-controls` is now declared in `peerDependencies` (marked optional, the host Superset always provides it; the local type stub stays for standalone typechecks) and `sideEffects` is set to `["*.css"]` so bundlers can tree-shake every JS module while keeping the stylesheet import.
- **Stricter TypeScript**: `noUnusedLocals` and `noUnusedParameters` enabled; the unused `MinMaxBound` import, the unused `metrics` destructuring in `HierarchicalTable.tsx`, the unused `thumbnail-dark.png` import and the unused cross-filter `pathMap` parameter name were cleaned up with no behavior change.

### Removed
- **Dead Runtime Dependencies `lodash`, `antd`, `@ant-design/icons`**: none of them is imported by `src/`; dropping them removes 62 packages from the install tree.

## [0.2.10] - 2026-10-08
### Changed
- **`transformProps.ts` Decomposed into Pure Modules**: The ~850-line monolithic function now only wires the pipeline. Option resolution (camelCase/snake_case aliases and defaults) lives in `src/plugin/formDataOptions.ts`, tree construction and variance deltas in `src/plugin/treeData.ts`, pivot value collection and ordering in `src/plugin/pivotOrdering.ts`, column/header construction for the flat, single-pivot (combined/separated) and two-way pivot layouts in `src/plugin/columnBuilders.ts` (orchestrated by `src/plugin/metricLayout.ts`), the grand total in `src/plugin/grandTotal.ts`, and the `onCrossFilter`/`onClearFilter` handlers with their data mask builders in `src/plugin/eventHandlers.ts`. Output shape, formulas and formats are unchanged.
- **`HierarchicalTable.tsx` Column Metadata and CSV Export Extracted**: Display column selection and delta-column detection moved to `src/utils/tableColumns.ts` (`ColumnMeta` is still re-exported by the component); CSV row building, cell escaping, serialization and download moved to `src/utils/csvExport.ts`.

### Added
- **Direct Unit Tests for the Delta Engine (`test/aggregations.test.ts`)**: `recomputeDerivedMetrics` against the AGENTS.md §5.3 naming conventions (`delta_richieste_pct`, `delta_accesso_diretto_pct`, `delta_programmata_pct`, `delta_prime_visite_pct`, `delta_controlli_pct`, generic `delta_X_pct -> X / X_conf`, pivot suffixes, `Nuovo`/0/null edge cases, saved dataset metrics vs adhoc metrics with custom labels), `rollupTreeMetrics` (multi-level subtotals, weighted rate metrics, derived fallbacks) and `computeGrandTotal`.
- **Characterization Snapshot of `transformProps`** (`test/transformProps.characterization.test.ts`): 15 representative fixtures (flat, snake_case options, variance delta, single and two-way pivot layouts, parent-child, empty data) recorded on the pre-refactor implementation, including formatter outputs and emitted cross-filter data masks.
- **Unit Tests for the Extracted Modules**: `test/formDataOptions.test.ts`, `test/pivotOrdering.test.ts`, `test/columnBuilders.test.ts`, `test/transformPipeline.test.ts`, `test/eventHandlers.test.ts`, `test/tableExport.test.ts`.

## [0.2.9] - 2026-10-07
### Fixed
- **Rigid idempotence of the registration in `MainPreset.ts`**: The check for an existing configuration in `install-plugin.ps1` now matches the canonical form line by line: `new HierarchicalTableChartPlugin().configure({ key: 'hierarchical_table' }),`. Legacy variants with `.register()`, anomalous indentation and duplicates are normalized to the canonical form instead of being considered already configured.

### Removed
- **Stale nested copy `packages/superset-plugin-chart-hierarchical-table` (v0.2.3)**: Removed the legacy copy of the plugin in `packages/` (the plugin lives at the root of the repository). As a consequence, removed the fallbacks to `packages/` in `install-plugin.ps1` and the source path in `scripts/install.ps1`, updated the `test-frontend` target of the `Makefile` to run the tests from the root, removed the extraneous entry from `package-lock.json` and updated the references in `MAINTAINER.md` and `docs/installation.md`. The Python package `packages/superset-hierarchical-table-backend` is left intact.

## [0.2.8] - 2026-10-06
### Added
- **Two-Way Hierarchical Pivot Columns (Qlik Sense-style hierarchical cross columns)**: Universal architecture for the horizontal multidimensional split when there are two pivot dimensions (e.g. Fascia Oraria and Canale), keeping the aggregation correct and isolated for each leaf column.
- **Intermediate column subtotals (`showPivotColumnSubtotals`)**: Control to enable the subtotal column (`Totale`) inside each first-level pivot group, computed as a closed aggregation of the child columns.
- **Customizable column subtotal label (`pivotColumnSubtotalLabel`)**: Text field to customize the label of the column subtotal (default `Totale`).
- **Row totals macro-block split by channel**: Expansion of the horizontal row totals group (`Totals`) to include both the overall Grand Total and the totals aggregated for each value of the second pivot dimension across all the slots.
- **Dedicated CSS styles for column subtotals**: Classes `.pivot-subtotal-col` and `.pivot-subtotal-cell` for the distinct formatting of subtotal columns compared with the leaf cells and the row totals.
- **Dedicated test suite `test/multiPivotColumns.test.ts`**: Complete Jest tests for building the two-pivot-dimension tree, accounting reconciliation on the Grand Total and correct emission of two-level headers.

### Changed
- **Explore control panel**: Integrated the pivot column subtotal controls directly into the query configuration flow.

## [0.2.7] - 2026-10-06
### Added
- **Two-Way Pivot Matrix Grid (Qlik/Excel-style cross grid)**: Universal architecture for the automatic calculation of the Horizontal Row Totals (`computeHorizontalRowTotals`) for each node (leaves, intermediate subtotals and Grand Total).
- **Configurable position of the horizontal row totals (`pivotRowTotalsPosition`)**: New Explore control to place the Totals macro-block on the left (`left`, Qlik Sense style, visible right before the horizontal scroll), on the right (`right`, Excel/classic style at the end of the table), or turned off (`none`).
- **Customizable horizontal totals label (`pivotRowTotalsLabel`)**: Text control to customize the header label (e.g. `Totals`, `Totale Complessivo`, `Consuntivo`).
- **Mathematical reconciliation at the totals intersection**: Perfect two-way accounting consistency between the sum of the row totals and the sum of the column totals on the Grand Total.
- **Dedicated CSS styles for total columns**: Classes `.pivot-row-totals-group`, `.pivot-row-totals-col` and `.pivot-row-totals-cell` for a clear visual distinction of the aggregation columns.
- **Jest unit test suite**: Added `test/pivotRowTotals.test.ts` with 5 complete scenarios for algebraic validation, left/right positioning and compatibility with the Grand Total.

### Fixed
- **Resilient test scripts**: The `test` and `test:watch` scripts in `package.json` were updated to support both standalone execution and execution inside the monorepo.
### Changed
- **Explore control panel**: Moved the automatic delta calculation controls (`pivotTimeDeltaMode` and `pivotTimeDeltaLag`) directly into the main Query section, right below the pivot columns and the sorting, making them immediately accessible without opening the advanced block.
- **Optimized support for a single metric**: Enabled the automatic generation of the Delta sub-columns under each month even with a single numeric metric selected (e.g. `Totale`), removing the need to calculate the Delta column on the SQL/DWH side.

## [0.2.5] - 2026-10-05
### Added
- **combineMetric (Pivot Metrics Side by Side)**: New option in the control panel that inverts the header hierarchy, exposing the columns per time period (e.g. Ott 2026, Set 2026) at the first level and placing the metrics side by side (`Totale | Delta`) at the second level, faithfully replicating the behavior of `pivot_table_v2`.
- **pivotSortOrder (Pivot Column Sorting)**: Support for descending time sorting (`desc`, most recent on the left), ascending (`asc`, chronological) or query order (`none`).
- **pivotTimeDeltaMode (Automatic Time Delta)**: Native and dynamic calculation of the absolute and/or percentage delta along the pivot columns without SQL window functions (`LAG OVER`), applied recursively to leaves, subtotals and Grand Total.
- **pivotTimeDeltaLag (Comparison Step)**: Ability to select the time offset (1 period for MoM/YoY, 2 or 3 for QoQ, 12 for monthly YoY).
- **Unit Test Suite**: Added the complete test suite `test/pivotTimeDelta.test.ts` with 6 mathematical reconciliation tests for absolute and percentage delta, handling of null/new nodes, Grand Total and `transformProps` integration.

### Changed
- **HierarchicalTable & Formatters**: Automatic recognition and formatting with color prefixes (`.delta-positive`, `.delta-negative`, `Nuovo` badge), both for dynamically generated keys and for native delta columns of the dataset.

### Fixed
- **Jest test script**: Aligned the Jest binary path in `package.json`.

## [0.2.4] - 2026-10-05
### Added
- **Sticky Hierarchy Column**: Implemented a sticky hierarchy column on the left (`position: sticky; left: 0`) with a separation shadow, keeping the tree always visible during horizontal scrolling in extended pivot tables.
- **Debounced Search**: Introduced a 250ms debounce with immediate controlled input and a quick reset button for the text search box.

### Changed
- **React.memo Row Component**: Split out and memoized the row rendering in the `HierarchicalTableRow` component, preventing cascading re-renders during node expansion or typing.
- **Precomputed Column Metadata**: Optimized the lookup of metric columns through a precomputed map (`columnMetaMap`), removing redundant string checks on every frame.
- **CSS Layout Isolation**: Added the CSS directive `contain: layout style` on the table rows to reduce browser reflow times on large datasets.

## [0.2.3] - 2026-10-05
### Fixed
- **Time Comparison Module Resolution**: Synchronized the module `src/utils/timeComparison.ts` into the `packages/` folder and prioritized the root path `src/index.ts` in the `install-plugin.ps1` script, resolving the Webpack build error `Can't resolve '../utils/timeComparison'`.

## [0.2.2] - 2026-10-02
### Added
- **Inline Data Bars (Excel-style)**: Enhanced the visualization with inline data bars within metric cells when `minMaxDisplayMode` is set to `data_bars`.
- **Glassmorphism CSS**: Upgraded the table styling with modern glassmorphism effects (`backdrop-filter: blur(8px)`) for the sticky header and improved spacing.

### Removed
- **Manual Styling Clutter**: Removed technical UI controls (`indentSize`, `stickyFirstColumn`, `minMaxColorTheme`) from the control panel to reduce configuration fatigue.
- Hardcoded optimal layout logic and removed the deprecated CSS class `.sticky-first-col` as it was causing visual bugs.

## [0.2.1] - 2026-09-01
### Added
- Initial release for the Hierarchical Table plugin.

[Unreleased]: https://github.com/FrancescoCastaldi/superset-plugin-chart-hierarchical-table/compare/v0.10.0...HEAD
[0.10.0]: https://github.com/FrancescoCastaldi/superset-plugin-chart-hierarchical-table/compare/v0.9.0...v0.10.0
[0.4.1]: https://github.com/FrancescoCastaldi/superset-plugin-chart-hierarchical-table/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/FrancescoCastaldi/superset-plugin-chart-hierarchical-table/compare/v0.3.3...v0.4.0
[0.3.3]: https://github.com/FrancescoCastaldi/superset-plugin-chart-hierarchical-table/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/FrancescoCastaldi/superset-plugin-chart-hierarchical-table/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/FrancescoCastaldi/superset-plugin-chart-hierarchical-table/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/FrancescoCastaldi/superset-plugin-chart-hierarchical-table/compare/v0.2.10...v0.3.0
[0.2.10]: https://github.com/FrancescoCastaldi/superset-plugin-chart-hierarchical-table/compare/v0.2.9...v0.2.10
[0.2.9]: https://github.com/FrancescoCastaldi/superset-plugin-chart-hierarchical-table/compare/v0.2.8...v0.2.9
[0.2.8]: https://github.com/FrancescoCastaldi/superset-plugin-chart-hierarchical-table/compare/v0.2.7...v0.2.8
[0.2.7]: https://github.com/FrancescoCastaldi/superset-plugin-chart-hierarchical-table/compare/v0.2.5...v0.2.7
[0.2.5]: https://github.com/FrancescoCastaldi/superset-plugin-chart-hierarchical-table/compare/v0.2.4...v0.2.5
[0.2.4]: https://github.com/FrancescoCastaldi/superset-plugin-chart-hierarchical-table/compare/v0.2.3...v0.2.4
[0.2.3]: https://github.com/FrancescoCastaldi/superset-plugin-chart-hierarchical-table/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/FrancescoCastaldi/superset-plugin-chart-hierarchical-table/compare/v0.2.1...v0.2.2

