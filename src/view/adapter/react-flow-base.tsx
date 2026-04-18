// Shared React Flow base — graph-type adapters compose this factory with
// type-specific options. Application logic must not import @xyflow/react directly.

import {
  useCallback,
  useImperativeHandle,
  useRef,
  forwardRef,
  createContext,
  useContext,
  type ComponentType,
  type ForwardRefExoticComponent,
  type RefAttributes,
} from "react";

// ---------------------------------------------------------------------------
// Drill-into context — workspace child nodes use this to trigger drill-down
// ---------------------------------------------------------------------------

export const DrillIntoContext = createContext<((nodeId: string) => void) | undefined>(undefined);
export const useDrillInto = () => useContext(DrillIntoContext);

// ---------------------------------------------------------------------------
// Toggle-expand context — workspace block nodes use this to expand/collapse
// a subgraph in-place on the unified canvas
// ---------------------------------------------------------------------------

export const ToggleExpandContext = createContext<((nodeId: string) => void) | undefined>(undefined);
export const useToggleExpand = () => useContext(ToggleExpandContext);
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useInternalNode,
  ReactFlowProvider,
  MarkerType,
  Position,
  type Node as RFNode,
  type Edge as RFEdge,
  type EdgeProps,
  type NodeProps,
  type OnSelectionChangeParams,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type InternalNode,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { Node, Viewport } from "@/model/types";
import type {
  GraphAdapter,
  SelectionEvent,
  GraphChangeEvent,
  MovePayload,
  ResizePayload,
  NodeRemovePayload,
  ReparentPayload,
  ReferenceCreatePayload,
  ReferenceRemovePayload,
} from "./index";

// ---------------------------------------------------------------------------
// Floating edge — dynamically picks the best connection point on each node
// ---------------------------------------------------------------------------

/** Returns the absolute canvas centre and half-dimensions of a node. */
function nodeBounds(node: InternalNode) {
  const pos = node.internals.positionAbsolute;
  const w = node.measured?.width ?? node.width ?? 100;
  const h = node.measured?.height ?? node.height ?? 50;
  return { cx: pos.x + w / 2, cy: pos.y + h / 2, hw: w / 2, hh: h / 2 };
}

/**
 * Finds the point where the line from this node's centre toward `target`
 * crosses the node's bounding-box edge, and names which side that is.
 */
function intersect(
  bounds: ReturnType<typeof nodeBounds>,
  target: { x: number; y: number },
): { x: number; y: number; side: Position } {
  const dx = target.x - bounds.cx;
  const dy = target.y - bounds.cy;

  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) {
    return { x: bounds.cx, y: bounds.cy + bounds.hh, side: Position.Bottom };
  }

  // Compare normalised distances: does the ray hit a vertical or horizontal wall first?
  if (Math.abs(dx) * bounds.hh > Math.abs(dy) * bounds.hw) {
    const side = dx > 0 ? Position.Right : Position.Left;
    return {
      x: bounds.cx + Math.sign(dx) * bounds.hw,
      y: bounds.cy + (dy * bounds.hw) / Math.abs(dx),
      side,
    };
  } else {
    const side = dy > 0 ? Position.Bottom : Position.Top;
    return {
      x: bounds.cx + (dx * bounds.hh) / Math.abs(dy),
      y: bounds.cy + Math.sign(dy) * bounds.hh,
      side,
    };
  }
}

/**
 * A shared edge type that draws a bezier curve between the closest edges of
 * source and target nodes, regardless of where their handles are placed.
 * Registered as `type: "floating"` on every edge produced by flattenEdges.
 */
export function FloatingEdge({
  id,
  source,
  target,
  markerEnd,
  style,
  label,
  data,
}: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  if (!sourceNode || !targetNode) return null;

  const sb = nodeBounds(sourceNode);
  const tb = nodeBounds(targetNode);

  const sp = intersect(sb, { x: tb.cx, y: tb.cy });
  const tp = intersect(tb, { x: sb.cx, y: sb.cy });

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX: sp.x,
    sourceY: sp.y,
    sourcePosition: sp.side,
    targetX: tp.x,
    targetY: tp.y,
    targetPosition: tp.side,
  });

  const edgeLabel = label ?? (data as Record<string, unknown> | undefined)?.label as string | undefined;

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      {edgeLabel && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
            }}
            className="nodrag nopan rounded bg-white/90 px-1.5 py-0.5 text-xs text-gray-600 shadow-sm border border-gray-200"
          >
            {edgeLabel}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const FLOATING_EDGE_TYPES = { floating: FloatingEdge };

