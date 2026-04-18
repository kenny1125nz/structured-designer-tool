// Code layout — ref resolution, line counts, heat scoring, compound layout.
// Extracted from adapter.tsx so both the standalone adapter and the
// UniversalCanvas can share the same transform logic.

import type { Node } from "@/model/types";

// ---------------------------------------------------------------------------
// Compound layout constants
// ---------------------------------------------------------------------------

export const CODE_LEAF_W = 200;
export const CODE_LEAF_H = 80;
export const CODE_GAP = 20;
export const CODE_H_PAD = 16;
export const CODE_V_PAD = 16;
export const CODE_HEADER_H = 40;

// ---------------------------------------------------------------------------
// Compound layout
// ---------------------------------------------------------------------------

interface LayoutResult { node: Node; w: number; h: number }

export function compoundLayoutCode(root: Node): Node {
  function layout(node: Node): LayoutResult {
    if (!node.children?.length) {
      const w = node.size?.width ?? CODE_LEAF_W;
      const h = node.size?.height ?? CODE_LEAF_H;
      return { node: { ...node, size: { width: w, height: h } }, w, h };
    }

    const childResults = node.children.map((c) => layout(c));
    const positioned: LayoutResult[] = [];
    const needsPlacement: LayoutResult[] = [];
    for (const cr of childResults) {
      (cr.node.position != null ? positioned : needsPlacement).push(cr);
    }

    let gridCy = CODE_HEADER_H + CODE_V_PAD;
    if (positioned.length > 0) {
      const lowestExisting = Math.max(...positioned.map(({ node: pn, h }) => (pn.position!.y) + h));
      gridCy = Math.max(gridCy, lowestExisting + CODE_GAP);
    }

    const numCols = Math.ceil(Math.sqrt(Math.max(needsPlacement.length, 1)));
    let cx = CODE_H_PAD, cy = gridCy, col = 0, rowH = 0;

    const newlyPlaced: LayoutResult[] = needsPlacement.map((cr) => {
      if (col > 0 && col % numCols === 0) { cx = CODE_H_PAD; cy += rowH + CODE_GAP; rowH = 0; }
      const placed: LayoutResult = { ...cr, node: { ...cr.node, position: { x: cx, y: cy } } };
      cx += cr.w + CODE_GAP; rowH = Math.max(rowH, cr.h); col++;
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
      width: Math.max(maxX + CODE_H_PAD, CODE_LEAF_W * 2, node.size?.width ?? 0),
      height: Math.max(maxY + CODE_V_PAD, CODE_HEADER_H + CODE_V_PAD * 2, node.size?.height ?? 0),
    };

    return {
      node: { ...node, size, children: orderedChildren.map((cr) => cr.node) },
      w: size.width, h: size.height,
    };
  }

  return layout(root).node;
}

// ---------------------------------------------------------------------------
// Reference-target resolution
// ---------------------------------------------------------------------------

export function resolveReferenceTargets(root: Node): Node {
  const labelToId = new Map<string, string>();
  const validIds = new Set<string>();

  function collect(node: Node) {
    labelToId.set(node.label, node.id);
    validIds.add(node.id);
    node.children?.forEach(collect);
  }
  collect(root);

  function resolve(node: Node): Node {
    const references = node.references
      ?.map((ref) => ({ ...ref, target: labelToId.get(ref.target) ?? ref.target }))
      .filter((ref) => validIds.has(ref.target));
    const children = node.children?.map(resolve);
    return {
      ...node,
      ...(references?.length ? { references } : { references: undefined }),
      ...(children ? { children } : {}),
    };
  }
  return resolve(root);
}

// ---------------------------------------------------------------------------
// Line-count aggregation
// ---------------------------------------------------------------------------

export function computeLineCounts(node: Node): { node: Node; lines: number } {
  if (node.type === "file") {
    const lines = typeof node.metadata.lineCount === "number" ? node.metadata.lineCount : 0;
    return { node, lines };
  }
  if (node.type === "entity" || node.type === "enum") {
    const lines = typeof node.metadata.lineCount === "number" ? node.metadata.lineCount : 0;
    return { node, lines };
  }
  if (!node.children?.length) return { node, lines: 0 };

  let total = 0;
  const updatedChildren = node.children.map((child) => {
    const { node: updatedChild, lines } = computeLineCounts(child);
    total += lines;
    return updatedChild;
  });

  return {
    node: { ...node, metadata: { ...node.metadata, lineCount: total }, children: updatedChildren },
    lines: total,
  };
}

// ---------------------------------------------------------------------------
// Heat scoring
// ---------------------------------------------------------------------------

function countSubtreeRefs(node: Node): number {
  let n = node.references?.length ?? 0;
  for (const c of node.children ?? []) n += countSubtreeRefs(c);
  return n;
}

interface HeatEntry { id: string; nodeType: "package" | "file"; isLeaf: boolean; lines: number; refs: number }

function collectHeatEntries(node: Node, out: HeatEntry[]) {
  if (node.type === "package" || node.type === "file") {
    const isLeaf = !(node.children ?? []).some((c) => c.type === "package");
    out.push({ id: node.id, nodeType: node.type, isLeaf, lines: typeof node.metadata.lineCount === "number" ? node.metadata.lineCount : 0, refs: countSubtreeRefs(node) });
  }
  for (const c of node.children ?? []) collectHeatEntries(c, out);
}

function applyHeatScores(node: Node, scores: Map<string, number>): Node {
  const score = scores.get(node.id);
  const updatedNode = score !== undefined ? { ...node, metadata: { ...node.metadata, heatScore: score } } : node;
  if (!updatedNode.children?.length) return updatedNode;
  return { ...updatedNode, children: updatedNode.children.map((c) => applyHeatScores(c, scores)) };
}

export function computeHeat(root: Node): Node {
  const entries: HeatEntry[] = [];
  collectHeatEntries(root, entries);
  if (entries.length === 0) return root;

  const files = entries.filter((e) => e.nodeType === "file");
  const leafPkgs = entries.filter((e) => e.nodeType === "package" && e.isLeaf);
  const allPkgs = entries.filter((e) => e.nodeType === "package");

  const maxFileLines = Math.max(...files.map((e) => e.lines), 1);
  const maxFileRefs = Math.max(...files.map((e) => e.refs), 1);
  const refPkgs = leafPkgs.length > 0 ? leafPkgs : allPkgs;
  const maxPkgLines = Math.max(...refPkgs.map((e) => e.lines), 1);
  const maxPkgRefs = Math.max(...refPkgs.map((e) => e.refs), 1);

  const scores = new Map<string, number>();
  for (const e of entries) {
    const [ml, mr] = e.nodeType === "file" ? [maxFileLines, maxFileRefs] : [maxPkgLines, maxPkgRefs];
    scores.set(e.id, Math.min(0.6 * (e.lines / ml) + 0.4 * (e.refs / mr), 1));
  }
  return applyHeatScores(root, scores);
}

// ---------------------------------------------------------------------------
// Heat colour helpers (exported for node components)
// ---------------------------------------------------------------------------

export function heatRgb(score: number): [number, number, number] {
  const s = Math.max(0, Math.min(1, score));
  const hue = s < 0.5 ? 120 - (120 - 38) * (s / 0.5) : 38 - 38 * ((s - 0.5) / 0.5);
  const sat = (88 + 12 * s) / 100;
  const lgt = (50 - 10 * s) / 100;
  const c = (1 - Math.abs(2 * lgt - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lgt - c / 2;
  let r = 0, g = 0, b = 0;
  if (hue < 60) { r = c; g = x; }
  else if (hue < 120) { r = x; g = c; }
  else if (hue < 180) { g = c; b = x; }
  else if (hue < 240) { g = x; b = c; }
  else if (hue < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

export function heatColor(score: number): string {
  const [r, g, b] = heatRgb(score);
  return `rgb(${r}, ${g}, ${b})`;
}

export function heatColorA(score: number, alpha: number): string {
  const [r, g, b] = heatRgb(score);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ---------------------------------------------------------------------------
// Composed transform
// ---------------------------------------------------------------------------

export function applyCodeLayout(root: Node): Node {
  const resolved = resolveReferenceTargets(root);
  const { node: withCounts } = computeLineCounts(resolved);
  const withHeat = computeHeat(withCounts);
  return compoundLayoutCode(withHeat);
}
