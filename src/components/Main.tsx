import type { GraphAdapter } from "@/view/adapter/index";
import type { Node } from "@/model/types";
import type { AppDispatch } from "@/app/events";
import { UniversalCanvas } from "@/view/universal-canvas";

interface MainProps {
  activeGraph: Node | null;
  adapterRef: React.RefObject<GraphAdapter | null>;
  /** Path from root's first child down to the focused node (inclusive). Empty = full graph. */
  breadcrumbPath: Node[];
  onEvent: AppDispatch;
}

// ---------------------------------------------------------------------------
// Breadcrumb — shown when a node is focused
// ---------------------------------------------------------------------------

function Breadcrumb({
  activeGraph,
  breadcrumbPath,
  onEvent,
}: {
  activeGraph: Node;
  breadcrumbPath: Node[];
  onEvent: AppDispatch;
}) {
  return (
    <div className="flex items-center gap-0.5 px-3 py-1.5 border-b bg-muted/30 text-xs overflow-x-auto shrink-0">
      <button
        className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
        onClick={() => onEvent({ type: "node:navigate", id: null })}
        title="Back to full graph"
      >
        {activeGraph.label}
      </button>

      {breadcrumbPath.map((node, i) => (
        <span key={node.id} className="flex items-center gap-0.5 shrink-0">
          <span className="text-muted-foreground/40 mx-0.5">›</span>
          {i < breadcrumbPath.length - 1 ? (
            <button
              className="text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => onEvent({ type: "node:navigate", id: node.id })}
            >
              {node.label}
            </button>
          ) : (
            <span className="font-medium text-foreground">{node.label}</span>
          )}
        </span>
      ))}

      <span className="ml-auto pl-2 shrink-0">
        <button
          className="px-2 py-0.5 rounded border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          onClick={() => {
            const parent = breadcrumbPath[breadcrumbPath.length - 2];
            onEvent({ type: "node:navigate", id: parent?.id ?? null });
          }}
          title="Go up one level"
        >
          ↑ Up
        </button>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function Main({ activeGraph, adapterRef, breadcrumbPath, onEvent }: MainProps) {
  return (
    <div className="flex flex-1 min-w-0">
      <div className="flex-1 min-w-0 flex flex-col">
        {activeGraph && breadcrumbPath.length > 0 && (
          <Breadcrumb
            activeGraph={activeGraph}
            breadcrumbPath={breadcrumbPath}
            onEvent={onEvent}
          />
        )}

        {activeGraph ? (
          <UniversalCanvas
            key={activeGraph.id}
            ref={adapterRef}
            className="flex-1 min-h-0"
            readOnly
            onDrillInto={(id) => onEvent({ type: "node:drill", id })}
            onToggleExpand={(id) => onEvent({ type: "node:toggle-expand", id })}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            Select or create a graph to get started.
          </div>
        )}
      </div>

      {/* Resize handle between main and right sidebar */}
      <div
        className="w-1 cursor-col-resize shrink-0 hover:bg-blue-300 active:bg-blue-400 transition-colors bg-transparent"
        onMouseDown={() => onEvent({ type: "layout:resize-right-start" })}
        title="Drag to resize"
      />
    </div>
  );
}
