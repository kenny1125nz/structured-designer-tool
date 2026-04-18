// Chat strategy for workspace graphs.
// Workspace is a wrapper for other graph types, so chat strategy is minimal.
// It provides basic structure editing for workspace nodes.

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

interface CompactWorkspaceNode {
    id: string;
    label: string;
    type: string; // "workspace", "architecture", "document", "code", "hyperlink", "repository"
    description?: string;
    url?: string; // for hyperlink
    title?: string; // for hyperlink
    provider?: string; // for repository
    branch?: string; // for repository
    children?: CompactWorkspaceNode[];
    links_to?: string[]; // labels of linked nodes
}

interface CompactWorkspace {
    label: string;
    description?: string;
    nodes: CompactWorkspaceNode[];
}

// ---------------------------------------------------------------------------
// Node → compact
// ---------------------------------------------------------------------------

function nodeToCompact(root: Node): CompactWorkspace {
    const idToLabel = buildIdToLabelMap(root);

    function convert(node: Node): CompactWorkspaceNode {
        const links_to = (node.references ?? [])
            .filter((r) => r.type === "links_to")
            .map((r) => idToLabel.get(r.target))
            .filter((l): l is string => !!l);

        const children = (node.children ?? []).map(convert);

        const result: CompactWorkspaceNode = {
            id: node.id,
            label: node.label,
            type: node.type,
            ...(children.length > 0 ? { children } : {}),
            ...(links_to.length > 0 ? { links_to } : {}),
        };

        // Add type-specific metadata
        if (node.type === "hyperlink") {
            if (node.metadata?.url) result.url = node.metadata.url as string;
            if (node.metadata?.title) result.title = node.metadata.title as string;
        } else if (node.type === "repository") {
            if (node.metadata?.provider) result.provider = node.metadata.provider as string;
            if (node.metadata?.branch) result.branch = node.metadata.branch as string;
        }

        if (node.metadata?.description) {
            result.description = node.metadata.description as string;
        }

        return result;
    }

    return {
        label: root.label,
        ...(root.metadata?.description ? { description: root.metadata.description as string } : {}),
        nodes: (root.children ?? []).map(convert),
    };
}

// ---------------------------------------------------------------------------
// Compact → Node
// ---------------------------------------------------------------------------

function compactToNode(
    compact: CompactWorkspaceNode,
    labelToId: Map<string, string>,
    layoutByLabel: LayoutMap,
): Node {
    const id = labelToId.get(compact.label) ?? uuidv4();
    const children = (compact.children ?? []).map((c) => compactToNode(c, labelToId, layoutByLabel));
    const references = resolveRefs("links_to", compact.links_to, labelToId);

    const metadata: Record<string, unknown> = {};
    if (compact.description) metadata.description = compact.description;

    if (compact.type === "hyperlink") {
        if (compact.url) metadata.url = compact.url;
        if (compact.title) metadata.title = compact.title;
    } else if (compact.type === "repository") {
        if (compact.provider) metadata.provider = compact.provider;
        if (compact.branch) metadata.branch = compact.branch;
    }

    return {
        id,
        label: compact.label,
        type: compact.type,
        metadata,
        ...(children.length > 0 ? { children } : {}),
        ...(references.length > 0 ? { references } : {}),
        ...(layoutByLabel.get(compact.label) ?? {}),
    };
}

// ---------------------------------------------------------------------------
// Strategy
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a workspace structure assistant helping to refine a workspace graph.

A workspace is a hypergraph that can contain:
- architecture graphs (type: "architecture")
- document graphs (type: "document")  
- code graphs (type: "code")
- hyperlinks (type: "hyperlink") with url and title metadata
- repositories (type: "repository") with provider and branch metadata

Nodes can have "links_to" references to other nodes in the workspace.

The user may ask you to add, remove, or reorganize nodes in the workspace, update descriptions, or modify links.

Return ONLY a valid JSON object (no markdown, no code fences):
{
  "label": "string",
  "description": "string (optional)",
  "nodes": [
    {
      "id": "string (preserve original; new uuid for new nodes)",
      "label": "string",
      "type": "workspace|architecture|document|code|hyperlink|repository",
      "description": "string (optional)",
      "url": "string (optional, for hyperlink)",
      "title": "string (optional, for hyperlink)",
      "provider": "string (optional, for repository)",
      "branch": "string (optional, for repository)",
      "children": [],
      "links_to": ["label of linked node"]
    }
  ]
}
Preserve all nodes and relationships the user does not ask to remove.`;

export const workspaceChatStrategy: ChatStrategy = {
    systemPrompt: SYSTEM_PROMPT,

    buildContext(root: Node, _options?: ChatOptions): string {
        return `Workspace graph:\n${JSON.stringify(nodeToCompact(root), null, 2)}`;
    },

    applyResult(result: unknown, original: Node): Node {
        const compact = result as CompactWorkspace;
        const layoutByLabel = extractLayoutByLabel(original);
        const labelToId = new Map<string, string>();
        seedLabelToId(original, labelToId);
        for (const n of compact.nodes ?? []) assignCompactIds(n, labelToId);

        const children = (compact.nodes ?? []).map((n) =>
            compactToNode(n, labelToId, layoutByLabel),
        );

        return finaliseRoot(original, children, compact.label, {
            ...(compact.description !== undefined ? { description: compact.description } : {}),
        });
    },
};