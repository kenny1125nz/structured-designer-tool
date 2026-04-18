// Chat strategy for architecture graphs.
//
// When the graph has named versions (Docs + Architecture), the strategy always
// reads from and writes to the "Architecture" version regardless of which view
// the user is currently looking at.  The "Docs" version content is included as
// read-only context so the AI can cross-reference the source documents.

import { v4 as uuidv4 } from "uuid";
import type { Node } from "@/model/types";
import type { ChatStrategy, ChatOptions } from "@/controller/ai/graph-chat";
import {
  extractLayoutByLabel,
  buildIdToLabelMap,
  seedLabelToId,
  assignCompactIds,
  resolveRefs,
  finaliseRoot,
  type LayoutMap,
} from "@/graph-types/chat-utils";


// ---------------------------------------------------------------------------
// Compact representation
// ---------------------------------------------------------------------------

interface CompactComponent {
  id: string;
  label: string;
  type: string; // "InternalComponent" | "ExternalComponent"
  kind?: string;
  description?: string;
  children?: CompactComponent[];
  calls?: string[]; // labels of called components
}

interface CompactArchitecture {
  label: string;
  description?: string;
  components: CompactComponent[];
}

// ---------------------------------------------------------------------------
// Node → compact
// ---------------------------------------------------------------------------

function nodeToCompact(root: Node): CompactArchitecture {
  const idToLabel = buildIdToLabelMap(root.children ?? []);

  function convert(node: Node): CompactComponent {
    const calls = (node.references ?? [])
      .filter((r) => r.type === "calls")
      .map((r) => idToLabel.get(r.target))
      .filter((l): l is string => !!l);

    const children = (node.children ?? [])
      .filter((c) => c.type === "InternalComponent" || c.type === "ExternalComponent")
      .map(convert);

    return {
      id: node.id,
      label: node.label,
      type: node.type,
      ...(node.metadata?.componentKind ? { kind: node.metadata.componentKind as string } : {}),
      ...(node.metadata?.description ? { description: node.metadata.description as string } : {}),
      ...(children.length > 0 ? { children } : {}),
      ...(calls.length > 0 ? { calls } : {}),
    };
  }

  return {
    label: root.label,
    ...(root.metadata?.description ? { description: root.metadata.description as string } : {}),
    components: (root.children ?? []).map(convert),
  };
}

// ---------------------------------------------------------------------------
// Compact → Node
// ---------------------------------------------------------------------------

function compactToNode(
  compact: CompactComponent,
  labelToId: Map<string, string>,
  layoutByLabel: LayoutMap,
): Node {
  const id = labelToId.get(compact.label) ?? uuidv4();
  const children = (compact.children ?? []).map((c) => compactToNode(c, labelToId, layoutByLabel));
  const references = resolveRefs("calls", compact.calls, labelToId);

  return {
    id,
    label: compact.label,
    type: compact.type,
    metadata: {
      ...(compact.kind ? { componentKind: compact.kind } : {}),
      ...(compact.description ? { description: compact.description } : {}),
    },
    ...(children.length > 0 ? { children } : {}),
    ...(references.length > 0 ? { references } : {}),
    ...(layoutByLabel.get(compact.label) ?? {}),
  };
}

// ---------------------------------------------------------------------------
// Brief text summary of a document node (for AI context)
// ---------------------------------------------------------------------------

function docNodeSummary(node: Node, depth = 0): string {
  const indent = "  ".repeat(depth);
  const lines: string[] = [`${indent}## ${node.label}`];
  if (node.metadata?.content && typeof node.metadata.content === "string") {
    lines.push(`${indent}${node.metadata.content.slice(0, 200).replace(/\n+/g, " ")}`);
  }
  for (const child of node.children ?? []) {
    lines.push(docNodeSummary(child, depth + 1));
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Strategy
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a software architecture assistant helping to refine a system architecture graph.

The graph contains components of two kinds:
- InternalComponent: systems, services, or modules owned by the team
- ExternalComponent: third-party dependencies or external services

Each component can have:
- type: "InternalComponent" | "ExternalComponent"
- kind: "service" | "storage" | "gui" | "worker" | "gateway"
- description: what the component does
- children: nested sub-components
- calls: list of labels of components this one communicates with

The user may ask you to rename components, change kinds, add or remove calls relationships, group components into a parent, split a component, or update descriptions.

Return ONLY a valid JSON object (no markdown, no code fences):
{
  "label": "string",
  "description": "string (optional)",
  "components": [
    {
      "id": "string (preserve original; new uuid for new components)",
      "label": "string",
      "type": "InternalComponent|ExternalComponent",
      "kind": "service|storage|gui|worker|gateway (optional)",
      "description": "string (optional)",
      "children": [],
      "calls": ["label of called component"]
    }
  ]
}
Preserve all components and relationships the user does not ask to remove.`;

export const architectureChatStrategy: ChatStrategy = {
  systemPrompt: SYSTEM_PROMPT,

  buildContext(root: Node, options?: ChatOptions): string {
    const archOnly = root.children?.find((c) => c.type === "architecture");
    if (!archOnly) throw new Error("Architecture graph is missing");

    let ctx = `Architecture graph:\n${JSON.stringify(nodeToCompact(archOnly), null, 2)}`;

    // Append document summaries only when explicitly requested
    if (options?.includeSource) {
      const docs = root.children?.filter((c) => c.type === "document") ?? [];
      const docSummaries = docs.map((d) => docNodeSummary(d)).join("\n\n");
      ctx += `\n\nSource Documents (read-only reference):\n${docSummaries}`;
    }

    return ctx;
  },

  applyResult(result: unknown, original: Node): Node {
    const compact = result as CompactArchitecture;

    // Build updated architecture children (layout-preserving)
    const layoutByLabel = extractLayoutByLabel(original);
    const labelToId = new Map<string, string>();
    seedLabelToId(original, labelToId);
    for (const c of compact.components ?? []) assignCompactIds(c, labelToId);
    const newArchChildren = (compact.components ?? []).map((c) =>
      compactToNode(c, labelToId, layoutByLabel),
    );

    const archOnly = original.children?.find((c) => c.type === "architecture");

    if (archOnly) {

      // Persist current view's children back into its version entry (preserves
      // layout edits the user made while in the Docs view)
      const children = original.children ?? [] as Node[];
      const updatedChildren = children.map((v) => {
        if (v.type === "architecture") return { ...v, children: newArchChildren };
        return v;
      });

      return {
        ...original,
        label: compact.label ?? original.label,
        // Only update root.children if the architecture view is active
        children: updatedChildren,
        metadata: {
          ...original.metadata,
          ...(compact.description !== undefined ? { description: compact.description } : {}),
        },
        updatedAt: new Date().toISOString(),
      };
    }
    // Fallback: no versioning — update root.children directly
    return finaliseRoot(original, newArchChildren, compact.label, {
      ...(compact.description !== undefined ? { description: compact.description } : {}),
    });
  },
};
