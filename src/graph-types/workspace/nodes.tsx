// Workspace-specific ReactFlow node components.
// WorkspaceRootNode   — invisible container; workspace children float inside it.
// WorkspaceBlockNode  — collapsed summary card for a document/architecture/code
//                       subgraph; provides expand and drill-into buttons.

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { FileText, Layers, Code2, Link, GitBranch, ChevronRight, Maximize2, type LucideIcon } from "lucide-react";
import { useDrillInto, useToggleExpand } from "@/view/adapter/react-flow-base";

// ---------------------------------------------------------------------------
// Type config
// ---------------------------------------------------------------------------

const TYPE_CONFIG: Record<string, {
  icon: LucideIcon;
  color: string;
  bg: string;
  border: string;
  badge: string;
  label: string;
}> = {
  document:     { icon: FileText, color: "text-blue-700",   bg: "bg-blue-50",   border: "border-blue-300",   badge: "bg-blue-100 text-blue-700",   label: "Document" },
  architecture: { icon: Layers,   color: "text-purple-700", bg: "bg-purple-50", border: "border-purple-300", badge: "bg-purple-100 text-purple-700", label: "Architecture" },
  code:         { icon: Code2,    color: "text-green-700",  bg: "bg-green-50",  border: "border-green-300",  badge: "bg-green-100 text-green-700",  label: "Code" },
};

// ---------------------------------------------------------------------------
// WorkspaceRootNode — transparent container so workspace children can float
// ---------------------------------------------------------------------------

export function WorkspaceRootNode({ data }: NodeProps) {
  const isContainer = data.isContainer as boolean;
  if (!isContainer) return null;
  // Completely transparent — provides a positioning context for subgraph nodes.
  return (
    <div style={{ width: "100%", height: "100%", position: "relative", pointerEvents: "none" }}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// WorkspaceBlockNode — collapsed subgraph summary card
// ---------------------------------------------------------------------------

export function WorkspaceBlockNode(props: NodeProps) {
  const { id: nodeId, data } = props;
  const label = data.label as string;
  const metadata = data.metadata as Record<string, unknown>;
  // Original type stored in metadata so we can show the right icon/colour
  const originalType = (metadata._originalType as string) ?? (data.type as string);

  const cfg = TYPE_CONFIG[originalType] ?? {
    icon: FileText, color: "text-gray-700", bg: "bg-gray-50",
    border: "border-gray-300", badge: "bg-gray-100 text-gray-700", label: originalType,
  };
  const Icon = cfg.icon;

  const onToggleExpand = useToggleExpand();
  const onDrillInto = useDrillInto();

  return (
    <div
      className={`rounded-xl border-2 ${cfg.border} ${cfg.bg} shadow-sm flex flex-col overflow-hidden select-none`}
      style={{ width: 220, minHeight: 110 }}
    >
      <Handle type="target" position={Position.Top} />

      {/* Header */}
      <div className={`flex items-center gap-2 px-4 py-3 border-b ${cfg.border}`}>
        <div className={`p-1.5 rounded-lg ${cfg.bg}`}>
          <Icon className={`h-4 w-4 ${cfg.color}`} />
        </div>
        <span className="font-semibold text-gray-900 text-sm leading-tight flex-1 truncate">{label}</span>
        <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${cfg.badge}`}>
          {cfg.label.slice(0, 3)}
        </span>
      </div>

      {/* Body — action buttons */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-3 gap-2">
        <button
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border ${cfg.border} ${cfg.color} hover:bg-white/50 transition-colors font-medium w-full justify-center`}
          onClick={(e) => { e.stopPropagation(); onToggleExpand?.(nodeId); }}
          title="Expand subgraph on canvas"
        >
          <Maximize2 className="h-3 w-3" />
          Expand
        </button>
        <button
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border ${cfg.border} ${cfg.color} hover:bg-white/50 transition-colors font-medium w-full justify-center`}
          onClick={(e) => { e.stopPropagation(); onDrillInto?.(nodeId); }}
          title="Open in focused view"
        >
          Drill In
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hyperlink / Repository nodes — remain for workspace leaf items
// ---------------------------------------------------------------------------

export function HyperlinkNode(props: NodeProps) {
  const { data, selected } = props;
  const label = data.label as string;
  const metadata = data.metadata as Record<string, unknown>;
  const url = (metadata.url as string) || "";
  const title = (metadata.title as string) || "";

  return (
    <div
      className={`rounded-lg border-2 ${selected ? "border-green-500" : "border-green-300"} bg-green-50 shadow-sm p-3`}
      style={{ width: 200, minHeight: 80, overflow: "hidden", position: "relative" }}
    >
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-2 mb-1">
        <div className="p-1 rounded bg-green-100 shrink-0">
          <Link className="h-3.5 w-3.5 text-green-600" />
        </div>
        <span className="font-semibold text-gray-900 text-xs leading-tight truncate">{title || label}</span>
      </div>
      <div className="text-xs text-green-600">hyperlink</div>
      {url && <div className="text-xs text-gray-500 truncate mt-1">{url.slice(0, 40)}</div>}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export function RepositoryNode(props: NodeProps) {
  const { data, selected } = props;
  const label = data.label as string;
  const metadata = data.metadata as Record<string, unknown>;
  const provider = (metadata.provider as string) || "github";
  const branch = (metadata.branch as string) || "main";

  return (
    <div
      className={`rounded-lg border-2 ${selected ? "border-purple-500" : "border-purple-300"} bg-purple-50 shadow-sm p-3`}
      style={{ width: 200, minHeight: 80, overflow: "hidden", position: "relative" }}
    >
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-2 mb-1">
        <div className="p-1 rounded bg-purple-100 shrink-0">
          <GitBranch className="h-3.5 w-3.5 text-purple-600" />
        </div>
        <span className="font-semibold text-gray-900 text-xs leading-tight truncate">{label}</span>
      </div>
      <div className="text-xs text-purple-600">repository · {provider}</div>
      <div className="text-xs text-gray-500 truncate mt-1">Branch: {branch}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
