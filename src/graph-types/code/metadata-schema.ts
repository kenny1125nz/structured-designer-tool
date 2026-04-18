// Advisory JSON Schema (draft-07) for metadata fields, keyed by node-type id.
// Validation is never blocking — schemas are informational only.

const LANGUAGES = ["java", "csharp", "typescript", "python"] as const;
const VISIBILITIES = ["public", "protected", "private", "internal"] as const;

const languageProperty = {
  type: "string",
  enum: LANGUAGES,
  description: "Implementation language of this element.",
};

const visibilityProperty = {
  type: "string",
  enum: VISIBILITIES,
  description: "Access modifier.",
};

export const CODE_METADATA_SCHEMAS: Record<string, object> = {
  code: {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {},
    additionalProperties: true,
  },

  package: {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {
      language: languageProperty,
    },
    additionalProperties: true,
  },

  file: {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {
      language: languageProperty,
      lineCount: {
        type: "integer",
        minimum: 0,
        description: "Total number of lines in the source file.",
      },
    },
    additionalProperties: true,
  },

  entity: {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {
      language: languageProperty,
      entityKind: {
        type: "string",
        enum: ["class", "interface"],
        description: "Whether this entity is a class or an interface.",
      },
      visibility: visibilityProperty,
      abstract: { type: "boolean" },
      signature: {
        type: "string",
        description: "Optional textual signature for display or search.",
      },
      startLine: {
        type: "integer",
        minimum: 1,
        description: "1-indexed line where this declaration starts in the source file.",
      },
      endLine: {
        type: "integer",
        minimum: 1,
        description: "1-indexed line where this declaration ends in the source file.",
      },
      lineCount: {
        type: "integer",
        minimum: 1,
        description: "Number of source lines this declaration spans (endLine - startLine + 1).",
      },
    },
    additionalProperties: true,
  },

  method: {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {
      language: languageProperty,
      visibility: visibilityProperty,
      static: { type: "boolean" },
      abstract: { type: "boolean" },
      signature: { type: "string" },
    },
    additionalProperties: true,
  },

  property: {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {
      language: languageProperty,
      visibility: visibilityProperty,
      static: { type: "boolean" },
      signature: { type: "string" },
    },
    additionalProperties: true,
  },

  parameter: {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {
      language: languageProperty,
      signature: { type: "string" },
    },
    additionalProperties: true,
  },

  enum: {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {
      language: languageProperty,
      startLine: {
        type: "integer",
        minimum: 1,
        description: "1-indexed line where this enum starts in the source file.",
      },
      endLine: {
        type: "integer",
        minimum: 1,
        description: "1-indexed line where this enum ends in the source file.",
      },
      lineCount: {
        type: "integer",
        minimum: 1,
        description: "Number of source lines this enum spans.",
      },
    },
    additionalProperties: true,
  },

  enum_member: {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {
      value: {
        description: "Explicit enum member value, if any.",
      },
    },
    additionalProperties: true,
  },

  library: {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {
      language: languageProperty,
      version: { type: "string" },
      packageName: { type: "string" },
    },
    additionalProperties: true,
  },

  primitive_type: {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {
      language: languageProperty,
    },
    additionalProperties: true,
  },
};
