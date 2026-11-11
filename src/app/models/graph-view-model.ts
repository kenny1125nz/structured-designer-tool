import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import type { Node, Reference } from "@/model/types";
import { findNodeById, findReferenceById } from "@/model/utils";
import { buildParentMap, getAncestorPath } from "@/app/helpers/graph-view";
import type { GraphAdapter } from "@/view/adapter/index";

// ---------------------------------------------------------------------------
// Graph view model — focused node, expanded subgraphs, canvas selection.
// Derives breadcrumb path and resolves selected node / reference from the graph.
// ---------------------------------------------------------------------------

export interface GraphViewModel {
  // State
  focusedNodeId: string | null;
  expandedSubgraphs: Set<string>;
  selectedNodeId: string | null;
  selectedReferenceId: string | null;
  /** Stable ref — safe to read from async callbacks without adding to deps. */
  selectedNodeIdRef: React.RefObject<string | null>;
  // Derived
  breadcrumbPath: Node[];
  selectedNode: Node | null;
  selectedReference: { ref: Reference; source: Node } | null;
  // Setters (exposed for the adapter subscription in App)
  setFocusedNodeId: (id: string | null) => void;
  setSelectedNodeId: (id: string | null) => void;
  setSelectedReferenceId: (id: string | null) => void;
  // Actions
  drillInto: (id: string, adapter: GraphAdapter | null) => void;
  navigateTo: (id: string | null) => void;
  toggleExpand: (id: string) => void;
}

export function useGraphViewModel(activeGraph: Node | null): GraphViewModel {
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [expandedSubgraphs, setExpandedSubgraphs] = useState<Set<string>>(
    new Set(),
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedReferenceId, setSelectedReferenceId] = useState<string | null>(
    null,
  );

  const selectedNodeIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId;
  }, [selectedNodeId]);

  // Keep a ref to activeGraph so stable callbacks can read the latest value.
  const activeGraphRef = useRef(activeGraph);
  useEffect(() => {
    activeGraphRef.current = activeGraph;
  }, [activeGraph]);

  // Reset all view state when the active graph changes.
  useEffect(() => {
    setSelectedNodeId(null);
    setSelectedReferenceId(null);
    setFocusedNodeId(null);
    setExpandedSubgraphs(new Set());
  }, [activeGraph?.id]);

  const parentMap = useMemo(() => {
    if (!activeGraph) return new Map<string, Node>();
    return buildParentMap(activeGraph);
  }, [activeGraph]);

  const breadcrumbPath = useMemo((): Node[] => {
    if (!focusedNodeId || !activeGraph) return [];
    const focused = findNodeById(activeGraph, focusedNodeId);
    if (!focused) return [];
    const ancestors = getAncestorPath(focusedNodeId, activeGraph, parentMap);
    return [...ancestors, focused];
  }, [focusedNodeId, activeGraph, parentMap]);

  const selectedNode = useMemo(
    () =>
      selectedNodeId && activeGraph
        ? (findNodeById(activeGraph, selectedNodeId) ?? null)
        : null,
    [selectedNodeId, activeGraph],
  );

  const selectedReference = useMemo(
    () =>
      selectedReferenceId && activeGraph
        ? (findReferenceById(activeGraph, selectedReferenceId) ?? null)
        : null,
    [selectedReferenceId, activeGraph],
  );

  const drillInto = useCallback(
    (id: string, adapter: GraphAdapter | null) => {
      const node = activeGraphRef.current
        ? findNodeById(activeGraphRef.current, id)
        : null;
      if (!node) return;
      if (node.children?.length) {
        setFocusedNodeId(id);
        setSelectedNodeId(null);
      } else {
        setSelectedNodeId(id);
        adapter?.focusNode(id);
      }
    },
    [],
  );

  const navigateTo = useCallback((id: string | null) => {
    setFocusedNodeId(id);
    setSelectedNodeId(null);
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setExpandedSubgraphs((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  return {
    focusedNodeId,
    expandedSubgraphs,
    selectedNodeId,
    selectedReferenceId,
    selectedNodeIdRef,
    breadcrumbPath,
    selectedNode,
    selectedReference,
    setFocusedNodeId,
    setSelectedNodeId,
    setSelectedReferenceId,
    drillInto,
    navigateTo,
    toggleExpand,
  };
}
