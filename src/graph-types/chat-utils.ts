// Shared utilities for graph chat strategies.
//
// Each graph type's chat-strategy.ts handles its own compact types, prompts,
// and field mappings.  This file provides the infrastructure that is identical
// across all strategies so it doesn't need to be copied.

import { v4 as uuidv4 } from "uuid";
import type { Node } from "@/model/types";

// ---------------------------------------------------------------------------
// Layout preservation
// ---------------------------------------------------------------------------

export type LayoutMap = Map<string, { position?: Node["position"]; size?: Node["size"] }>;

/**
 * Walks one or more Node trees and returns a label → {position, size} map.
 * Used to re-apply persisted canvas positions after the LLM rebuilds the tree.
 */
export function extractLayoutByLabel(root: Node | Node[]): LayoutMap {
  const map: LayoutMap = new Map();
  function walk(n: Node) {
    if (n.position || n.size) map.set(n.label, { position: n.position, size: n.size });
    for (const c of n.children ?? []) walk(c);
  }
  for (const n of Array.isArray(root) ? root : [root]) walk(n);
  return map;
}

// ---------------------------------------------------------------------------
// Id / label maps
// ---------------------------------------------------------------------------

/**
 * Walks one or more Node trees and returns an id → label map.
 * Used when serialising references (id is stored, label is sent to LLM).
 */
export function buildIdToLabelMap(root: Node | Node[]): Map<string, string> {
  const map = new Map<string, string>();
  function walk(n: Node) {
    map.set(n.id, n.label);
    for (const c of n.children ?? []) walk(c);
  }
  for (const n of Array.isArray(root) ? root : [root]) walk(n);
  return map;
}

/**
 * Walks a Node tree and seeds label → id into `map`.
 * Call this before `assignCompactIds` so that existing nodes keep their ids.
 */
export function seedLabelToId(node: Node, map: Map<string, string>): void {
  map.set(node.label, node.id);
  for (const c of node.children ?? []) seedLabelToId(c, map);
}

// ---------------------------------------------------------------------------
// Compact id assignment
// ---------------------------------------------------------------------------

/**
 * Recursively ensures every compact node has an entry in labelToId.
 * Works for any compact shape that has { label: string; children?: T[] }.
 * Call this after seeding from the original tree so existing labels keep their
 * ids and only genuinely new nodes get fresh UUIDs.
 */
export function assignCompactIds<T extends { label: string; children?: T[] }>(
  node: T,
  labelToId: Map<string, string>,
): void {
  if (!labelToId.has(node.label)) labelToId.set(node.label, uuidv4());
  for (const child of node.children ?? []) assignCompactIds(child, labelToId);
}

// ---------------------------------------------------------------------------
// Reference helpers
// ---------------------------------------------------------------------------

type Ref = NonNullable<Node["references"]>[number];

/** Resolves a label to a reference object, or null if the label is unknown. */
export function makeRef(
  type: string,
  targetLabel: string,
  labelToId: Map<string, string>,
): Ref | null {
  const target = labelToId.get(targetLabel);
  return target ? { id: uuidv4(), type, target, metadata: {} } : null;
}

/**
 * Maps a list of target labels to resolved references, dropping any that
 * don't resolve to a known node.
 */
export function resolveRefs(
  type: string,
  labels: string[] | undefined,
  labelToId: Map<string, string>,
): Ref[] {
  return (labels ?? [])
    .map((l) => makeRef(type, l, labelToId))
    .filter((r): r is Ref => r !== null);
}

// ---------------------------------------------------------------------------
// Root finalisation
// ---------------------------------------------------------------------------

/**
 * Returns an updated root Node by merging a patch and stamping updatedAt.
 * Spread `metadataPatch` over `original.metadata` — pass undefined to leave
 * metadata unchanged.
 */
export function finaliseRoot(
  original: Node,
  children: Node[],
  labelPatch?: string,
  metadataPatch?: Record<string, unknown>,
): Node {
  return {
    ...original,
    ...(labelPatch !== undefined ? { label: labelPatch } : {}),
    metadata:
      metadataPatch !== undefined
        ? { ...original.metadata, ...metadataPatch }
        : original.metadata,
    children,
    updatedAt: new Date().toISOString(),
  };
}
