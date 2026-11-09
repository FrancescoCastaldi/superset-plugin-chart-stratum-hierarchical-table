import {
  ControlPanelConfig,
  sharedControls,
  D3_FORMAT_OPTIONS,
} from '@superset-ui/chart-controls';
import { isValidHex } from '../utils/themes';

const t = (str: string) => str;

// Explore renders a React element placed in a control row as-is: this gives macro-sections
// visual sub-groups while controlPanelSections stays a flat list of sections.
const subsectionHeader = (label: string) => <h4 className="section-header">{label}</h4>;
const subsectionDivider = () => <hr />;

// Explore also accepts a component as control type: the list is edited as JSON and stored in
// the form data as a real array; text that does not parse to an array is not saved.
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
            // Incomplete JSON while typing: the last valid list stays saved.
          }
        }}
      />
    </label>
  );
}

const customHexControl = (name: string, label: string) => ({
  name,
  config: {
    type: 'TextControl',
    label,
    renderTrigger: true,
    default: '',
    description: t('#RRGGBB or empty for the standard color; keep 3:1 contrast on white.'),
    validators: [(v: string) => (!v || isValidHex(v) ? false : t('Use the #RRGGBB format'))],
    visibility: ({ controls }: { controls: any }) => controls?.themeProfile?.value === 'custom',
  },
});

// The time comparison reads its periods from the values of a single pivot column or general variance delta.
const isSinglePivot = ({ controls }: { controls: any }) =>
  controls?.hierarchyType?.value === 'multi_dimension' &&
  Array.isArray(controls?.columns?.value) &&
  controls.columns.value.length === 1;

const isComparisonVisible = ({ controls }: { controls: any }) =>
  Boolean(controls?.showVarianceDelta?.value) ||
  isSinglePivot({ controls });

export const CUSTOM_D3_FORMAT_OPTIONS: [string, string][] = [
  ['SMART_NUMBER', 'Adaptive formatting (Smart Number)'],
  [',d', '1,234 (Integer)'],
  ['.2f', '1234.56 (2 decimals)'],
  [',.2f', '1,234.56 (2 decimals)'],
  [',.1f', '1,234.6 (1 decimal)'],
  ['.2%', '12.34% (Percentage)'],
  ['.1%', '12.3% (Percentage)'],
  ['~s', '1.2k (SI prefix)'],
];

