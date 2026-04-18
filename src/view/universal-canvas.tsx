// Universal canvas — the single ReactFlow instance that renders every graph type.
//
// Philosophy:
//   • ONE canvas, always mounted.  No adapter-switching based on graph type.
//   • All node types from document, architecture, code, and workspace are
//     registered together in one nodeTypes map.
//   • Layout transforms (layout.ts files) pre-process the Node tree before it
//     reaches this canvas; the canvas is pure rendering / interaction.
//   • For workspace graphs, subgraph children appear as either:
//       – collapsed  → WorkspaceBlockNode (summary card with Expand + Drill buttons)
//       – expanded   → their native compound container (DocumentRootNode, etc.)
//         with children nested inside via React Flow sub-flow parentId.

import { createGraphCanvas } from "@/view/adapter/react-flow-base";

// ---------- Architecture node components ----------
import {
  Handle,
  Position,
  NodeResizer,
  type NodeProps,
} from "@xyflow/react";
import {
  Server, Database, Globe, Cpu, Box, type LucideIcon,
} from "lucide-react";
import { ARCH_LEAF_W, ARCH_LEAF_H } from "@/graph-types/architecture/layout";

// ---------- Code node components ----------
import {
  FolderOpen, FileCode, Braces, List, BookOpen,
} from "lucide-react";
import { heatColor, heatColorA, CODE_LEAF_W, CODE_LEAF_H } from "@/graph-types/code/layout";

// ---------- Document node components ----------
import { DocumentRootNode, SectionNode } from "@/graph-types/document/nodes";

// ---------- Workspace node components ----------
import {
  WorkspaceRootNode, WorkspaceBlockNode, HyperlinkNode, RepositoryNode,
} from "@/graph-types/workspace/nodes";

// ============================================================================
// Architecture node components
// ============================================================================

const COMPONENT_KIND_ICONS: Record<string, LucideIcon> = {
  service: Server, storage: Database, gui: Box, gateway: Globe, worker: Cpu,
};

