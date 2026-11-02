# StratumTree (Hierarchical Table & Matrix Grid) - Plugin for Apache Superset

Frontend visualization plugin for **Apache Superset 6.1.0+** providing a rich, interactive Tree Table and Matrix Grid Chart Plugin (StratumTree) with multi-level rollup aggregations, parent-child graph resolution, cross-filtering, explicit metric semantics, confidence intervals and small-number suppression for health data.

![StratumTree in Superset](docs/images/demo.gif)

*Recorded in Chrome on a running Superset: expanding all levels, searching the hierarchy and collapsing it again.*

---

## 📸 Visual Preview

### 🖥️ Screenshots from Superset

![StratumTree on a dashboard](docs/images/live_dashboard_showcase.png)

*Figure 1: StratumTree on Superset's example sales data: territory, country and product line with subtotals, a grand total, heatmap shading, search and CSV export.*

### 🌳 Tree Hierarchy & Advanced Matrix View

![StratumTree pivot](docs/images/hierarchical_table_preview.jpg)

*Figure 2: A pivot by year: product line and deal size down the side, years across the top.*

---

## 🌟 Key Features

- **Four Macro-Sections Control Panel**: Organized canonically into `Data`, `Customize`, `Comparison & Analysis`, and `Performance & Limits`.
- **Dual-Mode Hierarchy**: Multi-Dimension Level Grouping (e.g. Region, Country, City, Store) and Parent-Child Adjacency (ID / Parent ID / Label).
- **Time Comparison & Variance**: Time grain, reference period (current, previous, ytd), and comparison strategy (prev_period, prev_year_same_period, budget_target) wired end-to-end against pivot periods.
- **Weighted Average Rollup**: Native `weighted_avg` aggregation with explicit `weightColumn` metric selection and fallback to arithmetic mean when weights sum to zero.
- **Prioritized Conditional Formatting**: Cell, row, and column rules with operators (<, <=, ==, >=, >, between, regex) resolved by ascending priority order with static regex safety safeguards.
- **Theme & Palette Profiles**: 5 nominal palette profiles (`standard`, `colorblind`, `stratum-warm`, `stratum-cool`, `custom`) with custom hex overrides and WCAG contrast ratio checks.
- **Goal Benchmarks**: Per-metric target thresholds with attainment calculation, status progression (`achieved`, `on_track`, `at_risk`, `missed`), and directional evaluation (`higher_is_better`, `lower_is_better`).
- **Expression & Metric Sorting**: Sorting by hierarchy name, query metrics, structural properties (`__tree_level__`, `__leaf_count__`), and derived expressions (`delta_*_pct`), paired with configurable `nullHandling` (`bottom`, `top`, `exclude`).
- **Large Tree Virtualization**: Configurable `pageSize` and `virtualizationThreshold` using windowed rendering for high-volume trees with parent-delegated cross-filter interactions.
- **Multi-Selection Cross-Filtering**: Native Superset 6.1.0 `setDataMask` integration with grouped `IN` filters, checkboxes and multi-row highlighting.
- **Automatic Rollups & Grand Total**: Post-order tree aggregation for subtotals (SUM, AVG, MIN, MAX, COUNT, WEIGHTED_AVG), level-aware hybrid MAX/SUM roll-ups for distinct physical unit counters (`Sportelli Attivi`, `Sedi Attive`), automatic averaging for duration/rate metrics (`Tempo Gestione Sportello`), and a Grand Total row.
- **Two-Way Pivot Matrix Grid**: Horizontal row totals and column subtotals (the pivot time delta columns work with a single pivot dimension).
- **Metric Definitions**: Declare per metric `sum`, `mean`, `distinct_count`, `ratio` (parents and totals are a ratio of sums), `delta_pct`, `diff` (exact node-level difference current minus baseline, also on parent rows and the grand total) or `none`, plus format and polarity, instead of relying on name heuristics.
- **Confidence Intervals and Significance Signal**: Wilson and Poisson intervals on ratios, with a marker only when the whole interval lies above or below the parent, the total or the goal.
- **Small-Number Suppression**: Hides counts below a threshold with complementary suppression, so published tables do not disclose small cells (hidden values never reach sorting, colours or the CSV export).
- **Trend Sparklines and Indicators**: A Trend column per metric over the periods, and icons on conditional formatting rules.
- **Interactive What-If Simulation & Scenario Manager**: Real-time simulation toolbar with sliders (-50% to +50%), leaf-level multiplier recalculation, ratio and subtotal rollup consistency, polarity-aware in-cell delta badges (▲/▼), preset scenario saving in session storage, and enriched CSV export.

## 🔗 Cross-filtering: how to turn it on

