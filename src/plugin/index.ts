import { ChartMetadata, ChartPlugin, Behavior } from '@superset-ui/core';
import buildQuery from './buildQuery';
import controlPanel from './controlPanel';
import transformProps from './transformProps';
import thumbnail from '../images/thumbnail.png';
const example = thumbnail;

const t = (str: string) => str;

const metadata = new ChartMetadata({
  name: t('StratumTree: Hierarchical Matrix Grid'),
  description: t(
    'A deep-hierarchy tree table and matrix grid supporting multi-level dimension drill-down, parent-child adjacency graphs, roll-up aggregations, and native Superset 6.1.0 cross-filtering.',
  ),
  behaviors: [Behavior.InteractiveChart, Behavior.DrillToDetail, Behavior.DrillBy],
  category: t('Table'),
  tags: [
    t('Stratum'),
    t('StratumTree'),
    t('Table'),
    t('Hierarchy'),
    t('Tree'),
    t('Drilldown'),
    t('Rollup'),
    t('Matrix'),
    t('Financial'),
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