// ---------------------------------------------------------------------------
// Domain-model → React Flow conversion (shared utilities)
// ---------------------------------------------------------------------------

export function flattenNodes(root: Node, parentId?: string, useSubFlow = true): RFNode[] {
  const isContainer = !!(root.children?.length);
  const rfNode: RFNode = {
    id: root.id,
    type: root.type,
    data: { label: root.label, type: root.type, metadata: root.metadata, isContainer },
    position: root.position ?? { x: 0, y: 0 },
    // Propagate explicit size so React Flow knows container bounds before measuring.
    ...(root.size ? {
      width: root.size.width,
      height: root.size.height,
      style: { width: root.size.width, height: root.size.height },
    } : {}),
    // Removed extent: "parent" to allow drag-reparenting across containers.
    ...(parentId ? { parentId } : {}),
  };
  const nextParentId = useSubFlow ? root.id : undefined;
  const childNodes = (root.children ?? []).flatMap((c) => flattenNodes(c, nextParentId, useSubFlow));
  return [rfNode, ...childNodes];
}

export function flattenEdges(root: Node): RFEdge[] {
  const edges: RFEdge[] = (root.references ?? []).map((ref) => ({
    id: ref.id,
    source: root.id,
    target: ref.target,
    type: "floating",
    label: ref.label,
    data: { type: ref.type, metadata: ref.metadata },
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
  }));
  return [...edges, ...(root.children ?? []).flatMap(flattenEdges)];
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface GraphCanvasOptions {
  /** Custom React Flow node renderers keyed by node type id. */
  nodeComponents?: Record<string, ComponentType<NodeProps>>;
  /**
   * When true (default), child nodes in the domain model are rendered as
   * React Flow sub-flow nodes (parentId + extent:"parent") — children appear
   * visually inside their parent node. Set to false for free-floating network
   * graphs where the JSON hierarchy is logical, not visual.
   */
  useSubFlow?: boolean;

  /**
   * The reference type string to use when the user draws a new edge between
   * two nodes (e.g. "calls", "depends", "cites"). Defaults to "relates".
   */
  defaultReferenceType?: string;
}

export interface GraphCanvasProps {
  className?: string;
  /** When true the canvas is view-only: no drag, resize, delete, or connect. */
  readOnly?: boolean;
  /** Called when a canvas node requests drill-down (e.g. workspace child blocks). */
  onDrillInto?: (nodeId: string) => void;
  /** Called when a workspace block node's expand/collapse button is clicked. */
  onToggleExpand?: (nodeId: string) => void;
}

export type GraphCanvasComponent = ForwardRefExoticComponent<
  GraphCanvasProps & RefAttributes<GraphAdapter>
>;

export function createGraphCanvas(options: GraphCanvasOptions = {}): GraphCanvasComponent {
  const {
    nodeComponents,
    useSubFlow = true,
    defaultReferenceType = "relates",
  } = options;

  function Inner({ adapterRef, readOnly = false, onDrillInto, onToggleExpand }: { adapterRef: React.Ref<GraphAdapter>; readOnly?: boolean; onDrillInto?: (nodeId: string) => void; onToggleExpand?: (nodeId: string) => void }) {
    const [nodes, setNodes, onNodesChange] = useNodesState<RFNode>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<RFEdge>([]);
    const { fitView, setViewport, getViewport, getIntersectingNodes } = useReactFlow();

    const selectionListeners = useRef<Set<(e: SelectionEvent) => void>>(new Set());
    const changeListeners = useRef<Set<(e: GraphChangeEvent) => void>>(new Set());

    // Track the active document id so we only restore the saved viewport when
    // a *different* document is loaded, not on every position/size update.
    const activeDocIdRef = useRef<string | null>(null);

    // Track current node parentIds so we can detect reparenting on drag stop.
    const parentIdMapRef = useRef<Map<string, string | undefined>>(new Map());

    useImperativeHandle(
      adapterRef,
      (): GraphAdapter => ({
        setDocument(root: Node) {
          const isNewDocument = activeDocIdRef.current !== root.id;
          activeDocIdRef.current = root.id;
          setNodes(flattenNodes(root, undefined, useSubFlow));
          setEdges(flattenEdges(root));
          // Snapshot current parentId assignments for reparent detection.
          parentIdMapRef.current = new Map();

          // Restore the saved viewport only when switching to a different graph.
          if (isNewDocument && root.viewport) {
            // Defer one tick so React Flow has mounted the new nodes first.
            const vp = root.viewport;
            setTimeout(() => setViewport(vp), 0);
          } else if (isNewDocument) {
            // No saved viewport — auto-fit so the new layout is visible.
            setTimeout(() => fitView({ duration: 350, padding: 0.1 }), 0);
          }
        },
        onSelectionChange(cb) {
          selectionListeners.current.add(cb);
          return () => selectionListeners.current.delete(cb);
        },
        onGraphChange(cb) {
          changeListeners.current.add(cb);
          return () => changeListeners.current.delete(cb);
        },
        fitToView() { fitView(); },
        focusNode(id: string) {
          fitView({ nodes: [{ id }], duration: 350, padding: 0.25, maxZoom: 1.5 });
        },
        setViewport(vp: Viewport) { setViewport(vp); },
        getViewport(): Viewport { return getViewport(); },
      }),
      [fitView, setViewport, getViewport, setNodes, setEdges],
    );

    const handleSelectionChange = useCallback(
      ({ nodes: sel, edges: selEdges }: OnSelectionChangeParams) => {
        const event: SelectionEvent = {
          nodeIds: sel.map((n) => n.id),
          referenceIds: selEdges.map((e) => e.id),
        };
        selectionListeners.current.forEach((cb) => cb(event));
      },
      [],
    );

    const handleNodesChange = useCallback(
      (changes: NodeChange<RFNode>[]) => {
        // Intercept "remove" changes — emit node-remove events instead of
        // letting React Flow delete the node from its internal state. The App
        // will update the domain model and call setDocument, which resyncs.
        const removals = changes.filter((c) => c.type === "remove");
        const rest = changes.filter((c) => c.type !== "remove");

        // Forward non-removal changes to React Flow's internal state.
        if (rest.length > 0) onNodesChange(rest);

        for (const change of removals) {
          if (change.type === "remove") {
            const payload: NodeRemovePayload = { id: change.id };
            changeListeners.current.forEach((cb) =>
              cb({ type: "node-remove", payload })
            );
          }
        }

        if (!readOnly) {
          // Collect all final-position changes from this batch into one event so
          // multi-select moves are handled atomically (one updateGraph call).
          const finalMoves: MovePayload["moves"] = [];
          for (const change of rest) {
            if (
              change.type === "position" &&
              change.dragging === false &&
              change.position != null
            ) {
              finalMoves.push({ id: change.id, position: change.position });
            }
          }
          if (finalMoves.length > 0) {
            changeListeners.current.forEach((cb) =>
              cb({ type: "move", payload: { moves: finalMoves } satisfies MovePayload })
            );
          }

          // Resize events remain one-at-a-time (multi-resize is not a real interaction).
          for (const change of rest) {
            if (
              change.type === "dimensions" &&
              change.resizing === false &&
              change.dimensions != null
            ) {
              const payload: ResizePayload = {
                id: change.id,
                size: { width: change.dimensions.width, height: change.dimensions.height },
              };
              changeListeners.current.forEach((cb) => cb({ type: "resize", payload }));
            }
          }
        }
      },
      [onNodesChange],
    );

    const handleEdgesChange = useCallback(
      (changes: EdgeChange<RFEdge>[]) => {
        const removals = changes.filter((c) => c.type === "remove");
        const rest = changes.filter((c) => c.type !== "remove");

        if (rest.length > 0) onEdgesChange(rest);

        for (const change of removals) {
          if (change.type === "remove") {
            const payload: ReferenceRemovePayload = { id: change.id };
            changeListeners.current.forEach((cb) =>
              cb({ type: "reference-remove", payload })
            );
          }
        }
      },
      [onEdgesChange],
    );

    // When the user draws a new edge, emit a reference-create event.
    const handleConnect = useCallback(
      (connection: Connection) => {
        if (readOnly || !connection.source || !connection.target) return;
        const payload: ReferenceCreatePayload = {
          sourceId: connection.source,
          targetId: connection.target,
          refType: defaultReferenceType,
        };
        changeListeners.current.forEach((cb) =>
          cb({ type: "reference-create", payload })
        );
      },
      [defaultReferenceType],
    );

    // Detect reparenting: after a drag ends, check if the node now overlaps
    // a different container node than its current parent.
    const handleNodeDragStop = useCallback(
      (_event: React.MouseEvent, draggedNode: RFNode) => {
        if (!useSubFlow || readOnly) return;

        const currentParentId = parentIdMapRef.current.get(draggedNode.id);

        // Build the full ancestor chain of the dragged node so we can exclude
        // every ancestor — not just the immediate parent — from reparent candidates.
        // When a node moves within its parent it always overlaps grandparent,
        // great-grandparent, etc., and without this filter the closest ancestor
        // (after the immediate parent is excluded) would be picked as the new parent.
        const ancestorIds = new Set<string>();
        let walk: string | undefined = currentParentId;
        while (walk !== undefined) {
          ancestorIds.add(walk);
          walk = parentIdMapRef.current.get(walk);
        }

        // Returns true if `candidateId` is a descendant of `ancestorId`
        // by walking the parentId chain in parentIdMapRef.
        function isDescendant(candidateId: string, ancestorId: string): boolean {
          let cur: string | undefined = parentIdMapRef.current.get(candidateId);
          while (cur !== undefined) {
            if (cur === ancestorId) return true;
            cur = parentIdMapRef.current.get(cur);
          }
          return false;
        }

        // Find container nodes that the dragged node intersects with, excluding:
        //  • the node itself
        //  • all ancestors (current parent, grandparent, …) — a node moving
        //    within its parent always overlaps every ancestor geometrically
        //  • any of its own descendants — children are always inside a container
        const intersecting = getIntersectingNodes(draggedNode).filter(
          (n) =>
            n.id !== draggedNode.id &&
            !ancestorIds.has(n.id) &&
            !isDescendant(n.id, draggedNode.id),
        );

        // Pick the smallest intersecting container (most specific target).
        const candidates = intersecting.filter(
          (n) => (n.data as Record<string, unknown> | undefined)?.isContainer,
        );
        candidates.sort(
          (a, b) =>
            (a.measured?.width ?? 0) * (a.measured?.height ?? 0) -
            (b.measured?.width ?? 0) * (b.measured?.height ?? 0),
        );

        // Only reparent when the node explicitly overlaps a different container.
        // If no new container is found, leave the parent unchanged — this avoids
        // spurious reparent-to-root when dragging within the current parent.
        const newParent = candidates[0] ?? null;
        if (newParent === null) return;
        const newParentId = newParent.id;

        // Only emit if the parent actually changed.
        if (newParentId !== (currentParentId ?? null)) {
          const payload: ReparentPayload = {
            nodeId: draggedNode.id,
            newParentId,
          };
          changeListeners.current.forEach((cb) =>
            cb({ type: "reparent", payload })
          );
          // Update the snapshot so subsequent drags are relative to new parent.
          parentIdMapRef.current.set(draggedNode.id, newParentId ?? undefined);
        }
      },
      [useSubFlow, getIntersectingNodes],
    );

    // Persist viewport after every pan or zoom gesture ends.
    const handleMoveEnd = useCallback(
      (_event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
        changeListeners.current.forEach((cb) => cb({ type: "viewport", payload: viewport }));
      },
      [],
    );

    return (
      <ToggleExpandContext.Provider value={onToggleExpand}>
        <DrillIntoContext.Provider value={onDrillInto}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeComponents}
            edgeTypes={FLOATING_EDGE_TYPES}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={handleConnect}
            onNodeDragStop={handleNodeDragStop}
            onSelectionChange={handleSelectionChange}
            onMoveEnd={handleMoveEnd}
            deleteKeyCode={readOnly ? null : "Delete"}
            nodesDraggable={!readOnly}
            nodesConnectable={!readOnly}
            fitView
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </DrillIntoContext.Provider>
      </ToggleExpandContext.Provider>
    );
  }

  return forwardRef<GraphAdapter, GraphCanvasProps>(function GraphCanvas({ className, readOnly, onDrillInto, onToggleExpand }, ref) {
    return (
      <div className={className} style={{ width: "100%", height: "100%" }}>
        <ReactFlowProvider>
          <Inner adapterRef={ref} readOnly={readOnly} onDrillInto={onDrillInto} onToggleExpand={onToggleExpand} />
        </ReactFlowProvider>
      </div>
    );
  });
}
