jest.mock('@superset-ui/core', () => ({
  getNumberFormatter: () => (val: any) => String(val),
  ensureIsArray: (val: any) => (Array.isArray(val) ? val : [val]),
}));

import { buildMultiDimensionTree } from '../src/utils/treeBuilder';
import { computeHorizontalRowTotals, computeGrandTotal } from '../src/utils/aggregations';
import transformProps from '../src/plugin/transformProps';
import { HierarchicalTableChartProps } from '../src/types';

describe('Two-Way Pivot Matrix Grid & Horizontal Row Totals', () => {
  const sampleRecords: DataRecord[] = [
    // Lunedì
    {
      giorno: 'Lun',
      fascia: '00:00-01:00',
      totale: 39,
      sportello: 0,
      preno_sp: 0,
      pp: 39,
    },
    {
      giorno: 'Lun',
      fascia: '01:00-02:00',
      totale: 19,
      sportello: 5,
      preno_sp: 2,
      pp: 12,
    },
    // Martedì
    {
      giorno: 'Mar',
      fascia: '00:00-01:00',
      totale: 53,
      sportello: 10,
      preno_sp: 3,
      pp: 40,
    },
    {
      giorno: 'Mar',
      fascia: '01:00-02:00',
      totale: 26,
      sportello: 8,
      preno_sp: 1,
      pp: 17,
    },
  ];

  const metrics = ['totale', 'sportello', 'preno_sp', 'pp'];
  const dimensions = ['giorno'];
  const pivotDimensions = ['fascia'];
  const pivotValues = ['00:00-01:00', '01:00-02:00'];

  describe('Mathematical Horizontal Row Total Calculation', () => {
    it('computes accurate horizontal sum across all pivot values for each row', () => {
      const tree = buildMultiDimensionTree(sampleRecords, dimensions, metrics, pivotDimensions);

      // Invoke mathematical engine for horizontal totals
      computeHorizontalRowTotals(tree, metrics, pivotValues);

      const lunNode = tree.find(n => n.name === 'Lun');
      expect(lunNode).toBeDefined();
      expect(lunNode?.metrics['totale___ROW_TOTAL']).toBe(39 + 19); // 58
      expect(lunNode?.metrics['sportello___ROW_TOTAL']).toBe(0 + 5); // 5
      expect(lunNode?.metrics['preno_sp___ROW_TOTAL']).toBe(0 + 2); // 2
      expect(lunNode?.metrics['pp___ROW_TOTAL']).toBe(39 + 12); // 51

      const marNode = tree.find(n => n.name === 'Mar');
      expect(marNode).toBeDefined();
      expect(marNode?.metrics['totale___ROW_TOTAL']).toBe(53 + 26); // 79
      expect(marNode?.metrics['sportello___ROW_TOTAL']).toBe(10 + 8); // 18
      expect(marNode?.metrics['preno_sp___ROW_TOTAL']).toBe(3 + 1); // 4
      expect(marNode?.metrics['pp___ROW_TOTAL']).toBe(40 + 17); // 57
    });

    it('ensures perfect two-way cross-total square balance on Grand Total node', () => {
      const tree = buildMultiDimensionTree(sampleRecords, dimensions, metrics, pivotDimensions);
      computeHorizontalRowTotals(tree, metrics, pivotValues);

      const allMetricKeys = [
        ...metrics.map(m => `${m}___00:00-01:00`),
        ...metrics.map(m => `${m}___01:00-02:00`),
        ...metrics.map(m => `${m}___ROW_TOTAL`),
      ];

      const grandTotal = computeGrandTotal(tree, allMetricKeys);

      // Incrocio: somma dei totali di riga == somma dei totali di colonna
      expect(grandTotal.metrics['totale___ROW_TOTAL']).toBe(58 + 79); // 137
      expect(grandTotal.metrics['sportello___ROW_TOTAL']).toBe(5 + 18); // 23
      expect(grandTotal.metrics['preno_sp___ROW_TOTAL']).toBe(2 + 4); // 6
      expect(grandTotal.metrics['pp___ROW_TOTAL']).toBe(51 + 57); // 108

      // Verifica consistenza con colonne orizzontali del Grand Total
      const sumSlot0 = (grandTotal.metrics['totale___00:00-01:00'] as number) || 0; // 39 + 53 = 92
      const sumSlot1 = (grandTotal.metrics['totale___01:00-02:00'] as number) || 0; // 19 + 26 = 45
      expect(sumSlot0 + sumSlot1).toBe(grandTotal.metrics['totale___ROW_TOTAL']); // 92 + 45 = 137
    });

    it('computes level-aware ROW_TOTAL for Sportelli Attivi across pivot months (MAX per Sportello, SUM of distinct Sportelli per Sede)', () => {
      const sportelliRecords: DataRecord[] = [
        // Ascoli > SPORTELLO 1 attivo sia a Settembre (09) su due servizi che a Ottobre (10)
        { SedeDescrizione: 'Ascoli Piceno', Sportello: 'SPORTELLO 1', ServizioDescrizione: 'Prelievi', Mese: '09', 'Sportelli Attivi': 1, Serviti: 100 },
        { SedeDescrizione: 'Ascoli Piceno', Sportello: 'SPORTELLO 1', ServizioDescrizione: 'Accettazione', Mese: '09', 'Sportelli Attivi': 1, Serviti: 50 },
        { SedeDescrizione: 'Ascoli Piceno', Sportello: 'SPORTELLO 1', ServizioDescrizione: 'Prelievi', Mese: '10', 'Sportelli Attivi': 1, Serviti: 120 },
        // Ascoli > SPORTELLO 2 attivo solo a Settembre (09)
        { SedeDescrizione: 'Ascoli Piceno', Sportello: 'SPORTELLO 2', ServizioDescrizione: 'Prelievi', Mese: '09', 'Sportelli Attivi': 1, Serviti: 80 },
        // Ascoli > SPORTELLO 3 attivo solo a Ottobre (10)
        { SedeDescrizione: 'Ascoli Piceno', Sportello: 'SPORTELLO 3', ServizioDescrizione: 'Prelievi', Mese: '10', 'Sportelli Attivi': 1, Serviti: 90 },
        // Ascoli > ZEROCODA (0 sportelli attivi CUP)
        { SedeDescrizione: 'Ascoli Piceno', Sportello: 'ZEROCODA', ServizioDescrizione: 'Prelievi ZC', Mese: '09', 'Sportelli Attivi': 0, Serviti: 70 },
        { SedeDescrizione: 'Ascoli Piceno', Sportello: 'ZEROCODA', ServizioDescrizione: 'Prelievi ZC', Mese: '10', 'Sportelli Attivi': 0, Serviti: 69 },
      ];
      const hierDims = ['SedeDescrizione', 'Sportello', 'ServizioDescrizione'];
      const spMetrics = ['Sportelli Attivi', 'Serviti'];
      const months = ['09', '10'];

      const tree = buildMultiDimensionTree(sportelliRecords, hierDims, spMetrics, ['Mese'], 'sum');
      computeHorizontalRowTotals(tree, spMetrics, months, 'sum', hierDims);

      const ascoli = tree[0];
      const sp1 = ascoli.children!.find(c => c.name === 'SPORTELLO 1')!;
      const sp2 = ascoli.children!.find(c => c.name === 'SPORTELLO 2')!;
      const sp3 = ascoli.children!.find(c => c.name === 'SPORTELLO 3')!;
      const zc = ascoli.children!.find(c => c.name === 'ZEROCODA')!;

      // SPORTELLO 1: attivo in 09 (1) e in 10 (1) -> ROW_TOTAL = 1 (MAX, non 2)
      expect(sp1.metrics['Sportelli Attivi___09']).toBe(1);
      expect(sp1.metrics['Sportelli Attivi___10']).toBe(1);
      expect(sp1.metrics['Sportelli Attivi___ROW_TOTAL']).toBe(1);
      expect(sp1.metrics['Serviti___ROW_TOTAL']).toBe(270);

      // SPORTELLO 2: attivo in 09 (1), assente in 10 -> ROW_TOTAL = 1
      expect(sp2.metrics['Sportelli Attivi___09']).toBe(1);
      expect(sp2.metrics['Sportelli Attivi___ROW_TOTAL']).toBe(1);

      // SPORTELLO 3: assente in 09, attivo in 10 (1) -> ROW_TOTAL = 1
      expect(sp3.metrics['Sportelli Attivi___10']).toBe(1);
      expect(sp3.metrics['Sportelli Attivi___ROW_TOTAL']).toBe(1);

      // ZEROCODA: 0 in entrambi -> ROW_TOTAL = 0
      expect(zc.metrics['Sportelli Attivi___ROW_TOTAL']).toBe(0);
      expect(zc.metrics['Serviti___ROW_TOTAL']).toBe(139);

      // Ascoli Piceno (depth 0 < entityDepth 1):
      // Mese 09: SP1 (1) + SP2 (1) + ZC (0) = 2 sportelli attivi
      // Mese 10: SP1 (1) + SP3 (1) + ZC (0) = 2 sportelli attivi
      // ROW_TOTAL complessivo nel bimestre: SP1 (1) + SP2 (1) + SP3 (1) + ZC (0) = 3 sportelli distinti attivi!
      expect(ascoli.metrics['Sportelli Attivi___09']).toBe(2);
      expect(ascoli.metrics['Sportelli Attivi___10']).toBe(2);
      expect(ascoli.metrics['Sportelli Attivi___ROW_TOTAL']).toBe(3);
      expect(ascoli.metrics['Serviti___ROW_TOTAL']).toBe(579);
    });
  });

  describe('transformProps with pivotRowTotalsPosition', () => {
    const baseChartProps: any = {
      width: 1200,
      height: 600,
      formData: {
        hierarchyType: 'multi_dimension',
        groupby: ['giorno'],
        columns: ['fascia'],
        metrics,
        combineMetric: true,
        showGrandTotal: true,
      },
      queriesData: [{ data: sampleRecords }],
    };

    it('positions the Totals macro-header on the LEFT (Qlik Sense style)', () => {
      const props = transformProps({
        ...baseChartProps,
        formData: {
          ...baseChartProps.formData,
          pivotRowTotalsPosition: 'left',
          pivotRowTotalsLabel: 'Totals',
          pivotSortOrder: 'asc',
        },
      } as HierarchicalTableChartProps);

      expect(props.pivotHeaderGroups).toBeDefined();
      expect(props.pivotHeaderGroups?.length).toBe(3); // Totals, 00:00-01:00, 01:00-02:00

      // Il primo gruppo header a sinistra deve essere 'Totals'
      const firstGroup = props.pivotHeaderGroups?.[0];
      expect(firstGroup?.title).toBe('Totals');
      expect(firstGroup?.colSpan).toBe(4); // 4 metriche

      // Le prime 4 colonne metriche in columns devono corrispondere al totale di riga
      const metricCols = props.columns.filter(c => c.isMetric);
      expect(metricCols[0].key).toBe('totale___ROW_TOTAL');
      expect(metricCols[1].key).toBe('sportello___ROW_TOTAL');
      expect(metricCols[2].key).toBe('preno_sp___ROW_TOTAL');
      expect(metricCols[3].key).toBe('pp___ROW_TOTAL');

      // Subito dopo devono esserci le colonne di 00:00-01:00
      expect(metricCols[4].key).toBe('totale___00:00-01:00');
    });

    it('positions the Totals macro-header on the RIGHT (Excel / Classic style)', () => {
      const props = transformProps({
        ...baseChartProps,
        formData: {
          ...baseChartProps.formData,
          pivotRowTotalsPosition: 'right',
          pivotRowTotalsLabel: 'Totale Complessivo',
        },
      } as HierarchicalTableChartProps);

      expect(props.pivotHeaderGroups).toBeDefined();
      const lastGroup = props.pivotHeaderGroups?.[props.pivotHeaderGroups.length - 1];
      expect(lastGroup?.title).toBe('Totale Complessivo');
      expect(lastGroup?.colSpan).toBe(4);

      const metricCols = props.columns.filter(c => c.isMetric);
      const lastFourCols = metricCols.slice(-4);
      expect(lastFourCols[0].key).toBe('totale___ROW_TOTAL');
      expect(lastFourCols[1].key).toBe('sportello___ROW_TOTAL');
      expect(lastFourCols[2].key).toBe('preno_sp___ROW_TOTAL');
      expect(lastFourCols[3].key).toBe('pp___ROW_TOTAL');
    });

    it('defaults to none when pivotRowTotalsPosition is none or omitted', () => {
      const props = transformProps({
        ...baseChartProps,
        formData: {
          ...baseChartProps.formData,
          pivotRowTotalsPosition: 'none',
        },
      } as HierarchicalTableChartProps);

      expect(props.pivotHeaderGroups?.length).toBe(2); // Solo 00:00-01:00 e 01:00-02:00
      const hasRowTotal = props.columns.some(c => c.key.includes('___ROW_TOTAL'));
      expect(hasRowTotal).toBe(false);
    });

    it('computes pivot row totals using aggregationMode (avg, min, max, weighted_avg) instead of hardcoded sum', () => {
      const avgProps = transformProps({
        ...baseChartProps,
        formData: {
          ...baseChartProps.formData,
          pivotRowTotalsPosition: 'right',
          aggregationMode: 'avg',
        },
      } as HierarchicalTableChartProps);
      const lunAvg = avgProps.data.find(n => n.name === 'Lun')!;
      // Lun totale across two slots: 39 and 19 -> avg 29
      expect(lunAvg.metrics['totale___ROW_TOTAL']).toBeCloseTo(29);

      const minProps = transformProps({
        ...baseChartProps,
        formData: {
          ...baseChartProps.formData,
          pivotRowTotalsPosition: 'right',
          aggregationMode: 'min',
        },
      } as HierarchicalTableChartProps);
      expect(minProps.data.find(n => n.name === 'Lun')!.metrics['totale___ROW_TOTAL']).toBe(19);

      const weightedProps = transformProps({
        width: 1200,
        height: 600,
        formData: {
          hierarchyType: 'multi_dimension',
          groupby: ['reparto'],
          columns: ['turno'],
          metrics: ['prezzo', 'volumi'],
          pivotRowTotalsPosition: 'right',
          aggregationMode: 'weighted_avg',
          weightColumn: 'volumi',
        },
        queriesData: [
          {
            data: [
              { reparto: 'Cardio', turno: 'M', prezzo: 10, volumi: 100 },
              { reparto: 'Cardio', turno: 'P', prezzo: 40, volumi: 300 },
            ],
          },
        ],
      } as HierarchicalTableChartProps);
      const cardio = weightedProps.data.find(n => n.name === 'Cardio')!;
      // (10*100 + 40*300) / (100+300) = 13000 / 400 = 32.5; weight volumi itself sums to 400
      expect(cardio.metrics['prezzo___ROW_TOTAL']).toBeCloseTo(32.5);
      expect(cardio.metrics['volumi___ROW_TOTAL']).toBe(400);
    });
  });
});
