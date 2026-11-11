import type { Node } from "@/model/types";

// ---------------------------------------------------------------------------
// Typed event union — all cross-component interactions flow through this.
// Components dispatch events; App handles them.
// ---------------------------------------------------------------------------

export type AppEvent =
  // Graph management
  | { type: "graph:select"; id: string }
  | { type: "graph:delete"; id: string }
  | { type: "graph:export"; graph: Node }
  | { type: "graph:import" }
  | { type: "graph:update"; graph: Node }
  // Node navigation & canvas interactions
  | { type: "node:drill"; id: string }
  | { type: "node:navigate"; id: string | null }
  | { type: "node:toggle-expand"; id: string }
  | { type: "node:update"; nodeId: string; changes: { label?: string; metadata?: Record<string, unknown> } }
  | { type: "node:delete"; nodeId: string }
  // Analysis / import wizards
  | { type: "analyze:markdown"; graphType: string }
  | { type: "analyze:code" }
  | { type: "analyze:workspace" }
  // Layout resize
  | { type: "layout:resize-left-start" }
  | { type: "layout:resize-right-start" };

/** Async dispatcher — callers may await to know when the action settled. */
export type AppDispatch = (event: AppEvent) => Promise<void>;
