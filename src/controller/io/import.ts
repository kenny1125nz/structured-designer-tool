// Lossless JSON import of a root Node document.

import type { Node } from "@/model/types";

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}

export function parseGraph(json: string): Node {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new ImportError("Invalid JSON.");
  }

  if (typeof raw !== "object" || raw === null) {
    throw new ImportError("Root value must be an object.");
  }

  const node = raw as Record<string, unknown>;

  if (typeof node["id"] !== "string" || node["id"] === "") {
    throw new ImportError('Missing or empty "id" field.');
  }
  if (typeof node["label"] !== "string") {
    throw new ImportError('Missing "label" field.');
  }
  if (typeof node["type"] !== "string") {
    throw new ImportError('Missing "type" field.');
  }

  return raw as Node;
}

export function importFromFile(): Promise<Node> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";

    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        reject(new ImportError("No file selected."));
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const graph = parseGraph(reader.result as string);
          resolve(graph);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new ImportError("Failed to read file."));
      reader.readAsText(file);
    };

    input.click();
  });
}
