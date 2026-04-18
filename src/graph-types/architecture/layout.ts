// Architecture layout — compound sizing + external-component hoisting.
// Extracted from adapter.tsx so both the standalone adapter and the
// UniversalCanvas can share the same transform logic.

import type { Node } from "@/model/types";

// ---------------------------------------------------------------------------
// Compound layout constants
// ---------------------------------------------------------------------------

export const ARCH_LEAF_W = 220;
export const ARCH_LEAF_H = 90;
export const ARCH_GAP = 24;
export const ARCH_H_PAD = 20;
export const ARCH_V_PAD = 20;
export const ARCH_HEADER_H = 44;

// ---------------------------------------------------------------------------
// Compound layout — sizes containers bottom-up, positions children top-down
// ---------------------------------------------------------------------------

interface LayoutResult { node: Node; w: number; h: number }

export function compoundLayoutArchitecture(root: Node): Node {
  function layout(node: Node): LayoutResult {
    if (!node.children?.length) {
      const w = node.size?.width ?? ARCH_LEAF_W;
      const h = node.size?.height ?? ARCH_LEAF_H;
      return { node: { ...node, size: { width: w, height: h } }, w, h };
    }

    const childResults = node.children.map((c) => layout(c));
    const positioned: LayoutResult[] = [];
    const needsPlacement: LayoutResult[] = [];
    for (const cr of childResults) {
      (cr.node.position != null ? positioned : needsPlacement).push(cr);
    }

    let gridCy = ARCH_HEADER_H + ARCH_V_PAD;
    if (positioned.length > 0) {
      const lowestExisting = Math.max(...positioned.map(({ node: pn, h }) => (pn.position!.y) + h));
      gridCy = Math.max(gridCy, lowestExisting + ARCH_GAP);
    }

    const numCols = Math.ceil(Math.sqrt(Math.max(needsPlacement.length, 1)));
    let cx = ARCH_H_PAD, cy = gridCy, col = 0, rowH = 0;

    const newlyPlaced: LayoutResult[] = needsPlacement.map((cr) => {
      if (col > 0 && col % numCols === 0) { cx = ARCH_H_PAD; cy += rowH + ARCH_GAP; rowH = 0; }
      const placed: LayoutResult = { ...cr, node: { ...cr.node, position: { x: cx, y: cy } } };
      cx += cr.w + ARCH_GAP; rowH = Math.max(rowH, cr.h); col++;
      return placed;
    });

    const allResults = new Map([...positioned, ...newlyPlaced].map((cr) => [cr.node.id, cr]));
    const orderedChildren = node.children.map((c) => allResults.get(c.id)!);

    let maxX = 0, maxY = 0;
    for (const { node: cn, w: cw, h: ch } of orderedChildren) {
      maxX = Math.max(maxX, (cn.position?.x ?? 0) + cw);
      maxY = Math.max(maxY, (cn.position?.y ?? 0) + ch);
    }

    const size = {
      width: Math.max(maxX + ARCH_H_PAD, ARCH_LEAF_W * 2, node.size?.width ?? 0),
      height: Math.max(maxY + ARCH_V_PAD, ARCH_HEADER_H + ARCH_V_PAD * 2, node.size?.height ?? 0),
    };

    return {
      node: { ...node, size, children: orderedChildren.map((cr) => cr.node) },
      w: size.width, h: size.height,
    };
  }

  return layout(root).node;
}

// ---------------------------------------------------------------------------
// External-component hoisting
// ---------------------------------------------------------------------------

const CANVAS_ROOT_SUFFIX = "__canvas";

export function hoistExternalComponents(root: Node): Node {
  const collected: Node[] = [];
  const seenIds = new Set<string>();

  function strip(node: Node): Node {
    if (!node.children?.length) return node;
    let changed = false;
    const kept: Node[] = [];
    for (const child of node.children) {
      if (child.type === "ExternalComponent") {
        if (!seenIds.has(child.id)) { collected.push(child); seenIds.add(child.id); }
        changed = true;
      } else {
        const processed = strip(child);
        kept.push(processed);
        if (processed !== child) changed = true;
      }
    }
    return changed ? { ...node, children: kept } : node;
  }

  const stripped = strip(root);
  if (collected.length === 0) return root;

  const virtualRoot: Node = {
    id: root.id + CANVAS_ROOT_SUFFIX,
    label: root.label,
    type: root.type,
    metadata: root.metadata,
    schemaVersion: root.schemaVersion,
    viewport: root.viewport,
    createdAt: root.createdAt,
    updatedAt: root.updatedAt,
    children: [stripped, ...collected],
  };

  return virtualRoot;
}

// ---------------------------------------------------------------------------
// Composed transform — hoist + layout
// ---------------------------------------------------------------------------

export function applyArchitectureLayout(root: Node): Node {
  return compoundLayoutArchitecture(hoistExternalComponents(root));
}
