import {
  buildCsvRows,
  downloadCsv,
  escapeCsvCell,
  serializeCsv,
  shouldRenderMetricValue,
} from '../src/utils/csvExport';
import { buildColumnMetaMap, getDisplayColumns, isDeltaColumn } from '../src/utils/tableColumns';
import { TableColumn, TreeNode } from '../src/types';

const columns: TableColumn[] = [
  { key: '__hierarchy_tree__', title: 'regione / asl', dataIndex: 'name', isMetric: false, isHierarchyDimension: true },
  { key: 'richieste_corr', title: 'richieste_corr', dataIndex: 'richieste_corr', isMetric: true, formatter: (v: any) => `#${v}` },
  { key: 'delta_richieste_pct', title: 'delta_richieste_pct', dataIndex: 'delta_richieste_pct', isMetric: true },
  { key: 'totale___2026-09', title: 'totale', dataIndex: 'totale___2026-09', isMetric: true, baseMetric: '2026-09' },
];

const tree: TreeNode[] = [
  {
    key: 'Lazio',
    id: 'Lazio',
    name: 'Lazio, "Nord"',
    depth: 0,
    path: ['Lazio'],
    isLeaf: false,
    metrics: { richieste_corr: 150, delta_richieste_pct: 'Nuovo' },
    subtotals: { 'totale___2026-09': 9 },
    children: [
      {
        key: 'Lazio > ASL1',
        id: 'Lazio > ASL1',
        name: 'ASL1',
        depth: 1,
        path: ['Lazio', 'ASL1'],
        isLeaf: true,
        metrics: { richieste_corr: 100, delta_richieste_pct: null, 'totale___2026-09': 0 },
      },
    ],
  },
];

const grandTotalNode: TreeNode = {
  key: '__grand_total__',
  id: '__grand_total__',
  name: 'Grand Total',
  depth: 0,
  path: ['Grand Total'],
  isLeaf: true,
  metrics: { richieste_corr: 150, delta_richieste_pct: 12.5 },
};

describe('tableColumns', () => {
  it('keeps only metric columns', () => {
    expect(getDisplayColumns(columns).map(c => c.key)).toEqual([
      'richieste_corr',
      'delta_richieste_pct',
      'totale___2026-09',
    ]);
  });

  it('flags delta columns from key or title keywords', () => {
    expect(isDeltaColumn({ key: 'delta_richieste_pct', title: 'x' })).toBe(true);
    expect(isDeltaColumn({ key: 'm___delta_pct___2026', title: 'Δ%' })).toBe(true);
    expect(isDeltaColumn({ key: 'x', title: 'Variazione Volumi' })).toBe(true);
    expect(isDeltaColumn({ key: 'diff_acc_p.p.', title: '' })).toBe(true);
    expect(isDeltaColumn({ key: 'richieste_corr', title: 'Richieste' })).toBe(false);
  });

  it('builds the column metadata map', () => {
    const map = buildColumnMetaMap(getDisplayColumns(columns));
    expect(Array.from(map.keys())).toEqual(['richieste_corr', 'delta_richieste_pct', 'totale___2026-09']);
    expect(map.get('richieste_corr')).toEqual({
      key: 'richieste_corr',
      title: 'richieste_corr',
      width: undefined,
      formatter: columns[1].formatter,
      isDelta: false,
    });
    expect(map.get('delta_richieste_pct')?.isDelta).toBe(true);
  });
});

