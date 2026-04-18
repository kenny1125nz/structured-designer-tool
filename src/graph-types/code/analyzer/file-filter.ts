// Shared path-eligibility rules used by both the zip and folder extractors.

export const SOURCE_FILE_RE = /\.(ts|tsx|js|jsx)$/;
export const MARKDOWN_EXTENSIONS = /\.(md|markdown)$/;

/**
 * Directory names that are always excluded during traversal.
 * The folder extractor uses this set when recursing so that entire subtrees
 * are skipped early rather than filtered file-by-file.
 */
export const EXCLUDED_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  ".git",
  ".claude",
  ".next",
  ".nuxt",
  ".turbo",
  ".svelte-kit",
  ".parcel-cache",
  ".cache",
  ".vscode",
  ".idea",
  "coverage",
  "__pycache__",
  "vendor",
]);

/**
 * Returns true when a directory segment should be skipped entirely.
 * Hidden directories (starting with ".") are excluded in addition to the
 * explicit EXCLUDED_DIRS set.
 */
export function shouldExcludeDir(name: string): boolean {
  return EXCLUDED_DIRS.has(name) || name.startsWith(".");
}

/**
 * Returns true when a file at `filePath` should be included for analysis.
 * `filePath` is a forward-slash-separated relative path from the project root.
 * Each directory segment is checked against `shouldExcludeDir` so this function
 * covers both extension filtering and path-based exclusions.
 */
export function isEligiblePath(filePath: string): boolean {
  if (!SOURCE_FILE_RE.test(filePath) && !MARKDOWN_EXTENSIONS.test(filePath)) return false;
  if (filePath.endsWith(".d.ts")) return false;
  if (filePath.includes(".min.")) return false;

  const segments = filePath.split("/");
  // Check every directory segment (all but the last, which is the filename).
  for (const seg of segments.slice(0, -1)) {
    if (shouldExcludeDir(seg)) return false;
  }

  return true;
}
