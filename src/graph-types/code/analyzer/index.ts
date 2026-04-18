// Public entry point for the code analyzer pipeline.
//
// Pipeline:
//   1. extract            — zip or folder → Map<path, content>
//   2. extractAstGraph    — TypeScript Compiler API AST pass
//   3a. buildHierarchicalTree — deterministic graph (always produced)
//   3b. reduceWithLlm         — LLM-reduced graph (when ai.enabled, may fail gracefully)
//
// Both versions are returned so the caller can present them as switchable
// views within a single graph document.

import type { Node } from "@/model/types";
import { extractZip } from "./zip-extractor";
import { extractAstGraph } from "./ast-extractor";
import { buildHierarchicalTree } from "./tree-builder";
import { reduceWithLlm } from "./llm-reducer";

export { extractFolderFromEntry, extractFolderFromFileList } from "./folder-extractor";

export class CodeAnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CodeAnalysisError";
  }
}

export interface AnalysisResult {
  /**
   * Raw hierarchical graph produced by the AST pass.
   * Preserves the full directory / file / entity structure of the codebase.
   */
  ast: Node;
  /**
   * LLM-reduced graph that collapses noise into meaningful architectural units.
   * `null` when AI is disabled or the reduction request failed.
   */
  reduced: Node | null;
}

/**
 * Core analysis pipeline — accepts a pre-extracted file map.
 * Use this when the source is a folder (drag-drop or browse dialog).
 */
export async function analyzeFiles(
  files: Map<string, string>,
  name: string,
): Promise<AnalysisResult> {
  if (files.size === 0) {
    throw new CodeAnalysisError(
      "No TypeScript/JavaScript source files found. " +
      "Make sure the source contains .ts, .tsx, .js, or .jsx files outside node_modules.",
    );
  }

  const rawGraph = await extractAstGraph(files, name);
  const ast = buildHierarchicalTree(rawGraph);

  let reduced: Node | null = null;
  try {
    reduced = await reduceWithLlm(rawGraph);
  } catch {
    // LLM failed — caller will only see the AST graph.
  }

  return { ast, reduced };
}

/**
 * Convenience wrapper for zip-file input — extracts then analyses.
 */
export async function analyzeZippedCode(file: File): Promise<AnalysisResult> {
  const files = await extractZip(file);
  return analyzeFiles(files, file.name.replace(/\.zip$/i, ""));
}
