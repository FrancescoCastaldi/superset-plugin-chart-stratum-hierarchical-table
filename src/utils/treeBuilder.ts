import { DataRecord } from '@superset-ui/core';
import { AggregationFunction, TreeNode, SortOrder, MinMaxScope, MinMaxBoundsMap, NullHandling, SortExpression } from '../types';
import {
  rollupTreeMetrics,
  isDerivedMetric,
  isDistinctEntityMetric,
  rollupFunction,
  recomputeDerivedMetrics,
} from './aggregations';
import { toDimensionValue } from './dimensionValue';
import { NATIVE_COMPARISON_SUFFIX, nativeOffsetValue } from './timeComparison';

/**
 * Builds a hierarchical tree from flat records using an ordered list of dimensions.
 * Example: ['Region', 'Country', 'City']
 */
export function buildMultiDimensionTree(
  records: DataRecord[],
  dimensions: string[],
  metrics: string[],
  pivotDimensions: string[] = [],
  weightColumn = '',
  aggregationMode: AggregationFunction = 'sum',
): TreeNode[] {
  if (!records || records.length === 0 || !dimensions || dimensions.length === 0) {
    return [];
  }

  const isPivot = pivotDimensions && pivotDimensions.length > 0;
  const rootMap = new Map<string, any>();

  for (const record of records) {
    let currentLevelMap = rootMap;
    const currentPath: string[] = [];
    const currentRawPath: (string | number | boolean | null)[] = [];
    let pathKey = '';

    // Construct pivot key for this record if pivotDimensions are present
    let pivotKey = '';
    const isMultiPivot = isPivot && pivotDimensions.length >= 2;
    let pVal1 = '';
    let pVal2 = '';
    if (isPivot) {
      const pivotParts: string[] = [];
      for (const pDim of pivotDimensions) {
        pivotParts.push(toDimensionValue(record[pDim]));
      }
      pivotKey = pivotParts.join(' - ');
      if (isMultiPivot) {
        pVal1 = pivotParts[0];
        pVal2 = pivotParts[1];
      }
    }

    for (let i = 0; i < dimensions.length; i++) {
      const dim = dimensions[i];
      const rawVal = (record[dim] as string | number | boolean | null) ?? null;
      const val = toDimensionValue(record[dim]);
      currentPath.push(val);
      currentRawPath.push(rawVal);

      pathKey = i === 0 ? val : `${pathKey} > ${val}`;
      const isLeaf = i === dimensions.length - 1;

      if (!currentLevelMap.has(val)) {
        const hasDiff = currentRawPath.some((r, idx) => r !== currentPath[idx]);
        const nodeObj: any = {
          key: pathKey,
          id: pathKey,
          name: val,
          dimension: dim,
          depth: i,
          path: [...currentPath],
          ...(hasDiff ? { rawPath: [...currentRawPath] } : {}),
          isLeaf,
          metrics: {},
          subtotals: {},
          rawData: isLeaf ? record : undefined,
          childrenMap: isLeaf ? null : new Map<string, any>(),
        };

        if (isLeaf) {
          for (const m of metrics) {
            const rawM = record[m];
            const numVal =
              rawM === null || rawM === undefined
                ? null
                : typeof rawM === 'number'
                ? rawM
                : isNaN(parseFloat(String(rawM)))
                ? null
                : parseFloat(String(rawM));
            if (isPivot) {
              if (isMultiPivot) {
                nodeObj.metrics[`${m}___${pVal1}___${pVal2}`] = numVal;
                nodeObj.metrics[`${m}___${pVal1}___SUBTOTAL`] = numVal;
                nodeObj.metrics[`${m}___ROW_TOTAL___${pVal2}`] = numVal;
                nodeObj.metrics[`${m}___ROW_TOTAL`] = numVal;
                nodeObj.metrics[`${m}___${pivotKey}`] = numVal;
              } else if (pivotKey) {
                const compositeMetricKey = `${m}___${pivotKey}`;
                nodeObj.metrics[compositeMetricKey] = numVal;
                const offset = nativeOffsetValue(record, m);
                if (offset !== undefined) {
                  nodeObj.metrics[`${m}${NATIVE_COMPARISON_SUFFIX}`] = offset ?? 0;
                }
              }
            } else {
              nodeObj.metrics[m] = numVal;
            }
          }
        }

        currentLevelMap.set(val, nodeObj);
      } else if (isLeaf) {
        // If multiple records land on the same leaf path, sum up their metrics (or MAX for distinct-entity metrics)
        const existingNode = currentLevelMap.get(val);
        for (const m of metrics) {
          // Derived metrics (rates, deltas) are never summed, but a new pivot cell of the same
          // leaf must still receive its own value.
          const isDerived = isDerivedMetric(m);
          const isDistinct = isDistinctEntityMetric(m);
          const mergeVal = (curr: unknown, next: number): number =>
            typeof curr !== 'number'
              ? next
              : isDerived
              ? curr
              : isDistinct
              ? Math.max(curr, next)
              : curr + next;
          const rawM = record[m];
          const numVal =
            rawM === null || rawM === undefined
              ? null
              : typeof rawM === 'number'
              ? rawM
              : isNaN(parseFloat(String(rawM)))
              ? null
              : parseFloat(String(rawM));
          // The native baseline is the comparison of every pivot value, also of those whose current
          // value is empty: skipping them would understate the comparison period of the row.
          const offset = isPivot && pivotKey && !isMultiPivot ? nativeOffsetValue(record, m) : undefined;
          if (offset !== undefined) {
            const baselineKey = `${m}${NATIVE_COMPARISON_SUFFIX}`;
            const previous = existingNode.metrics[baselineKey];
            existingNode.metrics[baselineKey] = (typeof previous === 'number' ? previous : 0) + (offset ?? 0);
          }
          if (numVal !== null) {
            if (isPivot) {
              if (isMultiPivot) {
                const addVal = (k: string) => {
                  existingNode.metrics[k] = mergeVal(existingNode.metrics[k], numVal);
                };
                addVal(`${m}___${pVal1}___${pVal2}`);
                addVal(`${m}___${pVal1}___SUBTOTAL`);
                addVal(`${m}___ROW_TOTAL___${pVal2}`);
                addVal(`${m}___ROW_TOTAL`);
                addVal(`${m}___${pivotKey}`);
              } else if (pivotKey) {
                const targetKey = `${m}___${pivotKey}`;
                existingNode.metrics[targetKey] = mergeVal(existingNode.metrics[targetKey], numVal);
              }
            } else {
              existingNode.metrics[m] = mergeVal(existingNode.metrics[m], numVal);
            }
          }
        }
      }

      const currentNode = currentLevelMap.get(val);
      if (!isLeaf && currentNode.childrenMap) {
        currentLevelMap = currentNode.childrenMap;
      }
    }
  }

  // Recursive conversion from internal Map structure to TreeNode[]
  function mapToTreeNodes(map: Map<string, any>): TreeNode[] {
    const result: TreeNode[] = [];
    for (const item of Array.from(map.values())) {
      const node: TreeNode = {
        key: item.key,
        id: item.id,
        name: item.name,
        dimension: item.dimension,
        depth: item.depth,
        path: item.path,
        ...(item.rawPath ? { rawPath: item.rawPath } : {}),
        isLeaf: item.isLeaf,
        metrics: item.metrics,
        subtotals: item.subtotals,
        rawData: item.rawData,
      };

      if (item.childrenMap && item.childrenMap.size > 0) {
        node.children = mapToTreeNodes(item.childrenMap);
      }

      result.push(node);
    }
    return result;
  }

  const tree = mapToTreeNodes(rootMap);

  // Collect all actual metric keys present in tree (including pivoted keys like Richieste___SSN)
  const allMetricKeys = new Set<string>(metrics);
  function collectKeys(nodes: TreeNode[]) {
    for (const node of nodes) {
      if (node.metrics) {
        for (const k of Object.keys(node.metrics)) {
          allMetricKeys.add(k);
        }
      }
      if (node.children) collectKeys(node.children);
    }
  }
  collectKeys(tree);

  rollupTreeMetrics(
    tree,
    Array.from(allMetricKeys),
    rollupFunction(weightColumn, aggregationMode),
    weightColumn,
    dimensions,
  );
  return tree;
}

