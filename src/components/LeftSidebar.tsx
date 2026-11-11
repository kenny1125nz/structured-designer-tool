import { useState } from "react";
import { NewGraphMenu } from "./NewGraphMenu";
import { ConfigDialog } from "./ConfigDialog";
import type { Node } from "@/model/types";
import type { AppDispatch } from "@/app/events";

// ---------------------------------------------------------------------------
// Type badge
// ---------------------------------------------------------------------------

const TYPE_BADGE: Record<string, { label: string; className: string }> = {
  document: { label: "DOC", className: "bg-blue-100 text-blue-700" },
  architecture: { label: "ARC", className: "bg-purple-100 text-purple-700" },
  code: { label: "COD", className: "bg-green-100 text-green-700" },
  workspace: { label: "WRK", className: "bg-orange-100 text-orange-700" },
};

function TypeBadge({ type }: { type: string }) {
  const badge = TYPE_BADGE[type] ?? {
    label: type.slice(0, 3).toUpperCase(),
    className: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`shrink-0 text-[9px] font-semibold leading-none px-1 py-0.5 rounded ${badge.className}`}
      title={type}
    >
      {badge.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Recursive node tree row
// ---------------------------------------------------------------------------

const NODE_TYPE_ICON: Record<string, string> = {
  package: "📁",
  file: "📄",
  entity: "⬡",
  enum: "≡",
  library: "📦",
  section: "§",
  document: "📝",
  architecture: "🏗",
  code: "💻",
};

function NodeTreeRow({
  node,
  depth,
  activeNodeId,
  expandedIds,
  onToggle,
  onFocus,
}: {
  node: Node;
  depth: number;
  activeNodeId: string | null;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  onFocus: (id: string) => void;
}) {
  const hasChildren = (node.children?.length ?? 0) > 0;
  const expanded = expandedIds.has(node.id);
  const icon = NODE_TYPE_ICON[node.type] ?? "○";
  const indent = depth * 12;

  return (
    <>
      <div
        className={`flex items-center gap-0.5 rounded group cursor-pointer hover:bg-muted/60 transition-colors ${activeNodeId === node.id ? "bg-muted font-medium" : ""
          }`}
        style={{ paddingLeft: `${indent + 4}px` }}
      >
        <button
          className="w-4 shrink-0 text-center text-muted-foreground/60 text-xs hover:text-foreground"
          onClick={(e) => { e.stopPropagation(); if (hasChildren) onToggle(node.id); }}
          tabIndex={-1}
        >
          {hasChildren ? (expanded ? "▾" : "▸") : ""}
        </button>

        <button
          className="flex items-center gap-1 flex-1 min-w-0 text-left py-0.5 pr-1 text-xs"
          onClick={() => onFocus(node.id)}
          title={node.label}
        >
          <span className="shrink-0 text-[11px] opacity-70">{icon}</span>
          <span className="truncate">{node.label}</span>
        </button>
      </div>

      {expanded && hasChildren && (
        <div className="border-l border-border/50 ml-3">
          {node.children!.map((child) => (
            <NodeTreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              activeNodeId={activeNodeId}
              expandedIds={expandedIds}
              onToggle={onToggle}
              onFocus={onFocus}
            />
          ))}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Graph tree — shows graphs of a single type
// ---------------------------------------------------------------------------

function GraphTree({
  graphs,
  activeGraph,
  activeNodeId,
  onSelectGraph,
  onDeleteGraph,
  onExportGraph,
  onFocusNode,
}: {
  graphs: Node[];
  activeGraph: Node | null;
  activeNodeId: string | null;
  onSelectGraph: (id: string) => void;
  onDeleteGraph: (id: string) => void;
  onExportGraph: (graph: Node) => void;
  onFocusNode: (id: string) => void;
}) {
  const [expandedGraphs, setExpandedGraphs] = useState<Set<string>>(new Set());
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  function toggleGraph(id: string) {
    setExpandedGraphs((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleNode(id: string) {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  if (graphs.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-3 px-1 italic">No graphs yet</p>
    );
  }

  return (
    <ul className="space-y-0.5">
      {graphs.map((g) => {
        const isActive = activeGraph?.id === g.id;
        const graphExpanded = expandedGraphs.has(g.id);
        const hasChildren = (g.children?.length ?? 0) > 0;

        return (
          <li key={g.id}>
            <div className={`group flex items-center gap-1 rounded hover:bg-muted/50 transition-colors ${isActive ? "bg-muted/40" : ""}`}>
              <button
                className="w-4 shrink-0 text-center text-muted-foreground/50 text-xs hover:text-foreground py-1"
                onClick={() => toggleGraph(g.id)}
                tabIndex={-1}
              >
                {hasChildren ? (graphExpanded ? "▾" : "▸") : "─"}
              </button>

              <TypeBadge type={g.type} />

              <button
                className={`flex-1 min-w-0 text-left text-xs px-1 py-1 rounded truncate transition-colors ${isActive ? "font-medium text-foreground" : "text-foreground/80"
                  }`}
                onClick={() => onSelectGraph(g.id)}
                title={g.label}
              >
                {g.label}
              </button>

              <button
                className="shrink-0 px-1 py-0.5 rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted transition-opacity text-xs"
                title="Export as JSON"
                onClick={() => onExportGraph(g)}
              >
                ↓
              </button>
              <button
                className="shrink-0 px-1 py-0.5 rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted hover:text-destructive transition-opacity text-xs"
                title="Delete graph"
                onClick={() => onDeleteGraph(g.id)}
              >
                ×
              </button>
            </div>

            {graphExpanded && hasChildren && (
              <div className="ml-4 border-l border-border/40 mt-0.5">
                {g.children!.map((child) => (
                  <NodeTreeRow
                    key={child.id}
                    node={child}
                    depth={0}
                    activeNodeId={activeNodeId}
                    expandedIds={expandedNodes}
                    onToggle={toggleNode}
                    onFocus={(id) => {
                      if (!isActive) onSelectGraph(g.id);
                      onFocusNode(id);
                    }}
                  />
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

const TABS: Array<{ id: string; label: string }> = [
  { id: "document", label: "Documents" },
  { id: "architecture", label: "Architecture" },
  { id: "code", label: "Code" },
  { id: "workspace", label: "Workspace" },
];

// ---------------------------------------------------------------------------
// Graph operations panel (placeholders)
// ---------------------------------------------------------------------------

function OpSection({ label }: { label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border rounded">
      <button
        className="w-full flex items-center justify-between px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="font-medium">{label}</span>
        <span className="font-mono">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="border-t px-3 py-3 text-xs text-muted-foreground italic">
          Not yet implemented.
        </div>
      )}
    </div>
  );
}

function GraphOperations() {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-muted-foreground px-1 mb-2">Graph Operations</p>
      <OpSection label="Filter" />
      <OpSection label="Layout" />
      <OpSection label="Clustering" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Left sidebar
// ---------------------------------------------------------------------------

interface LeftSidebarProps {
  graphs: Node[];
  activeGraph: Node | null;
  loading: boolean;
  sidebarWidth: number;
  isResizing: boolean;
  importError: string | null;
  focusedNodeId: string | null;
  onEvent: AppDispatch;
}

export function LeftSidebar({
  graphs,
  activeGraph,
  loading,
  sidebarWidth,
  isResizing,
  importError,
  focusedNodeId,
  onEvent,
}: LeftSidebarProps) {
  const [showConfig, setShowConfig] = useState(false);
  const [activeTab, setActiveTab] = useState<string>(() => {
    if (activeGraph && TABS.some(t => t.id === activeGraph.type)) return activeGraph.type;
    return "document";
  });

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-xs">
        Loading…
      </div>
    );
  }

  const tabGraphs = graphs.filter((g) => g.type === activeTab);

  return (
    <div className="flex">
      <aside
        className="shrink-0 border-r bg-muted/40 flex flex-col relative"
        style={{ width: `${sidebarWidth}px` }}
      >
        {/* ── Top toolbar ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-1 px-3 py-2 border-b shrink-0">
          <span className="text-xs font-semibold text-foreground">Explorer</span>
          <div className="flex items-center gap-1">
            <button
              className="text-xs px-1.5 py-1 rounded border hover:bg-muted"
              title="AI configuration"
              onClick={() => setShowConfig(true)}
            >
              ⚙
            </button>
            <button
              className="text-xs px-1.5 py-1 rounded border hover:bg-muted"
              title="Import graph JSON"
              onClick={() => onEvent({ type: "graph:import" })}
            >
              ↑
            </button>
            <NewGraphMenu
              onAnalyzeFromMarkdown={(type) => onEvent({ type: "analyze:markdown", graphType: type })}
              onAnalyzeCode={() => onEvent({ type: "analyze:code" })}
              onAnalyzeWorkspace={() => onEvent({ type: "analyze:workspace" })}
            />
          </div>
        </div>

        {importError && (
          <p className="text-xs text-destructive px-3 pt-2 shrink-0">{importError}</p>
        )}

        {/* ── Tab bar ─────────────────────────────────────────────────── */}
        <div className="flex border-b shrink-0 overflow-x-auto">
          {TABS.map((tab) => {
            const count = graphs.filter((g) => g.type === tab.id).length;
            return (
              <button
                key={tab.id}
                className={`flex-1 min-w-0 px-1 py-1.5 text-[10px] font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
                  }`}
                onClick={() => setActiveTab(tab.id)}
                title={tab.label}
              >
                {tab.label}
                {count > 0 && (
                  <span className="ml-1 text-[9px] opacity-60">({count})</span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Upper panel: graph tree for active tab ──────────────────── */}
        <div className="flex-1 overflow-y-auto px-2 py-2 min-h-0">
          <GraphTree
            graphs={tabGraphs}
            activeGraph={activeGraph}
            activeNodeId={focusedNodeId}
            onSelectGraph={(id) => onEvent({ type: "graph:select", id })}
            onDeleteGraph={(id) => onEvent({ type: "graph:delete", id })}
            onExportGraph={(graph) => onEvent({ type: "graph:export", graph })}
            onFocusNode={(id) => onEvent({ type: "node:drill", id })}
          />
        </div>

        {/* ── Divider ─────────────────────────────────────────────────── */}
        <div className="border-t shrink-0" />

        {/* ── Lower panel: graph operations ───────────────────────────── */}
        <div className="shrink-0 px-2 py-2 overflow-y-auto" style={{ maxHeight: "220px" }}>
          <GraphOperations />
        </div>
      </aside>

      {/* Resize handle */}
      <div
        className={`w-1 cursor-col-resize shrink-0 hover:bg-blue-300 active:bg-blue-400 transition-colors ${isResizing ? "bg-blue-400" : "bg-transparent"
          }`}
        onMouseDown={() => onEvent({ type: "layout:resize-left-start" })}
        title="Drag to resize sidebar"
      />

      {showConfig && <ConfigDialog onClose={() => setShowConfig(false)} />}
    </div>
  );
}
