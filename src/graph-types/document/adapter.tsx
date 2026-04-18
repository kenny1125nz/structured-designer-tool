// Document graph adapter — Word/PDF-style collapsible section view.
// Does NOT use React Flow; implements GraphAdapter directly.

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { Node, Viewport } from "@/model/types";
import type {
  GraphAdapter,
  SelectionEvent,
  GraphChangeEvent,
  UnsubscribeFn,
} from "@/view/adapter/index";
import type { GraphCanvasComponent } from "@/view/adapter/react-flow-base";

// ---------------------------------------------------------------------------
// Shared markdown components configuration
// ---------------------------------------------------------------------------

const markdownComponents: Components = {
  code(props) {
    const { node: _, inline, className, children, ...rest } = props as any;
    const match = /language-(\w+)/.exec(className || '');
    const codeChildren = String(children).replace(/\n$/, '');
    return !inline && match ? (
      <SyntaxHighlighter
        style={oneDark as any}
        language={match[1]}
        PreTag="div"
        {...rest}
      >
        {codeChildren}
      </SyntaxHighlighter>
    ) : (
      <code className={className} {...rest}>
        {children}
      </code>
    );
  },
};

// ---------------------------------------------------------------------------
// Section node component
// ---------------------------------------------------------------------------

const DEPTH_CLASSES: Record<number, string> = {
  1: "text-2xl font-bold",
  2: "text-xl font-semibold",
  3: "text-lg font-semibold",
  4: "text-base font-semibold",
  5: "text-sm font-semibold",
  6: "text-xs font-semibold",
};

interface SectionProps {
  node: Node;
  depth: number; // 1 = H1 child of root, etc.
  collapsed: Set<string>;
  selectedId: string | null;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
}

function SectionNode({
  node,
  depth,
  collapsed,
  selectedId,
  onToggle,
  onSelect,
}: SectionProps) {
  const hasChildren = node.children && node.children.length > 0;
  const isCollapsed = collapsed.has(node.id);
  const isSelected = selectedId === node.id;
  const headingClass = DEPTH_CLASSES[Math.min(depth, 6)] ?? DEPTH_CLASSES[6];
  const indent = (depth - 1) * 16; // px per level

  return (
    <div>
      {/* Heading row */}
      <div
        className={`flex items-start gap-1 rounded px-2 py-0.5 cursor-pointer group ${isSelected ? "bg-blue-50 ring-1 ring-blue-300" : "hover:bg-muted/60"
          }`}
        style={{ paddingLeft: `${indent + 8}px` }}
        onClick={() => onSelect(node.id)}
      >
        {/* Collapse toggle */}
        <button
          className="shrink-0 mt-1 text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(node.id);
          }}
          aria-label={isCollapsed ? "Expand" : "Collapse"}
        >
          {hasChildren ? (
            isCollapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )
          ) : (
            <span className="inline-block h-3.5 w-3.5" />
          )}
        </button>

        {/* Heading label */}
        <span className={`${headingClass} leading-snug select-text`}>
          {node.label}
        </span>
      </div>

      {/* Body content */}
      {!isCollapsed && node.metadata?.content && typeof node.metadata.content === "string" && node.metadata.content.trim() !== "" && (
        <div
          className="text-sm text-muted-foreground leading-relaxed px-2 py-1 select-text prose prose-sm max-w-none"
          style={{ paddingLeft: `${indent + 28}px` }}
        >
          <ReactMarkdown components={markdownComponents}>
            {node.metadata.content}
          </ReactMarkdown>
        </div>
      )}

      {/* Child sections */}
      {!isCollapsed && hasChildren && (
        <div>
          {node.children!.map((child) => (
            <SectionNode
              key={child.id}
              node={child}
              depth={depth + 1}
              collapsed={collapsed}
              selectedId={selectedId}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DocumentAdapter — implements GraphAdapter
// ---------------------------------------------------------------------------

type Listener<T> = (event: T) => void;

const DocumentAdapterInner = forwardRef<GraphAdapter, { className?: string }>(
  function DocumentAdapterInner({ className }, ref) {
    const [root, setRoot] = useState<Node | null>(null);
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Listener registries
    const selectionListeners = useRef<Set<Listener<SelectionEvent>>>(new Set());
    const changeListeners = useRef<Set<Listener<GraphChangeEvent>>>(new Set());

    const handleToggle = useCallback((id: string) => {
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    }, []);

    const handleSelect = useCallback(
      (id: string) => {
        const nextId = selectedId === id ? null : id;
        setSelectedId(nextId);
        const event: SelectionEvent = {
          nodeIds: nextId ? [nextId] : [],
          referenceIds: [],
        };
        selectionListeners.current.forEach((cb) => cb(event));
      },
      [selectedId]
    );

    useImperativeHandle(
      ref,
      () => ({
        setDocument(node: Node) {
          setRoot(node);
          setCollapsed(new Set());
          setSelectedId(null);
        },

        onSelectionChange(cb: Listener<SelectionEvent>): UnsubscribeFn {
          selectionListeners.current.add(cb);
          return () => selectionListeners.current.delete(cb);
        },

        onGraphChange(cb: Listener<GraphChangeEvent>): UnsubscribeFn {
          changeListeners.current.add(cb);
          return () => changeListeners.current.delete(cb);
        },

        fitToView() {
          scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
        },

        focusNode(_id: string) {
          // Document adapter is a linear scroll view; no per-node focus.
        },

        setViewport(vp: Viewport) {
          scrollRef.current?.scrollTo({ top: vp.y, behavior: "instant" });
        },

        getViewport(): Viewport {
          return {
            x: 0,
            y: scrollRef.current?.scrollTop ?? 0,
            zoom: 1,
          };
        },
      }),
      []
    );

    if (!root) {
      return (
        <div
          className={`flex h-full items-center justify-center text-muted-foreground ${className ?? ""}`}
        >
          No document loaded.
        </div>
      );
    }

    return (
      <div
        ref={scrollRef}
        className={`overflow-y-auto h-full ${className ?? ""}`}
      >
        {/* Document title */}
        <div className="mx-auto px-8 py-10" style={{ maxWidth: "96em" }}>
          <h1 className="text-3xl font-bold mb-1 select-text">{root.label}</h1>
          {root.metadata?.content && typeof root.metadata.content === "string" && root.metadata.content.trim() !== "" && (
            <div className="text-sm text-muted-foreground mb-6 select-text prose prose-sm max-w-none">
              <ReactMarkdown components={markdownComponents}>
                {root.metadata.content}
              </ReactMarkdown>
            </div>
          )}

          {/* Top-level sections */}
          {root.children?.map((child) => (
            <SectionNode
              key={child.id}
              node={child}
              depth={1}
              collapsed={collapsed}
              selectedId={selectedId}
              onToggle={handleToggle}
              onSelect={handleSelect}
            />
          ))}

          {!root.children?.length && (
            <p className="text-muted-foreground text-sm">
              This document has no sections yet.
            </p>
          )}
        </div>
      </div>
    );
  }
);

export const DocumentAdapter: GraphCanvasComponent = DocumentAdapterInner;
