// Chat strategy for code graphs.
//
// Code graphs may hold multiple named versions (AST = raw static analysis,
// AI = LLM-reduced architectural summary) in metadata.versions.  The strategy
// sends all versions to the LLM as context but asks it to modify only the
// active version, keeping the AST untouched as ground truth.

import { v4 as uuidv4 } from "uuid";
import type { Node } from "@/model/types";
import type { ChatStrategy, ChatOptions } from "@/controller/ai/graph-chat";
import { extractLayoutByLabel, type LayoutMap } from "@/graph-types/chat-utils";

// ---------------------------------------------------------------------------
// Compact representation (packages + entities)
// ---------------------------------------------------------------------------

interface CompactEntity {
  id: string;
  label: string;
  kind: string;
}

interface CompactPackage {
  id: string;
  label: string;
  description?: string;
  entities: CompactEntity[];
  dependencies: string[]; // labels of packages this one depends on
}

interface CompactCodeGraph {
  label: string;
  description?: string;
  packages: CompactPackage[];
}

// ---------------------------------------------------------------------------
// Node children → compact
// ---------------------------------------------------------------------------

function childrenToCompact(rootLabel: string, children: Node[]): CompactCodeGraph {
  // Build id→label for resolving dependency references.
  const idToLabel = new Map<string, string>();
  function collectLabels(n: Node) {
    idToLabel.set(n.id, n.label);
    for (const c of n.children ?? []) collectLabels(c);
  }
  for (const n of children) collectLabels(n);

  const packages: CompactPackage[] = [];

  function collectPackages(node: Node) {
    if (node.type !== "package") return;

    const entities: CompactEntity[] = (node.children ?? [])
      .filter((c) => c.type === "entity" || c.type === "enum")
      .map((c) => ({
        id: c.id,
        label: c.label,
        kind: (c.metadata?.entityKind as string | undefined) ?? c.type,
      }));

    const dependencies = (node.references ?? [])
      .filter((r) => r.type === "depends")
      .map((r) => idToLabel.get(r.target))
      .filter((l): l is string => !!l);

    packages.push({
      id: node.id,
      label: node.label,
      description: node.metadata?.description as string | undefined,
      entities,
      dependencies,
    });

    for (const child of node.children ?? []) {
      if (child.type === "package") collectPackages(child);
    }
  }

  for (const child of children) collectPackages(child);
  return { label: rootLabel, packages };
}

// ---------------------------------------------------------------------------
// Compact → Node children
// ---------------------------------------------------------------------------

function compactToChildren(compact: CompactCodeGraph, originalChildren: Node[]): Node[] {
  const layoutByLabel: LayoutMap = extractLayoutByLabel(originalChildren);
  const pkgIdByLabel = new Map<string, string>();
  for (const pkg of compact.packages) pkgIdByLabel.set(pkg.label, uuidv4());

  return compact.packages.map((pkg) => {
    const id = pkgIdByLabel.get(pkg.label) ?? uuidv4();

    const entityNodes: Node[] = pkg.entities.map((e) => ({
      id: uuidv4(),
      label: e.label,
      type: e.kind === "enum" ? "enum" : "entity",
      metadata: { language: "typescript", entityKind: e.kind },
      ...(layoutByLabel.get(e.label) ?? {}),
    }));

    const references: Node["references"] = pkg.dependencies
      .filter((dep) => pkgIdByLabel.has(dep))
      .map((dep) => ({
        id: uuidv4(),
        type: "depends",
        target: pkgIdByLabel.get(dep)!,
        metadata: {},
      }));

    return {
      id,
      label: pkg.label,
      type: "package",
      metadata: {
        language: "typescript",
        ...(pkg.description ? { description: pkg.description } : {}),
      },
      ...(entityNodes.length > 0 ? { children: entityNodes } : {}),
      ...(references.length > 0 ? { references } : {}),
      ...(layoutByLabel.get(pkg.label) ?? {}),
    };
  });
}

// ---------------------------------------------------------------------------
// Strategy
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a software architecture assistant helping to refine a codebase graph.
You will receive the current working graph, and optionally an AST version as read-only ground-truth reference.
If an AST version is provided, do NOT modify it — only update the working graph.

The user may ask you to rename packages, merge or split packages, add or remove dependencies, group entities, or change descriptions.

Return ONLY the modified working graph as a JSON object:
{
  "label": "string",
  "description": "string",
  "packages": [
    {
      "id": "string (preserve original id when keeping; new uuid for new packages)",
      "label": "string",
      "description": "string",
      "entities": [{ "id": "string", "label": "string", "kind": "class|interface|enum|type|function|component" }],
      "dependencies": ["label of packages this one depends on"]
    }
  ]
}
Preserve all entities and packages the user does not ask to remove.`;

export const codeChatStrategy: ChatStrategy = {
  systemPrompt: SYSTEM_PROMPT,

  buildContext(root: Node, options?: ChatOptions): string {

    if (options?.includeSource) {
      // Include all versions so the LLM can cross-reference the AST.
      const nodes = root.children ?? [];
      const parts = nodes.map((v) => {
        const compact = childrenToCompact(root.label, v.children ?? []);
        return `== ${v.label}  ==\n${JSON.stringify(compact, null, 2)}`;
      });
      return `Graph: ${root.label}\n\n${parts.join("\n\n")}`;
    }

    // Default: only the active (working) version.
    const current = root.children?.filter((c) => c.label.includes("reduced")) ?? [];

    return `Graph: ${root.label}\n\n${JSON.stringify(childrenToCompact(root.label, current), null, 2)}`;
  },

  applyResult(result: unknown, original: Node): Node {
    const compact = result as CompactCodeGraph;
    const current = original.children ?? [];
    const reduced = current.filter((c) => c.label.includes("reduced"));

    const updatedChildren = compactToChildren(compact, reduced ?? []);

    const updatedVersions = current.map((v) =>
      v.label.includes("reduced") ? { ...v, children: updatedChildren } : v,
    );

    return {
      ...original,
      children: updatedChildren,
      metadata: {
        ...original.metadata,
        ...(updatedVersions.length > 0 ? { versions: updatedVersions } : {}),
      },
      updatedAt: new Date().toISOString(),
    };
  },
};
