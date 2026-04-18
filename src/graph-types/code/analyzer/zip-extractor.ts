// Extracts TypeScript/JavaScript source files from a zip archive.
// Uses fflate (dynamically imported to allow code-splitting).

import { isEligiblePath } from "./file-filter";

/**
 * Unzips `file` and returns a map of eligible source file paths → UTF-8 content.
 * The returned paths are the raw zip entry names; normalisation happens later
 * in the AST extractor (stripCommonPrefix).
 */
export async function extractZip(file: File): Promise<Map<string, string>> {
  const { unzipSync } = await import("fflate");
  const buffer = await file.arrayBuffer();
  const unzipped = unzipSync(new Uint8Array(buffer));

  const decoder = new TextDecoder("utf-8", { fatal: false });
  const result = new Map<string, string>();

  for (const [name, data] of Object.entries(unzipped)) {
    if (isEligiblePath(name)) {
      result.set(name, decoder.decode(data));
    }
  }

  return result;
}
