import { useRef, useState, useEffect, useCallback } from "react";
import { useGraph } from "@/view/hooks/use-graph";
import { ANALYZER_REGISTRY, TRANSFORM_REGISTRY } from "@/graph-types/registry";
import type { FileEntry } from "@/graph-types/registry";
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
import type { Viewport } from "@/model/types";
import {
  updateNodeInTree,
  removeNodeFromTree,
  addReferenceToNode,
  removeReferenceFromTree,
  reparentNode,
  findNodeById,
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

import { useLayoutModel } from "@/app/models/layout-model";
import { useGraphViewModel } from "@/app/models/graph-view-model";
import { useModalModel } from "@/app/models/modal-model";
import { buildFocusedView, findTransformer, TYPE_LABELS } from "@/app/helpers/graph-view";
import type { AppEvent } from "@/app/events";

// ---------------------------------------------------------------------------
// App — orchestrates models, wires the canvas adapter, dispatches events.
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

  // Mirror activeGraph in a ref so canvas callbacks always read the latest value.
  const activeGraphRef = useRef(activeGraph);
  useEffect(() => { activeGraphRef.current = activeGraph; }, [activeGraph]);

  // When set, skip the next setDocument call (canvas already reflects the change).
  const skipDocumentReloadRef = useRef(false);

  const [importError, setImportError] = useState<string | null>(null);

  const layout = useLayoutModel();
  const view = useGraphViewModel(activeGraph);
  const modals = useModalModel();

  // ---------------------------------------------------------------------------
  // Graph mutation helpers (used both directly and via dispatch)
  // ---------------------------------------------------------------------------

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

  const handleNodeDelete = useCallback(
    async (nodeId: string) => {
      const current = activeGraphRef.current;
      if (!current) return;
      let updated = removeNodeFromTree(current, nodeId);
      updated = { ...updated, updatedAt: new Date().toISOString() };
      if (view.selectedNodeIdRef.current === nodeId) view.setSelectedNodeId(null);
      await updateGraph(updated);
    },
    [updateGraph, view.setSelectedNodeId, view.selectedNodeIdRef],
  );

  // ---------------------------------------------------------------------------
  // Canvas change handler — handles structural and layout events from the adapter.
  // ---------------------------------------------------------------------------

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
        if (view.selectedNodeIdRef.current === id) view.setSelectedNodeId(null);
      } else if (event.type === "reparent") {
        const { nodeId, newParentId } = event.payload as ReparentPayload;
        updated = reparentNode(current, nodeId, newParentId);
        updated = { ...updated, updatedAt: new Date().toISOString() };
      } else if (event.type === "reference-create") {
        const { sourceId, targetId, refType } = event.payload as ReferenceCreatePayload;
        const ref = { id: uuidv4(), type: refType, target: targetId, metadata: {} };
        updated = addReferenceToNode(current, sourceId, ref);
        updated = { ...updated, updatedAt: new Date().toISOString() };
      } else if (event.type === "reference-remove") {
        const { id } = event.payload as ReferenceRemovePayload;
        updated = removeReferenceFromTree(current, id);
        updated = { ...updated, updatedAt: new Date().toISOString() };
      } else {
        return;
      }

      const isLayoutOnly =
        event.type === "move" || event.type === "resize" || event.type === "viewport";
      if (isLayoutOnly) skipDocumentReloadRef.current = true;

      await updateGraph(updated);
    },
    [updateGraph, view.selectedNodeIdRef, view.setSelectedNodeId],
  );

  // ---------------------------------------------------------------------------
  // Adapter wiring — push document to canvas and subscribe to its events.
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!activeGraph || !adapterRef.current) return;

    let docRoot;
    if (!view.focusedNodeId) {
      const transform = TRANSFORM_REGISTRY[activeGraph.type];
      docRoot = transform ? transform(activeGraph, view.expandedSubgraphs) : activeGraph;
    } else {
      const focusedNode = findNodeById(activeGraph, view.focusedNodeId);
      if (!focusedNode) {
        view.setFocusedNodeId(null);
        return;
      }
      const focusedView = buildFocusedView(focusedNode, activeGraph);
      const transform = findTransformer(focusedNode, activeGraph);
      docRoot = transform ? transform(focusedView, view.expandedSubgraphs) : focusedView;
    }

    if (!skipDocumentReloadRef.current) {
      adapterRef.current.setDocument(docRoot);
    }
    skipDocumentReloadRef.current = false;

    const unsubSel = adapterRef.current.onSelectionChange((e) => {
      view.setSelectedNodeId(e.nodeIds[0] ?? null);
      view.setSelectedReferenceId(e.referenceIds[0] ?? null);
    });
    const unsubChange = adapterRef.current.onGraphChange(handleGraphChange);
    return () => {
      unsubChange();
      unsubSel();
    };
  }, [activeGraph, view.focusedNodeId, view.expandedSubgraphs, handleGraphChange]);

  // ---------------------------------------------------------------------------
  // Analysis result handlers (used by modal components directly)
  // ---------------------------------------------------------------------------

  async function handleModalAnalyze(combinedContent: FileEntry[]) {
    if (!modals.analyzeModalType) return;
    const analyzer = ANALYZER_REGISTRY[modals.analyzeModalType];
    if (!analyzer) return;
    const draft = await analyzer(combinedContent);
    await importGraph(draft);
    modals.closeMarkdown();
  }

  async function handleCodeAnalysisResult(result: AnalysisResult) {
    const now = new Date().toISOString();
    const activeChildren = Object.entries(result).map(([key, node]) => ({
      ...node,
      id: uuidv4(),
      label: `${key} View`,
      metadata: { ...node.metadata, _viewType: key },
    }));
    const rootGraph = {
      id: uuidv4(),
      label: result.ast.label,
      type: "code",
      schemaVersion: "1.0.0" as const,
      metadata: {},
      children: activeChildren,
      createdAt: now,
      updatedAt: now,
    };
    await importGraph(rootGraph);
    modals.closeCode();
  }

  async function handleWorkspaceAnalysisResult(files: Map<string, string>, name: string) {
    const { analyzeWorkspaceFromFileMap } = await import("@/graph-types/workspace/analyzer");
    const draft = await analyzeWorkspaceFromFileMap(files, name);
    await importGraph(draft);
    modals.closeWorkspace();
  }

  // ---------------------------------------------------------------------------
  // Import helper
  // ---------------------------------------------------------------------------

  async function handleImportJson() {
    setImportError(null);
    try {
      const node = await importFromFile();
      await importGraph(node);
    } catch (err) {
      if (err instanceof ImportError) setImportError(err.message);
    }
  }

  // ---------------------------------------------------------------------------
  // Central event dispatcher — single entry point for all component interactions.
  // ---------------------------------------------------------------------------

  const dispatch = useCallback(
    async (event: AppEvent): Promise<void> => {
      switch (event.type) {
        case "graph:select":
          selectGraph(event.id);
          break;
        case "graph:delete":
          deleteGraph(event.id);
          break;
        case "graph:export":
          downloadGraph(event.graph);
          break;
        case "graph:import":
          await handleImportJson();
          break;
        case "graph:update":
          await updateGraph(event.graph);
          break;
        case "node:drill":
          view.drillInto(event.id, adapterRef.current);
          break;
        case "node:navigate":
          view.navigateTo(event.id);
          break;
        case "node:toggle-expand":
          view.toggleExpand(event.id);
          break;
        case "node:update":
          await handleNodeUpdate(event.nodeId, event.changes);
          break;
        case "node:delete":
          await handleNodeDelete(event.nodeId);
          break;
        case "analyze:markdown":
          modals.openMarkdown(event.graphType);
          break;
        case "analyze:code":
          modals.openCode();
          break;
        case "analyze:workspace":
          modals.openWorkspace();
          break;
        case "layout:resize-left-start":
          layout.startResizeLeft();
          break;
        case "layout:resize-right-start":
          layout.startResizeRight();
          break;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      selectGraph, deleteGraph, updateGraph, importGraph,
      handleNodeUpdate, handleNodeDelete,
      view.drillInto, view.navigateTo, view.toggleExpand,
      modals.openMarkdown, modals.openCode, modals.openWorkspace,
      layout.startResizeLeft, layout.startResizeRight,
    ],
  );

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

  return (
    <div className="flex h-full">
      <LeftSidebar
        graphs={graphs}
        activeGraph={activeGraph}
        loading={loading}
        sidebarWidth={layout.leftSidebarWidth}
        isResizing={layout.isResizingLeft}
        importError={importError}
        focusedNodeId={view.focusedNodeId}
        onEvent={dispatch}
      />

      <Main
        activeGraph={activeGraph}
        adapterRef={adapterRef}
        breadcrumbPath={view.breadcrumbPath}
        onEvent={dispatch}
      />

      <RightSidebar
        sidebarWidth={layout.rightSidebarWidth}
        isResizing={layout.isResizingRight}
        activeGraph={activeGraph}
        selectedNode={view.selectedNode}
        selectedReference={view.selectedReference}
        onEvent={dispatch}
      />

      {modals.analyzeModalType && (
        <AnalyzeModal
          typeName={TYPE_LABELS[modals.analyzeModalType] ?? modals.analyzeModalType}
          onClose={modals.closeMarkdown}
          onAnalyze={handleModalAnalyze}
        />
      )}

      {modals.showCodeModal && (
        <AnalyzeCodeModal
          onClose={modals.closeCode}
          onAnalyze={handleCodeAnalysisResult}
        />
      )}

      {modals.showWorkspaceModal && (
        <AnalyzeWorkspaceModal
          onClose={modals.closeWorkspace}
          onAnalyze={handleWorkspaceAnalysisResult}
        />
      )}
    </div>
  );
}
