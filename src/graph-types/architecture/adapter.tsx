// Architecture graph adapter.
// Compound layout sizes containers bottom-up and positions children top-down.
// Nodes with an already-persisted position/size are left where they are;
// only nodes without a position get placed by the grid algorithm.

import { createGraphCanvas } from "@/view/adapter/react-flow-base";
import type { GraphCanvasProps } from "@/view/adapter/react-flow-base";
import { Handle, Position, NodeResizer, type NodeProps } from "@xyflow/react";
import {
  Server,
  Database,
  Globe,
  Cpu,
  Box,
  type LucideIcon
} from "lucide-react";
import type { Node } from "@/model/types";
import type { GraphAdapter } from "@/view/adapter";
import { forwardRef, useRef, useImperativeHandle, useCallback } from "react";

// ---------------------------------------------------------------------------
// Component kind icons
// ---------------------------------------------------------------------------

const COMPONENT_KIND_ICONS: Record<string, LucideIcon> = {
  service: Server,
  storage: Database,
  gui: Box,
  gateway: Globe,
  worker: Cpu,
};

// ---------------------------------------------------------------------------
// Compound layout constants
// ---------------------------------------------------------------------------

const LEAF_W = 220;
const LEAF_H = 90;
const GAP = 24;       // gap between sibling nodes
const H_PAD = 20;     // left / right padding inside a container
const V_PAD = 20;     // bottom padding inside a container
const HEADER_H = 44;  // header strip height at top of every container node

// ---------------------------------------------------------------------------
// Compound layout
//
// - Leaf nodes: use persisted size if set, otherwise default card dimensions.
// - Container nodes:
//     1. Recurse into children to get their sizes.
//     2. Children that already have a position keep it (persisted by the user).
//     3. Children without a position are placed in a sqrt(n)-column grid
//        starting below the lowest already-positioned child.
//     4. Container size = bounding box of ALL children + padding.
//        This means the container grows automatically if the user dragged a
//        child near the edge.
// ---------------------------------------------------------------------------

interface LayoutResult {
  node: Node;
  w: number;
  h: number;
}

function compoundLayout(root: Node): Node {
  function layout(node: Node): LayoutResult {
    // ── Leaf ──────────────────────────────────────────────────────────────
    if (!node.children?.length) {
      const w = node.size?.width ?? LEAF_W;
      const h = node.size?.height ?? LEAF_H;
      return { node: { ...node, size: { width: w, height: h } }, w, h };
    }

    // ── Container ─────────────────────────────────────────────────────────
    // Recurse first so every child has a final size before we do placement.
    const childResults = node.children.map((c) => layout(c));

    // Separate children into those already positioned (persisted) and those
    // that need the grid algorithm.
    const positioned: LayoutResult[] = [];
    const needsPlacement: LayoutResult[] = [];
    for (const cr of childResults) {
      if (cr.node.position != null) {
        positioned.push(cr);
      } else {
        needsPlacement.push(cr);
      }
    }

    // Start the grid below the lowest already-positioned child so new nodes
    // don't overlap with manually placed ones.
    let gridCy = HEADER_H + V_PAD;
    if (positioned.length > 0) {
      const lowestExisting = Math.max(
        ...positioned.map(({ node: pn, h }) => (pn.position!.y) + h)
      );
      gridCy = Math.max(gridCy, lowestExisting + GAP);
    }

    const numCols = Math.ceil(Math.sqrt(Math.max(needsPlacement.length, 1)));
    let cx = H_PAD;
    let cy = gridCy;
    let col = 0;
    let rowH = 0;

    // Place children that have no position.
    const newlyPlaced: LayoutResult[] = needsPlacement.map((cr) => {
      if (col > 0 && col % numCols === 0) {
        cx = H_PAD;
        cy += rowH + GAP;
        rowH = 0;
      }
      const placed: LayoutResult = {
        ...cr,
        node: { ...cr.node, position: { x: cx, y: cy } },
      };
      cx += cr.w + GAP;
      rowH = Math.max(rowH, cr.h);
      col++;
      return placed;
    });

    // Merge back in original order so children render in JSON order.
    const allResults = new Map<string, LayoutResult>(
      [...positioned, ...newlyPlaced].map((cr) => [cr.node.id, cr])
    );
    const orderedChildren = node.children.map((c) => allResults.get(c.id)!);

    // Container size = bounding box of ALL final child positions + padding.
    let maxX = 0;
    let maxY = 0;
    for (const { node: cn, w: cw, h: ch } of orderedChildren) {
      maxX = Math.max(maxX, (cn.position?.x ?? 0) + cw);
      maxY = Math.max(maxY, (cn.position?.y ?? 0) + ch);
    }

    const parentW = Math.max(maxX + H_PAD, LEAF_W * 2);
    const parentH = Math.max(maxY + V_PAD, HEADER_H + V_PAD * 2);

    // If the node already has a user-set size that is LARGER than what the
    // children need, honour that (user may have manually expanded the container).
    const size = {
      width: Math.max(parentW, node.size?.width ?? 0),
      height: Math.max(parentH, node.size?.height ?? 0),
    };

    return {
      node: {
        ...node,
        size,
        children: orderedChildren.map((cr) => cr.node),
      },
      w: size.width,
      h: size.height,
    };
  }

  return layout(root).node;
}

