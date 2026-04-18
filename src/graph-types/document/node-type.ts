import type { NodeType } from "@/model/types";

export const DOCUMENT: NodeType = {
  id: "document",
  referenceTypes: {
    cites: { id: "cites", targetNodeTypes: ["document", "architecture"] },
    links_to: { id: "links_to", targetNodeTypes: ["document", "architecture"] },
  },
  nodeTypes: {
    section: {
      id: "section",
      referenceTypes: {
        cites: "cites",
        links_to: "links_to",
      },
      nodeTypes: {
        section: "section",
      },
    },
  },
};
