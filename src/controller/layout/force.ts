// Force-directed layout using d3-force (physics simulation).

import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import type { Node } from "@/model/types";
import type { LayoutFn, LayoutPosition } from "./index";

interface SimNode extends SimulationNodeDatum {
  id: string;
}

function collectNodes(root: Node): Node[] {
  return [root, ...(root.children ?? []).flatMap(collectNodes)];
}

function collectEdges(root: Node): Array<{ source: string; target: string }> {
  const edges = (root.references ?? []).map((ref) => ({
    source: root.id,
    target: ref.target,
  }));
  return [...edges, ...(root.children ?? []).flatMap(collectEdges)];
}

export const forceLayout: LayoutFn = (root, params) => {
  const {
    linkDistance = 100,
    charge = -300,
    iterations = 300,
  } = params;

  const allNodes = collectNodes(root);
  const allEdges = collectEdges(root);
  const nodeIdSet = new Set(allNodes.map((n) => n.id));

  const simNodes: SimNode[] = allNodes.map((n) => ({
    id: n.id,
    x: n.position?.x ?? Math.random() * 400,
    y: n.position?.y ?? Math.random() * 400,
  }));

  const nodeIndex = new Map(simNodes.map((n, i) => [n.id, i]));

  const simLinks: SimulationLinkDatum<SimNode>[] = allEdges
    .filter((e) => nodeIdSet.has(e.source) && nodeIdSet.has(e.target))
    .map((e) => ({
      source: nodeIndex.get(e.source)!,
      target: nodeIndex.get(e.target)!,
    }));

  const simulation = forceSimulation(simNodes)
    .force(
      "link",
      forceLink<SimNode, SimulationLinkDatum<SimNode>>(simLinks).distance(
        linkDistance,
      ),
    )
    .force("charge", forceManyBody().strength(charge))
    .force("center", forceCenter(0, 0))
    .stop();

  simulation.tick(iterations);

  const positions = new Map<string, LayoutPosition>();
  for (const n of simNodes) {
    positions.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 });
  }

  return positions;
};
