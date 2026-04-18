// Workspace layout — positions subgraph children as collapsed summary blocks
// (workspace-block) or, when expanded, as their native compound containers
// with the appropriate type-specific layout applied.

import type { Node } from "@/model/types";
import { applyDocumentLayout } from "@/graph-types/document/layout";
import { applyArchitectureLayout } from "@/graph-types/architecture/layout";
import { applyCodeLayout } from "@/graph-types/code/layout";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BLOCK_W = 240;    // collapsed workspace-block width
const BLOCK_H = 120;    // collapsed workspace-block height
const WS_GAP = 80;      // horizontal gap between sibling blocks / containers
const WS_H_PAD = 60;    // horizontal padding from workspace root edges
const WS_V_PAD = 80;    // vertical padding from workspace root edges (below header)
const WS_HEADER_H = 50; // estimated workspace root header height

// ---------------------------------------------------------------------------
// Per-type layout transforms applied to expanded children
// ---------------------------------------------------------------------------

const CHILD_TRANSFORMS: Record<string, (root: Node) => Node> = {
  document:     applyDocumentLayout,
  architecture: applyArchitectureLayout,
  code:         applyCodeLayout,
};

// ---------------------------------------------------------------------------
// applyWorkspaceLayout
// ---------------------------------------------------------------------------

/**
 * Transforms a workspace root for rendering:
 *   • Children not in `expandedIds` → workspace-block virtual node (collapsed)
 *   • Children in `expandedIds`     → their own type-specific layout applied
 *
 * Positions are preserved if already set on the child node; otherwise children
 * are arranged in a horizontal row.
 */
export function applyWorkspaceLayout(root: Node, expandedIds: Set<string>): Node {
  if (!root.children?.length) return root;

  // ---------------------------------------------------------------------------
  // Step 1 — transform each child
  // ---------------------------------------------------------------------------
  const items = root.children.map((child) => {
    const isExpanded = expandedIds.has(child.id);

    if (!isExpanded) {
      // Collapsed → virtual workspace-block node; strip children/refs so React
      // Flow treats it as a leaf (isContainer === false).
      const blockNode: Node = {
        ...child,
        type: "workspace-block",
        metadata: { ...child.metadata, _originalType: child.type },
        children: undefined,
        references: undefined,
        size: child.size ?? { width: BLOCK_W, height: BLOCK_H },
      };
      return { node: blockNode, w: BLOCK_W, h: BLOCK_H };
    }

    // Expanded → apply type-specific layout, keep as container
    const transform = CHILD_TRANSFORMS[child.type];
    const laid = transform ? transform(child) : child;
    const w = laid.size?.width ?? BLOCK_W;
    const h = laid.size?.height ?? BLOCK_H;
    return { node: laid, w, h };
  });

  // ---------------------------------------------------------------------------
  // Step 2 — position children (honour persisted position, auto-place the rest)
  // ---------------------------------------------------------------------------
  let autoCx = WS_H_PAD;
  const autoCy = WS_HEADER_H + WS_V_PAD;

  const placedChildren = items.map(({ node, w, h }) => {
    const hasPos = node.position != null;
    const pos = hasPos ? node.position! : { x: autoCx, y: autoCy };
    if (!hasPos) autoCx += w + WS_GAP;
    return {
      ...node,
      position: pos,
      size: node.size ?? { width: w, height: h },
    };
  });

  // ---------------------------------------------------------------------------
  // Step 3 — size the workspace root to contain all children
  // ---------------------------------------------------------------------------
  const finalMaxX = Math.max(...placedChildren.map((n) => (n.position?.x ?? 0) + (n.size?.width ?? 0)));
  const finalMaxY = Math.max(...placedChildren.map((n) => (n.position?.y ?? 0) + (n.size?.height ?? 0)));
  const totalW = Math.max(finalMaxX + WS_H_PAD, root.size?.width ?? 0, 600);
  const totalH = Math.max(finalMaxY + WS_V_PAD, root.size?.height ?? 0, 400);

  return {
    ...root,
    size: { width: totalW, height: totalH },
    children: placedChildren,
  };
}
