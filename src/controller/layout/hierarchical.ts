// Hierarchical layout using Dagre (rank-based).

import dagre from "@dagrejs/dagre";
import type { Node } from "@/model/types";
import type { LayoutFn, LayoutPosition } from "./index";

function collectNodes(root: Node): Node[] {
  return [root, ...(root.children ?? []).flatMap(collectNodes)];
}

function collectEdges(
  root: Node,
): Array<{ source: string; target: string }> {
  const edges = (root.references ?? []).map((ref) => ({
    source: root.id,
    target: ref.target,
  }));
  const childEdges = (root.children ?? []).flatMap(collectEdges);
  return [...edges, ...childEdges];
}

export const hierarchicalLayout: LayoutFn = (root, params) => {
  const {
    direction = "TB",
    rankSep = 80,
    nodeSep = 50,
  } = params;

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: direction, ranksep: rankSep, nodesep: nodeSep });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of collectNodes(root)) {
    const w = node.size?.width ?? 160;
    const h = node.size?.height ?? 40;
    g.setNode(node.id, { width: w, height: h });
  }

  for (const { source, target } of collectEdges(root)) {
    if (g.hasNode(source) && g.hasNode(target)) {
      g.setEdge(source, target);
    }
  }

  dagre.layout(g);

  const positions = new Map<string, LayoutPosition>();
  for (const nodeId of g.nodes()) {
    const { x, y } = g.node(nodeId);
    positions.set(nodeId, { x, y });
  }

  return positions;
};
