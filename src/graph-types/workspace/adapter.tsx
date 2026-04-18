// Workspace graph adapter — renders document / architecture / code children as
// simple drillable blocks.  Clicking "Drill In" on a block switches the main
// canvas to that child's own type-specific adapter.

import { createGraphCanvas, useDrillInto } from "@/view/adapter/react-flow-base";
import type { GraphCanvasProps } from "@/view/adapter/react-flow-base";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { FileText, Layers, Code2, Link, GitBranch, ChevronRight, type LucideIcon } from "lucide-react";
import type { Node } from "@/model/types";
import type { GraphAdapter } from "@/view/adapter";
import { forwardRef, useRef, useImperativeHandle, useCallback } from "react";

// ---------------------------------------------------------------------------
// Type config
// ---------------------------------------------------------------------------

const TYPE_CONFIG: Record<string, { icon: LucideIcon; color: string; bg: string; border: string; badge: string }> = {
    document: {
        icon: FileText,
        color: "text-blue-700",
        bg: "bg-blue-50",
        border: "border-blue-300",
        badge: "bg-blue-100 text-blue-700",
    },
    architecture: {
        icon: Layers,
        color: "text-purple-700",
        bg: "bg-purple-50",
        border: "border-purple-300",
        badge: "bg-purple-100 text-purple-700",
    },
    code: {
        icon: Code2,
        color: "text-green-700",
        bg: "bg-green-50",
        border: "border-green-300",
        badge: "bg-green-100 text-green-700",
    },
};

// ---------------------------------------------------------------------------
// Drillable block — rendered for document / architecture / code children
// ---------------------------------------------------------------------------

function DrillableBlock(props: NodeProps) {
    const { data } = props;
    const nodeId = props.id;
    const label = data.label as string;
    const nodeType = data.type as string;
    const onDrillInto = useDrillInto();

    const cfg = TYPE_CONFIG[nodeType] ?? {
        icon: FileText,
        color: "text-gray-700",
        bg: "bg-gray-50",
        border: "border-gray-300",
        badge: "bg-gray-100 text-gray-700",
    };
    const Icon = cfg.icon;

    return (
        <div
            className={`rounded-xl border-2 ${cfg.border} ${cfg.bg} shadow-sm flex flex-col overflow-hidden`}
            style={{ width: 220, minHeight: 100 }}
        >
            <Handle type="target" position={Position.Top} />

            {/* Header */}
            <div className={`flex items-center gap-2 px-4 py-3 border-b ${cfg.border}`}>
                <div className={`p-1.5 rounded-lg ${cfg.bg}`}>
                    <Icon className={`h-4 w-4 ${cfg.color}`} />
                </div>
                <span className="font-semibold text-gray-900 text-sm leading-tight flex-1 truncate">{label}</span>
                <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${cfg.badge}`}>
                    {nodeType.slice(0, 3)}
                </span>
            </div>

            {/* Body */}
            <div className="flex-1 flex flex-col items-center justify-center px-4 py-3 gap-2">
                <p className={`text-xs ${cfg.color} opacity-70 text-center`}>
                    Click to explore {nodeType} graph
                </p>
                <button
                    className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border ${cfg.border} ${cfg.color} hover:${cfg.bg} transition-colors font-medium`}
                    onClick={(e) => {
                        e.stopPropagation();
                        onDrillInto?.(nodeId);
                    }}
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
// Hyperlink / Repository nodes (remain as-is in workspace overview)
// ---------------------------------------------------------------------------

function HyperlinkNode(props: NodeProps) {
    const { data, selected } = props;
    const label = data.label as string;
    const metadata = data.metadata as Record<string, unknown>;
    const url = metadata.url as string || "";
    const title = metadata.title as string || "";

    return (
        <div
            className={`rounded-lg border-2 ${selected ? "border-green-500" : "border-green-300"} bg-green-50 shadow-sm p-3`}
            style={{ width: 200, height: 80, overflow: "hidden", position: "relative" }}
        >
            <Handle type="target" position={Position.Top} />
            <div className="flex items-center gap-2 mb-1">
                <div className="p-1 rounded bg-green-100 shrink-0">
                    <Link className="h-3.5 w-3.5 text-green-600" />
                </div>
                <span className="font-semibold text-gray-900 text-xs leading-tight truncate">{title || label}</span>
            </div>
            <div className="text-xs text-green-600">hyperlink</div>
            <div className="text-xs text-gray-500 truncate mt-1">{url.slice(0, 40)}</div>
            <Handle type="source" position={Position.Bottom} />
        </div>
    );
}

function RepositoryNode(props: NodeProps) {
    const { data, selected } = props;
    const label = data.label as string;
    const metadata = data.metadata as Record<string, unknown>;
    const provider = metadata.provider as string || "github";
    const branch = metadata.branch as string || "main";

    return (
        <div
            className={`rounded-lg border-2 ${selected ? "border-purple-500" : "border-purple-300"} bg-purple-50 shadow-sm p-3`}
            style={{ width: 200, height: 80, overflow: "hidden", position: "relative" }}
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

// ---------------------------------------------------------------------------
// Node component registry
// ---------------------------------------------------------------------------

const NODE_COMPONENTS = {
    // workspace root itself (workspace node shouldn't be shown — skipRoot would be true)
    workspace: DrillableBlock,
    // direct workspace children — shown as drillable blocks
    document: DrillableBlock,
    architecture: DrillableBlock,
    code: DrillableBlock,
    // other workspace leaf nodes
    hyperlink: HyperlinkNode,
    repository: RepositoryNode,
};

// ---------------------------------------------------------------------------
// Base canvas
// ---------------------------------------------------------------------------

const BaseWorkspaceAdapter = createGraphCanvas({
    nodeComponents: NODE_COMPONENTS,
    useSubFlow: false,     // children float freely, not nested visually
    defaultReferenceType: "links_to",
});

// ---------------------------------------------------------------------------
// Workspace adapter — strips grandchildren so doc/arch/code appear as
// simple flat blocks rather than exposing their full internal trees.
// ---------------------------------------------------------------------------

const WorkspaceAdapterWithLayout = forwardRef<GraphAdapter, GraphCanvasProps>(
    function WorkspaceAdapterWithLayout(props, ref) {
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
                // Strip sub-trees from direct children so they render as flat
                // drillable blocks, not as nested compound containers.
                const shallowRoot: Node = {
                    ...root,
                    children: root.children?.map((child) => ({
                        ...child,
                        children: undefined,
                        references: undefined,
                    })),
                };
                if (baseAdapterRef.current) {
                    baseAdapterRef.current.setDocument(shallowRoot);
                } else {
                    pendingRootRef.current = shallowRoot;
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

        return <BaseWorkspaceAdapter ref={setBaseAdapterRef} {...props} />;
    }
);

export const WorkspaceAdapter = WorkspaceAdapterWithLayout;
