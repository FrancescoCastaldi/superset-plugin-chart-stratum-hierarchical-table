import { buildQueryContext, QueryContext, ensureIsArray } from '@superset-ui/core';
import { HierarchicalTableFormData } from '../types';
import { buildPeriodMetrics, resolvePeriodColumns } from '../utils/dynamicPeriodLabels';
import { getMetricNames, resolveHiddenMetrics } from './formDataOptions';

export default function buildQuery(
  formData: HierarchicalTableFormData,
  options?: { ownState?: Record<string, any> },
): QueryContext {
  const fd: any = formData || {};
  const {
    hierarchyType = 'multi_dimension',
    groupby,
    hierarchy_dimensions,
    hierarchyDimensions,
    idColumn,
    parentIdColumn,
    labelColumn,
    metrics = [],
  } = fd;

  return buildQueryContext(formData as any, (baseQueryObject: any) => {
    let columns: string[] = [];

    if (hierarchyType === 'multi_dimension') {
      // Backward compat: support groupby, hierarchyDimensions, hierarchy_dimensions
      const rowDims = ensureIsArray(groupby || hierarchyDimensions || hierarchy_dimensions);
      const pivotDims = ensureIsArray(fd.columns || fd.pivot_columns);
      columns = Array.from(new Set([...rowDims, ...pivotDims]));
    } else {
      // Parent-Child hierarchy requires ID, Parent ID, and optional Label column
      const cols = [idColumn, parentIdColumn, labelColumn].filter(Boolean) as string[];
      columns = Array.from(new Set(cols));
    }

    const dashboardTimeCompare = ensureIsArray(
      fd.extra_form_data?.time_compare ||
      baseQueryObject.extra_form_data?.time_compare,
    ).filter(Boolean);

    // Saved metrics that calculated metrics (formulas) cite but the chart does not show are asked too.
    const hiddenMetrics = resolveHiddenMetrics(fd, getMetricNames(metrics));
    const baseMetrics = hiddenMetrics.length > 0 ? [...ensureIsArray(metrics), ...hiddenMetrics] : metrics;

    // With dynamic period labels the query also asks for the periods it is run on.
    const queryMetrics = fd.periodLabelsFromFilters
      ? [...ensureIsArray(baseMetrics), ...buildPeriodMetrics(resolvePeriodColumns(fd))]
      : baseMetrics;

    const query: any = {
      ...baseQueryObject,
      columns,
      metrics: queryMetrics,
    };

    // The chart's own cross-filter, which the dashboard does not apply to the chart that emits it.
    const selfFilters = fd.crossFilterAppliesToSelf ? ensureIsArray(options?.ownState?.selfFilters) : [];
    if (selfFilters.length > 0) {
      query.filters = [...ensureIsArray(query.filters), ...selfFilters];
    }

    if (dashboardTimeCompare.length > 0) {
      query.time_offsets = dashboardTimeCompare;
    }

    return [query];
  });
}
