// Workspace analyzer — creates a workspace node containing document, architecture, and code graphs.
// Workspace analyzes provided markdown files for document/architecture analysis
// and attempts to analyze the code base if in Node.js environment.

import { v4 as uuidv4 } from "uuid";
import type { Node } from "@/model/types";
import type { FileEntry } from "../registry";
import { analyzeMarkdown } from "../document/analyzer";
import { analyzeArchitectureFromMarkdowns } from "../architecture/analyzer";
const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown", ".txt", ".rst", ".yaml", ".yml"]);

/**
 * Creates a workspace graph node by analyzing markdown files and optionally code base.
 * 1. Parses each markdown file to a document node as child of workspace root node
 * 2. Uses the architecture analyzer to generate an architecture node from the same markdown files
 * 3. Attempts to analyze code base to create a code node (Node.js environment only)
 * 4. Returns workspace root node with all available children
 */
export async function analyzeWorkspace(sources: FileEntry[]): Promise<Node> {
    const markdownEntries: FileEntry[] = sources.filter((s) => {
        console.log(`Checking file ${s.name} for markdown analysis`);
        const ext = s.name.split(".").pop()?.toLowerCase() ?? "";
        return MARKDOWN_EXTENSIONS.has(ext);
    });
    const codeFiles = new Map<string, string>();
    for (const s of sources) {
        const ext = s.name.split(".").pop()?.toLowerCase() ?? "";
        if (!MARKDOWN_EXTENSIONS.has(ext)) {
            codeFiles.set(s.name, s.content);
        }
    }
    return await analyzeWorkspaceFromFiles(markdownEntries, codeFiles, "Workspace");
}

// ---------------------------------------------------------------------------
// Workspace analysis from a folder / zip file (browser-native)
// ---------------------------------------------------------------------------


/**
 * Analyses a workspace from a flat map of file paths → contents (extracted
 * from a dropped folder or zip archive).  Separates markdown files (used for
 * document + architecture analysis) from source-code files (used for code
 * analysis) and combines the results into a single workspace node.
 */
export async function analyzeWorkspaceFromFileMap(
    files: Map<string, string>,
    name: string,
): Promise<Node> {
    console.log(`Received ${files.size} files for workspace analysis`);
    const markdownEntries: FileEntry[] = [];
    const codeFiles = new Map<string, string>();

    for (const [path, content] of files) {
        const dotIndex = path.lastIndexOf(".");
        const ext = dotIndex !== -1 ? path.slice(dotIndex).toLowerCase() : "";
        if (MARKDOWN_EXTENSIONS.has(ext)) {
            markdownEntries.push({ name: path, content });
        } else {
            codeFiles.set(path, content);
        }
    }

    return await analyzeWorkspaceFromFiles(markdownEntries, codeFiles, name);
}


async function analyzeWorkspaceFromFiles(markdownEntries: FileEntry[], codeFiles: Map<string, string>, name: string): Promise<Node> {
    const now = new Date().toISOString();


    const documentNodes = await Promise.all(markdownEntries.map((entry) => analyzeMarkdown(entry)));

    const architectureNode: Node = markdownEntries.length > 0
        ? await analyzeArchitectureFromMarkdowns(markdownEntries)
        : createEmptyNode("architecture", "No Architecture");

    const children: Node[] = [...documentNodes, architectureNode];

    if (codeFiles.size > 0) {
        try {
            const { analyzeFiles } = await import("../code/analyzer");
            const result = await analyzeFiles(codeFiles, name);
            children.push(result.ast);
            if (result.reduced)
                children.push(result.reduced);

        } catch (err) {
            console.warn("Could not analyse code files:", err);
        }
    }

    return {
        id: uuidv4(),
        label: name || "Workspace",
        type: "workspace",
        schemaVersion: "1.0.0",
        metadata: {
            description: "A workspace containing architecture, document, and code graphs",
            createdAt: now,
            analyzedAt: now,
            totalFilesCount: markdownEntries.length + codeFiles.size,
            markdownFilesCount: markdownEntries.length,
            codeFilesCount: codeFiles.size,
        },
        children,
        createdAt: now,
        updatedAt: now,
    };
}

/**
 * Helper to create an empty placeholder node when analysis is not possible
 */
function createEmptyNode(type: string, label: string): Node {
    const now = new Date().toISOString();
    return {
        id: uuidv4(),
        label,
        type,
        schemaVersion: "1.0.0",
        metadata: {
            description: `Empty ${type} node - no source files available`,
            createdAt: now,
        },
        children: [],
        createdAt: now,
        updatedAt: now,
    };
}
