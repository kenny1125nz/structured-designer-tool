// Architecture analyzer — sends Markdown design documents to the LLM and
// converts the response into a versioned architecture Node tree.
//
// The resulting graph root has two versions stored in metadata.versions:
//   "Docs"         (viewType: "document")      — one document node per source file,
//                                                 built locally with the markdown parser
//   "Architecture" (viewType: "architecture")  — LLM-derived component graph
//
// The user can switch between views via the VersionSelector in the RightSidebar.

import { v4 as uuidv4 } from "uuid";
import type { Node } from "@/model/types";
import { assignCompactIds, resolveRefs } from "@/graph-types/chat-utils";
import type { FileEntry } from "../registry";
import { analyzeMarkdown } from "../document/analyzer";

// ---------------------------------------------------------------------------
// LLM spec types
// ---------------------------------------------------------------------------

interface CapabilitySpec {
  capability: string;
  protocol: "HTTP" | "gRPC" | "Event" | "SQL";
  interfaceSchemaRef?: string;
}

interface ComponentSpec {
  label: string;
  /** "InternalComponent" for systems the team owns; "ExternalComponent" for third-party. */
  type: "InternalComponent" | "ExternalComponent";
  kind?: "service" | "storage" | "gui" | "worker" | "gateway";
  description?: string;
  /** Capabilities this component exposes to other components. */
  exposes?: CapabilitySpec[];
  /** Nested sub-components (for grouped systems). */
  children?: ComponentSpec[];
  /** Labels of other components this one calls / depends on. */
  calls?: string[];
}

interface ArchitectureSpec {
  label: string;
  description?: string;
  components: ComponentSpec[];
}

// ---------------------------------------------------------------------------
// Spec → Node conversion
// ---------------------------------------------------------------------------

function specToNode(
  spec: ComponentSpec,
  labelToId: Map<string, string>,
): Node {
  const id = labelToId.get(spec.label) ?? uuidv4();
  const children = (spec.children ?? []).map((c) => specToNode(c, labelToId));
  const references = resolveRefs("calls", spec.calls, labelToId);

  return {
    id,
    label: spec.label,
    type: spec.type,
    metadata: {
      ...(spec.kind ? { componentKind: spec.kind } : {}),
      ...(spec.description ? { description: spec.description } : {}),
      ...(spec.exposes?.length ? { exposes: spec.exposes } : {}),
    },
    ...(children.length > 0 ? { children } : {}),
    ...(references.length > 0 ? { references } : {}),
  };
}

function specToChildren(spec: ArchitectureSpec): Node[] {
  const labelToId = new Map<string, string>();
  for (const c of spec.components ?? []) assignCompactIds(c, labelToId);
  return (spec.components ?? []).map((c) => specToNode(c, labelToId));
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a software architecture analyst. Read the provided design documents and extract a structured system architecture graph.

Identify:
1. Internal components — services, modules, or subsystems the team owns
2. External components — third-party services, libraries, or external APIs
3. Communication relationships (who calls / depends on whom)
4. Natural groupings / nesting (subsystems inside a larger system)

For each component determine:
- label: short, descriptive name (e.g. "Order Service", "PostgreSQL", "Stripe API")
- type: "InternalComponent" | "ExternalComponent"
- kind: "service" | "storage" | "gui" | "worker" | "gateway"
- description: one sentence explaining what it does
- exposes: capabilities it provides to others (optional)
- calls: labels of components it communicates with (outgoing dependencies)
- children: nested sub-components if this is a grouped system

Return ONLY a valid JSON object (no markdown, no code fences):
{
  "label": "project or system name",
  "description": "one-sentence summary of the overall system",
  "components": [
    {
      "label": "string",
      "type": "InternalComponent|ExternalComponent",
      "kind": "service|storage|gui|worker|gateway",
      "description": "string",
      "exposes": [
        { "capability": "string", "protocol": "HTTP|gRPC|Event|SQL" }
      ],
      "children": [],
      "calls": ["label of called component"]
    }
  ]
}`;

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Analyses Markdown architecture documents and returns a versioned
 * architecture graph root.
 *

 * root.children reflects the Architecture version (the default active view).
 */
export async function analyzeArchitectureMarkdown(sources: FileEntry[]): Promise<Node> {
  const { callAi } = await import("@/controller/ai/client");
  const now = new Date().toISOString();

  // ── Docs view: parse each file locally (no LLM) ────────────────────────
  const docNodes = await Promise.all(
    sources.map(async (f) => {
      let doc = await analyzeMarkdown(f);
      return doc.label === "Untitled Document" ? { ...doc, label: f.name } : { ...doc, label: `${f.name}: ${doc.label}` };
    }),
  );

  // ── Architecture view: send combined content to LLM ────────────────────
  const combinedContent = sources
    .map((f) => `# ${f.name}\n\n${f.content.trim()}`)
    .join("\n\n---\n\n");

  const spec = await callAi<ArchitectureSpec>(SYSTEM_PROMPT, combinedContent);
  const archChildren = specToChildren(spec);

  const archNode: Node = {
    id: uuidv4(),
    label: "arch:" + spec.label,
    type: "architecture",
    schemaVersion: "1.0.0",
    metadata: {
      ...(spec.description ? { description: spec.description } : {}),
    },
    children: archChildren,
    createdAt: now,
    updatedAt: now,
  };

  return {
    id: uuidv4(),
    label: spec.label || "Untitled Architecture",
    type: "architecture",
    schemaVersion: "1.0.0",
    metadata: {
    },
    children: [archNode, ...docNodes],
  };
}


export async function analyzeArchitectureFromMarkdowns(sources: FileEntry[]): Promise<Node> {
  const { callAi } = await import("@/controller/ai/client");
  const now = new Date().toISOString();

  const combinedContent = sources
    .map((f) => `# ${f.name}\n\n${f.content.trim()}`)
    .join("\n\n---\n\n");

  const spec = await callAi<ArchitectureSpec>(SYSTEM_PROMPT, combinedContent);
  const archChildren = specToChildren(spec);

  return {
    id: uuidv4(),
    label: "arch:" + spec.label,
    type: "architecture",
    schemaVersion: "1.0.0",
    metadata: {
      ...(spec.description ? { description: spec.description } : {}),
    },
    children: archChildren,
    createdAt: now,
    updatedAt: now,
  };
}
