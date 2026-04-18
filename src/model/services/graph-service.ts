// Graph service — business-level operations wrapping the DB layer

import { v4 as uuidv4 } from "uuid";
import type { Node } from "../types";
import {
  getAllGraphs,
  getGraph,
  putGraph,
  deleteGraph,
} from "../db/graphs";

export async function listGraphs(): Promise<Node[]> {
  return getAllGraphs();
}

export async function loadGraph(id: string): Promise<Node | undefined> {
  return getGraph(id);
}

export async function createGraph(label: string, type: string): Promise<Node> {
  const now = new Date().toISOString();
  const graph: Node = {
    id: uuidv4(),
    label,
    type,
    schemaVersion: "1.0.0",
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };
  await putGraph(graph);
  return graph;
}

export async function saveGraph(graph: Node): Promise<void> {
  const updated: Node = { ...graph, updatedAt: new Date().toISOString() };
  await putGraph(updated);
}

export async function removeGraph(id: string): Promise<void> {
  return deleteGraph(id);
}

/** Persist an imported Node document as a new root graph. */
export async function importGraph(node: Node): Promise<Node> {
  const now = new Date().toISOString();
  const graph: Node = {
    ...node,
    schemaVersion: "1.0.0",
    createdAt: node.createdAt ?? now,
    updatedAt: now,
  };
  await putGraph(graph);
  return graph;
}