// ---------------------------------------------------------------------------
// External-component hoisting
//
// An ExternalComponent anywhere in the hierarchy is external to the whole
// system, not just the sub-component that declares it.  Before rendering we
// strip every ExternalComponent from wherever it lives in the tree and
// re-attach it as a direct child of the root document node.
//
// This transform is applied to a copy — the persisted document is never
// mutated.  References from any node to an ExternalComponent (by id) remain
// valid because ids do not change.
//
// Position persistence survives the round-trip: when the user drags a hoisted
// ExternalComponent, React Flow reports its position relative to its
// parentId — which is root.id after hoisting.  That root-relative coordinate
// is saved via updateNodeInTree into the node's original nested location.  On
// the next load the node is hoisted again carrying the same root-relative
// position, which compound layout then honours unchanged.
// ---------------------------------------------------------------------------

// Suffix appended to the original root id to form the virtual-root id.
// Keeping it deterministic means activeDocIdRef in react-flow-base detects
// graph switches correctly without treating every setDocument call as new.
const CANVAS_ROOT_SUFFIX = "__canvas";

function hoistExternalComponents(root: Node): Node {
  const collected: Node[] = [];
  const seenIds = new Set<string>();

  // Recursively strip ExternalComponent nodes from the subtree.
  // Returns the same object reference when nothing changed (avoids
  // unnecessary allocations for purely-internal subtrees).
  function strip(node: Node): Node {
    if (!node.children?.length) return node;

    let changed = false;
    const kept: Node[] = [];

    for (const child of node.children) {
      if (child.type === "ExternalComponent") {
        if (!seenIds.has(child.id)) {
          collected.push(child);
          seenIds.add(child.id);
        }
        changed = true;
      } else {
        const processed = strip(child);
        kept.push(processed);
        if (processed !== child) changed = true;
      }
    }

    return changed ? { ...node, children: kept } : node;
  }

  const stripped = strip(root);
  if (collected.length === 0) return root; // no ExternalComponents — no wrapper needed

  // Introduce a new virtual root that owns:
  //   • the stripped original system node  (internal boundary)
  //   • all hoisted ExternalComponents     (outside the system boundary)
  //
  // The virtual root is never written to IndexedDB; it exists only during
  // rendering.  Its id is stable (derived from the original root id) so
  // react-flow-base's activeDocIdRef correctly distinguishes graph switches
  // from position/size updates.
  const virtualRoot: Node = {
    id: root.id + CANVAS_ROOT_SUFFIX,
    label: root.label,
    type: root.type,         // same type → same ArchitectureRootNode renderer
    metadata: root.metadata,
    // Forward document-level fields so viewport restore and exports work.
    schemaVersion: root.schemaVersion,
    viewport: root.viewport,
    createdAt: root.createdAt,
    updatedAt: root.updatedAt,
    children: [stripped, ...collected],
  };

  return virtualRoot;
}

// ---------------------------------------------------------------------------
// Custom node components
// ---------------------------------------------------------------------------

