// Adapter contract — application logic interacts only with this interface,
// never with the renderer library directly.

import type { Node, Viewport } from "@/model/types";

export interface SelectionEvent {
  nodeIds: string[];
  referenceIds: string[];
}

/** Emitted when a drag ends — one entry per moved node (multi-select moves are batched). */
export interface MovePayload {
  moves: Array<{ id: string; position: { x: number; y: number } }>;
}

/** Emitted when a node resize ends. */
export interface ResizePayload {
  id: string;
  size: { width: number; height: number };
}

/** Emitted when a node is deleted from the canvas. */
export interface NodeRemovePayload {
  id: string;
}

/** Emitted when a node is dragged into a different parent. */
export interface ReparentPayload {
  nodeId: string;
  newParentId: string | null;
}

/** Emitted when the user draws a new edge between two nodes. */
export interface ReferenceCreatePayload {
  sourceId: string;
  targetId: string;
  /** The reference type string to use, e.g. "calls", "depends", "cites". */
  refType: string;
}

/** Emitted when an edge is deleted from the canvas. */
export interface ReferenceRemovePayload {
  id: string;
}

export interface GraphChangeEvent {
  type:
    | "move"
    | "resize"
    | "viewport"
    | "reference-create"
    | "reference-remove"
    | "node-remove"
    | "reparent"
    | "collapse";
  payload:
    | MovePayload
    | ResizePayload
    | Viewport
    | NodeRemovePayload
    | ReparentPayload
    | ReferenceCreatePayload
    | ReferenceRemovePayload
    | unknown;
}

export type UnsubscribeFn = () => void;

export interface GraphAdapter {
  /** Load or replace the active root node document. */
  setDocument(root: Node): void;

  /** Subscribe to node/reference selection events. */
  onSelectionChange(cb: (event: SelectionEvent) => void): UnsubscribeFn;

  /** Subscribe to structural/interaction events (move, reference ops, collapse). */
  onGraphChange(cb: (event: GraphChangeEvent) => void): UnsubscribeFn;

  /** Fit entire graph into the current viewport. */
  fitToView(): void;

  /** Pan/zoom the canvas so that the node with the given id is centred and visible. */
  focusNode(id: string): void;

  /** Restore a previously saved viewport. */
  setViewport(vp: Viewport): void;

  /** Read the current viewport (for persistence). */
  getViewport(): Viewport;
}
