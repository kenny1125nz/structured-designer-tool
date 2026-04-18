import type { NodeType } from "@/model/types";
import { DOCUMENT } from "../document";

// Architecture graphs may carry two named versions in metadata.versions:
//   "Docs"         (viewType: "document")      — per-file document nodes
//   "Architecture" (viewType: "architecture")  — InternalComponent / ExternalComponent tree
//
// The active version's children are mirrored in root.children so the adapter
// can render them without knowing about versioning.

export const ARCHITECTURE: NodeType = {
  id: "architecture",
  referenceTypes: {},
  nodeTypes: {
    InternalComponent: {
      id: "InternalComponent",
      referenceTypes: {
        calls: {
          id: "calls",
          targetNodeTypes: ["InternalComponent", "ExternalComponent"],
        },
        implemented_by: { id: "implemented_by", targetNodeTypes: ["code"] },
      },
      nodeTypes: {
        InternalComponent: "InternalComponent",
        ExternalComponent: {
          id: "ExternalComponent",
          referenceTypes: {},
          nodeTypes: {},
        },
      },
    },
    document: DOCUMENT,
  },
};
