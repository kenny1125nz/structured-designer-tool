// Lossless JSON export of a root Node document.

import type { Node } from "@/model/types";

export function exportGraph(root: Node): string {
  const doc: Node = {
    ...root,
    schemaVersion: "1.0.0",
  };
  return JSON.stringify(doc, null, 2);
}

export function downloadGraph(root: Node): void {
  const json = exportGraph(root);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${root.label.replace(/\s+/g, "-").toLowerCase()}.graph.json`;
  anchor.click();

  URL.revokeObjectURL(url);
}
