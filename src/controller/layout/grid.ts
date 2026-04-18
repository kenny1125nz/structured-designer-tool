// Grid layout — uniform row/column placement (in-house, no external deps).

import type { Node } from "@/model/types";
import type { LayoutFn, LayoutPosition } from "./index";

function collectNodes(root: Node): Node[] {
  return [root, ...(root.children ?? []).flatMap(collectNodes)];
}

export const gridLayout: LayoutFn = (root, params) => {
  const {
    columns = 4,
    cellWidth = 200,
    cellHeight = 100,
  } = params;

  const allNodes = collectNodes(root);
  const positions = new Map<string, LayoutPosition>();

  allNodes.forEach((node, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    positions.set(node.id, {
      x: col * cellWidth,
      y: row * cellHeight,
    });
  });

  return positions;
};