1. **In the chart** (Explore, section *Interaction*/*Cross-filtering*): the option **Emit Dashboard Cross-Filters** is on by default. Turn it off to stop the chart from filtering the others.
2. **On the dashboard**: cross-filtering is enabled by default in Superset 6 (feature flag `DASHBOARD_CROSS_FILTERS`). Open the filter bar and its *Cross-filters* tab to choose which charts a filter reaches.
3. **Use it**: Tick the checkbox of a row: the other charts are filtered by the path of that node (for example territory and country). Tick several rows to combine them. The other charts reload and show a filter badge in their header.
4. **Clear it**: click the same item again, or use *Clear all* in the filter bar.

The other charts must have the filtered column in their dataset: a chart without it ignores the filter. Turn on *Also filter this table* to apply the selection to the table itself, which then shows only the selected rows.

## Installation & Setup

Install the plugin dependency:

```bash
npm install superset-plugin-chart-stratum-hierarchical-table
```

### Registration in Superset

In `superset-frontend/src/visualizations/presets/MainPreset.ts` (or `MainPreset.js`):

```typescript
import { HierarchicalTableChartPlugin } from 'superset-plugin-chart-stratum-hierarchical-table';

new HierarchicalTableChartPlugin().configure({ key: 'hierarchical_table' }).register();
```

### Local Automated Installation

To register and synchronize the plugin directly into a local Apache Superset development environment, run:

```bat
install.bat
```

or use the PowerShell installer:

```powershell
powershell -ExecutionPolicy Bypass -File install-plugin.ps1
```

## Build & Validation

To build declarations and the ESM bundle:

```bash
npm run build
```

The build compiles TypeScript declarations and bundles `dist/index.esm.js` via esbuild.

To run typechecking:

```bash
npx tsc --noEmit
```

To run the complete Jest test suite:

```bash
npm test
```

## Live Dev Studio (Superset Explore Workbench)

A dedicated interactive development workbench is included in `dev-studio/` for rapid prototyping, visual verification, and interactive control testing without needing a running Superset backend.

### Launching the Dev Studio

Start the local development server:

```bash
npm run dev
```

Or on Windows, double-click:

```cmd
dev.bat
```

The workbench opens at `http://localhost:5173/` with sub-50ms Hot Module Reloading (HMR).

### More views

Screenshots of real charts in Chrome, on Superset's example sales data.

#### Hierarchy with heatmap shading

![Hierarchy with heatmap](docs/images/tree_overview.png)

#### Pivot by year

![Pivot](docs/images/tree_pivot.png)

#### Many rows, three levels deep

![Many rows](docs/images/tree_many_rows.png)

#### In-cell data bars

![Data bars](docs/images/tree_data_bars.png)

### Dev Studio Features

- **Split-Screen Layout**: Left panel houses the full Superset Explore control panel (5 collapsible accordion sections); right panel displays the live chart rendering; bottom drawer monitors runtime events.
- **Interactive Explore Controls**: Toggle hierarchy modes, change rollup aggregations, switch display modes (Values, Delta, Both), configure Table Calculations, enable Diverging Heatmaps and Bipolar Data Bars, adjust privacy suppression thresholds, and tweak virtualization settings with instant re-render.
- **Built-in Benchmark Scenarios**:
  - *Healthcare & Sanita*: Multi-level regional hierarchy (Regione, ASL, Ospedale, Reparto), admissions, bed occupancy rate, deltas, and privacy suppression (<5).
  - *Sales Multi-Pivot*: Multi-dimension pivots (Quarter, Channel), table calculations (% of Column Total, Running Total), and bipolar bars for profit margin.
  - *High-Volume Stress Test*: 5,000-row tree generator validating 60fps virtualization and windowing performance.
- **Diagnostics & Event Drawer**: Real-time monitor logging Superset `setDataMask` cross-filter emissions, Context Menu drill events, and transform pipeline calculation latency in milliseconds.
- **Preset Management & Export**: Switch presets or export active `formData` as clean JSON for direct paste into Superset dashboards or automated tests.
- **Superset REST API Integration (`POST /api/v1/chart/`)**: Direct generation of `ChartPostSchema` payloads conforming to official documentation, with copyable cURL, Python and PowerShell scripts, as well as in-browser direct API dispatch.

## Superset REST API Integration (`POST /api/v1/chart/`)

In compliance with the official [Superset Create Chart API](https://superset.apache.org/developer-docs/api/create-a-new-chart/), the plugin provides tools to programmatically create and register charts directly onto any Apache Superset instance.

### CLI Automation Script

Use [`scripts/create_chart_api.py`](scripts/create_chart_api.py) to create charts from the command line:

```bash
# Test the payload generation without sending network requests
python scripts/create_chart_api.py --dry-run --preset healthcare

# Create chart on a live Apache Superset instance
python scripts/create_chart_api.py \
  --url http://localhost:8088 \
  --username admin \
  --password admin \
  --dataset-id 1 \
  --chart-name "Monitoraggio Strutture Sanitarie" \
  --preset healthcare
```

### Dev Studio API Modal

Within the Dev Studio (`http://localhost:5173/`), click **🌐 Esporta API (POST /api/v1/chart/)** in the top navigation bar to:

1. Preview the exact `ChartPostSchema` JSON structure containing serialized `params` and `query_context`.
2. Copy ready-to-run cURL (Bash), Python (requests), or PowerShell scripts with automated JWT login and CSRF handling.
3. Execute a live REST request directly from the browser to create the chart and obtain a direct link to Superset Explore (`/explore/?slice_id=...`).
