// Radial layout — center node plus concentric rings (in-house, no external deps).

import type { Node } from "@/model/types";
import type { LayoutFn, LayoutPosition } from "./index";

function collectNodes(root: Node): Node[] {
  return [root, ...(root.children ?? []).flatMap(collectNodes)];
}

function buildAdjacency(root: Node): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const node of collectNodes(root)) {
    if (!adj.has(node.id)) adj.set(node.id, new Set());
    for (const ref of node.references ?? []) {
      adj.get(node.id)!.add(ref.target);
    }
  }
  return adj;
}

export const radialLayout: LayoutFn = (root, params) => {
  const { ringSpacing = 120 } = params;

  const allNodes = collectNodes(root);
  const adj = buildAdjacency(root);
  const nodeIdSet = new Set(allNodes.map((n) => n.id));

  // BFS from root to assign rings
  const ringMap = new Map<string, number>();
  const queue: string[] = [root.id];
  ringMap.set(root.id, 0);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const ring = ringMap.get(current)!;
    for (const neighbor of adj.get(current) ?? []) {
      if (nodeIdSet.has(neighbor) && !ringMap.has(neighbor)) {
        ringMap.set(neighbor, ring + 1);
        queue.push(neighbor);
      }
    }
  }

  // Assign unvisited nodes to the last ring + 1
  const maxRing = Math.max(0, ...ringMap.values());
  for (const node of allNodes) {
    if (!ringMap.has(node.id)) {
      ringMap.set(node.id, maxRing + 1);
    }
  }

  // Group nodes by ring
  const rings = new Map<number, string[]>();
  for (const [id, ring] of ringMap) {
    if (!rings.has(ring)) rings.set(ring, []);
    rings.get(ring)!.push(id);
  }

  const positions = new Map<string, LayoutPosition>();

  for (const [ring, ids] of rings) {
    if (ring === 0) {
      positions.set(ids[0]!, { x: 0, y: 0 });
      continue;
    }
    const radius = ring * ringSpacing;
    ids.forEach((id, i) => {
      const angle = (2 * Math.PI * i) / ids.length;
      positions.set(id, {
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle),
      });
    });
  }

  return positions;
};