/**
 * Builds a hierarchical tree from parent-child (adjacency list) records.
 * Example: idColumn = 'employee_id', parentIdColumn = 'manager_id', labelColumn = 'name'
 */
export function buildParentChildTree(
  records: DataRecord[],
  idColumn: string,
  parentIdColumn: string,
  labelColumn: string,
  metrics: string[],
  weightColumn = '',
  aggregationMode: AggregationFunction = 'sum',
): TreeNode[] {
  if (!records || records.length === 0 || !idColumn) {
    return [];
  }

  const nodeLookup = new Map<string, TreeNode>();
  const parentChildMap = new Map<string, string[]>(); // parentId -> childIds
  const allIds = new Set<string>();

  // 1. Create all nodes
  for (const record of records) {
    const id = String(record[idColumn] ?? '');
    const parentIdRaw = record[parentIdColumn];
    const parentId =
      parentIdRaw !== null && parentIdRaw !== undefined && String(parentIdRaw).trim() !== ''
        ? String(parentIdRaw)
        : null;
    const name =
      labelColumn && record[labelColumn] !== undefined ? String(record[labelColumn]) : id;

    if (!id) continue;
    allIds.add(id);

    const metricValues: Record<string, number | string | null> = {};
    for (const m of metrics) {
      const rawM = record[m];
      metricValues[m] =
        rawM === null || rawM === undefined
          ? null
          : typeof rawM === 'number'
          ? rawM
          : isNaN(parseFloat(String(rawM)))
          ? null
          : parseFloat(String(rawM));
    }

    const node: TreeNode = {
      key: id,
      id,
      name,
      depth: 0,
      path: [name],
      isLeaf: true,
      metrics: metricValues,
      subtotals: { ...metricValues },
      rawData: record,
      children: [],
    };

    nodeLookup.set(id, node);

    const pKey = parentId ?? '__ROOT__';
    if (!parentChildMap.has(pKey)) {
      parentChildMap.set(pKey, []);
    }
    parentChildMap.get(pKey)!.push(id);
  }

  // 2. Identify root items (either parentId is null or parentId not in allIds)
  const rootIds: string[] = [];
  for (const record of records) {
    const id = String(record[idColumn] ?? '');
    const parentIdRaw = record[parentIdColumn];
    const parentId =
      parentIdRaw !== null && parentIdRaw !== undefined && String(parentIdRaw).trim() !== ''
        ? String(parentIdRaw)
        : null;

    if (!parentId || !allIds.has(parentId)) {
      if (id && !rootIds.includes(id)) {
        rootIds.push(id);
      }
    }
  }

  // 3. Recursively assemble tree hierarchy and calculate depth/paths
  function assembleNode(id: string, depth: number, parentPath: string[]): TreeNode | null {
    const node = nodeLookup.get(id);
    if (!node) return null;

    node.depth = depth;
    node.path = [...parentPath, node.name];

    const childIds = parentChildMap.get(id) || [];
    if (childIds.length > 0) {
      node.isLeaf = false;
      const childNodes: TreeNode[] = [];
      for (const childId of childIds) {
        if (childId === id) continue; // prevent direct cycle
        const childNode = assembleNode(childId, depth + 1, node.path);
        if (childNode) {
          childNodes.push(childNode);
        }
      }
      node.children = childNodes;
    } else {
      node.isLeaf = true;
      delete node.children;
    }

    return node;
  }

  const roots: TreeNode[] = [];
  for (const rootId of rootIds) {
    const rootNode = assembleNode(rootId, 0, []);
    if (rootNode) {
      roots.push(rootNode);
    }
  }

  rollupTreeMetrics(roots, metrics, rollupFunction(weightColumn, aggregationMode), weightColumn);
  return roots;
}

