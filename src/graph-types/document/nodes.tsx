// ReactFlow node components for the document graph type.
// Used by the UniversalCanvas when a document is rendered as canvas nodes.

import { Handle, Position, NodeResizer, type NodeProps } from "@xyflow/react";
import { FileText } from "lucide-react";

const DEPTH_COLORS: Record<number, { border: string; bg: string; header: string; text: string }> = {
  1: { border: "border-blue-300", bg: "bg-blue-50/40", header: "bg-blue-100", text: "text-blue-800" },
  2: { border: "border-indigo-200", bg: "bg-indigo-50/30", header: "bg-indigo-50", text: "text-indigo-700" },
  3: { border: "border-slate-200", bg: "bg-slate-50/20", header: "bg-slate-50", text: "text-slate-600" },
};
const DEPTH_DEFAULT = { border: "border-gray-200", bg: "bg-white/10", header: "bg-gray-50", text: "text-gray-600" };

function depthColors(depth: number) {
  return DEPTH_COLORS[depth] ?? DEPTH_DEFAULT;
}

// ---------------------------------------------------------------------------
// Document root node — compound container wrapping section children
// ---------------------------------------------------------------------------

export function DocumentRootNode(props: NodeProps) {
  const { data, selected } = props;
  const label = data.label as string;
  const isContainer = data.isContainer as boolean;

  if (isContainer) {
    return (
      <div
        style={{ width: "100%", height: "100%", position: "relative" }}
        className={`rounded-xl border-2 ${selected ? "border-blue-500" : "border-blue-300"} bg-blue-50/30 overflow-visible`}
      >
        <NodeResizer
          minWidth={340}
          minHeight={160}
          isVisible={selected}
          lineStyle={{ borderColor: "#3b82f6" }}
          handleStyle={{ borderColor: "#3b82f6", backgroundColor: "white" }}
        />
        <Handle type="target" position={Position.Top} />
        <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-100 border-b-2 border-blue-300 rounded-t-xl">
          <FileText className="h-4 w-4 text-blue-700 shrink-0" />
          <span className="font-bold text-gray-900 text-base leading-tight">{label}</span>
          <span className="text-xs text-blue-600 ml-1">Document</span>
        </div>
        <Handle type="source" position={Position.Bottom} />
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border-2 ${selected ? "border-blue-500" : "border-blue-300"} bg-blue-50 shadow-md p-4 min-w-[320px]`}
      style={{ position: "relative" }}
    >
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-blue-600 shrink-0" />
        <span className="font-bold text-gray-900 text-lg">{label}</span>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section node — leaf card OR collapsible container for sub-sections
// ---------------------------------------------------------------------------

export function SectionNode(props: NodeProps) {
  const { data, selected } = props;
  const label = data.label as string;
  const metadata = data.metadata as Record<string, unknown>;
  const isContainer = data.isContainer as boolean;
  const depth = (metadata.depth as number) ?? 1;
  const content = typeof metadata.content === "string" ? metadata.content : "";
  const colors = depthColors(depth);

  const headingClass =
    depth === 1 ? "text-base font-bold" :
    depth === 2 ? "text-sm font-semibold" :
    "text-xs font-semibold";

  if (isContainer) {
    return (
      <div
        style={{ width: "100%", height: "100%", position: "relative" }}
        className={`rounded-lg border ${selected ? "border-blue-400" : colors.border} ${colors.bg} overflow-visible`}
      >
        <NodeResizer
          minWidth={280}
          minHeight={80}
          isVisible={selected}
          lineStyle={{ borderColor: "#93c5fd" }}
          handleStyle={{ borderColor: "#93c5fd", backgroundColor: "white" }}
        />
        <Handle type="target" position={Position.Top} />
        <div className={`flex items-center gap-2 px-3 py-2 rounded-t-lg border-b ${colors.border} ${colors.header}`}>
          <span className={`font-mono text-xs opacity-50 shrink-0`}>{"#".repeat(Math.min(depth, 4))}</span>
          <span className={`${headingClass} ${colors.text} leading-snug truncate`}>{label}</span>
        </div>
        <Handle type="source" position={Position.Bottom} />
      </div>
    );
  }

  // Leaf section — show header + content preview
  return (
    <div
      className={`rounded-lg border ${selected ? "border-blue-400" : colors.border} bg-white shadow-sm overflow-hidden`}
      style={{ width: 320, minHeight: 80, maxHeight: 160, position: "relative" }}
    >
      <NodeResizer
        minWidth={240}
        minHeight={60}
        isVisible={selected}
        lineStyle={{ borderColor: "#93c5fd" }}
        handleStyle={{ borderColor: "#93c5fd", backgroundColor: "white" }}
      />
      <Handle type="target" position={Position.Top} />
      <div className={`flex items-center gap-2 px-3 py-2 border-b ${colors.border} ${colors.header}`}>
        <span className={`font-mono text-xs opacity-50 shrink-0`}>{"#".repeat(Math.min(depth, 4))}</span>
        <span className={`${headingClass} ${colors.text} leading-snug truncate flex-1 min-w-0`}>{label}</span>
      </div>
      {content && (
        <div className="px-3 py-2 text-xs text-gray-500 leading-relaxed line-clamp-3 select-text">
          {content.slice(0, 200)}
          {content.length > 200 ? "…" : ""}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
