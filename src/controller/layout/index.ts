// Layout interface — each strategy is a pure function with no side effects.

import type { Node, LayoutAlgorithm } from "@/model/types";

export interface LayoutPosition {
  x: number;
  y: number;
}

export interface LayoutParams {
  // Hierarchical (dagre)
  direction?: "TB" | "BT" | "LR" | "RL";
  rankSep?: number;
  nodeSep?: number;
  // Force-directed (d3-force)
  linkDistance?: number;
  charge?: number;
  iterations?: number;
  // Radial
  ringSpacing?: number;
  // Grid
  columns?: number;
  cellWidth?: number;
  cellHeight?: number;
}

export type LayoutFn = (
  root: Node,
  params: LayoutParams,
) => Map<string, LayoutPosition>;

import { hierarchicalLayout } from "./hierarchical";
import { forceLayout } from "./force";
import { radialLayout } from "./radial";
import { gridLayout } from "./grid";

const STRATEGIES: Record<LayoutAlgorithm, LayoutFn> = {
  hierarchical: hierarchicalLayout,
  force: forceLayout,
  radial: radialLayout,
  grid: gridLayout,
};

export function computeLayout(
  algorithm: LayoutAlgorithm,
  root: Node,
  params: LayoutParams = {},
): Map<string, LayoutPosition> {
  return STRATEGIES[algorithm](root, params);
}