/**
 * Filter tree by search term preserving ancestry path for matched nodes.
 */
export function filterTreeBySearch(nodes: TreeNode[], searchTerm: string): TreeNode[] {
  if (!searchTerm || searchTerm.trim() === '') return nodes;
  const term = searchTerm.toLowerCase().trim();

  function searchNode(node: TreeNode): TreeNode | null {
    const nameMatches = node.name.toLowerCase().includes(term);

    let matchingChildren: TreeNode[] = [];
    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        const filteredChild = searchNode(child);
        if (filteredChild) {
          matchingChildren.push(filteredChild);
        }
      }
    }

    if (nameMatches || matchingChildren.length > 0) {
      return {
        ...node,
        children: matchingChildren.length > 0 ? matchingChildren : node.children,
      };
    }

    return null;
  }

  const results: TreeNode[] = [];
  for (const node of nodes) {
    const filtered = searchNode(node);
    if (filtered) {
      results.push(filtered);
    }
  }
  return results;
}

const countLeaves = (node: TreeNode): number =>
  node.children?.length ? node.children.reduce((n, c) => n + countLeaves(c), 0) : 1;

/**
 * Helper to extract or aggregate metric value for a node during sorting.
 * In Pivot Matrix Mode, aggregates composite keys (e.g. 'sales___2023' + 'sales___2024' when sorting by 'sales').
 */
