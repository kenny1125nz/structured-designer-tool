import type { NodeType } from "@/model/types";
import { ARCHITECTURE } from "../architecture";

export const CODE: NodeType = {
  id: "code",
  referenceTypes: {},
  nodeTypes: {
    package: {
      id: "package",
      referenceTypes: {},
      nodeTypes: {
        package: "package",
        entity: {
          id: "entity",
          referenceTypes: {
            extends: { id: "extends", targetNodeTypes: ["entity"] },
            implements: { id: "implements", targetNodeTypes: ["entity"] },
          },
          nodeTypes: {
            method: {
              id: "method",
              referenceTypes: {
                calls: { id: "calls", targetNodeTypes: ["method"] },
                returns: {
                  id: "returns",
                  targetNodeTypes: ["entity", "enum", "primitive_type", "method"],
                },
              },
              nodeTypes: {
                parameter: {
                  id: "parameter",
                  referenceTypes: {
                    type_of: {
                      id: "type_of",
                      targetNodeTypes: ["entity", "enum", "primitive_type", "method"],
                    },
                  },
                  nodeTypes: {},
                },
              },
            },
            constructor: "method",
            property: {
              id: "property",
              referenceTypes: {
                type_of: {
                  id: "type_of",
                  targetNodeTypes: ["entity", "enum", "primitive_type"],
                },
              },
              nodeTypes: {},
            },
          },
        },
        enum: {
          id: "enum",
          referenceTypes: {},
          nodeTypes: {
            enum_member: {
              id: "enum_member",
              referenceTypes: {},
              nodeTypes: {},
            },
          },
        },
        file: {
          id: "file",
          referenceTypes: {
            imports: {
              id: "imports",
              targetNodeTypes: ["entity", "enum", "library"],
            },
          },
          nodeTypes: {
            entity: "entity",
            enum: "enum",
          },
        },
        library: {
          id: "library",
          referenceTypes: {},
          nodeTypes: {},
        },
        primitive_type: {
          id: "primitive_type",
          referenceTypes: {},
          nodeTypes: {},
        },
      },
    },
    code: 'code',
    architecture: ARCHITECTURE,
  },
};