const config: ControlPanelConfig = {
  controlPanelSections: [
    {
      label: t('Data'),
      expanded: true,
      controlSetRows: [
        [
          {
            name: 'hierarchyType',
            config: {
              type: 'SelectControl',
              label: t('Hierarchy Mode'),
              default: 'multi_dimension',
              choices: [
                ['multi_dimension', t('Multi-Dimension Grouping (Level-based)')],
                ['parent_child', t('Parent-Child Adjacency (ID / Parent ID)')],
              ],
              renderTrigger: false,
              description: t(
                'Choose whether hierarchy is derived from ordered categorical dimensions or parent-child relations.',
              ),
            },
          },
        ],
        [
          {
            name: 'groupby',
            config: {
              ...sharedControls.groupby,
              label: t('Hierarchy Dimensions / Rows (in order)'),
              description: t('Select dimensions from highest to lowest level of hierarchy for rows (e.g. FARE LIV1 > FARE LIV2 > Prestazione).'),
              clearable: true,
              validators: [],
              visibility: ({ controls }: { controls: any }) =>
                controls?.hierarchyType?.value === 'multi_dimension',
            },
          },
        ],
        [
          {
            name: 'columns',
            config: {
              ...sharedControls.groupby,
              label: t('Pivot columns (horizontal matrix)'),
              description: t('Optional: group metrics horizontally by one or more dimensions (e.g. RegimeErogazione).'),
              clearable: true,
              validators: [],
              visibility: ({ controls }: { controls: any }) =>
                controls?.hierarchyType?.value === 'multi_dimension',
            },
          },
        ],
        [
          {
            name: 'combineMetric',
            config: {
              type: 'CheckboxControl',
              label: t('Combine metrics by column (side by side for each pivot column)'),
              renderTrigger: true,
              default: true,
              description: t(
                'Display all metrics side by side under each pivot column value (e.g., [Oct 2026 > Total | Delta]) instead of separating metrics into distinct column groups.',
              ),
              visibility: ({ controls }: { controls: any }) =>
                controls?.hierarchyType?.value === 'multi_dimension' &&
                Boolean(controls?.columns?.value && controls.columns.value.length > 0),
            },
          },
          {
            name: 'pivotSortOrder',
            config: {
              type: 'SelectControl',
              label: t('Pivot columns order'),
              default: 'desc',
              renderTrigger: true,
              choices: [
                ['desc', t('Descending / most recent first (e.g. Oct 2026 -> Jan 2026)')],
                ['asc', t('Ascending / Cronologico (e.g. Gen 2026 -> Ott 2026)')],
                ['none', t('Appearance / Query Order')],
              ],
              description: t('Order in which pivot columns appear across the table.'),
              visibility: ({ controls }: { controls: any }) =>
                controls?.hierarchyType?.value === 'multi_dimension' &&
                Boolean(controls?.columns?.value && controls.columns.value.length > 0),
            },
          },
        ],
        [
          {
            name: 'pivotRowTotalsPosition',
            config: {
              type: 'SelectControl',
              label: t('Pivot row totals (horizontal row totals)'),
              default: 'none',
              renderTrigger: true,
              choices: [
                ['none', t('None (no horizontal total)')],
                ['left', t('Left / start (Qlik Sense style, before the pivot columns)')],
                ['right', t('Right / end (classic Excel style, at the end of the table)')],
              ],
              description: t(
                'Places the row totals macro-column on the left (Qlik Sense style) or on the right.',
              ),
              visibility: ({ controls }: { controls: any }) =>
                controls?.hierarchyType?.value === 'multi_dimension' &&
                Boolean(controls?.columns?.value && controls.columns.value.length > 0),
            },
          },
          {
            name: 'pivotRowTotalsLabel',
            config: {
              type: 'TextControl',
              label: t('Pivot row totals label'),
              default: 'Totals',
              renderTrigger: true,
              description: t(
                'Text shown in the header of the horizontal totals column (e.g. Totals, Grand total, Actuals).',
              ),
              visibility: ({ controls }: { controls: any }) =>
                controls?.hierarchyType?.value === 'multi_dimension' &&
                Boolean(controls?.columns?.value && controls.columns.value.length > 0) &&
                controls?.pivotRowTotalsPosition?.value &&
                controls?.pivotRowTotalsPosition?.value !== 'none',
            },
          },
        ],
        [
          {
            name: 'showPivotColumnSubtotals',
            config: {
              type: 'CheckboxControl',
              label: t('Show pivot column subtotals'),
              renderTrigger: true,
              default: true,
              description: t(
                'Shows the subtotal column for each first-level pivot group (and in the Totals block), next to the values of the second pivot dimension.',
              ),
              visibility: ({ controls }: { controls: any }) =>
                controls?.hierarchyType?.value === 'multi_dimension' &&
                Boolean(controls?.columns?.value && controls.columns.value.length > 0),
            },
          },
          {
            name: 'pivotColumnSubtotalLabel',
            config: {
              type: 'TextControl',
              label: t('Pivot column subtotal label'),
              default: 'Total',
              renderTrigger: true,
              description: t(
                'Text for the column subtotal column (e.g. Total, Subtotal, Sum).',
              ),
              visibility: ({ controls }: { controls: any }) =>
                controls?.hierarchyType?.value === 'multi_dimension' &&
                Boolean(controls?.columns?.value && controls.columns.value.length > 0) &&
                controls?.showPivotColumnSubtotals?.value !== false,
            },
          },
        ],
        [
          {
            name: 'pivotTimeDeltaMode',
            config: {
              type: 'SelectControl',
              label: t('Variazione automatica tra colonne pivot'),
              default: 'none',
              renderTrigger: true,
              choices: [
                ['none', t('Nessuna (nessuna variazione automatica)')],
                ['absolute', t('Variazione assoluta (Δ = valore - periodo precedente)')],
                ['percentage', t('Variazione percentuale (Δ% = (valore - periodo precedente) / periodo precedente)')],
                ['both', t('Entrambe (Δ assoluta + Δ%)')],
              ],
              description: t(
                'Calcola la variazione rispetto al periodo precedente lungo le colonne pivot, senza funzioni SQL window.',
              ),
              visibility: ({ controls }: { controls: any }) =>
                controls?.hierarchyType?.value === 'multi_dimension' &&
                Boolean(controls?.columns?.value && controls.columns.value.length > 0),
            },
          },
          {
            name: 'pivotTimeDeltaLag',
            config: {
              type: 'SelectControl',
              label: t('Passo di confronto (periodi indietro)'),
              default: 1,
              renderTrigger: true,
              choices: [
                [1, t('1 periodo (es. mese precedente / MoM, anno precedente / YoY)')],
                [2, t('2 periodi')],
                [3, t('3 periodi (es. trimestre precedente / QoQ)')],
                [12, t('12 periodi (es. stesso mese dell\'anno precedente / YoY)')],
              ],
              description: t('Quanti periodi indietro usare come base della variazione.'),
              visibility: ({ controls }: { controls: any }) =>
                controls?.hierarchyType?.value === 'multi_dimension' &&
                Boolean(controls?.columns?.value && controls.columns.value.length > 0) &&
                controls?.pivotTimeDeltaMode?.value !== 'none',
            },
          },
        ],
        [
          {
            name: 'show_calendar_comparison',
            config: {
              type: 'CheckboxControl',
              label: t('Confronto con il periodo di confronto del filtro Calendar'),
              description: t(
                'Il filtro Calendar della dashboard può avere un periodo corrente (T1) e un periodo di confronto (T2). Con questa opzione attiva, ogni riga mostra la variazione del totale del periodo corrente rispetto al totale del periodo di confronto, nelle colonne Δ e Δ%. Richiede una tabella pivot con una sola colonna pivot. Senza un periodo di confronto nel filtro non compare alcuna colonna di confronto.',
              ),
              default: true,
              renderTrigger: true,
              visibility: ({ controls }: { controls: any }) =>
                controls?.hierarchyType?.value === 'multi_dimension' &&
                Boolean(controls?.columns?.value && controls.columns.value.length === 1),
            },
          },
        ],
        [
          {
            name: 'idColumn',
            config: {
              ...sharedControls.entity,
              label: t('Node ID Column'),
              description: t('Column containing the unique identifier of the node.'),
              validators: [],
              visibility: ({ controls }: { controls: any }) =>
                controls?.hierarchyType?.value === 'parent_child',
            },
          },
        ],
        [
          {
            name: 'parentIdColumn',
            config: {
              ...sharedControls.entity,
              label: t('Parent ID Column'),
              description: t('Column containing the identifier of the parent node.'),
              validators: [],
              visibility: ({ controls }: { controls: any }) =>
                controls?.hierarchyType?.value === 'parent_child',
            },
          },
        ],
        [
          {
            name: 'labelColumn',
            config: {
              ...sharedControls.entity,
              label: t('Node Label Column (Optional)'),
              description: t('Column containing the display name for the node.'),
              validators: [],
              visibility: ({ controls }: { controls: any }) =>
                controls?.hierarchyType?.value === 'parent_child',
            },
          },
        ],
        [
          {
            name: 'metrics',
            config: {
              ...sharedControls.metrics,
              label: t('Metrics'),
              description: t('Metrics to calculate and display for each hierarchy level.'),
              clearable: true,
              validators: [],
            },
          },
        ],
        ['adhoc_filters'],
      ],
    },
    {
      label: t('Customize'),
      expanded: true,
      controlSetRows: [
        [subsectionHeader(t('Hierarchy & Tree Display Options'))],
        [
          {
            name: 'initialExpandDepth',
            config: {
              type: 'SelectControl',
              label: t('Initial Expand Depth'),
              default: 1,
              renderTrigger: true,
              choices: [
                [-1, t('Expand All')],
                [0, t('Collapse All (Roots only)')],
                [1, t('Level 1')],
                [2, t('Level 2')],
                [3, t('Level 3')],
                [4, t('Level 4')],
              ],
              description: t('Initial depth of tree nodes expanded upon loading.'),
            },
          },
        ],
        [
          {
            name: 'valueDisplayMode',
            config: {
              type: 'SelectControl',
              label: t('Value Display Mode'),
              default: 'all',
              renderTrigger: true,
              choices: [
                ['all', t('All Levels (Default)')],
                ['leaves_only', t('Leaves only')],
                ['parents_only', t('Parents only (parents / subtotals)')],
              ],
              description: t(
                'Choose whether to display metric values on all levels, leaf nodes only, or parent totals only.',
              ),
            },
          },
        ],
        [
          {
            name: 'showSubtotals',
            config: {
              type: 'CheckboxControl',
              label: t('Show Subtotals / Rollup Rows'),
              renderTrigger: true,
              default: true,
              description: t('Display aggregated metric values on parent nodes.'),
            },
          },
          {
            name: 'showGrandTotal',
            config: {
              type: 'CheckboxControl',
              label: t('Show Grand Total Row'),
              renderTrigger: true,
              default: true,
              description: t('Display a summary grand total row at the top or bottom.'),
            },
          },
        ],
        [
          {
            name: 'stickyHeader',
            config: {
              type: 'CheckboxControl',
              label: t('Sticky Table Header'),
              renderTrigger: true,
              default: true,
              description: t('Keep column headers fixed while scrolling.'),
            },
          },
        ],
        [
          {
            name: 'enableSearch',
            config: {
              type: 'CheckboxControl',
              label: t('Enable In-Tree Search'),
              renderTrigger: true,
              default: true,
              description: t('Show search bar to filter hierarchy nodes dynamically.'),
            },
          },
          {
            name: 'compactMode',
            config: {
              type: 'CheckboxControl',
              label: t('Compact Row Padding'),
              renderTrigger: true,
              default: false,
              description: t('Use denser row height for high data density.'),
            },
          },
        ],
        [
          {
            name: 'wrapHeaderLabels',
            config: {
              type: 'CheckboxControl',
              label: t('Automatic line wrap (long headers and labels)'),
              renderTrigger: true,
              default: false,
              description: t(
                'Long headers and row labels wrap instead of being cut off or widening the table.',
              ),
            },
          },
          {
            name: 'resizableColumns',
            config: {
              type: 'CheckboxControl',
              label: t('Resizable columns (drag the header border)'),
              renderTrigger: true,
              default: false,
              description: t(
                'Widen or narrow each column by dragging the right border of its header; double-click the border to restore it. Widths are kept in the browser.',
              ),
            },
          },
        ],
        [
          {
            name: 'reorderColumnsByDrag',
            config: {
              type: 'CheckboxControl',
              label: t('Drag-to-reorder columns'),
              renderTrigger: true,
              default: false,
              description: t(
                'Drag the metric headers to change their order, without going through the panel. Applies to tables without pivot columns; the order is kept in the browser.',
              ),
            },
          },
        ],
        [
          {
            name: 'enableHierarchicalSort',
            config: {
              type: 'CheckboxControl',
              label: t('Enable Hierarchical In-Tree Sorting'),
              renderTrigger: true,
              default: true,
              description: t(
                'Allow sorting tree nodes within their respective parent branch by clicking metric column headers.',
              ),
            },
          },
          {
            name: 'enableExport',
            config: {
              type: 'CheckboxControl',
              label: t('Enable CSV Hierarchy Export'),
              renderTrigger: true,
              default: true,
              description: t(
                'Show export button to download hierarchy with preserved levels and subtotals.',
              ),
            },
          },
        ],
        [subsectionDivider()],
        [subsectionHeader(t('Sorting & Conditional Formatting'))],
        [
          {
            name: 'defaultSortColumn',
            config: {
              type: 'SelectControl',
              label: t('Default Sort Column'),
              default: '__hierarchy_tree__',
              renderTrigger: true,
              freeForm: true,
              choices: [
                ['__hierarchy_tree__', t('Hierarchy Category (Name)')],
              ],
              mapStateToProps: (explore: any) => {
                const rawMetrics = explore?.controls?.metrics?.value || explore?.controls?.metric?.value || [];
                const metrics = Array.isArray(rawMetrics) ? rawMetrics : rawMetrics ? [rawMetrics] : [];
                const names: string[] = metrics.map((m: any) =>
                  typeof m === 'string' ? m : m?.label || m?.metric_name || String(m),
                );
                // A current-period metric `x_corr` offers its derived `delta_x_pct` expression.
                const deltas = names
                  .map(n => n.match(/^(.+)_corr$/)?.[1])
                  .filter(Boolean)
                  .map(b => `delta_${b}_pct`);
                return {
                  choices: [
                    ['__hierarchy_tree__', t('Hierarchy Category (Name)')],
                    ['__tree_level__', t('Tree Level')],
                    ['__leaf_count__', t('Leaf Count')],
                    ...[...names, ...deltas].map(v => [v, v]),
                  ],
                };
              },
              description: t(
                'Hierarchy, structure, metric or delta % key for default sorting.',
              ),
            },
          },
          {
            name: 'defaultSortOrder',
            config: {
              type: 'SelectControl',
              label: t('Default Sort Order'),
              default: 'none',
              renderTrigger: true,
              choices: [
                ['none', t('Query Order (None)')],
                ['asc', t('Ascending / A-Z')],
                ['desc', t('Descending / Z-A')],
              ],
              description: t('Initial sort direction on chart load.'),
            },
          },
          {
            name: 'nullHandling',
            config: {
              type: 'SelectControl',
              label: t('Empty Values'),
              default: 'bottom',
              renderTrigger: true,
              choices: [
                ['bottom', t('Bottom')],
                ['top', t('Top')],
                ['exclude', t('Exclude')],
              ],
            },
          },
        ],
        [
          {
            name: 'minMaxDisplayMode',
            config: {
              type: 'SelectControl',
              label: t('Min/Max Display Mode'),
              default: 'none',
              renderTrigger: true,
              choices: [
                ['none', t('Disabled')],
                ['badges', t('Min/Max Pill Badges')],
                ['heatmap', t('Cell Heatmap Gradient')],
                ['diverging_heatmap', t('Diverging Heatmap (3-Stop Continuous)')],
                ['data_bars', t('In-Cell Data Bars')],
                ['bipolar_data_bars', t('Bipolar Data Bars (Zero-Centered)')],
              ],
              description: t(
                'Visual formatting style for highlighting minimum and maximum values across columns.',
              ),
            },
          },
          {
            name: 'minMaxScope',
            config: {
              type: 'SelectControl',
              label: t('Min/Max Calculation Scope'),
              default: 'leaves_only',
              renderTrigger: true,
              choices: [
                ['leaves_only', t('Leaf Nodes Only (Recommended)')],
                ['level_aware', t('By Hierarchy Level')],
                ['all_nodes', t('All Nodes Excl. Grand Total')],
              ],
              description: t(
                'Scope used to calculate min and max values. Leaf nodes only prevents parent aggregations from distorting scale.',
              ),
            },
          },
        ],
        [
          {
            name: 'heatmapPalette',
            config: {
              type: 'SelectControl',
              label: t('Diverging Heatmap Palette'),
              default: 'red_white_green',
              renderTrigger: true,
              choices: [
                ['red_white_green', t('Red - White - Green')],
                ['red_yellow_green', t('Red - Yellow - Green')],
                ['blue_white_red', t('Blue - White - Red (Colorblind Safe)')],
                ['custom', t('Custom Theme Colors')],
              ],
              description: t('Continuous 3-stop color palette for diverging heatmap.'),
              visibility: ({ controls }: { controls: any }) =>
                controls?.minMaxDisplayMode?.value === 'diverging_heatmap',
            },
          },
          {
            name: 'divergingMidpoint',
            config: {
              type: 'TextControl',
              label: t('Diverging Midpoint (optional)'),
              default: '',
              renderTrigger: true,
              description: t(
                'Numeric center value for the neutral color (e.g. 0, 100). If omitted, automatically defaults to 0 (if range spans negative and positive) or the mean of min and max.',
              ),
              visibility: ({ controls }: { controls: any }) =>
                controls?.minMaxDisplayMode?.value === 'diverging_heatmap',
            },
          },
        ],
        [
          {
            name: 'conditionalFormatting',
            config: {
              type: ArrayControl,
              label: t('Conditional Formatting Rules'),
              default: [],
              renderTrigger: true,
              description: t(
                'JSON rules, e.g. [{"metric": "revenue", "operator": ">", "targetValue": 100, "priority": 1, "scope": "cell"}]. ' +
                  'Operators < <= == >= > between (targetValue2) regex; scope cell, row, column (pivot value). ' +
                  'Priority 1 wins (green, 2 amber, 3+ red).',
              ),
            },
          },
        ],
        [subsectionDivider()],
        [subsectionHeader(t('Formatting & Aesthetics'))],
        [
          {
            name: 'numberFormat',
            config: {
              type: 'SelectControl',
              freeForm: true,
              label: t('Number Format'),
              renderTrigger: true,
              default: 'SMART_NUMBER',
              choices: CUSTOM_D3_FORMAT_OPTIONS || D3_FORMAT_OPTIONS,
              description: t('D3 format string for numerical metric values.'),
            },
          },
        ],
        [
          {
            name: 'currencySymbol',
            config: {
              type: 'TextControl',
              label: t('Currency Symbol Prefix'),
              renderTrigger: true,
              default: '',
              description: t('Optional prefix (e.g. €, $, £) for metrics.'),
            },
          },
        ],
        [
          {
            name: 'stripedRows',
            config: {
              type: 'CheckboxControl',
              label: t('Striped Alternating Rows'),
              renderTrigger: true,
              default: true,
              description: t('Alternating background color for easier reading.'),
            },
          },
        ],
        [subsectionHeader(t('Theme & Palette'))],
        [
          {
            name: 'themeProfile',
            config: {
              type: 'SelectControl',
              label: t('Palette'),
              renderTrigger: true,
              default: 'standard',
              choices: [
                ['standard', t('Standard (teal)')],
                ['colorblind', t('Colorblind safe (blue)')],
                ['stratum-warm', t('Stratum warm (sunset)')],
                ['stratum-cool', t('Stratum cool (emerald)')],
                ['custom', t('Custom colors')],
              ],
              description: t('Colors of the min/max badges, heatmap and data bars.'),
            },
          },
        ],
        [customHexControl('customPositiveHex', t('Positive / MAX badge'))],
        [customHexControl('customNegativeHex', t('Negative / MIN badge'))],
        [customHexControl('customNeutralHex', t('Neutral / data bars'))],
      ],
    },
    {
      label: t('Comparison & Analysis'),
      expanded: false,
      controlSetRows: [
        [subsectionHeader(t('Time Comparison & Period-over-Period Variance'))],
        [
          {
            name: 'showVarianceDelta',
            config: {
              type: 'CheckboxControl',
              label: t('Enable Period Delta Badges (Δ %)'),
              renderTrigger: true,
              default: false,
              description: t(
                'Display period-over-period growth or variance delta badges next to numeric metric values.',
              ),
            },
          },
          {
            name: 'showVarianceBadges',
            config: {
              type: 'CheckboxControl',
              label: t('Show the Δ % badges next to the values (Δ % labels)'),
              renderTrigger: true,
              default: true,
              description: t(
                'When off, the variance stays in the Δ % columns only and absolute values such as counts carry no percent sign.',
              ),
              visibility: isComparisonVisible,
            },
          },
          {
            name: 'showPeriodInMetricLabel',
            config: {
              type: 'CheckboxControl',
              label: t('Show the period next to each metric (Arco temporale)'),
              renderTrigger: true,
              default: false,
              description: t(
                'Writes next to every metric name the span it covers, and next to the comparison and delta columns what they are measured against.',
              ),
            },
          },
          {
            name: 'periodLabelsFromFilters',
            config: {
              type: 'CheckboxControl',
              label: t('Reference and comparison period in the headers'),
              renderTrigger: true,
              default: false,
              description: t(
                'Adds the reference month to the headers of the current values, the comparison month to the comparison values and to the deltas, for example "Requests (Current) · Oct 2026". The periods are the ones the query really runs on, so they follow the dashboard filters and, when none is applied, the dataset defaults. Requires a dataset with year and month columns for the period.',
              ),
            },
          },
          {
            name: 'periodReferenceYearColumn',
            config: {
              type: 'TextControl',
              label: t('Reference year column'),
              renderTrigger: true,
              default: 'ANNO_CORRENTE',
              description: t('Dataset column with this part of the period; only applies when the period in the headers is on.'),
              visibility: ({ controls }: { controls: any }) => Boolean(controls?.periodLabelsFromFilters?.value),
            },
          },
          {
            name: 'periodReferenceMonthColumn',
            config: {
              type: 'TextControl',
              label: t('Reference month column'),
              renderTrigger: true,
              default: 'MESE_CORRENTE',
              description: t('Dataset column with this part of the period; only applies when the period in the headers is on.'),
              visibility: ({ controls }: { controls: any }) => Boolean(controls?.periodLabelsFromFilters?.value),
            },
          },
          {
            name: 'periodComparisonYearColumn',
            config: {
              type: 'TextControl',
              label: t('Comparison year column'),
              renderTrigger: true,
              default: 'ANNO_CONFRONTO',
              description: t('Dataset column with this part of the period; only applies when the period in the headers is on.'),
              visibility: ({ controls }: { controls: any }) => Boolean(controls?.periodLabelsFromFilters?.value),
            },
          },
          {
            name: 'periodComparisonMonthColumn',
            config: {
              type: 'TextControl',
              label: t('Comparison month column'),
              renderTrigger: true,
              default: 'MESE_CONFRONTO',
              description: t('Dataset column with this part of the period; only applies when the period in the headers is on.'),
              visibility: ({ controls }: { controls: any }) => Boolean(controls?.periodLabelsFromFilters?.value),
            },
          },
          {
            name: 'timeGrain',
            config: {
              type: 'SelectControl',
              label: t('Time Comparison Granularity'),
              default: 'year',
              renderTrigger: true,
              choices: [
                ['auto', t('✨ Auto (Detect from data)')],
                ['day', t('📅 Day (DoD - Day-over-Day)')],
                ['week', t('📆 Week (WoW - Week-over-Week)')],
                ['month', t('🗓️ Month (MoM - Month-over-Month)')],
                ['quarter', t('📊 Quarter (QoQ - Quarter-over-Quarter)')],
                ['year', t('📈 Year (YoY - Year-over-Year)')],
              ],
              description: t(
                'Period length for the deltas. Periods come from the pivot column values (YYYY, YYYY-Qn, YYYY-MM, YYYY-MM-DD, timestamps).',
              ),
              visibility: isComparisonVisible,
            },
          },
        ],
        [
          {
            name: 'referencePeriod',
            config: {
              type: 'SelectControl',
              label: t('Periodo di riferimento'),
              default: 'current',
              renderTrigger: true,
              choices: [
                ['current', t('Periodo attivo corrente')],
                ['previous', t('Periodo completo precedente')],
                ['ytd', t('Anno in corso (YTD)')],
              ],
              description: t(
                'Baseline of the latest period: itself (no delta), the previous period, or the year-to-date average.',
              ),
              visibility: (state: { controls: any }) =>
                isComparisonVisible(state) &&
                (state.controls?.comparisonType?.value ?? 'prev_period') === 'prev_period',
            },
          },
          {
            name: 'comparisonType',
            config: {
              type: 'SelectControl',
              label: t('Base di confronto'),
              default: 'prev_period',
              renderTrigger: true,
              choices: [
                ['prev_period', t('Periodo immediatamente precedente (DoD / WoW / MoM / YoY)')],
                ['prev_year_same_period', t('Stesso periodo dell\'anno precedente')],
                ['budget_target', t('Budget / obiettivo (target pianificato)')],
              ],
              description: t(
                'Baseline for the latest period delta. Budget / Target uses the matching Metric Goals target.',
              ),
              visibility: isComparisonVisible,
            },
          },
        ],
        [subsectionDivider()],
        [subsectionHeader(t('Goals (optional)'))],
        [
          {
            name: 'goals',
            config: {
              type: 'TextAreaControl',
              language: 'json',
              label: t('Metric Goals'),
              default: '',
              renderTrigger: true,
              description: t(
                'JSON list of per-metric targets, e.g. [{"metricKey": "revenue", "target": 1000, "direction": "higher_is_better"}]. ' +
                  'direction is "higher_is_better" (default) or "lower_is_better". Each matching metric cell shows its ' +
                  'deviation from the target and a status: achieved (>= 100% attainment), on track (>= 90%), at risk (>= 75%) or missed.',
              ),
            },
          },
        ],
        [subsectionDivider()],
        [subsectionHeader(t('Metric Semantics (optional)'))],
        [
          {
            name: 'metricDefinitions',
            config: {
              type: 'TextAreaControl',
              language: 'json',
              label: t('Metric Definitions'),
              default: '',
              renderTrigger: true,
              description: t(
                'JSON list that states what each metric means, overriding the name-based guesses. Types: sum, mean (optional weight), ' +
                  'distinct_count (entityDimension), ratio (numerator, denominator, scale: parents and totals are a ratio of sums), ' +
                  'delta_pct (current, baseline), diff (current, baseline: exact node-level difference, also on parents and totals) ' +
                  'and none (empty on parent rows). Optional format (integer, decimal, percent, duration in seconds, ' +
                  'days, currency), decimals and polarity (higher_is_better or lower_is_better, used for the colour of deltas). ' +
                  'Example: [{"metric": "pct_in_soglia", "type": "ratio", "numerator": "entro_soglia", "denominator": "prenotazioni", "scale": 100, "format": "percent"}]',
              ),
            },
          },
        ],
        [subsectionDivider()],
        [subsectionHeader(t('Table Calculations (optional)'))],
        [
          {
            name: 'tableCalculations',
            config: {
              type: 'TextAreaControl',
              language: 'json',
              label: t('Table Calculations & Measure Modifiers'),
              default: '',
              renderTrigger: true,
              description: t(
                'JSON list of table calculations and measure modifiers. Supported types: pct_of_total, pct_of_parent, running_total, diff_from_previous, diff_from_previous_pct, rank. ' +
                  'Example: [{"metric": "sales", "type": "pct_of_parent", "display": "companion_column"}]',
              ),
            },
          },
        ],
        [subsectionDivider()],
        [subsectionHeader(t('Privacy (small numbers)'))],
        [
          {
            name: 'suppressionThreshold',
            config: {
              type: 'TextControl',
              isInt: true,
              label: t('Suppress Counts Below'),
              default: 0,
              renderTrigger: true,
              description: t(
                'Hides the counts from 1 up to this value minus 1 (0 turns it off; 5 or 10 are usual for published health data). ' +
                  'Ratios and deltas built on a hidden count are hidden too, and the hidden value never reaches sorting, colours or the CSV export.',
              ),
            },
          },
        ],
        [
          {
            name: 'suppressionMetrics',
            config: {
              type: 'TextControl',
              label: t('Metrics To Suppress'),
              default: '',
              renderTrigger: true,
              description: t('Comma separated count metrics subject to suppression, e.g. casi, ricoveri.'),
              visibility: ({ controls }: { controls: any }) => Number(controls?.suppressionThreshold?.value) > 0,
            },
          },
        ],
        [
          {
            name: 'complementarySuppression',
            config: {
              type: 'CheckboxControl',
              label: t('Complementary Suppression'),
              default: true,
              renderTrigger: true,
              description: t(
                'Also hides the smallest visible sibling of a lone hidden cell, so the hidden value cannot be recovered by subtracting from the parent total.',
              ),
              visibility: ({ controls }: { controls: any }) => Number(controls?.suppressionThreshold?.value) > 0,
            },
          },
          {
            name: 'suppressionLabel',
            config: {
              type: 'TextControl',
              label: t('Suppressed Cell Label'),
              default: '<{k}',
              renderTrigger: true,
              description: t('Text shown in place of a hidden value; {k} is replaced by the threshold.'),
              visibility: ({ controls }: { controls: any }) => Number(controls?.suppressionThreshold?.value) > 0,
            },
          },
        ],
        [subsectionDivider()],
        [subsectionHeader(t('Trend (Sparklines)'))],
        [
          {
            name: 'showSparklines',
            config: {
              type: 'CheckboxControl',
              label: t('Show Trend Sparklines'),
              default: false,
              renderTrigger: true,
              description: t(
                'With exactly one pivot column (the periods), adds a Trend column per metric with a line over the periods in chronological order.',
              ),
            },
          },
          {
            name: 'sparklineMetrics',
            config: {
              type: 'TextControl',
              label: t('Sparkline Metrics'),
              default: '',
              renderTrigger: true,
              description: t('Comma separated metrics that get a trend column; empty means every metric.'),
              visibility: ({ controls }: { controls: any }) => Boolean(controls?.showSparklines?.value),
            },
          },
        ],
        [subsectionDivider()],
        [subsectionHeader(t('Advanced Rollup Calculations'))],
        [
          {
            name: 'aggregationMode',
            config: {
              type: 'SelectControl',
              label: t('Rollup Aggregation Function'),
              default: 'sum',
              renderTrigger: false,
              choices: [
                ['sum', t('SUM (Add Subtotals)')],
                ['avg', t('AVG (Mean of Children)')],
                ['min', t('MIN (Minimum Value)')],
                ['max', t('MAX (Maximum Value)')],
                ['weighted_avg', t('Weighted Average / Ratio')],
              ],
              description: t('Default aggregation algorithm for calculating intermediate parent node subtotals.'),
            },
          },
        ],
        [
          {
            name: 'weightColumn',
            config: {
              type: 'TextControl',
              label: t('Weight Metric'),
              default: '',
              renderTrigger: true,
              description: t(
                'Metric label used as weight (it must be one of the query metrics). Overrides the automatic volume weights; zero total weight falls back to the plain average.',
              ),
              visibility: ({ controls }: { controls: any }) => {
                const aggregationMode = controls?.aggregationMode?.value;
                return aggregationMode === 'weighted_avg';
              },
            },
          },
        ],
        [
          {
            name: 'emit_filter',
            config: {
              type: 'CheckboxControl',
              label: t('Emit Dashboard Cross-Filters'),
              renderTrigger: true,
              default: true,
              description: t(
                'Broadcast interactive cross-filters to other charts in the dashboard when clicking on tree nodes or dimension values.',
              ),
            },
          },
          {
            name: 'crossFilterAppliesToSelf',
            config: {
              type: 'CheckboxControl',
              label: t('Also filter this table'),
              renderTrigger: true,
              default: false,
              description: t(
                'When a row is selected, the cross-filter also applies to the table itself, which then shows only the selection (with the totals recalculated). Clearing the selection restores everything.',
              ),
              visibility: ({ controls }: { controls: any }) => controls?.emit_filter?.value !== false,
            },
          },
          {
            name: 'enableContextMenu',
            config: {
              type: 'CheckboxControl',
              label: t('Enable Context Menu'),
              renderTrigger: true,
              default: true,
              description: t(
                'Show contextual menu on right click for drill to detail, drill by, and cross-filtering actions.',
              ),
            },
          },
        ],
      ],
    },
    {
      label: t('Performance & Limits'),
      expanded: false,
      controlSetRows: [
        ['row_limit'],
        [
          {
            name: 'pageSize',
            config: {
              type: 'SliderControl',
              label: t('Page Size'),
              default: 100,
              min: 50,
              max: 2000,
              step: 50,
              renderTrigger: true,
            },
          },
          {
            name: 'virtualizationThreshold',
            config: {
              type: 'TextControl',
              isInt: true,
              label: t('Virtualize Above Rows'),
              default: 500,
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'dimensionLimits',
            config: {
              type: 'TextAreaControl',
              language: 'json',
              label: t('Dimension Limits & Top N (optional)'),
              default: '',
              renderTrigger: true,
              description: t(
                'JSON array of dimension limit rules per hierarchy level or dimension name. ' +
                  'Limits the visible branches to the Top N (or Bottom N) and collapses the rest into a synthetic "Others" row with exact metric sum. ' +
                  'Example: [{"level": 1, "limit": 5, "metric": "volume", "mode": "top", "othersLabel": "Altri ({k})"}]',
              ),
            },
          },
        ],
      ],
    },
  ],
};

export default config;
