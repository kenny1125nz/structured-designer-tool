// AI-assisted editing — operates on node/reference content only.

import type { Node, Reference } from "@/model/types";
import { generatePatch } from "./client";

export interface NodePatch {
  label?: string;
  type?: string;
  metadata?: Record<string, unknown>;
}

export interface ReferencePatch {
  label?: string;
  type?: string;
  target?: string;
  metadata?: Record<string, unknown>;
}

export type Patch = { kind: "node"; patch: NodePatch } | { kind: "reference"; patch: ReferencePatch };

export async function generatePatchForNode(
  prompt: string,
  node: Node,
): Promise<NodePatch> {
  return generatePatch(prompt, { kind: "node", target: node });
}

export async function generatePatchForReference(
  prompt: string,
  reference: Reference,
): Promise<ReferencePatch> {
  return generatePatch(prompt, { kind: "reference", target: reference });
}
