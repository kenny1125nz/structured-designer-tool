// Advisory JSON Schema (draft-07) for metadata fields, keyed by node-type id.
// Validation is never blocking — schemas are informational only.

export const WORKSPACE_METADATA_SCHEMAS: Record<string, object> = {
    workspace: {
        $schema: "http://json-schema.org/draft-07/schema#",
        type: "object",
        properties: {},
        additionalProperties: true,
    },

    hyperlink: {
        $schema: "http://json-schema.org/draft-07/schema#",
        type: "object",
        properties: {
            url: {
                type: "string",
                format: "uri",
                description: "The URL this hyperlink points to.",
            },
            title: {
                type: "string",
                description: "Optional display title for the hyperlink.",
            },
            description: {
                type: "string",
                description: "Optional description of what the link references.",
            },
        },
        additionalProperties: true,
    },

    repository: {
        $schema: "http://json-schema.org/draft-07/schema#",
        type: "object",
        properties: {
            url: {
                type: "string",
                format: "uri",
                description: "URL of the repository (e.g., https://github.com/user/repo).",
            },
            provider: {
                type: "string",
                enum: ["github", "gitlab", "bitbucket", "azure-devops", "other"],
                description: "Git hosting provider.",
            },
            branch: {
                type: "string",
                description: "Default branch name (e.g., main, master).",
            },
            commitHash: {
                type: "string",
                pattern: "^[a-f0-9]{7,40}$",
                description: "Latest commit hash (short or full).",
            },
        },
        additionalProperties: true,
    },
};