function ArchitectureRootNode(props: NodeProps) {
  const { data, selected } = props;
  const label = data.label as string;
  const isContainer = data.isContainer as boolean;

  if (isContainer) {
    return (
      <div
        style={{ width: "100%", height: "100%", position: "relative" }}
        className={`rounded-xl border-4 ${selected ? "border-blue-500" : "border-blue-300"} bg-blue-50/40 overflow-visible`}
      >
        <NodeResizer
          minWidth={200}
          minHeight={120}
          isVisible={selected}
          lineStyle={{ borderColor: "#3b82f6" }}
          handleStyle={{ borderColor: "#3b82f6", backgroundColor: "white" }}
        />
        <Handle type="target" position={Position.Top} />
        <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-100 border-b-2 border-blue-300 rounded-t-xl">
          <Box className="h-5 w-5 text-blue-700 shrink-0" />
          <span className="font-bold text-gray-900 text-base leading-tight">{label}</span>
          <span className="text-xs text-blue-600 ml-1">Architecture</span>
        </div>
        <Handle type="source" position={Position.Bottom} />
      </div>
    );
  }

  return (
    <div className={`rounded-xl border-4 ${selected ? "border-blue-500" : "border-blue-300"} bg-blue-50 shadow-lg p-4 min-w-[200px]`}>
      <NodeResizer minWidth={160} minHeight={60} isVisible={selected} />
      <Handle type="target" position={Position.Top} />
      <div className="font-bold text-gray-900 text-lg">{label}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function DocumentNode(props: NodeProps) {
  const { data, selected } = props;
  const label = data.label as string;
  const isContainer = data.isContainer as boolean;

  if (isContainer) {
    return (
      <div
        style={{ width: "100%", height: "100%", position: "relative" }}
        className={`rounded-xl border-4 ${selected ? "border-blue-500" : "border-blue-300"} bg-blue-50/40 overflow-visible`}
      >
        <NodeResizer
          minWidth={200}
          minHeight={120}
          isVisible={selected}
          lineStyle={{ borderColor: "#3b82f6" }}
          handleStyle={{ borderColor: "#3b82f6", backgroundColor: "white" }}
        />
        <Handle type="target" position={Position.Top} />
        <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-100 border-b-2 border-blue-300 rounded-t-xl">
          <Box className="h-5 w-5 text-blue-700 shrink-0" />
          <span className="font-bold text-gray-900 text-base leading-tight">{label}</span>
          <span className="text-xs text-blue-600 ml-1">Architecture</span>
        </div>
        <Handle type="source" position={Position.Bottom} />
      </div>
    );
  }

  return (
    <div className={`rounded-xl border-4 ${selected ? "border-blue-500" : "border-blue-300"} bg-blue-50 shadow-lg p-4 min-w-[200px]`}>
      <NodeResizer minWidth={160} minHeight={60} isVisible={selected} />
      <Handle type="target" position={Position.Top} />
      <div className="font-bold text-gray-900 text-lg">{label}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function InternalComponentNode(props: NodeProps) {
  const { data, selected } = props;
  const label = data.label as string;
  const metadata = data.metadata as Record<string, unknown>;
  const componentKind = (metadata.componentKind as string) || "service";
  const Icon = COMPONENT_KIND_ICONS[componentKind] || Box;
  const description = (metadata.description as string) || "";
  const exposes = (metadata.exposes as Array<{ capability: string; protocol: string }>) || [];
  const isContainer = data.isContainer as boolean;

  if (isContainer) {
    return (
      <div
        style={{ width: "100%", height: "100%", position: "relative" }}
        className={`rounded-lg border-2 ${selected ? "border-blue-400" : "border-gray-300"} bg-gray-50/60 overflow-visible`}
      >
        <NodeResizer
          minWidth={180}
          minHeight={80}
          isVisible={selected}
          lineStyle={{ borderColor: "#60a5fa" }}
          handleStyle={{ borderColor: "#60a5fa", backgroundColor: "white" }}
        />
        <Handle type="target" position={Position.Top} />
        <div className={`flex items-center gap-2 px-3 py-2 rounded-t-lg ${selected ? "bg-blue-50" : "bg-white"} border-b border-gray-200`}>
          <Icon className="h-4 w-4 text-gray-600 shrink-0" />
          <span className="font-semibold text-gray-900 text-sm leading-tight">{label}</span>
          <span className="text-xs text-gray-400 capitalize ml-1">{componentKind}</span>
        </div>
        <Handle type="source" position={Position.Bottom} />
      </div>
    );
  }

  // Leaf card
  return (
    <div
      className={`rounded-lg border-2 ${selected ? "border-blue-500" : "border-gray-300"} bg-white shadow-md p-3`}
      style={{ width: LEAF_W, height: LEAF_H, overflow: "hidden", position: "relative" }}
    >
      <NodeResizer
        minWidth={140}
        minHeight={60}
        isVisible={selected}
        lineStyle={{ borderColor: "#60a5fa" }}
        handleStyle={{ borderColor: "#60a5fa", backgroundColor: "white" }}
      />
      <Handle type="target" position={Position.Top} />
      <div className="flex items-start gap-2 mb-1">
        <div className={`p-1.5 rounded ${selected ? "bg-blue-50" : "bg-gray-50"} shrink-0`}>
          <Icon className="h-4 w-4 text-gray-700" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-gray-900 text-xs leading-tight truncate">{label}</div>
          <div className="text-xs text-gray-500 capitalize">{componentKind}</div>
        </div>
      </div>
      {description && (
        <div className="text-xs text-gray-500 line-clamp-2 leading-tight">{description.slice(0, 80)}</div>
      )}
      {exposes.length > 0 && (
        <div className="mt-1 text-xs text-gray-400">
          {exposes[0].capability} ({exposes[0].protocol}){exposes.length > 1 ? ` +${exposes.length - 1}` : ""}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function ExternalComponentNode(props: NodeProps) {
  const { data, selected } = props;
  const label = data.label as string;
  const metadata = data.metadata as Record<string, unknown>;
  const componentKind = (metadata.componentKind as string) || "service";
  const Icon = COMPONENT_KIND_ICONS[componentKind] || Globe;
  const description = (metadata.description as string) || "";

  return (
    <div
      className={`rounded-lg border-2 ${selected ? "border-blue-500" : "border-gray-400"} border-dashed bg-gray-50 shadow-sm p-3`}
      style={{ width: LEAF_W, height: LEAF_H, overflow: "hidden", position: "relative" }}
    >
      <NodeResizer
        minWidth={140}
        minHeight={60}
        isVisible={selected}
        lineStyle={{ borderColor: "#9ca3af" }}
        handleStyle={{ borderColor: "#9ca3af", backgroundColor: "white" }}
      />
      <Handle type="target" position={Position.Top} />
      <div className="flex items-start gap-2 mb-1">
        <div className={`p-1.5 rounded ${selected ? "bg-blue-50" : "bg-gray-100"} shrink-0`}>
          <Icon className="h-4 w-4 text-gray-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-gray-900 text-xs leading-tight truncate">{label}</div>
          <div className="text-xs text-gray-500 capitalize">External · {componentKind}</div>
        </div>
      </div>
      {description && (
        <div className="text-xs text-gray-500 line-clamp-2 leading-tight">{description.slice(0, 80)}</div>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Node component registry
// ---------------------------------------------------------------------------

const NODE_COMPONENTS = {
  architecture: ArchitectureRootNode,
  document: DocumentNode,
  InternalComponent: InternalComponentNode,
  ExternalComponent: ExternalComponentNode,
};

// ---------------------------------------------------------------------------
// Base canvas
// ---------------------------------------------------------------------------

const BaseArchitectureAdapter = createGraphCanvas({
  nodeComponents: NODE_COMPONENTS,
  defaultReferenceType: "calls",
});

// ---------------------------------------------------------------------------
// Architecture adapter — applies compound layout before handing to base
// ---------------------------------------------------------------------------

const ArchitectureAdapterWithLayout = forwardRef<GraphAdapter, GraphCanvasProps>(
  function ArchitectureAdapterWithLayout(props, ref) {
    const baseAdapterRef = useRef<GraphAdapter>(null);
    const pendingRootRef = useRef<Node | null>(null);

    const setBaseAdapterRef = useCallback((instance: GraphAdapter | null) => {
      if (instance) {
        baseAdapterRef.current = instance;
        if (pendingRootRef.current) {
          instance.setDocument(pendingRootRef.current);
          pendingRootRef.current = null;
        }
      }
    }, []);

    useImperativeHandle(ref, () => ({
      setDocument(root: Node) {
        const hoisted = hoistExternalComponents(root);
        const laidOut = compoundLayout(hoisted);
        if (baseAdapterRef.current) {
          baseAdapterRef.current.setDocument(laidOut);
        } else {
          pendingRootRef.current = laidOut;
        }
      },
      onSelectionChange(cb) {
        return baseAdapterRef.current?.onSelectionChange(cb) || (() => { });
      },
      onGraphChange(cb) {
        return baseAdapterRef.current?.onGraphChange(cb) || (() => { });
      },
      fitToView() { baseAdapterRef.current?.fitToView(); },
      focusNode(id: string) { baseAdapterRef.current?.focusNode(id); },
      setViewport(vp) { baseAdapterRef.current?.setViewport(vp); },
      getViewport() {
        return baseAdapterRef.current?.getViewport() || { x: 0, y: 0, zoom: 1 };
      },
    }), []);

    return <BaseArchitectureAdapter ref={setBaseAdapterRef} {...props} />;
  }
);

export const ArchitectureAdapter = ArchitectureAdapterWithLayout;
