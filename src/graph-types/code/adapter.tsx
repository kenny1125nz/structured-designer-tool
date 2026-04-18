// Code graph adapter.
// Compound layout sizes containers bottom-up and positions children top-down.
// skipRoot: the code root document node is not rendered — packages are
// top-level canvas nodes.

import { createGraphCanvas } from "@/view/adapter/react-flow-base";
import type { GraphCanvasProps } from "@/view/adapter/react-flow-base";
import { Handle, Position, NodeResizer, type NodeProps } from "@xyflow/react";
import {
  FolderOpen,
  FileCode,
  Box,
  Braces,
  List,
  BookOpen,
  type LucideIcon,
} from "lucide-react";
import type { Node } from "@/model/types";
import type { GraphAdapter } from "@/view/adapter";
import { forwardRef, useRef, useImperativeHandle, useState } from "react";

// ---------------------------------------------------------------------------
// Drill-mode badge — shows CONTEXT / INTERNAL / EXTERNAL indicator
// ---------------------------------------------------------------------------

function DrillBadge({ metadata }: { metadata: Record<string, unknown> }) {
  if (metadata._externalRef === "internal")
    return (
      <span className="text-[9px] px-1 py-0.5 bg-orange-100 text-orange-600 rounded font-semibold shrink-0 leading-none">
        INTERNAL
      </span>
    );
  if (metadata._externalRef === "external")
    return (
      <span className="text-[9px] px-1 py-0.5 bg-gray-100 text-gray-500 rounded font-semibold shrink-0 leading-none">
        EXTERNAL
      </span>
    );
  return null;
}

// ---------------------------------------------------------------------------
// Compound layout constants
// ---------------------------------------------------------------------------

const LEAF_W = 200;
const LEAF_H = 80;
const GAP = 20;
const H_PAD = 16;
const V_PAD = 16;
const HEADER_H = 40;

// ---------------------------------------------------------------------------
// Compound layout (identical logic to architecture adapter — sizes containers
// bottom-up, positions children top-down, honours persisted positions/sizes)
// ---------------------------------------------------------------------------

interface LayoutResult {
  node: Node;
  w: number;
  h: number;
}