function getNodeMetricValue(node: TreeNode, sortColumn: string): any {
  if (sortColumn === '__tree_level__') return node.depth;
  if (sortColumn === '__leaf_count__') return countLeaves(node);
  const directVal = node.metrics?.[sortColumn] ?? node.subtotals?.[sortColumn];
  if (directVal !== undefined) {
    return directVal;
  }

  // If sorting by base metric in Pivot Matrix Mode (e.g. 'sales' when keys are 'sales___2023')
  const pivotPrefix = `${sortColumn}___`;
  const allKeys = new Set([
    ...Object.keys(node.metrics || {}),
    ...Object.keys(node.subtotals || {}),
  ]);
  const matchingKeys = Array.from(allKeys).filter(k => k.startsWith(pivotPrefix));
  if (matchingKeys.length > 0) {
    let sum = 0;
    let hasNum = false;
    for (const k of matchingKeys) {
      const rawV = node.metrics?.[k] ?? node.subtotals?.[k];
      const v =
        typeof rawV === 'number' && Number.isFinite(rawV)
          ? rawV
          : typeof rawV === 'string' && rawV.trim() !== '' && Number.isFinite(Number(rawV))
          ? Number(rawV)
          : NaN;
      if (!isNaN(v)) {
        sum += v;
        hasNum = true;
      }
    }
    if (hasNum) return sum;
  }

  if (/^delta_.+_pct$/.test(sortColumn)) {
    // Virtual delta expressions are evaluated on a copy so the node metrics stay untouched.
    const metrics = { ...node.subtotals, ...node.metrics };
    recomputeDerivedMetrics(metrics, [...Object.keys(metrics), sortColumn]);
    return metrics[sortColumn];
  }

  return undefined;
}

const isEmptySortValue = (v: any) => v == null || v === '' || Number.isNaN(v);

const isGrandTotal = (n: TreeNode) => n.key === '__grand_total__' || n.id === '__grand_total__';

/**
 * Recursively sorts tree nodes sibling-by-sibling preserving parent-child tree hierarchy.
 */
export const sortTreeHierarchy = (
  nodes: TreeNode[],
  sortColumn?: SortExpression,
  sortOrder?: SortOrder,
  dimensions?: string[],
  grandTotalPosition: 'top' | 'bottom' = 'top',
): TreeNode[] =>
  sortTreeByExpression(nodes, sortColumn, sortOrder, undefined, dimensions, grandTotalPosition);

/**
 * Sibling-aware recursive sort by a metric, hierarchy, structural key (`__tree_level__`,
 * `__leaf_count__`) or virtual `delta_*_pct` expression. Empty values (null, NaN, undefined)
 * go to the bottom in both directions unless nullHandling is 'top' or 'exclude'.
 */
