// Document layout — stacks sections vertically inside a compound container.
// Used by the UniversalCanvas when rendering document graphs as RF nodes.

import type { Node } from "@/model/types";

const SECTION_W = 320;
const SECTION_LEAF_H = 80;
const SECTION_CONTENT_LINE_H = 18;
const SECTION_CONTENT_PREVIEW_LINES = 3;
const GAP = 16;
const H_PAD = 16;
const V_PAD = 16;
const HEADER_H = 40;

function sectionHeight(node: Node): number {
  if (node.children?.length) return 0; // computed bottom-up
  const content = typeof node.metadata.content === "string" ? node.metadata.content : "";
  const previewLines = content ? Math.min(SECTION_CONTENT_PREVIEW_LINES, Math.ceil(content.length / 60)) : 0;
  return SECTION_LEAF_H + previewLines * SECTION_CONTENT_LINE_H;
}

interface LayoutResult { node: Node; w: number; h: number }

function layoutSection(node: Node): LayoutResult {
  if (!node.children?.length) {
    const h = sectionHeight(node);
    return { node: { ...node, size: { width: SECTION_W, height: h } }, w: SECTION_W, h };
  }

  // Container: stack children vertically
  const childResults = node.children.map((c) => layoutSection(c));
  let cy = HEADER_H + V_PAD;
  const newChildren = childResults.map((cr) => {
    const placed = { ...cr.node, position: { x: H_PAD, y: cy } };
    cy += cr.h + GAP;
    return placed;
  });

  const totalH = Math.max(cy + V_PAD, HEADER_H + V_PAD * 2, node.size?.height ?? 0);
  const totalW = Math.max(SECTION_W + H_PAD * 2, node.size?.width ?? 0);

  return {
    node: { ...node, size: { width: totalW, height: totalH }, children: newChildren },
    w: totalW, h: totalH,
  };
}

export function applyDocumentLayout(root: Node): Node {
  if (!root.children?.length) return root;

  // Lay out each top-level section
  const childResults = root.children.map((c) => layoutSection(c));
  let cy = HEADER_H + V_PAD;
  const newChildren = childResults.map((cr) => {
    const placed = { ...cr.node, position: { x: H_PAD, y: cy } };
    cy += cr.h + GAP;
    return placed;
  });

  const totalH = Math.max(cy + V_PAD, 200, root.size?.height ?? 0);
  const totalW = Math.max(SECTION_W + H_PAD * 2, 360, root.size?.width ?? 0);

  return {
    ...root,
    size: { width: totalW, height: totalH },
    children: newChildren,
  };
}
