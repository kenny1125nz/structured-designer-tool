import { useState, useRef, useEffect } from "react";
import type { Node, Reference } from "@/model/types";
import type { ChatMessage } from "@/controller/ai/graph-chat";
import type { AppDispatch } from "@/app/events";
import { findNodeById } from "@/model/utils";

// ---------------------------------------------------------------------------
// RightSidebar props
// ---------------------------------------------------------------------------

interface RightSidebarProps {
  sidebarWidth: number;
  isResizing: boolean;
  activeGraph?: Node | null;
  selectedNode?: Node | null;
  selectedReference?: { ref: Reference; source: Node } | null;
  onEvent: AppDispatch;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countNodes(node: Node): number {
  let n = 1;
  for (const c of node.children ?? []) n += countNodes(c);
  return n;
}

function countRefs(node: Node): number {
  let n = node.references?.length ?? 0;
  for (const c of node.children ?? []) n += countRefs(c);
  return n;
}

function childrenSummary(node: Node): string | null {
  if (!node.children?.length) return null;
  const counts = new Map<string, number>();
  for (const c of node.children) {
    counts.set(c.type, (counts.get(c.type) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([t, n]) => `${n} ${t}${n !== 1 ? "s" : ""}`)
    .join(", ");
}

function groupedRefs(
  node: Node,
): Array<{ type: string; refs: Reference[] }> {
  if (!node.references?.length) return [];
  const map = new Map<string, Reference[]>();
  for (const r of node.references) {
    const list = map.get(r.type) ?? [];
    list.push(r);
    map.set(r.type, list);
  }
  return Array.from(map.entries()).map(([type, refs]) => ({ type, refs }));
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function TagList({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1 mt-0.5">
      {items.map((item) => (
        <span key={item} className="text-xs bg-muted rounded px-1.5 py-0.5 font-mono">
          {item}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Structured metadata fields for code nodes
// ---------------------------------------------------------------------------

function CodeNodeDetails({ node }: { node: Node }) {
  const m = node.metadata ?? {};

  return (
    <div className="space-y-2 pt-1 border-t">
      {m.entityKind && (
        <Field label="Kind">
          <span className="capitalize text-muted-foreground">{m.entityKind as string}</span>
        </Field>
      )}
      {m.isExported !== undefined && (
        <Field label="Exported">
          <span className="text-muted-foreground">{m.isExported ? "Yes" : "No"}</span>
        </Field>
      )}
      {m.lineCount !== undefined && (
        <Field label="Lines">
          <span className="text-muted-foreground">{m.lineCount as number}</span>
        </Field>
      )}
      {m.extends && (
        <Field label="Extends">
          <span className="font-mono text-xs text-muted-foreground">{m.extends as string}</span>
        </Field>
      )}
      {Array.isArray(m.implements) && (m.implements as string[]).length > 0 && (
        <Field label="Implements">
          <TagList items={m.implements as string[]} />
        </Field>
      )}
      {Array.isArray(m.extendsInterfaces) && (m.extendsInterfaces as string[]).length > 0 && (
        <Field label="Extends interfaces">
          <TagList items={m.extendsInterfaces as string[]} />
        </Field>
      )}
      {Array.isArray(m.methods) && (m.methods as string[]).length > 0 && (
        <Field label={`Methods (${(m.methods as string[]).length})`}>
          <TagList items={m.methods as string[]} />
        </Field>
      )}
      {Array.isArray(m.properties) && (m.properties as string[]).length > 0 && (
        <Field label={`Properties (${(m.properties as string[]).length})`}>
          <TagList items={m.properties as string[]} />
        </Field>
      )}
      {m.description && (
        <Field label="Description">
          <span className="text-xs text-muted-foreground">{m.description as string}</span>
        </Field>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// JSON payload box — collapsible, excludes children
// ---------------------------------------------------------------------------

function NodeJson({ node }: { node: Node }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const payload = JSON.stringify({ ...node, children: undefined }, null, 2);

  function handleCopy() {
    navigator.clipboard.writeText(payload).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="border rounded">
      <button
        className="w-full flex items-center justify-between px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="font-medium">JSON payload</span>
        <span className="font-mono">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="border-t">
          <div className="flex justify-end px-2 pt-1">
            <button
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={handleCopy}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <pre className="text-xs font-mono text-muted-foreground whitespace-pre overflow-auto max-h-64 px-2 pb-2">
            {payload}
          </pre>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Node editor — shown when a canvas node is selected
// ---------------------------------------------------------------------------

function NodeEditor({
  node,
  graph,
  readOnly = false,
  onUpdate,
  onDelete,
}: {
  node: Node;
  graph?: Node | null;
  readOnly?: boolean;
  onUpdate?: (nodeId: string, changes: { label?: string; metadata?: Record<string, unknown> }) => Promise<void>;
  onDelete?: (nodeId: string) => Promise<void>;
}) {
  const [label, setLabel] = useState(node.label);
  const [metaText, setMetaText] = useState(() => {
    const editableMeta: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node.metadata ?? {})) {
      if (k === "versions" || k === "activeVersionId") continue;
      editableMeta[k] = v;
    }
    return Object.keys(editableMeta).length > 0
      ? JSON.stringify(editableMeta, null, 2)
      : "";
  });
  const [metaError, setMetaError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLabel(node.label);
    const editableMeta: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node.metadata ?? {})) {
      if (k === "versions" || k === "activeVersionId") continue;
      editableMeta[k] = v;
    }
    setMetaText(
      Object.keys(editableMeta).length > 0 ? JSON.stringify(editableMeta, null, 2) : "",
    );
    setMetaError(null);
  }, [node.id]);

  async function handleSave() {
    const changes: { label?: string; metadata?: Record<string, unknown> } = {};

    if (label.trim() && label.trim() !== node.label) {
      changes.label = label.trim();
    }

    if (metaText.trim()) {
      try {
        changes.metadata = JSON.parse(metaText);
        setMetaError(null);
      } catch {
        setMetaError("Invalid JSON");
        return;
      }
    } else {
      changes.metadata = {};
    }

    if (Object.keys(changes).length === 0) return;
    setSaving(true);
    try {
      await onUpdate?.(node.id, changes);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete node "${node.label}"? This cannot be undone.`)) return;
    await onDelete?.(node.id);
  }

  const childSummary = childrenSummary(node);
  const refGroups = groupedRefs(node);
  const isCodeGraph = graph?.type === "code";

  function resolveTarget(target: string): { label: string; type?: string } {
    if (!graph) return { label: target };
    const n = findNodeById(graph, target);
    return n ? { label: n.label, type: n.type } : { label: target };
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">Selected Node</span>
        {!readOnly && (
          <button
            className="text-xs px-2 py-0.5 rounded border border-destructive text-destructive hover:bg-destructive/10 transition-colors"
            onClick={handleDelete}
          >
            Delete
          </button>
        )}
      </div>

      {readOnly && (
        <p className="text-xs text-muted-foreground italic">
          Read-only — use the Chat panel to modify this graph.
        </p>
      )}

      <div>
        <label className="text-xs text-muted-foreground block mb-1">Label</label>
        {readOnly ? (
          <div className="text-sm font-medium text-foreground">{node.label}</div>
        ) : (
          <input
            className="w-full text-sm rounded border bg-background px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
        )}
      </div>

      <div>
        <label className="text-xs text-muted-foreground block mb-1">Type</label>
        <div className="text-sm capitalize text-muted-foreground">{node.type}</div>
      </div>

      {isCodeGraph && <CodeNodeDetails node={node} />}

      {childSummary && (
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Children</label>
          <div className="text-xs text-muted-foreground">{childSummary}</div>
        </div>
      )}

      {refGroups.length > 0 && (
        <div>
          <label className="text-xs text-muted-foreground block mb-1">
            References ({node.references!.length})
          </label>
          <div className="space-y-2">
            {refGroups.map(({ type, refs }) => (
              <div key={type}>
                <div className="text-xs font-mono text-muted-foreground/70 mb-1">{type}</div>
                <div className="space-y-1 pl-2 border-l border-border">
                  {refs.map((r) => {
                    const { label: targetLabel, type: targetType } = resolveTarget(r.target);
                    const names = r.metadata?.names as string[] | undefined;
                    const specifier = r.metadata?.specifier as string | undefined;
                    const isDynamic = r.metadata?.dynamic as boolean | undefined;
                    return (
                      <div key={r.id} className="text-xs">
                        <div className="flex items-baseline gap-1">
                          <span className="font-medium text-foreground">{targetLabel}</span>
                          {targetType && (
                            <span className="text-muted-foreground/60 capitalize">({targetType})</span>
                          )}
                          {isDynamic && (
                            <span className="text-muted-foreground/50 italic">dynamic</span>
                          )}
                        </div>
                        {specifier && (
                          <div className="text-muted-foreground/60 font-mono truncate" title={specifier}>
                            {specifier}
                          </div>
                        )}
                        {names && names.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {names.map((n) => (
                              <span key={n} className="bg-muted rounded px-1 py-0.5 font-mono">
                                {n}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="text-xs text-muted-foreground block mb-1">ID</label>
        <div className="text-xs font-mono text-muted-foreground truncate">{node.id}</div>
      </div>

      {!isCodeGraph && (
        <div>
          <label className="text-xs text-muted-foreground block mb-1">
            Metadata
            {!readOnly && <span className="ml-1 text-muted-foreground/60">(JSON)</span>}
          </label>
          {readOnly ? (
            <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all">
              {metaText || "{}"}
            </pre>
          ) : (
            <>
              <textarea
                className={`w-full text-xs font-mono rounded border bg-background px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-ring ${metaError ? "border-destructive" : ""
                  }`}
                rows={5}
                value={metaText}
                onChange={(e) => { setMetaText(e.target.value); setMetaError(null); }}
                placeholder="{}"
                spellCheck={false}
              />
              {metaError && (
                <p className="text-xs text-destructive mt-0.5">{metaError}</p>
              )}
            </>
          )}
        </div>
      )}

      <NodeJson node={node} />

      {!readOnly && (
        <button
          className="w-full text-xs px-3 py-1.5 rounded border bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving…" : "Apply"}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reference details — shown when an edge is selected
// ---------------------------------------------------------------------------

function ReferenceDetails({
  ref,
  source,
  graph,
}: {
  ref: Reference;
  source: Node;
  graph: Node;
}) {
  const targetNode = findNodeById(graph, ref.target);
  const metaEntries = Object.entries(ref.metadata ?? {});

  return (
    <div className="space-y-3">
      <span className="text-xs font-medium text-foreground">Selected Reference</span>

      <Field label="Type">
        <span className="font-mono text-xs">{ref.type}</span>
      </Field>

      <Field label="Source">
        <span className="font-medium">{source.label}</span>
        <span className="text-xs text-muted-foreground ml-1 capitalize">({source.type})</span>
      </Field>

      <Field label="Target">
        {targetNode ? (
          <>
            <span className="font-medium">{targetNode.label}</span>
            <span className="text-xs text-muted-foreground ml-1 capitalize">({targetNode.type})</span>
          </>
        ) : (
          <span className="font-mono text-xs text-muted-foreground">{ref.target}</span>
        )}
      </Field>

      {ref.label && (
        <Field label="Label">
          <span className="text-muted-foreground">{ref.label}</span>
        </Field>
      )}

      {metaEntries.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground mb-1">Metadata</div>
          <div className="space-y-1">
            {metaEntries.map(([k, v]) => (
              <div key={k} className="flex gap-2 text-xs">
                <span className="text-muted-foreground/70 font-mono shrink-0">{k}</span>
                <span className="font-mono text-muted-foreground break-all">
                  {Array.isArray(v) ? v.join(", ") : String(v)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="text-xs text-muted-foreground mb-0.5">ID</div>
        <div className="text-xs font-mono text-muted-foreground truncate">{ref.id}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Properties tab
// ---------------------------------------------------------------------------

function PropertiesTab({
  graph,
  selectedNode,
  selectedReference,
  onEvent,
}: {
  graph: Node | null | undefined;
  selectedNode?: Node | null;
  selectedReference?: { ref: Reference; source: Node } | null;
  onEvent: AppDispatch;
}) {
  if (!graph) {
    return <p className="text-xs text-muted-foreground">No graph selected.</p>;
  }

  if (selectedNode && selectedNode.id !== graph.id) {
    return (
      <NodeEditor
        node={selectedNode}
        graph={graph}
        onUpdate={(nodeId, changes) => onEvent({ type: "node:update", nodeId, changes })}
        onDelete={(nodeId) => onEvent({ type: "node:delete", nodeId })}
      />
    );
  }

  if (selectedReference && (!selectedNode || selectedNode.id === graph.id)) {
    return (
      <ReferenceDetails
        ref={selectedReference.ref}
        source={selectedReference.source}
        graph={graph}
      />
    );
  }

  const nodeCount = countNodes(graph) - 1;
  const refCount = countRefs(graph);

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-muted-foreground block mb-1">Name</label>
        <div className="text-sm font-medium truncate">{graph.label}</div>
      </div>
      <div>
        <label className="text-xs text-muted-foreground block mb-1">Type</label>
        <div className="text-sm capitalize">{graph.type}</div>
      </div>
      <div>
        <label className="text-xs text-muted-foreground block mb-1">Nodes</label>
        <div className="text-sm">{nodeCount}</div>
      </div>
      <div>
        <label className="text-xs text-muted-foreground block mb-1">References</label>
        <div className="text-sm">{refCount}</div>
      </div>
      {graph.createdAt && (
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Created</label>
          <div className="text-xs text-muted-foreground">
            {new Date(graph.createdAt).toLocaleString()}
          </div>
        </div>
      )}
      {graph.updatedAt && (
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Updated</label>
          <div className="text-xs text-muted-foreground">
            {new Date(graph.updatedAt).toLocaleString()}
          </div>
        </div>
      )}
      <div>
        <label className="text-xs text-muted-foreground block mb-1">ID</label>
        <div className="text-xs font-mono text-muted-foreground truncate">{graph.id}</div>
      </div>
      {graph.metadata?.description && (
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Description</label>
          <div className="text-xs">{graph.metadata.description as string}</div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chat placeholder — type-specific example prompts
// ---------------------------------------------------------------------------

const CHAT_EXAMPLES: Record<string, string[]> = {
  code: [
    "Merge the data access packages into one",
    "Rename the UI package to Presentation Layer",
    "Add a dependency from Services to Repository",
    "Remove packages with fewer than 2 entities",
  ],
  architecture: [
    "Add an API Gateway component that calls the Auth Service",
    "Rename Order Service to Order Management",
    "Group the storage components under a Data Layer",
    "Mark the Payment provider as an ExternalComponent",
  ],
  document: [
    "Add a Summary section at the top",
    "Split the Architecture section into Design and Constraints",
    "Add a citation from Implementation to Architecture",
    "Rename Overview to Introduction",
  ],
};

const FALLBACK_EXAMPLES = [
  "Rename a node",
  "Add a relationship between two nodes",
  "Group related nodes together",
  "Remove nodes that are no longer relevant",
];

function ChatPlaceholder({ type }: { type: string }) {
  const examples = CHAT_EXAMPLES[type] ?? FALLBACK_EXAMPLES;
  return (
    <div className="text-xs text-muted-foreground space-y-1">
      <p>Ask the AI to adjust the graph. For example:</p>
      <ul className="space-y-0.5 mt-1">
        {examples.map((ex) => (
          <li key={ex} className="before:content-['•'] before:mr-1">
            {ex}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chat tab
// ---------------------------------------------------------------------------

function ChatTab({
  graph,
  onGraphUpdate,
}: {
  graph: Node;
  onGraphUpdate?: (graph: Node) => Promise<void>;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [includeSource, setIncludeSource] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const text = input.trim();
    if (!text || isLoading) return;

    setError(null);
    const userMessage: ChatMessage = { role: "user", content: text };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setIsLoading(true);

    try {
      const { chatAdjustGraph } = await import("@/controller/ai/graph-chat");
      const updated = await chatAdjustGraph(nextMessages, graph, { includeSource });
      await onGraphUpdate?.(updated);
      setMessages([...nextMessages, { role: "assistant", content: "Done — graph updated." }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
      setMessages([...nextMessages, { role: "assistant", content: `Error: ${msg}` }]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex flex-col h-full gap-2">
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {messages.length === 0 ? (
          <ChatPlaceholder type={graph.type} />
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              className={`text-xs rounded px-2 py-1.5 ${m.role === "user"
                ? "bg-primary text-primary-foreground ml-4"
                : "bg-muted text-muted-foreground mr-4"
                }`}
            >
              {m.content}
            </div>
          ))
        )}
        {isLoading && (
          <div className="text-xs text-muted-foreground bg-muted rounded px-2 py-1.5 mr-4 animate-pulse">
            Thinking…
          </div>
        )}
        {error && (
          <div className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1.5">
            {error}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex flex-col gap-1 border-t pt-2">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            className="rounded border-muted accent-primary"
            checked={includeSource}
            onChange={(e) => setIncludeSource(e.target.checked)}
          />
          <span className="text-xs text-muted-foreground">
            Include {graph.label} as context
          </span>
        </label>
        <textarea
          className="w-full text-xs rounded border bg-background px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
          rows={3}
          placeholder="Describe the change… (Enter to send)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
        />
        <button
          className="w-full text-xs px-3 py-1.5 rounded border bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          onClick={handleSend}
          disabled={isLoading || !input.trim()}
        >
          {isLoading ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RightSidebar
// ---------------------------------------------------------------------------

export function RightSidebar({
  sidebarWidth,
  isResizing,
  activeGraph,
  selectedNode,
  selectedReference,
  onEvent,
}: RightSidebarProps) {
  const [activeTab, setActiveTab] = useState<"properties" | "chat">("properties");

  const canChat = !!activeGraph;

  return (
    <div className="flex">
      {/* Resize handle */}
      <div
        className={`w-1 cursor-col-resize shrink-0 hover:bg-blue-300 active:bg-blue-400 transition-colors ${isResizing ? "bg-blue-400" : "bg-transparent"
          }`}
        onMouseDown={() => onEvent({ type: "layout:resize-right-start" })}
        title="Drag to resize sidebar"
      />

      <aside
        className="shrink-0 border-l bg-muted/40 flex flex-col gap-2 p-3 relative"
        style={{ width: `${sidebarWidth}px` }}
      >
        {/* Tab bar */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            className={`text-xs px-2 py-1 rounded border hover:bg-muted ${activeTab === "properties" ? "bg-muted font-medium" : ""
              }`}
            onClick={() => setActiveTab("properties")}
          >
            Properties
          </button>
          {canChat && (
            <button
              className={`text-xs px-2 py-1 rounded border hover:bg-muted ${activeTab === "chat" ? "bg-muted font-medium" : ""
                }`}
              onClick={() => setActiveTab("chat")}
            >
              Chat
            </button>
          )}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-auto min-h-0">
          {activeTab === "properties" || !canChat ? (
            <PropertiesTab
              graph={activeGraph}
              selectedNode={selectedNode}
              selectedReference={selectedReference}
              onEvent={onEvent}
            />
          ) : (
            <ChatTab
              graph={activeGraph!}
              onGraphUpdate={(graph) => onEvent({ type: "graph:update", graph })}
            />
          )}
        </div>
      </aside>
    </div>
  );
}
