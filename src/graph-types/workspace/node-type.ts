import type { NodeType } from "@/model/types";

export const WORKSPACE: NodeType = {
  id: "workspace",
  referenceTypes: {
    links_to: { id: "links_to", targetNodeTypes: ["hyperlink"] },
    repository: { id: "repository", targetNodeTypes: ["repository"] },
  },
  nodeTypes: {
    architecture: "architecture",
    document: "document",
    code: "code",
    hyperlink: {
      id: "hyperlink",
      referenceTypes: {},
      nodeTypes: {}
    },
    repository: {
      id: "repository",
      referenceTypes: {},
      nodeTypes: {}
    },
  },
};
