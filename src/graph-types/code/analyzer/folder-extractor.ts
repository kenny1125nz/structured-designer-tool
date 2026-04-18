// Extracts TypeScript/JavaScript source files from a local project folder.
//
// Two sources are supported:
//   • FileSystemDirectoryEntry  — from a drag-and-drop DataTransferItem
//   • FileList with webkitRelativePath — from <input webkitdirectory>
//
// Both return the same Map<relativePath, content> shape expected by the
// AST extractor pipeline.

import { isEligiblePath, shouldExcludeDir } from "./file-filter";

// ---------------------------------------------------------------------------
// FileSystemDirectoryEntry (drag-and-drop)
// ---------------------------------------------------------------------------

/** Promisified wrapper around FileSystemDirectoryReader.readEntries. */
function readBatch(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
}

/** Promisified wrapper around FileSystemFileEntry.file. */
function entryToFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

async function walkEntry(
  entry: FileSystemEntry,
  prefix: string,
  result: Map<string, string>,
): Promise<void> {
  const path = prefix ? `${prefix}/${entry.name}` : entry.name;

  if (entry.isDirectory) {
    if (shouldExcludeDir(entry.name)) return;
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    // readEntries returns at most 100 items per call — loop until empty.
    while (true) {
      const batch = await readBatch(reader);
      if (batch.length === 0) break;
      await Promise.all(batch.map((e) => walkEntry(e, path, result)));
    }
  } else if (entry.isFile) {
    if (!isEligiblePath(path)) return;
    const file = await entryToFile(entry as FileSystemFileEntry);
    result.set(path, await file.text());
  }
}

/**
 * Recursively reads all eligible source files from a dropped folder.
 * Returns a map of relative paths → file contents.
 */
export async function extractFolderFromEntry(
  entry: FileSystemDirectoryEntry,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  await walkEntry(entry, "", result);
  return result;
}

// ---------------------------------------------------------------------------
// FileList from <input webkitdirectory> (browse dialog)
// ---------------------------------------------------------------------------

/**
 * Reads all eligible source files from a File array produced by an
 * `<input webkitdirectory>` element.
 * Each File has a `webkitRelativePath` like "myproject/src/index.ts".
 */
export async function extractFolderFromFileList(
  files: File[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  await Promise.all(
    files.map(async (file) => {
      const path = file.webkitRelativePath || file.name;
      if (!isEligiblePath(path)) return;
      result.set(path, await file.text());
    }),
  );
  return result;
}
