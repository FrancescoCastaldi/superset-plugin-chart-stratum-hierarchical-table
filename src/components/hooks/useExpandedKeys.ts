import { useCallback, useEffect, useRef, useState } from 'react';
import { TreeNode } from '../../types';

function parentNodes(nodes: TreeNode[], out: TreeNode[] = []): TreeNode[] {
  for (const node of nodes) {
    if (node.children && node.children.length > 0) {
      out.push(node);
      parentNodes(node.children, out);
    }
  }
  return out;
}

/** Chiavi dei padri che a quella profondità partono espansi. */
function defaultKeys(parents: TreeNode[], depth: number): Set<string> {
  const keys = new Set<string>();
  for (const node of parents) {
    if (depth === -1 || node.depth < depth) keys.add(node.key);
  }
  return keys;
}

/**
 * Nodi espansi dell'albero. Parte dal livello iniziale scelto; quando arrivano dati con altri
 * padri (una nuova query, un filtro della dashboard) i nodi nuovi si espandono secondo il livello
 * iniziale e quelli già visti restano come l'utente li ha lasciati. Se cambia il livello iniziale
 * si riparte dal predefinito.
 */
export function useExpandedKeys(data: TreeNode[], effectiveTreeData: TreeNode[], initialExpandDepth: number) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() =>
    defaultKeys(parentNodes(data), initialExpandDepth),
  );
  const seen = useRef<{ keys: Set<string>; depth: number }>({
    keys: new Set(parentNodes(data).map(n => n.key)),
    depth: initialExpandDepth,
  });

  useEffect(() => {
    const parents = parentNodes(data);
    const current = new Set(parents.map(n => n.key));
    const previous = seen.current;

    if (previous.depth !== initialExpandDepth) {
      seen.current = { keys: current, depth: initialExpandDepth };
      setExpandedKeys(defaultKeys(parents, initialExpandDepth));
      return;
    }

    const sameShape = current.size === previous.keys.size && [...current].every(key => previous.keys.has(key));
    if (sameShape) return;

    seen.current = { keys: current, depth: initialExpandDepth };
    setExpandedKeys(prev => {
      const next = new Set<string>();
      for (const node of parents) {
        const wasKnown = previous.keys.has(node.key);
        const expanded = wasKnown ? prev.has(node.key) : initialExpandDepth === -1 || node.depth < initialExpandDepth;
        if (expanded) next.add(node.key);
      }
      return next;
    });
  }, [data, initialExpandDepth]);

  const toggleExpand = useCallback((key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedKeys(new Set(parentNodes(effectiveTreeData).map(n => n.key)));
  }, [effectiveTreeData]);

  const collapseAll = useCallback(() => setExpandedKeys(new Set<string>()), []);

  return { expandedKeys, toggleExpand, expandAll, collapseAll };
}
