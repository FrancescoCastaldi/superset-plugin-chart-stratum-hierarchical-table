import { ChartMetadata, ChartPlugin, Behavior } from '@superset-ui/core';
import buildQuery from './buildQuery';
import controlPanel from './controlPanel';
import transformProps from './transformProps';
import thumbnail from '../images/thumbnail.png';
const example = thumbnail;

const metadata = new ChartMetadata({
  name: 'StratumTree: tabella gerarchica e matrice',
  description:
    'Tabella ad albero e matrice pivot con più livelli di dimensioni, drill-down, gerarchie padre-figlio, subtotali, confronto tra periodi e cross-filter nativo di Superset.',
  behaviors: [Behavior.InteractiveChart, Behavior.DrillToDetail, Behavior.DrillBy],
  category: 'Tabella',
  tags: [
    'Stratum',
    'StratumTree',
    'Tabella',
    'Gerarchia',
    'Albero',
    'Drill-down',
    'Subtotali',
    'Matrice',
    'Finanza',
  ],
  credits: ['Francesco Castaldi'],
  exampleGallery: [{ url: example }],
  thumbnail,
});

export default class HierarchicalTableChartPlugin extends ChartPlugin {
  constructor() {
    super({
      buildQuery: buildQuery as any,
      controlPanel,
      loadChart: () => import('../components/HierarchicalTable'),
      metadata,
      transformProps: transformProps as any,
    });
  }
}