export function sortTreeByExpression(
  nodes: TreeNode[],
  sortColumn?: SortExpression,
  sortOrder?: SortOrder,
  nullHandling?: NullHandling,
  dimensions?: string[],
  grandTotalPosition: 'top' | 'bottom' = 'top',
): TreeNode[] {
  if (!nodes || nodes.length === 0) return [];
  const recurse = (list: TreeNode[]) =>
    list.map(node => ({
      ...node,
      children: node.children
        ? sortTreeByExpression(node.children, sortColumn, sortOrder, nullHandling, dimensions, grandTotalPosition)
        : node.children,
    }));
  if (!sortColumn || !sortOrder || sortOrder === 'none') {
    return recurse(nodes);
  }

  const isHierarchyCol =
    sortColumn === '__hierarchy_tree__' ||
    sortColumn === 'name' ||
    sortColumn === 'hierarchy' ||
    sortColumn === 'category' ||
    Boolean(dimensions && dimensions.includes(sortColumn));
  const nullSign = nullHandling === 'top' ? -1 : 1;

  const sorted = (
    nullHandling === 'exclude' && !isHierarchyCol
      ? nodes.filter(n => isGrandTotal(n) || !isEmptySortValue(getNodeMetricValue(n, sortColumn)))
      : [...nodes]
  ).sort((a, b) => {
    // Keep Grand Total pinned at the top or bottom if present in nodes
    const aIsGrandTotal = isGrandTotal(a);
    const bIsGrandTotal = isGrandTotal(b);
    if (aIsGrandTotal && bIsGrandTotal) return 0;
    if (grandTotalPosition === 'bottom') {
      if (aIsGrandTotal) return 1;
      if (bIsGrandTotal) return -1;
    } else {
      if (aIsGrandTotal) return -1;
      if (bIsGrandTotal) return 1;
    }

    if (isHierarchyCol) {
      const nameA = a.name ?? '';
      const nameB = b.name ?? '';
      const cmp = nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
      return sortOrder === 'asc' ? cmp : -cmp;
    }

    const valA = getNodeMetricValue(a, sortColumn);
    const valB = getNodeMetricValue(b, sortColumn);

    const isANull = isEmptySortValue(valA);
    const isBNull = isEmptySortValue(valB);

    if (isANull && isBNull) return 0;
    if (isANull) return nullSign;
    if (isBNull) return -nullSign;

    const numA =
      typeof valA === 'number'
        ? valA
        : typeof valA === 'string' && valA.trim() !== ''
        ? Number(valA)
        : NaN;
    const numB =
      typeof valB === 'number'
        ? valB
        : typeof valB === 'string' && valB.trim() !== ''
        ? Number(valB)
        : NaN;

    const isANum = Number.isFinite(numA);
    const isBNum = Number.isFinite(numB);

    if (isANum && isBNum) {
      const diff = numA - numB;
      return sortOrder === 'asc' ? diff : -diff;
    }

    // Numbers sort before non-numeric strings (e.g. 'Nuovo')
    if (isANum && !isBNum) return -1;
    if (!isANum && isBNum) return 1;

    const strCmp = String(valA).localeCompare(String(valB), undefined, {
      numeric: true,
      sensitivity: 'base',
    });
    return sortOrder === 'asc' ? strCmp : -strCmp;
  });

  return recurse(sorted);
}

/**
 * Calculates min and max metric values across a specified hierarchy scope.
 * Subtotals and parent aggregations are excluded when scope is 'leaves_only'.
 * Grand Total is always excluded.
 */
export function calculateMinMaxBounds(
  nodes: TreeNode[],
  metricKeys: string[],
  scope: MinMaxScope = 'leaves_only',
): MinMaxBoundsMap {
  const globalBounds: Record<string, { min: number; max: number }> = {};
  const byLevelBounds: Record<string, Record<number, { min: number; max: number }>> = {};

  if (!nodes || !Array.isArray(nodes) || nodes.length === 0 || !metricKeys || !Array.isArray(metricKeys) || metricKeys.length === 0) {
    return {
      global: globalBounds,
      byLevel: scope === 'level_aware' ? byLevelBounds : undefined,
    };
  }

  if (scope === 'level_aware') {
    for (const m of metricKeys) {
      byLevelBounds[m] = {};
    }
  }

  function traverse(nodeList: TreeNode[]) {
    for (const node of nodeList) {
      if (isGrandTotal(node)) {
        continue;
      }

      const isLeaf = Boolean(node.isLeaf || !node.children || node.children.length === 0);
      const inScope =
        scope === 'all_nodes' ||
        (scope === 'leaves_only' && isLeaf) ||
        scope === 'level_aware';

      if (inScope) {
        for (const m of metricKeys) {
          const rawVal = node.metrics?.[m] ?? node.subtotals?.[m];
          const val =
            typeof rawVal === 'number' && Number.isFinite(rawVal)
              ? rawVal
              : typeof rawVal === 'string' && rawVal.trim() !== '' && Number.isFinite(Number(rawVal))
              ? Number(rawVal)
              : null;

          if (val !== null) {
            if (scope !== 'level_aware') {
              if (!globalBounds[m]) {
                globalBounds[m] = { min: val, max: val };
              } else {
                if (val < globalBounds[m].min) globalBounds[m].min = val;
                if (val > globalBounds[m].max) globalBounds[m].max = val;
              }
            } else {
              const depth = node.depth ?? 0;
              if (!byLevelBounds[m]) {
                byLevelBounds[m] = {};
              }
              if (!byLevelBounds[m][depth]) {
                byLevelBounds[m][depth] = { min: val, max: val };
              } else {
                if (val < byLevelBounds[m][depth].min) byLevelBounds[m][depth].min = val;
                if (val > byLevelBounds[m][depth].max) byLevelBounds[m][depth].max = val;
              }
            }
          }
        }
      }

      if (node.children && node.children.length > 0) {
        traverse(node.children);
      }
    }
  }

  traverse(nodes);

  return {
    global: globalBounds,
    byLevel: scope === 'level_aware' ? byLevelBounds : undefined,
  };
}

