import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { useGraph } from "@/view/hooks/use-graph";
import { ANALYZER_REGISTRY, TRANSFORM_REGISTRY, FileEntry, GraphTransformFn } from "@/graph-types/registry";
import type { GraphAdapter } from "@/view/adapter/index";
import type {
  GraphChangeEvent,
  MovePayload,
  ResizePayload,
  NodeRemovePayload,
  ReparentPayload,
  ReferenceCreatePayload,
  ReferenceRemovePayload,
} from "@/view/adapter/index";
import type { Viewport, Node as GraphNode } from "@/model/types";
import {
  updateNodeInTree,
  removeNodeFromTree,
  addReferenceToNode,
  removeReferenceFromTree,
  reparentNode,
  findNodeById,
  findReferenceById,
} from "@/model/utils";
import { downloadGraph } from "@/controller/io/export";
import { importFromFile, ImportError } from "@/controller/io/import";
import { v4 as uuidv4 } from "uuid";
import type { AnalysisResult } from "@/graph-types/code/analyzer";
import { LeftSidebar } from "@/components/LeftSidebar";
import { Main } from "@/components/Main";
import { RightSidebar } from "@/components/RightSidebar";
import { AnalyzeModal } from "@/components/AnalyzeModal";
import { AnalyzeCodeModal } from "@/components/AnalyzeCodeModal";
import { AnalyzeWorkspaceModal } from "@/components/AnalyzeWorkspaceModal";

const TYPE_LABELS: Record<string, string> = {
  document: "Document",
  architecture: "Architecture",
  code: "Code",
};

// ---------------------------------------------------------------------------
// Graph traversal helpers
// ---------------------------------------------------------------------------

function buildParentMap(root: GraphNode): Map<string, GraphNode> {
  const parentOf = new Map<string, GraphNode>();
  function collect(n: GraphNode, parent?: GraphNode) {
    if (parent) parentOf.set(n.id, parent);
    n.children?.forEach((c) => collect(c, n));
  }
  collect(root);
  return parentOf;
}

/** Returns ancestors from the first child of root down to (but not including) nodeId. */
function getAncestorPath(nodeId: string, root: GraphNode, parentOf: Map<string, GraphNode>): GraphNode[] {
  const path: GraphNode[] = [];
  let cur = parentOf.get(nodeId);
  while (cur && cur.id !== root.id) {
    path.unshift(cur);
    cur = parentOf.get(cur.id);
  }
  return path;
}


function findGraphTypeByNode(node: GraphNode, root: GraphNode): string | null {
  const parents = getAncestorPath(node.id, root, buildParentMap(root));
  for (const n of [node, ...parents.reverse()]) {
    if (n.type) {
      const transformer = TRANSFORM_REGISTRY[n.type]
      if (!!transformer) {
        return n.type;
      }
    }
  }
  return null;
}

function findTransformer(node: GraphNode, root: GraphNode): GraphTransformFn | null {
  const type = findGraphTypeByNode(node, root);
  if (!type) return null;
  return TRANSFORM_REGISTRY[type] ?? null;
}


// ---------------------------------------------------------------------------
// buildFocusedView — derives canvas content from a single focused node.
//
// Rule: the focused node is the "key container."
//   • Its direct children are the primary nodes shown on canvas.
//   • References from any descendant to a node outside the focused subtree
//     become external stubs alongside those children.
//   • Two stub kinds:
//       "external" — library nodes or truly foreign nodes (external-external)
//       "internal" — nodes inside the same graph but outside focused subtree
//                    (internal-external)
// ---------------------------------------------------------------------------

