// Advisory JSON Schema (draft-07) for metadata fields, keyed by node-type id.
// Validation is never blocking — schemas are informational only.

export const DOCUMENT_METADATA_SCHEMAS: Record<string, object> = {
  document: {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {
      documentKind: {
        type: "string",
        enum: ["doc", "section", "note"],
        description: "Coarse category of the document.",
      },
      status: {
        type: "string",
        description: "Lifecycle status (e.g. Draft, MVP, Stable).",
      },
      date: {
        type: "string",
        format: "date",
        description: "Authoring or last-review date (YYYY-MM-DD).",
      },
    },
    additionalProperties: true,
  },

  section: {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {
      content: {
        type: "string",
        description: "Full prose text of the section.",
      },
      summary: {
        type: "string",
        description: "One-line summary for collapsed views.",
      },
    },
    additionalProperties: true,
  },
};
