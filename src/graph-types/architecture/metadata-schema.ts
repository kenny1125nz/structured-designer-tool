// Advisory JSON Schema (draft-07) for metadata fields, keyed by node-type id.
// Validation is never blocking — schemas are informational only.

const capabilitySchema = {
  type: "object",
  properties: {
    capability: { type: "string", description: "Capability name (e.g. OrderQuery)." },
    protocol: {
      type: "string",
      enum: ["HTTP", "gRPC", "Event", "SQL"],
      description: "Wire protocol.",
    },
    interfaceSchemaRef: {
      type: "string",
      description: "URI to the interface contract (e.g. schema://orders/query/v1).",
    },
  },
  required: ["capability", "protocol"],
  additionalProperties: true,
};

const componentMetadata = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    componentKind: {
      type: "string",
      enum: ["service", "storage", "gui", "worker", "gateway"],
      description: "Broad category of the component.",
    },
    exposes: {
      type: "array",
      items: capabilitySchema,
      description: "Capabilities this component exposes to other components.",
    },
  },
  additionalProperties: true,
};

export const ARCHITECTURE_METADATA_SCHEMAS: Record<string, object> = {
  architecture: {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {},
    additionalProperties: true,
  },

  InternalComponent: componentMetadata,
  ExternalComponent: componentMetadata,
};