function buildFocusedView(focusedNode: GraphNode, fullGraph: GraphNode): GraphNode {
  // 1. Collect all IDs inside the focused subtree.
  const focusedIds = new Set<string>();
  function collectFocusedIds(n: GraphNode) {
    focusedIds.add(n.id);
    n.children?.forEach(collectFocusedIds);
  }
  collectFocusedIds(focusedNode);

  // 2. Build lookup maps for the full graph.
  const byLabel = new Map<string, GraphNode>();
  const byId = new Map<string, GraphNode>();
  const parentOf = new Map<string, GraphNode>();
  function collectAll(n: GraphNode, parent?: GraphNode) {
    byLabel.set(n.label, n);
    byId.set(n.id, n);
    if (parent) parentOf.set(n.id, parent);
    n.children?.forEach((c) => collectAll(c, n));
  }
  collectAll(fullGraph);

  // 3. Walk up to find the nearest file/library ancestor (for grouping stubs).
  function containerAncestor(n: GraphNode): GraphNode | null {
    let cur: GraphNode | undefined = parentOf.get(n.id);
    while (cur) {
      if (cur.type === "file" || cur.type === "library") return cur;
      cur = parentOf.get(cur.id);
    }
    return null;
  }

  // 4. Collect external reference targets from descendants of focusedNode.
  type StubGroup = { containerNode: GraphNode; entities: Map<string, GraphNode> };
  const stubs = new Map<string, StubGroup>();

  function registerRef(refTarget: string) {
    const targetNode = byLabel.get(refTarget) ?? byId.get(refTarget);
    if (!targetNode || focusedIds.has(targetNode.id)) return; // internal — skip

    if (targetNode.type === "library" || targetNode.type === "file") {
      if (!stubs.has(targetNode.id)) {
        stubs.set(targetNode.id, { containerNode: targetNode, entities: new Map() });
      }
      return;
    }

    // Entity/enum: group under nearest file/library ancestor outside focused subtree.
    const container = containerAncestor(targetNode);
    const containerNode = (container && !focusedIds.has(container.id)) ? container : targetNode;
    if (focusedIds.has(containerNode.id)) return;

    if (!stubs.has(containerNode.id)) {
      stubs.set(containerNode.id, { containerNode, entities: new Map() });
    }
    if (containerNode.id !== targetNode.id) {
      stubs.get(containerNode.id)!.entities.set(targetNode.id, {
        ...targetNode,
        children: undefined,
        references: undefined,
      });
    }
  }

  function walkRefs(n: GraphNode) {
    for (const ref of n.references ?? []) registerRef(ref.target);
    n.children?.forEach(walkRefs);
  }
  // Walk the focused node's children (not the focused node itself — its own
  // references are the container's cross-graph edges, not child-level refs).
  for (const child of focusedNode.children ?? []) {
    walkRefs(child);
  }

  // 5. Build stub nodes.
  //    Mark as "external" (library / out-of-graph) or "internal" (same graph,
  //    outside the focused subtree).
  const stubNodes: GraphNode[] = Array.from(stubs.values()).map(({ containerNode, entities }) => ({
    id: containerNode.id,
    label: containerNode.label,
    type: containerNode.type,
    metadata: {
      ...containerNode.metadata,
      _externalRef: containerNode.type === "library" ? "external" : "internal",
    },
    children: entities.size > 0 ? Array.from(entities.values()) : undefined,
  }));

  // 6. The view root uses focusedNode.id so the adapter detects it as a new
  //    document when navigation changes, triggering auto-fit.  Root type comes
  //    from fullGraph so the correct renderer and canvas context are applied.
  //    focusedNode itself (with its children intact) is the compound box;
  //    external stubs appear alongside it as peers.
  return {
    id: fullGraph.id,
    type: findGraphTypeByNode(focusedNode, fullGraph) ?? fullGraph.type,
    label: fullGraph.label,
    metadata: fullGraph.metadata,
    children: [
      focusedNode,   // compound box — children remain nested inside it
      ...stubNodes,  // external-ref stubs as top-level peers
    ],
  };
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export function App() {
  const adapterRef = useRef<GraphAdapter>(null);
  const {
    graphs,
    activeGraph,
    loading,
    selectGraph,
    updateGraph,
    deleteGraph,
    importGraph,
  } = useGraph();

  // Mirror activeGraph in a ref so the change handler always reads the latest
  // value without needing it as a useCallback dependency.
  const activeGraphRef = useRef(activeGraph);
  useEffect(() => { activeGraphRef.current = activeGraph; }, [activeGraph]);

  // When we persist a position/size/viewport change we set this flag so the
  // useEffect([activeGraph]) below skips calling setDocument — the canvas
  // already reflects those changes, there is nothing to reload.
  const skipDocumentReloadRef = useRef(false);

  const [importError, setImportError] = useState<string | null>(null);
  const [leftSidebarWidth, setLeftSidebarWidth] = useState<number>(() => {
    // Try to load from localStorage, default to 224px (w-56)
    const saved = localStorage.getItem("left-sidebar-width");
    return saved ? parseInt(saved, 10) : 224;
  });
  const [rightSidebarWidth, setRightSidebarWidth] = useState<number>(() => {
    const saved = localStorage.getItem("right-sidebar-width");
    return saved ? parseInt(saved, 10) : 300;
  });
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);
  // null = closed; string = the graph type currently being analyzed via modal
  const [analyzeModalType, setAnalyzeModalType] = useState<string | null>(null);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);

  // The currently focused node id — drives what the canvas shows.
  // null = full graph root.  Non-null = focused node's children are the canvas content.
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);

  // Set of node ids whose workspace subgraph is currently expanded in-place.
  const [expandedSubgraphs, setExpandedSubgraphs] = useState<Set<string>>(new Set());

  // Currently selected node id (from canvas selection).
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const selectedNodeIdRef = useRef<string | null>(null);
  useEffect(() => { selectedNodeIdRef.current = selectedNodeId; }, [selectedNodeId]);

  // Currently selected reference id (edge selection).
  const [selectedReferenceId, setSelectedReferenceId] = useState<string | null>(null);

  // Derive parent map and breadcrumb path from focusedNodeId + activeGraph.
  const parentMap = useMemo(() => {
    if (!activeGraph) return new Map<string, GraphNode>();
    return buildParentMap(activeGraph);
  }, [activeGraph]);

  // Breadcrumb: path from root's first-level child down to the focused node (inclusive).
  const breadcrumbPath = useMemo((): GraphNode[] => {
    if (!focusedNodeId || !activeGraph) return [];
    const focused = findNodeById(activeGraph, focusedNodeId);
    if (!focused) return [];
    const ancestors = getAncestorPath(focusedNodeId, activeGraph, parentMap);
    return [...ancestors, focused];
  }, [focusedNodeId, activeGraph, parentMap]);

  const handleAnalyzeCode = useCallback(() => {
    setShowCodeModal(true);
  }, []);

  const handleAnalyzeWorkspace = useCallback(() => {
    setShowWorkspaceModal(true);
  }, []);

  const handleWorkspaceAnalysisResult = useCallback(async (files: Map<string, string>, name: string) => {
    const { analyzeWorkspaceFromFileMap } = await import("@/graph-types/workspace/analyzer");
    const draft = await analyzeWorkspaceFromFileMap(files, name);
    await importGraph(draft);
    setShowWorkspaceModal(false);
  }, [importGraph]);

  const handleCodeAnalysisResult = useCallback(async (result: AnalysisResult) => {
    const now = new Date().toISOString();

    const activeChildren = Object.entries(result).map(([key, node]) => ({
      ...node,
      id: uuidv4(),
      label: `${key} View`,
      metadata: { ...node.metadata, _viewType: key },
    }));

    const rootGraph: GraphNode = {
      id: uuidv4(),
      label: result.ast.label,
      type: "code",
      schemaVersion: "1.0.0",
      metadata: {},
      children: activeChildren,
      createdAt: now,
      updatedAt: now,
    };

    await importGraph(rootGraph);
    setShowCodeModal(false);
  }, [importGraph]);

  const handleAnalyzeFromMarkdown = useCallback((type: string) => {
    setAnalyzeModalType(type);
  }, []);

  const handleModalAnalyze = useCallback(async (combinedContent: FileEntry[]) => {
    if (!analyzeModalType) return;
    const analyzer = ANALYZER_REGISTRY[analyzeModalType];
    if (!analyzer) return;
    const draft = await analyzer(combinedContent);
    await importGraph(draft);
    setAnalyzeModalType(null);
  }, [analyzeModalType, importGraph]);

  // Save sidebar widths to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("left-sidebar-width", leftSidebarWidth.toString());
  }, [leftSidebarWidth]);

  useEffect(() => {
    localStorage.setItem("right-sidebar-width", rightSidebarWidth.toString());
  }, [rightSidebarWidth]);

  // Handle left sidebar resize mouse events
  useEffect(() => {
    if (!isResizingLeft) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(160, Math.min(500, e.clientX));
      setLeftSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizingLeft(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizingLeft]);

  // Handle right sidebar resize mouse events
  useEffect(() => {
    if (!isResizingRight) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Calculate width from right side of window
      const newWidth = Math.max(200, Math.min(500, window.innerWidth - e.clientX));
      setRightSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizingRight(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizingRight]);

  // Handle move / resize / viewport / structural events from the canvas.
  const handleGraphChange = useCallback(
    async (event: GraphChangeEvent) => {
      const current = activeGraphRef.current;
      if (!current) return;

      let updated = current;

      if (event.type === "move") {
        const { moves } = event.payload as MovePayload;
        let graph = current;
        for (const { id, position } of moves) {
          graph = updateNodeInTree(graph, id, () => ({ position }));
        }
        updated = graph;
      } else if (event.type === "resize") {
        const { id, size } = event.payload as ResizePayload;
        updated = updateNodeInTree(current, id, () => ({ size }));
      } else if (event.type === "viewport") {
        updated = { ...current, viewport: event.payload as Viewport };
      } else if (event.type === "node-remove") {
        const { id } = event.payload as NodeRemovePayload;
        updated = removeNodeFromTree(current, id);
        updated = { ...updated, updatedAt: new Date().toISOString() };
        if (selectedNodeIdRef.current === id) setSelectedNodeId(null);
      } else if (event.type === "reparent") {
        const { nodeId, newParentId } = event.payload as ReparentPayload;
        updated = reparentNode(current, nodeId, newParentId);
        updated = { ...updated, updatedAt: new Date().toISOString() };
      } else if (event.type === "reference-create") {
        const { sourceId, targetId, refType } = event.payload as ReferenceCreatePayload;
        const ref = {
          id: uuidv4(),
          type: refType,
          target: targetId,
          metadata: {},
        };
        updated = addReferenceToNode(current, sourceId, ref);
        updated = { ...updated, updatedAt: new Date().toISOString() };
      } else if (event.type === "reference-remove") {
        const { id } = event.payload as ReferenceRemovePayload;
        updated = removeReferenceFromTree(current, id);
        updated = { ...updated, updatedAt: new Date().toISOString() };
      } else {
        return;
      }

      // For move/resize/viewport: skip setDocument to avoid layout jitter.
      const isLayoutOnly =
        event.type === "move" || event.type === "resize" || event.type === "viewport";
      if (isLayoutOnly) {
        skipDocumentReloadRef.current = true;
      }
      await updateGraph(updated);
    },
    [updateGraph],
  );

  // Handle node deletion from Properties panel.
  const handleNodeDelete = useCallback(
    async (nodeId: string) => {
      const current = activeGraphRef.current;
      if (!current) return;
      let updated = removeNodeFromTree(current, nodeId);
      updated = { ...updated, updatedAt: new Date().toISOString() };
      if (selectedNodeIdRef.current === nodeId) setSelectedNodeId(null);
      await updateGraph(updated);
    },
    [updateGraph],
  );

  // Handle node update (label / metadata) from Properties panel.
  const handleNodeUpdate = useCallback(
    async (nodeId: string, changes: { label?: string; metadata?: Record<string, unknown> }) => {
      const current = activeGraphRef.current;
      if (!current) return;
      const updated = updateNodeInTree(current, nodeId, (n) => ({
        ...(changes.label !== undefined ? { label: changes.label } : {}),
        ...(changes.metadata !== undefined
          ? { metadata: { ...n.metadata, ...changes.metadata } }
          : {}),
      }));
      await updateGraph({ ...updated, updatedAt: new Date().toISOString() });
    },
    [updateGraph],
  );

  // Push the active graph document into the adapter whenever it (or the focused
  // node / expanded-subgraphs set) changes, and (re-)subscribe to canvas events.
  useEffect(() => {
    if (!activeGraph || !adapterRef.current) return;

    let docRoot: GraphNode;
    if (!focusedNodeId) {
      // Full graph — apply the graph-type's layout transform.
      const transform = TRANSFORM_REGISTRY[activeGraph.type];
      docRoot = transform ? transform(activeGraph, expandedSubgraphs) : activeGraph;
    } else {
      const focusedNode = findNodeById(activeGraph, focusedNodeId);
      if (!focusedNode) {
        // Focused node no longer exists — reset to full graph.
        setFocusedNodeId(null);
        return;
      }
      // Build a view where focusedNode's children are the top-level canvas nodes,
      // with external reference stubs alongside them.
      const focusedView = buildFocusedView(focusedNode, activeGraph);
      const transform = findTransformer(focusedNode, activeGraph);
      docRoot = transform ? transform(focusedView, expandedSubgraphs) : focusedView;
    }


    if (!skipDocumentReloadRef.current) {
      adapterRef.current.setDocument(docRoot);
    }
    skipDocumentReloadRef.current = false;

    const unsubSel = adapterRef.current.onSelectionChange((e) => {
      setSelectedNodeId(e.nodeIds[0] ?? null);
      setSelectedReferenceId(e.referenceIds[0] ?? null);
    });

    const unsubChange = adapterRef.current.onGraphChange(handleGraphChange);
    return () => {
      unsubChange();
      unsubSel();
    };
  }, [activeGraph, focusedNodeId, expandedSubgraphs, handleGraphChange]);

  // Clear selection, focus, and expanded subgraphs when switching graphs.
  useEffect(() => {
    setSelectedNodeId(null);
    setSelectedReferenceId(null);
    setFocusedNodeId(null);
    setExpandedSubgraphs(new Set());
  }, [activeGraph?.id]);


  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  async function handleImportJson() {
    setImportError(null);
    try {
      const node = await importFromFile();
      await importGraph(node);
    } catch (err) {
      if (err instanceof ImportError) {
        setImportError(err.message);
      }
    }
  }

  function handleExportJson(graph: (typeof graphs)[number]) {
    downloadGraph(graph);
  }


  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  // Resolve the currently selected node for the Properties panel.
  const selectedNode = selectedNodeId && activeGraph
    ? findNodeById(activeGraph, selectedNodeId) ?? null
    : null;

  // Resolve the currently selected reference for the Properties panel.
  const selectedReference = selectedReferenceId && activeGraph
    ? findReferenceById(activeGraph, selectedReferenceId) ?? null
    : null;

  function handleDrillInto(id: string) {
    const node = activeGraph ? findNodeById(activeGraph, id) : null;
    if (!node) return;

    if (node.children?.length) {
      // Container node — make it the focused view root.
      setFocusedNodeId(id);
      setSelectedNodeId(null);
    } else {
      // Leaf node — select it and zoom to it on the current canvas.
      setSelectedNodeId(id);
      adapterRef.current?.focusNode(id);
    }
  }

  function handleNavigateTo(nodeId: string | null) {
    // Navigate to an ancestor via the breadcrumb (null = back to full graph).
    setFocusedNodeId(nodeId);
    setSelectedNodeId(null);
  }

  function handleToggleExpand(nodeId: string) {
    setExpandedSubgraphs((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }

  return (
    <div className="flex h-full">
      {/* Left Sidebar */}
      <LeftSidebar
        graphs={graphs}
        activeGraph={activeGraph}
        loading={loading}
        sidebarWidth={leftSidebarWidth}
        isResizing={isResizingLeft}
        importError={importError}
        onSelectGraph={selectGraph}
        onDeleteGraph={deleteGraph}
        onExportGraph={handleExportJson}
        onImportJson={handleImportJson}
        onAnalyzeFromMarkdown={handleAnalyzeFromMarkdown}
        onAnalyzeCode={handleAnalyzeCode}
        onAnalyzeWorkspace={handleAnalyzeWorkspace}
        onResizeStart={() => setIsResizingLeft(true)}
        onDrillInto={handleDrillInto}
        focusedNodeId={focusedNodeId}
      />

      {/* Main Content Area */}
      <Main
        activeGraph={activeGraph}
        adapterRef={adapterRef}
        onResizeStart={() => setIsResizingRight(true)}
        breadcrumbPath={breadcrumbPath}
        onNavigateTo={handleNavigateTo}
        onDrillInto={handleDrillInto}
        onToggleExpand={handleToggleExpand}
      />

      {/* Right Sidebar */}
      <RightSidebar
        sidebarWidth={rightSidebarWidth}
        isResizing={isResizingRight}
        onResizeStart={() => setIsResizingRight(true)}
        activeGraph={activeGraph}
        selectedNode={selectedNode}
        selectedReference={selectedReference}
        onGraphUpdate={updateGraph}
        onNodeUpdate={handleNodeUpdate}
        onNodeDelete={handleNodeDelete}
      />

      {/* Analyze-from-files modal (markdown analyzers) */}
      {analyzeModalType && (
        <AnalyzeModal
          typeName={TYPE_LABELS[analyzeModalType] ?? analyzeModalType}
          onClose={() => setAnalyzeModalType(null)}
          onAnalyze={handleModalAnalyze}
        />
      )}

      {/* Analyze codebase modal (zip or folder) */}
      {showCodeModal && (
        <AnalyzeCodeModal
          onClose={() => setShowCodeModal(false)}
          onAnalyze={handleCodeAnalysisResult}
        />
      )}

      {/* Analyze workspace modal (folder or zip → doc + arch + code) */}
      {showWorkspaceModal && (
        <AnalyzeWorkspaceModal
          onClose={() => setShowWorkspaceModal(false)}
          onAnalyze={handleWorkspaceAnalysisResult}
        />
      )}
    </div>
  );
}
