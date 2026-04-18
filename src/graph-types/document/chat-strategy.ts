// Chat strategy for document graphs.

import { v4 as uuidv4 } from "uuid";
import type { Node } from "@/model/types";
import type { ChatStrategy } from "@/controller/ai/graph-chat";
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

interface CompactSection {
  id: string;
  label: string;
  summary?: string;
  content?: string;
  children?: CompactSection[];
  cites?: string[];    // labels of cited sections
  links_to?: string[]; // labels of linked sections
}

interface CompactDocument {
  label: string;
  description?: string;
  status?: string;
  sections: CompactSection[];
}

// ---------------------------------------------------------------------------
// Node → compact
// ---------------------------------------------------------------------------

function nodeToCompact(root: Node): CompactDocument {
  const idToLabel = buildIdToLabelMap(root);

  function convert(node: Node): CompactSection {
    const cites = (node.references ?? [])
      .filter((r) => r.type === "cites")
      .map((r) => idToLabel.get(r.target))
      .filter((l): l is string => !!l);

    const links_to = (node.references ?? [])
      .filter((r) => r.type === "links_to")
      .map((r) => idToLabel.get(r.target))
      .filter((l): l is string => !!l);

    const children = (node.children ?? []).map(convert);

    return {
      id: node.id,
      label: node.label,
      ...(node.metadata?.summary ? { summary: node.metadata.summary as string } : {}),
      ...(node.metadata?.content ? { content: node.metadata.content as string } : {}),
      ...(children.length > 0 ? { children } : {}),
      ...(cites.length > 0 ? { cites } : {}),
      ...(links_to.length > 0 ? { links_to } : {}),
    };
  }

  return {
    label: root.label,
    ...(root.metadata?.description ? { description: root.metadata.description as string } : {}),
    ...(root.metadata?.status ? { status: root.metadata.status as string } : {}),
    sections: (root.children ?? []).map(convert),
  };
}

// ---------------------------------------------------------------------------
// Compact → Node
// ---------------------------------------------------------------------------

function compactToNode(
  compact: CompactSection,
  labelToId: Map<string, string>,
  layoutByLabel: LayoutMap,
): Node {
  const id = labelToId.get(compact.label) ?? uuidv4();
  const children = (compact.children ?? []).map((c) => compactToNode(c, labelToId, layoutByLabel));
  const references = [
    ...resolveRefs("cites", compact.cites, labelToId),
    ...resolveRefs("links_to", compact.links_to, labelToId),
  ];

  return {
    id,
    label: compact.label,
    type: "section",
    metadata: {
      ...(compact.summary ? { summary: compact.summary } : {}),
      ...(compact.content ? { content: compact.content } : {}),
    },
    ...(children.length > 0 ? { children } : {}),
    ...(references.length > 0 ? { references } : {}),
    ...(layoutByLabel.get(compact.label) ?? {}),
  };
}

// ---------------------------------------------------------------------------
// Strategy
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a document structure assistant helping to refine a structured document graph.

The document contains nested sections, each of which may have:
- label: the section title
- summary: a one-line overview (shown in collapsed views)
- content: full prose text of the section
- children: sub-sections
- cites: labels of sections this one references as citations
- links_to: labels of related sections this one links to navigationally

The user may ask you to rename sections, add or edit content or summaries, reorganize the hierarchy, add or remove cross-references, split or merge sections.

Return ONLY the modified document as a JSON object:
{
  "label": "string",
  "description": "string (optional)",
  "status": "string (optional, e.g. Draft, MVP, Stable)",
  "sections": [
    {
      "id": "string (preserve original; new uuid for new sections)",
      "label": "string",
      "summary": "string (optional)",
      "content": "string (optional)",
      "children": [...],
      "cites": ["label of cited section"],
      "links_to": ["label of linked section"]
    }
  ]
}
Preserve all sections and references the user does not ask to remove.`;

export const documentChatStrategy: ChatStrategy = {
  systemPrompt: SYSTEM_PROMPT,

  buildContext(root: Node, _options?: import("@/controller/ai/graph-chat").ChatOptions): string {
    return `Document graph:\n${JSON.stringify(nodeToCompact(root), null, 2)}`;
  },

  applyResult(result: unknown, original: Node): Node {
    const compact = result as CompactDocument;
    const layoutByLabel = extractLayoutByLabel(original);
    const labelToId = new Map<string, string>();
    seedLabelToId(original, labelToId);
    for (const s of compact.sections ?? []) assignCompactIds(s, labelToId);

    const children = (compact.sections ?? []).map((s) =>
      compactToNode(s, labelToId, layoutByLabel),
    );

    return finaliseRoot(original, children, compact.label, {
      ...(compact.description !== undefined ? { description: compact.description } : {}),
      ...(compact.status !== undefined ? { status: compact.status } : {}),
    });
  },
};
