import type { GraphAdapter } from "@/view/adapter/index";
import type { Node } from "@/model/types";
import { UniversalCanvas } from "@/view/universal-canvas";

interface MainProps {
    activeGraph: Node | null;
    adapterRef: React.RefObject<GraphAdapter | null>;
    onResizeStart: () => void;
    /** Path from root's first child down to the focused node (inclusive). Empty = full graph. */
    breadcrumbPath: Node[];
    onNavigateTo: (nodeId: string | null) => void;
    /** Forwarded to the canvas so node components can trigger drill-down. */
    onDrillInto?: (nodeId: string) => void;
    /** Forwarded to the canvas so workspace block nodes can toggle expand. */
    onToggleExpand?: (nodeId: string) => void;
}

// ---------------------------------------------------------------------------
// Breadcrumb — shown when a node is focused
// ---------------------------------------------------------------------------

function Breadcrumb({
    activeGraph,
    breadcrumbPath,
    onNavigateTo,
}: {
    activeGraph: Node;
    breadcrumbPath: Node[];
    onNavigateTo: (nodeId: string | null) => void;
}) {
    return (
        <div className="flex items-center gap-0.5 px-3 py-1.5 border-b bg-muted/30 text-xs overflow-x-auto shrink-0">
            {/* Root graph — click to go back to full graph */}
            <button
                className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                onClick={() => onNavigateTo(null)}
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
                            onClick={() => onNavigateTo(node.id)}
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
                        // Go up one level: navigate to the parent of the focused node.
                        const parent = breadcrumbPath[breadcrumbPath.length - 2];
                        onNavigateTo(parent?.id ?? null);
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

export function Main({ activeGraph, adapterRef, onResizeStart, breadcrumbPath, onNavigateTo, onDrillInto, onToggleExpand }: MainProps) {
    return (
        <div className="flex flex-1 min-w-0">
            <div className="flex-1 min-w-0 flex flex-col">
                {/* Breadcrumb — only visible when a node is focused */}
                {activeGraph && breadcrumbPath.length > 0 && (
                    <Breadcrumb
                        activeGraph={activeGraph}
                        breadcrumbPath={breadcrumbPath}
                        onNavigateTo={onNavigateTo}
                    />
                )}

                {/* Canvas */}
                {activeGraph ? (
                    <UniversalCanvas
                        key={activeGraph!.id}
                        ref={adapterRef}
                        className="flex-1 min-h-0"
                        onDrillInto={onDrillInto}
                        onToggleExpand={onToggleExpand}
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
                onMouseDown={onResizeStart}
                title="Drag to resize"
            />
        </div>
    );
}