function ArchitectureRootNode(props: NodeProps) {
  const { data, selected } = props;
  const label = data.label as string;
  const isContainer = data.isContainer as boolean;

  if (isContainer) {
    return (
      <div style={{ width: "100%", height: "100%", position: "relative" }}
        className={`rounded-xl border-4 ${selected ? "border-blue-500" : "border-blue-300"} bg-blue-50/40 overflow-visible`}>
        <NodeResizer minWidth={200} minHeight={120} isVisible={selected}
          lineStyle={{ borderColor: "#3b82f6" }} handleStyle={{ borderColor: "#3b82f6", backgroundColor: "white" }} />
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
      <div style={{ width: "100%", height: "100%", position: "relative" }}
        className={`rounded-lg border-2 ${selected ? "border-blue-400" : "border-gray-300"} bg-gray-50/60 overflow-visible`}>
        <NodeResizer minWidth={180} minHeight={80} isVisible={selected}
          lineStyle={{ borderColor: "#60a5fa" }} handleStyle={{ borderColor: "#60a5fa", backgroundColor: "white" }} />
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
  return (
    <div className={`rounded-lg border-2 ${selected ? "border-blue-500" : "border-gray-300"} bg-white shadow-md p-3`}
      style={{ width: ARCH_LEAF_W, height: ARCH_LEAF_H, overflow: "hidden", position: "relative" }}>
      <NodeResizer minWidth={140} minHeight={60} isVisible={selected}
        lineStyle={{ borderColor: "#60a5fa" }} handleStyle={{ borderColor: "#60a5fa", backgroundColor: "white" }} />
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
      {description && <div className="text-xs text-gray-500 line-clamp-2 leading-tight">{description.slice(0, 80)}</div>}
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
    <div className={`rounded-lg border-2 border-dashed ${selected ? "border-blue-500" : "border-gray-400"} bg-gray-50 shadow-sm p-3`}
      style={{ width: ARCH_LEAF_W, height: ARCH_LEAF_H, overflow: "hidden", position: "relative" }}>
      <NodeResizer minWidth={140} minHeight={60} isVisible={selected}
        lineStyle={{ borderColor: "#9ca3af" }} handleStyle={{ borderColor: "#9ca3af", backgroundColor: "white" }} />
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
      {description && <div className="text-xs text-gray-500 line-clamp-2 leading-tight">{description.slice(0, 80)}</div>}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

// ============================================================================
// Code node components
// ============================================================================

function DrillBadge({ metadata }: { metadata: Record<string, unknown> }) {
  if (metadata._externalRef === "internal")
    return <span className="text-[9px] px-1 py-0.5 bg-orange-100 text-orange-600 rounded font-semibold shrink-0 leading-none">INTERNAL</span>;
  if (metadata._externalRef === "external")
    return <span className="text-[9px] px-1 py-0.5 bg-gray-100 text-gray-500 rounded font-semibold shrink-0 leading-none">EXTERNAL</span>;
  return null;
}

function HeatBar({ score, color }: { score: number; color: string }) {
  return (
    <div className="w-full h-1 bg-black/10 overflow-hidden">
      <div style={{ width: `${Math.round(score * 100)}%`, background: color, transition: "width 0.4s ease" }} className="h-full" />
    </div>
  );
}

function PackageNode(props: NodeProps) {
  const { data, selected } = props;
  const label = data.label as string;
  const metadata = data.metadata as Record<string, unknown>;
  const lineCount = typeof metadata?.lineCount === "number" ? metadata.lineCount : undefined;
  const heatScore = typeof metadata?.heatScore === "number" ? metadata.heatScore : undefined;
  const isContainer = data.isContainer as boolean;
  const color = heatScore !== undefined ? heatColor(heatScore) : "#10b981";
  const borderStyle = { borderColor: selected ? color : color + "99" };

  if (isContainer) {
    return (
      <div style={{ width: "100%", height: "100%", position: "relative", ...borderStyle }}
        className="rounded-lg border-2 bg-white/60 overflow-visible">
        <NodeResizer minWidth={180} minHeight={80} isVisible={selected}
          lineStyle={{ borderColor: color }} handleStyle={{ borderColor: color, backgroundColor: "white" }} />
        <Handle type="target" position={Position.Top} />
        <div className="flex items-center gap-2 px-3 py-2 rounded-t-lg border-b border-black/10"
          style={{ background: heatColorA(heatScore ?? 0, 0.1) }}>
          <FolderOpen style={{ color }} className="h-4 w-4 shrink-0" />
          <span className="font-semibold text-gray-900 text-sm leading-tight truncate">{label}</span>
          <DrillBadge metadata={metadata} />
          <div className="ml-auto flex items-center gap-2 shrink-0">
            {lineCount != null && <span className="text-xs font-mono" style={{ color }}>{lineCount} lines</span>}
            {heatScore != null && (
              <span className="text-xs font-mono tabular-nums px-1 rounded"
                style={{ background: color + "22", color }}>{Math.round(heatScore * 100)}°</span>
            )}
          </div>
        </div>
        {heatScore != null && <HeatBar score={heatScore} color={color} />}
        <Handle type="source" position={Position.Bottom} />
      </div>
    );
  }

  return (
    <div style={{ width: CODE_LEAF_W, height: CODE_LEAF_H, overflow: "hidden", position: "relative", ...borderStyle }}
      className="rounded-lg border-2 bg-white shadow-sm">
      <NodeResizer minWidth={140} minHeight={60} isVisible={selected}
        lineStyle={{ borderColor: color }} handleStyle={{ borderColor: color, backgroundColor: "white" }} />
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-2 px-3 py-2"
        style={{ background: heatColorA(heatScore ?? 0, 0.08) }}>
        <FolderOpen style={{ color }} className="h-4 w-4 shrink-0" />
        <span className="font-semibold text-gray-900 text-sm truncate">{label}</span>
        <DrillBadge metadata={metadata} />
        {heatScore != null && <span className="text-xs font-mono ml-auto shrink-0" style={{ color }}>{Math.round(heatScore * 100)}°</span>}
      </div>
      {heatScore != null && <HeatBar score={heatScore} color={color} />}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

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
      <div style={{ width: "100%", height: "100%", position: "relative", ...borderStyle }}
        className="rounded-lg border-2 bg-white/60 overflow-visible">
        <NodeResizer minWidth={180} minHeight={80} isVisible={selected}
          lineStyle={{ borderColor: color }} handleStyle={{ borderColor: color, backgroundColor: "white" }} />
        <Handle type="target" position={Position.Top} />
        <div className="flex items-center gap-2 px-3 py-2 rounded-t-lg border-b border-black/10"
          style={{ background: heatColorA(heatScore ?? 0, 0.1) }}>
          <FileCode style={{ color }} className="h-4 w-4 shrink-0" />
          <span className="font-semibold text-gray-900 text-sm leading-tight truncate">{label}</span>
          <DrillBadge metadata={metadata} />
          <div className="ml-auto flex items-center gap-2 shrink-0">
            {lineCount != null && <span className="text-xs font-mono" style={{ color }}>{lineCount} lines</span>}
            {heatScore != null && (
              <span className="text-xs font-mono tabular-nums px-1 rounded"
                style={{ background: color + "22", color }}>{Math.round(heatScore * 100)}°</span>
            )}
          </div>
        </div>
        {heatScore != null && <HeatBar score={heatScore} color={color} />}
        <Handle type="source" position={Position.Bottom} />
      </div>
    );
  }

  return (
    <div style={{ width: CODE_LEAF_W, height: CODE_LEAF_H, overflow: "hidden", position: "relative", ...borderStyle }}
      className="rounded-lg border-2 bg-white shadow-sm">
      <NodeResizer minWidth={140} minHeight={60} isVisible={selected}
        lineStyle={{ borderColor: color }} handleStyle={{ borderColor: color, backgroundColor: "white" }} />
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-2 px-3 py-2"
        style={{ background: heatColorA(heatScore ?? 0, 0.08) }}>
        <FileCode style={{ color }} className="h-4 w-4 shrink-0" />
        <span className="font-semibold text-gray-900 text-sm truncate flex-1 min-w-0">{label}</span>
        <DrillBadge metadata={metadata} />
        {heatScore != null && <span className="text-xs font-mono shrink-0" style={{ color }}>{Math.round(heatScore * 100)}°</span>}
      </div>
      {lineCount != null && <div className="px-3 text-xs font-mono" style={{ color }}>{lineCount} lines</div>}
      {heatScore != null && <HeatBar score={heatScore} color={color} />}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const ENTITY_ICONS: Record<string, LucideIcon> = { class: Box, interface: Braces, enum: List, type: Braces };
const ENTITY_COLORS = {
  class:     { border: "border-violet-300", bg: "bg-violet-50", text: "text-violet-700", icon: "text-violet-600" },
  interface: { border: "border-sky-300",    bg: "bg-sky-50",    text: "text-sky-700",    icon: "text-sky-600" },
  enum:      { border: "border-amber-300",  bg: "bg-amber-50",  text: "text-amber-700",  icon: "text-amber-600" },
  type:      { border: "border-sky-300",    bg: "bg-sky-50",    text: "text-sky-700",    icon: "text-sky-600" },
};
const DEFAULT_EC = ENTITY_COLORS.class;

function EntityNode(props: NodeProps) {
  const { data, selected } = props;
  const label = data.label as string;
  const metadata = data.metadata as Record<string, unknown>;
  const entityKind = (metadata?.entityKind as string) || "class";
  const isContainer = data.isContainer as boolean;
  const colors = ENTITY_COLORS[entityKind as keyof typeof ENTITY_COLORS] ?? DEFAULT_EC;
  const Icon = ENTITY_ICONS[entityKind] ?? Box;

  if (isContainer) {
    return (
      <div style={{ width: "100%", height: "100%", position: "relative" }}
        className={`rounded-lg border-2 ${selected ? "border-violet-500" : colors.border} ${colors.bg}/40 overflow-visible`}>
        <NodeResizer minWidth={160} minHeight={80} isVisible={selected}
          lineStyle={{ borderColor: "#7c3aed" }} handleStyle={{ borderColor: "#7c3aed", backgroundColor: "white" }} />
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
    <div className={`rounded-lg border-2 ${selected ? "border-violet-500" : colors.border} bg-white shadow-sm p-3`}
      style={{ width: CODE_LEAF_W, height: CODE_LEAF_H, overflow: "hidden", position: "relative" }}>
      <NodeResizer minWidth={140} minHeight={60} isVisible={selected}
        lineStyle={{ borderColor: "#7c3aed" }} handleStyle={{ borderColor: "#7c3aed", backgroundColor: "white" }} />
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-2 mb-1">
        <div className={`p-1 rounded ${colors.bg} shrink-0`}><Icon className={`h-3.5 w-3.5 ${colors.icon}`} /></div>
        <span className="font-semibold text-gray-900 text-xs leading-tight truncate">{label}</span>
        <DrillBadge metadata={metadata} />
      </div>
      <span className={`text-xs ${colors.text} capitalize`}>{entityKind}</span>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function EnumNode(props: NodeProps) {
  const { data, selected } = props;
  const label = data.label as string;
  const metadata = data.metadata as Record<string, unknown>;
  return (
    <div className={`rounded-lg border-2 ${selected ? "border-amber-500" : "border-amber-300"} bg-white shadow-sm p-3`}
      style={{ width: CODE_LEAF_W, height: CODE_LEAF_H, overflow: "hidden", position: "relative" }}>
      <NodeResizer minWidth={140} minHeight={60} isVisible={selected} />
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-2 mb-1">
        <div className="p-1 rounded bg-amber-50 shrink-0"><List className="h-3.5 w-3.5 text-amber-600" /></div>
        <span className="font-semibold text-gray-900 text-xs leading-tight truncate">{label}</span>
        <DrillBadge metadata={metadata} />
      </div>
      <span className="text-xs text-amber-600">enum</span>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function LibraryNode(props: NodeProps) {
  const { data, selected } = props;
  const label = data.label as string;
  const metadata = data.metadata as Record<string, unknown>;
  const version = metadata?.version as string | undefined;
  const isDrillExternal = metadata?._externalRef === "external";
  return (
    <div className={`rounded-lg border-2 border-dashed ${isDrillExternal ? (selected ? "border-gray-600" : "border-gray-400") : (selected ? "border-gray-500" : "border-gray-400")} bg-gray-50 shadow-sm p-3`}
      style={{ width: CODE_LEAF_W, height: CODE_LEAF_H, overflow: "hidden", position: "relative" }}>
      <NodeResizer minWidth={140} minHeight={60} isVisible={selected} />
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-2 mb-1">
        <div className="p-1 rounded bg-gray-100 shrink-0"><BookOpen className="h-3.5 w-3.5 text-gray-500" /></div>
        <span className="font-semibold text-gray-800 text-xs leading-tight truncate">{label}</span>
        <DrillBadge metadata={metadata} />
      </div>
      <span className="text-xs text-gray-500">external{version ? ` · ${version}` : ""}</span>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

// ============================================================================
// Unified node type registry
// ============================================================================

const UNIVERSAL_NODE_TYPES = {
  // ── Workspace ──────────────────────────────────────────────────────────────
  workspace:         WorkspaceRootNode,
  "workspace-block": WorkspaceBlockNode,   // collapsed subgraph placeholder
  hyperlink:         HyperlinkNode,
  repository:        RepositoryNode,

  // ── Architecture ──────────────────────────────────────────────────────────
  architecture:      ArchitectureRootNode,
  InternalComponent: InternalComponentNode,
  ExternalComponent: ExternalComponentNode,

  // ── Code ──────────────────────────────────────────────────────────────────
  code:    (props: NodeProps) => { const { data } = props; return <div style={{ display: "none" }}>{data.label as string}</div>; },
  package: PackageNode,
  file:    FileNode,
  entity:  EntityNode,
  enum:    EnumNode,
  library: LibraryNode,

  // ── Document ───────────────────────────────────────────────────────────────
  document: DocumentRootNode,
  section:  SectionNode,
};

// ============================================================================
// The one canvas to rule them all
// ============================================================================

export const UniversalCanvas = createGraphCanvas({
  nodeComponents: UNIVERSAL_NODE_TYPES,
  useSubFlow: true,          // sub-flow nesting for compound containers
  defaultReferenceType: "relates",
});
