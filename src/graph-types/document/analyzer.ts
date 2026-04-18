// Document analyzer — parses Markdown heading hierarchy into a document Node tree.
// Pure async function: no storage side effects. Result is a draft for user review.

import { v4 as uuidv4 } from "uuid";
import type { Node } from "@/model/types";
import { FileEntry } from "../registry";

/**
 * Parse a Markdown string into a document graph Node.
 * Headings (#–######) determine nesting depth; body text between headings
 * is attached to the nearest preceding heading as metadata.content.
 * Text before the first heading is attached to the root node's metadata.content.
 */

export async function analyzeMarkdowns(source: FileEntry[]): Promise<Node> {
  // anaylyze in parallel, then combine results by creating a new root and attaching each result as a child
  const nodes = await Promise.all(source.map((s) => analyzeMarkdown(s)));
  if (nodes.length === 1) {
    return nodes[0];
  } else {
    const now = new Date().toISOString();
    return {
      id: uuidv4(),
      label: "Combined Document",
      type: "document",
      schemaVersion: "1.0.0",
      children: nodes,
      metadata: {},
      createdAt: now,
      updatedAt: now,
    };
  }
}


export async function analyzeMarkdown(source: FileEntry): Promise<Node> {
  const lines = source.content.split("\n");
  const now = new Date().toISOString();

  // Root node — will become the document root
  const root: Node = {
    id: uuidv4(),
    label: "Untitled Document",
    type: "document",
    schemaVersion: "1.0.0",
    children: [],
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };

  // Stack tracking the most-recently-created node at each heading depth (1–6).
  // stack[0] = root (depth 0); stack[1] = most recent h1 node; etc.
  const stack: Node[] = [root];

  // Accumulated body lines for the current node
  let bodyLines: string[] = [];

  function flushBody(node: Node) {
    const content = bodyLines.join("\n").trim();
    if (content) {
      node.metadata = { ...node.metadata, content };
    }
    bodyLines = [];
  }

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.*)/);

    if (headingMatch) {
      const depth = headingMatch[1].length; // 1–6
      const label = headingMatch[2].trim();

      // Flush body text into the current top-of-stack node
      flushBody(stack[stack.length - 1]);

      // Create a new section node
      const section: Node = {
        id: uuidv4(),
        label,
        type: "section",
        children: [],
        metadata: {},
      };

      // Find parent: walk down the stack looking for the deepest node whose
      // depth is strictly less than the current heading depth.
      // Truncate the stack to depth (sections at same or deeper level are done).
      stack.splice(depth); // remove anything at depth d or deeper
      const parent = stack[stack.length - 1]; // deepest remaining node

      if (!parent.children) parent.children = [];
      parent.children.push(section);

      // If this is the first H1, use it as the document label
      if (depth === 1 && root.label === "Untitled Document") {
        root.label = label;
      }

      stack[depth] = section;
    } else {
      bodyLines.push(line);
    }
  }

  // Flush trailing body text
  flushBody(stack[stack.length - 1]);

  // Clean up empty children arrays
  function pruneEmpty(node: Node) {
    if (node.children && node.children.length === 0) {
      delete node.children;
    } else {
      node.children?.forEach(pruneEmpty);
    }
  }
  pruneEmpty(root);

  return root;
}