function compoundLayout(root: Node): Node {
  function layout(node: Node): LayoutResult {
    if (!node.children?.length) {
      const w = node.size?.width ?? LEAF_W;
      const h = node.size?.height ?? LEAF_H;
      return { node: { ...node, size: { width: w, height: h } }, w, h };
    }

    const childResults = node.children.map((c) => layout(c));

    const positioned: LayoutResult[] = [];
    const needsPlacement: LayoutResult[] = [];
    for (const cr of childResults) {
      if (cr.node.position != null) positioned.push(cr);
      else needsPlacement.push(cr);
    }

    let gridCy = HEADER_H + V_PAD;
    if (positioned.length > 0) {
      const lowestExisting = Math.max(
        ...positioned.map(({ node: pn, h }) => (pn.position!.y) + h),
      );
      gridCy = Math.max(gridCy, lowestExisting + GAP);
    }

    const numCols = Math.ceil(Math.sqrt(Math.max(needsPlacement.length, 1)));
    let cx = H_PAD;
    let cy = gridCy;
    let col = 0;
    let rowH = 0;

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

    const allResults = new Map<string, LayoutResult>(
      [...positioned, ...newlyPlaced].map((cr) => [cr.node.id, cr]),
    );
    const orderedChildren = node.children.map((c) => allResults.get(c.id)!);

    let maxX = 0;
    let maxY = 0;
    for (const { node: cn, w: cw, h: ch } of orderedChildren) {
      maxX = Math.max(maxX, (cn.position?.x ?? 0) + cw);
      maxY = Math.max(maxY, (cn.position?.y ?? 0) + ch);
    }

    const size = {
      width: Math.max(maxX + H_PAD, LEAF_W * 2, node.size?.width ?? 0),
      height: Math.max(maxY + V_PAD, HEADER_H + V_PAD * 2, node.size?.height ?? 0),
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
// Node kind → icon + colour helpers
// ---------------------------------------------------------------------------

const ENTITY_ICONS: Record<string, LucideIcon> = {
  class: Box,
  interface: Braces,
  enum: List,
  type: Braces,
};

const ENTITY_COLORS = {
  class: { border: "border-violet-300", bg: "bg-violet-50", text: "text-violet-700", icon: "text-violet-600" },
  interface: { border: "border-sky-300", bg: "bg-sky-50", text: "text-sky-700", icon: "text-sky-600" },
  enum: { border: "border-amber-300", bg: "bg-amber-50", text: "text-amber-700", icon: "text-amber-600" },
  type: { border: "border-sky-300", bg: "bg-sky-50", text: "text-sky-700", icon: "text-sky-600" },
};
const DEFAULT_COLORS = ENTITY_COLORS.class;

// ---------------------------------------------------------------------------
// Node components
// ---------------------------------------------------------------------------

/** Progress bar shown below a node header to indicate heat intensity. */
function HeatBar({ score, color }: { score: number; color: string }) {
  return (
    <div className="w-full h-1 bg-black/10 overflow-hidden">
      <div
        style={{ width: `${Math.round(score * 100)}%`, background: color, transition: "width 0.4s ease" }}
        className="h-full"
      />
    </div>
  );
}

/** Package — rendered as a container. */
function PackageNode(props: NodeProps) {
  const { data, selected } = props;
  const label = data.label as string;
  const metadata = data.metadata as Record<string, unknown>;
  const lineCount = typeof metadata?.lineCount === "number" ? metadata.lineCount : undefined;
  const heatScore = typeof metadata?.heatScore === "number" ? metadata.heatScore : undefined;
  const isContainer = data.isContainer as boolean;
  const color = heatScore !== undefined ? heatColor(heatScore) : "#10b981";
  // Outer border: heat color, dimmed when not selected
  const borderStyle = { borderColor: selected ? color : color + "99" };

  if (isContainer) {
    return (
      <div
        style={{ width: "100%", height: "100%", position: "relative", ...borderStyle }}
        className="rounded-lg border-2 bg-white/60 overflow-visible"
      >
        <NodeResizer
          minWidth={180}
          minHeight={80}
          isVisible={selected}
          lineStyle={{ borderColor: color }}
          handleStyle={{ borderColor: color, backgroundColor: "white" }}
        />
        <Handle type="target" position={Position.Top} />
        {/* Header — background tinted from heat color at low opacity */}
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-t-lg border-b border-black/10"
          style={{ background: heatColorA(heatScore ?? 0, 0.1) }}
        >
          <FolderOpen style={{ color }} className="h-4 w-4 shrink-0" />
          <span className="font-semibold text-gray-900 text-sm leading-tight truncate">{label}</span>
          <DrillBadge metadata={metadata} />
          <div className="ml-auto flex items-center gap-2 shrink-0">
            {lineCount != null && (
              <span className="text-xs font-mono" style={{ color }}>{lineCount} lines</span>
            )}
            {heatScore != null && (
              <span
                className="text-xs font-mono tabular-nums px-1 rounded"
                style={{ background: color + "22", color }}
                title={`Heat score: lines (60%) + refs (40%)`}
              >
                {Math.round(heatScore * 100)}°
              </span>
            )}
          </div>
        </div>
        {heatScore != null && <HeatBar score={heatScore} color={color} />}
        <Handle type="source" position={Position.Bottom} />
      </div>
    );
  }

  // Leaf package (no children)
  return (
    <div
      style={{ width: LEAF_W, height: LEAF_H, overflow: "hidden", position: "relative", ...borderStyle }}
      className="rounded-lg border-2 bg-white shadow-sm"
    >
      <NodeResizer minWidth={140} minHeight={60} isVisible={selected} lineStyle={{ borderColor: color }} handleStyle={{ borderColor: color, backgroundColor: "white" }} />
      <Handle type="target" position={Position.Top} />
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ background: heatColorA(heatScore ?? 0, 0.08) }}
      >
        <FolderOpen style={{ color }} className="h-4 w-4 shrink-0" />
        <span className="font-semibold text-gray-900 text-sm truncate">{label}</span>
        <DrillBadge metadata={metadata} />
        {heatScore != null && (
          <span className="text-xs font-mono ml-auto shrink-0" style={{ color }}>
            {Math.round(heatScore * 100)}°
          </span>
        )}
      </div>
      {heatScore != null && <HeatBar score={heatScore} color={color} />}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

/** File — source file container showing line count. */
function FileNode(props: NodeProps) {
  const { data, selected } = props;
  const label = data.label as string;
  const metadata = data.metadata as Record<string, unknown>;
  const lineCount = metadata?.lineCount as number | undefined;
  const heatScore = typeof metadata?.heatScore === "number" ? metadata.heatScore : undefined;
  const isContainer = data.isContainer as boolean;
  const color = heatScore !== undefined ? heatColor(heatScore) : "#3b82f6";
  const borderStyle = { borderColor: selected ? color : color + "99" };

  if (isContainer) {
    return (
      <div
        style={{ width: "100%", height: "100%", position: "relative", ...borderStyle }}
        className="rounded-lg border-2 bg-white/60 overflow-visible"
      >
        <NodeResizer
          minWidth={180}
          minHeight={80}
          isVisible={selected}
          lineStyle={{ borderColor: color }}
          handleStyle={{ borderColor: color, backgroundColor: "white" }}
        />
        <Handle type="target" position={Position.Top} />
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-t-lg border-b border-black/10"
          style={{ background: heatColorA(heatScore ?? 0, 0.1) }}
        >
          <FileCode style={{ color }} className="h-4 w-4 shrink-0" />
          <span className="font-semibold text-gray-900 text-sm leading-tight truncate">{label}</span>
          <DrillBadge metadata={metadata} />
          <div className="ml-auto flex items-center gap-2 shrink-0">
            {lineCount != null && (
              <span className="text-xs font-mono" style={{ color }}>{lineCount} lines</span>
            )}
            {heatScore != null && (
              <span
                className="text-xs font-mono tabular-nums px-1 rounded"
                style={{ background: color + "22", color }}
                title={`Heat score: lines (60%) + refs (40%)`}
              >
                {Math.round(heatScore * 100)}°
              </span>
            )}
          </div>
        </div>
        {heatScore != null && <HeatBar score={heatScore} color={color} />}
        <Handle type="source" position={Position.Bottom} />
      </div>
    );
  }

  // Leaf file (no children)
  return (
    <div
      style={{ width: LEAF_W, height: LEAF_H, overflow: "hidden", position: "relative", ...borderStyle }}
      className="rounded-lg border-2 bg-white shadow-sm"
    >
      <NodeResizer minWidth={140} minHeight={60} isVisible={selected} lineStyle={{ borderColor: color }} handleStyle={{ borderColor: color, backgroundColor: "white" }} />
      <Handle type="target" position={Position.Top} />
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ background: heatColorA(heatScore ?? 0, 0.08) }}
      >
        <FileCode style={{ color }} className="h-4 w-4 shrink-0" />
        <span className="font-semibold text-gray-900 text-sm truncate flex-1 min-w-0">{label}</span>
        <DrillBadge metadata={metadata} />
        {heatScore != null && (
          <span className="text-xs font-mono shrink-0" style={{ color }}>
            {Math.round(heatScore * 100)}°
          </span>
        )}
      </div>
      {lineCount != null && (
        <div className="px-3 text-xs font-mono" style={{ color }}>{lineCount} lines</div>
      )}
      {heatScore != null && <HeatBar score={heatScore} color={color} />}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

/** Entity — class or interface leaf card. */
function EntityNode(props: NodeProps) {
  const { data, selected } = props;
  const label = data.label as string;
  const metadata = data.metadata as Record<string, unknown>;
  const entityKind = (metadata?.entityKind as string) || "class";
  const isContainer = data.isContainer as boolean;

  const colors = ENTITY_COLORS[entityKind as keyof typeof ENTITY_COLORS] ?? DEFAULT_COLORS;
  const Icon = ENTITY_ICONS[entityKind] ?? Box;

  if (isContainer) {
    // Entity with visible members (methods/properties as children)
    return (
      <div
        style={{ width: "100%", height: "100%", position: "relative" }}
        className={`rounded-lg border-2 ${selected ? "border-violet-500" : colors.border} ${colors.bg}/40 overflow-visible`}
      >
        <NodeResizer
          minWidth={160}
          minHeight={80}
          isVisible={selected}
          lineStyle={{ borderColor: "#7c3aed" }}
          handleStyle={{ borderColor: "#7c3aed", backgroundColor: "white" }}
        />
        <Handle type="target" position={Position.Top} />
        <div className={`flex items-center gap-2 px-3 py-2 rounded-t-lg border-b ${selected ? "border-violet-300 bg-violet-50" : `${colors.border} bg-white`}`}>
          <Icon className={`h-4 w-4 ${colors.icon} shrink-0`} />
          <span className="font-semibold text-gray-900 text-sm leading-tight truncate">{label}</span>
          <DrillBadge metadata={metadata} />
          <span className={`text-xs ${colors.text} ml-auto shrink-0 capitalize`}>{entityKind}</span>
        </div>
        <Handle type="source" position={Position.Bottom} />
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border-2 ${selected ? "border-violet-500" : colors.border} bg-white shadow-sm p-3`}
      style={{ width: LEAF_W, height: LEAF_H, overflow: "hidden", position: "relative" }}
    >
      <NodeResizer
        minWidth={140}
        minHeight={60}
        isVisible={selected}
        lineStyle={{ borderColor: "#7c3aed" }}
        handleStyle={{ borderColor: "#7c3aed", backgroundColor: "white" }}
      />
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-2 mb-1">
        <div className={`p-1 rounded ${colors.bg} shrink-0`}>
          <Icon className={`h-3.5 w-3.5 ${colors.icon}`} />
        </div>
        <span className="font-semibold text-gray-900 text-xs leading-tight truncate">{label}</span>
        <DrillBadge metadata={metadata} />
      </div>
      <span className={`text-xs ${colors.text} capitalize`}>{entityKind}</span>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

/** Enum — leaf card with member count. */
function EnumNode(props: NodeProps) {
  const { data, selected } = props;
  const label = data.label as string;
  const metadata = data.metadata as Record<string, unknown>;

  return (
    <div
      className={`rounded-lg border-2 ${selected ? "border-amber-500" : "border-amber-300"} bg-white shadow-sm p-3`}
      style={{ width: LEAF_W, height: LEAF_H, overflow: "hidden", position: "relative" }}
    >
      <NodeResizer minWidth={140} minHeight={60} isVisible={selected} />
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-2 mb-1">
        <div className="p-1 rounded bg-amber-50 shrink-0">
          <List className="h-3.5 w-3.5 text-amber-600" />
        </div>
        <span className="font-semibold text-gray-900 text-xs leading-tight truncate">{label}</span>
        <DrillBadge metadata={metadata} />
      </div>
      <span className="text-xs text-amber-600">enum</span>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

/** Library — external dependency, dashed border. */
function LibraryNode(props: NodeProps) {
  const { data, selected } = props;
  const label = data.label as string;
  const metadata = data.metadata as Record<string, unknown>;
  const version = metadata?.version as string | undefined;
  // In drill mode, libraries always have _externalRef: "external"
  const isDrillExternal = metadata?._externalRef === "external";

  return (
    <div
      className={`rounded-lg border-2 border-dashed ${isDrillExternal
        ? selected ? "border-gray-600" : "border-gray-400"
        : selected ? "border-gray-500" : "border-gray-400"
        } bg-gray-50 shadow-sm p-3`}
      style={{ width: LEAF_W, height: LEAF_H, overflow: "hidden", position: "relative" }}
    >
      <NodeResizer minWidth={140} minHeight={60} isVisible={selected} />
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-2 mb-1">
        <div className="p-1 rounded bg-gray-100 shrink-0">
          <BookOpen className="h-3.5 w-3.5 text-gray-500" />
        </div>
        <span className="font-semibold text-gray-800 text-xs leading-tight truncate">{label}</span>
        <DrillBadge metadata={metadata} />
      </div>
      <span className="text-xs text-gray-500">external{version ? ` · ${version}` : ""}</span>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function CodeNode(props: NodeProps) {
  const { data } = props;
  const label = data.label as string;

  return (
    <div

    >
      {label}
    </div>
  );
}



// ---------------------------------------------------------------------------
// Node component registry
// ---------------------------------------------------------------------------

const NODE_COMPONENTS = {
  package: PackageNode,
  file: FileNode,
  entity: EntityNode,
  enum: EnumNode,
  library: LibraryNode,
  code: CodeNode,
};

// ---------------------------------------------------------------------------
// Base canvas — skip the code root node; packages are top-level canvas nodes
// ---------------------------------------------------------------------------

const BaseCodeCanvas = createGraphCanvas({
  nodeComponents: NODE_COMPONENTS,
  defaultReferenceType: "depends",
});

// ---------------------------------------------------------------------------
// Reference-target resolution
// ---------------------------------------------------------------------------

/**
 * References on AST-generated nodes use readable label expressions as targets
 * (e.g. "Button", "react") rather than node IDs.  This pass builds a
 * label → id map across the whole tree and replaces those expressions with the
 * matching node's UUID so React Flow can draw edges correctly.
 * References whose target cannot be resolved are dropped silently.
 */
function resolveReferenceTargets(root: Node): Node {
  // 1. Collect every node's label → id (last-writer wins for duplicate labels).
  const labelToId = new Map<string, string>();
  const validIds = new Set<string>();

  function collect(node: Node) {
    labelToId.set(node.label, node.id);
    validIds.add(node.id);
    node.children?.forEach(collect);
  }
  collect(root);

  // 2. Walk the tree and resolve / filter references.
  function resolve(node: Node): Node {
    const references = node.references
      ?.map((ref) => ({
        ...ref,
        target: labelToId.get(ref.target) ?? ref.target,
      }))
      .filter((ref) => validIds.has(ref.target));

    const children = node.children?.map(resolve);
    return {
      ...node,
      ...(references?.length ? { references } : { references: undefined }),
      ...(children ? { children } : {}),
    };
  }

  return resolve(root);
}

// ---------------------------------------------------------------------------
// Line-count aggregation — populates package.metadata.lineCount by summing
// all descendant file nodes' lineCount values bottom-up.
// ---------------------------------------------------------------------------

/**
 * Returns the total line count contributed by a node and all its descendants.
 * For `file` nodes the value comes from metadata.lineCount.
 * For all other nodes (packages, root) the value is the sum of children.
 * The function also rewrites each node's metadata with the computed lineCount
 * so the PackageNode component can display it without extra lookups.
 */
function computeLineCounts(node: Node): { node: Node; lines: number } {
  // File nodes: source of truth is their own metadata.lineCount (total lines
  // in the source file), independent of child entity counts.
  if (node.type === "file") {
    const lines =
      typeof node.metadata.lineCount === "number" ? node.metadata.lineCount : 0;
    return { node, lines };
  }

  // Entity / enum leaf nodes: lineCount was derived from startLine/endLine in
  // the tree-builder and stored in metadata. Return it but do not overwrite it
  // (the value is already correct and should not be aggregated further up).
  if (node.type === "entity" || node.type === "enum") {
    const lines =
      typeof node.metadata.lineCount === "number" ? node.metadata.lineCount : 0;
    return { node, lines };
  }

  if (!node.children?.length) {
    return { node, lines: 0 };
  }

  let total = 0;
  const updatedChildren = node.children.map((child) => {
    const { node: updatedChild, lines } = computeLineCounts(child);
    total += lines;
    return updatedChild;
  });

  return {
    node: {
      ...node,
      metadata: { ...node.metadata, lineCount: total },
      children: updatedChildren,
    },
    lines: total,
  };
}

// ---------------------------------------------------------------------------
// Heat scoring — combines lineCount + subtree reference count, normalised
// across all package/file nodes, written as metadata.heatScore (0–1).
// ---------------------------------------------------------------------------

/** Count all references owned by a node and its entire subtree. */
function countSubtreeRefs(node: Node): number {
  let n = node.references?.length ?? 0;
  for (const c of node.children ?? []) n += countSubtreeRefs(c);
  return n;
}

interface HeatEntry {
  id: string;
  nodeType: "package" | "file";
  /** True for packages that contain no child packages (leaf packages). */
  isLeaf: boolean;
  lines: number;
  refs: number;
}

function collectHeatEntries(node: Node, out: HeatEntry[]) {
  if (node.type === "package" || node.type === "file") {
    const isLeaf = !(node.children ?? []).some((c) => c.type === "package");
    out.push({
      id: node.id,
      nodeType: node.type,
      isLeaf,
      lines: typeof node.metadata.lineCount === "number" ? node.metadata.lineCount : 0,
      refs: countSubtreeRefs(node),
    });
  }
  for (const c of node.children ?? []) collectHeatEntries(c, out);
}

function applyHeatScores(node: Node, scores: Map<string, number>): Node {
  const score = scores.get(node.id);
  const updatedNode = score !== undefined
    ? { ...node, metadata: { ...node.metadata, heatScore: score } }
    : node;
  if (!updatedNode.children?.length) return updatedNode;
  return {
    ...updatedNode,
    children: updatedNode.children.map((c) => applyHeatScores(c, scores)),
  };
}

function computeHeat(root: Node): Node {
  const entries: HeatEntry[] = [];
  collectHeatEntries(root, entries);
  if (entries.length === 0) return root;

  // Normalise files and packages separately.
  // For packages: use only leaf packages (no package children) as the reference
  // maximum — parent packages always aggregate their children's counts, so the
  // root would otherwise dominate max and compress everything else toward zero.
  const files = entries.filter((e) => e.nodeType === "file");
  const leafPkgs = entries.filter((e) => e.nodeType === "package" && e.isLeaf);
  const allPkgs = entries.filter((e) => e.nodeType === "package");

  const maxFileLines = Math.max(...files.map((e) => e.lines), 1);
  const maxFileRefs = Math.max(...files.map((e) => e.refs), 1);
  // Reference max comes from leaf packages; fall back to all packages if none.
  const refPkgs = leafPkgs.length > 0 ? leafPkgs : allPkgs;
  const maxPkgLines = Math.max(...refPkgs.map((e) => e.lines), 1);
  const maxPkgRefs = Math.max(...refPkgs.map((e) => e.refs), 1);

  const scores = new Map<string, number>();
  for (const e of entries) {
    const [ml, mr] = e.nodeType === "file"
      ? [maxFileLines, maxFileRefs]
      : [maxPkgLines, maxPkgRefs];
    const heat = 0.6 * (e.lines / ml) + 0.4 * (e.refs / mr);
    scores.set(e.id, Math.min(heat, 1));
  }
  return applyHeatScores(root, scores);
}

/**
 * Maps a heat score (0–1) to an RGB triple.
 * 0   → green  hsl(120, 55%, 45%)
 * 0.5 → amber  hsl(38,  90%, 48%)
 * 1   → red    hsl(0,   82%, 52%)
 */
function heatRgb(score: number): [number, number, number] {
  const s = Math.max(0, Math.min(1, score));
  const hue = s < 0.5 ? 120 - (120 - 38) * (s / 0.5) : 38 - 38 * ((s - 0.5) / 0.5);
  const sat = (88 + 12 * s) / 100;   // 88% → 100% — fully saturated throughout
  const lgt = (50 - 10 * s) / 100;   // 50% → 40%  — bright but not washed out
  // HSL → RGB conversion
  const c = (1 - Math.abs(2 * lgt - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lgt - c / 2;
  let r = 0, g = 0, b = 0;
  if (hue < 60) { r = c; g = x; }
  else if (hue < 120) { r = x; g = c; }
  else if (hue < 180) { g = c; b = x; }
  else if (hue < 240) { g = x; b = c; }
  else if (hue < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/** Opaque heat colour as `rgb(r, g, b)`. */
function heatColor(score: number): string {
  const [r, g, b] = heatRgb(score);
  return `rgb(${r}, ${g}, ${b})`;
}

/** Heat colour with alpha as `rgba(r, g, b, a)`. */
function heatColorA(score: number, alpha: number): string {
  const [r, g, b] = heatRgb(score);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ---------------------------------------------------------------------------
// Code adapter — applies compound layout before handing to base canvas
// ---------------------------------------------------------------------------

const CodeAdapterWithLayout = forwardRef<GraphAdapter, GraphCanvasProps>(
  function CodeAdapterWithLayout(props, ref) {
    const baseAdapterRef = useRef<GraphAdapter>(null);
    const pendingRootRef = useRef<Node | null>(null);
    const [readOnly, setReadOnly] = useState(false);

    useImperativeHandle(ref, () => ({
      setDocument(root: Node) {
        // Code graphs generated by the AST analyser are read-only on the canvas;
        // the user should use the Chat panel to make structural changes.
        setReadOnly(root.type === "code");
        const resolved = resolveReferenceTargets(root);
        const { node: withCounts } = computeLineCounts(resolved);
        const withHeat = computeHeat(withCounts);
        const laidOut = compoundLayout(withHeat);
        if (baseAdapterRef.current) {
          baseAdapterRef.current.setDocument(laidOut);
        } else {
          pendingRootRef.current = laidOut;
        }
      },
      onSelectionChange(cb) {
        return baseAdapterRef.current?.onSelectionChange(cb) ?? (() => { });
      },
      onGraphChange(cb) {
        return baseAdapterRef.current?.onGraphChange(cb) ?? (() => { });
      },
      fitToView() { baseAdapterRef.current?.fitToView(); },
      focusNode(id: string) { baseAdapterRef.current?.focusNode(id); },
      setViewport(vp) { baseAdapterRef.current?.setViewport(vp); },
      getViewport() {
        return baseAdapterRef.current?.getViewport() ?? { x: 0, y: 0, zoom: 1 };
      },
    }), []);

    const setBaseRef = (instance: GraphAdapter | null) => {
      (baseAdapterRef as React.MutableRefObject<GraphAdapter | null>).current = instance;
      if (instance && pendingRootRef.current) {
        instance.setDocument(pendingRootRef.current);
        pendingRootRef.current = null;
      }
    };

    return <BaseCodeCanvas ref={setBaseRef} readOnly={readOnly} {...props} />;
  },
);

export const CodeAdapter = CodeAdapterWithLayout;