describe('csvExport', () => {
  const displayCols = getDisplayColumns(columns);

  it('decides which nodes render values per display mode', () => {
    expect(shouldRenderMetricValue(tree[0], 'all')).toBe(true);
    expect(shouldRenderMetricValue(tree[0], 'leaves_only')).toBe(false);
    expect(shouldRenderMetricValue(tree[0], 'parents_only')).toBe(true);
    expect(shouldRenderMetricValue(tree[0].children![0], 'parents_only')).toBe(false);
  });

  it('exports header, grand total on top and the whole tree with raw values', () => {
    const rows = buildCsvRows({
      columns,
      displayCols,
      nodes: tree,
      displayMode: 'all',
      showGrandTotal: true,
      grandTotalNode,
      grandTotalPosition: 'top',
    });
    expect(rows).toEqual([
      ['regione / asl', 'richieste_corr', 'delta_richieste_pct', '2026-09 (totale)'],
      ['Totale generale', '150', '12.5', ''],
      ['Lazio, "Nord"', '150', 'Nuovo', '9'],
      ['  ASL1', '100', '', '0'],
    ]);
  });

  it('puts the grand total at the bottom and blanks values hidden by the display mode', () => {
    const rows = buildCsvRows({
      columns,
      displayCols,
      nodes: tree,
      displayMode: 'leaves_only',
      showGrandTotal: true,
      grandTotalNode,
      grandTotalPosition: 'bottom',
    });
    expect(rows).toEqual([
      ['regione / asl', 'richieste_corr', 'delta_richieste_pct', '2026-09 (totale)'],
      ['Lazio, "Nord"', '', '', ''],
      ['  ASL1', '100', '', '0'],
      ['Totale generale', '', '', ''],
    ]);
  });

  it('omits the grand total when disabled and defaults the hierarchy header', () => {
    const rows = buildCsvRows({
      columns: [],
      displayCols: [],
      nodes: tree,
      displayMode: 'all',
      showGrandTotal: false,
      grandTotalNode,
      grandTotalPosition: 'top',
    });
    expect(rows).toEqual([['Gerarchia'], ['Lazio, "Nord"'], ['  ASL1']]);
  });

  it('escapes cells containing separators, quotes or line breaks', () => {
    expect(escapeCsvCell('plain')).toBe('plain');
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell('a\nb')).toBe('"a\nb"');
    expect(escapeCsvCell('a\rb')).toBe('"a\rb"');
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(undefined)).toBe('');
  });

  it('serializes rows with CRLF line endings', () => {
    expect(serializeCsv([['h1', 'h2'], ['Lazio, "Nord"', '1']])).toBe('h1,h2\r\n"Lazio, ""Nord""",1');
  });

  it('downloadCsv is a no-op outside the browser', () => {
    expect(() => downloadCsv('a,b')).not.toThrow();
  });

  it('enriches CSV with Base, Simulato, and Delta % columns when whatIfBaseline is provided', () => {
    const whatIfBaseline = {
      nodeBaselines: new Map([
        ['Lazio', { richieste_corr: 150, delta_richieste_pct: null, 'totale___2026-09': 9 }],
        ['Lazio > ASL1', { richieste_corr: 80, delta_richieste_pct: null, 'totale___2026-09': 0 }],
        ['__grand_total__', { richieste_corr: 150, delta_richieste_pct: null, 'totale___2026-09': 9 }],
      ]),
    };

    const rows = buildCsvRows({
      columns,
      displayCols,
      nodes: tree,
      displayMode: 'all',
      showGrandTotal: true,
      grandTotalNode,
      grandTotalPosition: 'top',
      whatIfBaseline,
    });

    // Check header
    expect(rows[0]).toEqual([
      'regione / asl',
      'richieste_corr (Base)',
      'richieste_corr (Simulato)',
      'richieste_corr (Δ%)',
      'delta_richieste_pct (Base)',
      'delta_richieste_pct (Simulato)',
      'delta_richieste_pct (Δ%)',
      '2026-09 (totale) (Base)',
      '2026-09 (totale) (Simulato)',
      '2026-09 (totale) (Δ%)',
    ]);

    // Check ASL1 row (simulated 100 vs baseline 80 = +25.0%)
    const asl1Row = rows.find(r => r[0].includes('ASL1'))!;
    expect(asl1Row[1]).toBe('80');
    expect(asl1Row[2]).toBe('100');
    expect(asl1Row[3]).toBe('+25.0%');
  });
});
