// LLM reduction pass.
//
// Takes the raw graph produced by the AST extractor and asks an LLM to reduce
// it to a meaningful architectural summary.  The LLM receives a compact
// hierarchical directory tree (not raw source) to minimise token cost while
// preserving structural context.

import { v4 as uuidv4 } from "uuid";
import type { Node } from "@/model/types";
import type { RawGraph, RawModule, LlmGraphSpec } from "./types";

// ---------------------------------------------------------------------------
// Compact directory summary (LLM prompt input)
// ---------------------------------------------------------------------------

// Each key is either a subdirectory name or one of the two reserved keys.
// We use a string index signature so the object can nest arbitrarily.
type DirSummary = {
  _entities?: string[];
  _externalDeps?: string[];
  [subdir: string]: DirSummary | string[] | undefined;
};

/** Formats a single entity as a human-readable description string. */
function describeEntity(e: {
  name: string;
  kind: string;
  isExported: boolean;
  extends?: string;
  implements?: string[];
  extendsInterfaces?: string[];
  methods?: string[];
  usesComponents?: string[];
}): string {
  let desc = `${e.name} (${e.kind}${e.isExported ? ", exported" : ""})`;
  if (e.extends) desc += ` extends ${e.extends}`;
  if (e.implements?.length) desc += ` implements ${e.implements.join(", ")}`;
  if (e.extendsInterfaces?.length) desc += ` extends ${e.extendsInterfaces.join(", ")}`;
  if (e.methods?.length)
    desc += ` [methods: ${e.methods.slice(0, 5).join(", ")}${e.methods.length > 5 ? "…" : ""}]`;
  if (e.usesComponents?.length)
    desc += ` [renders: ${e.usesComponents.slice(0, 5).join(", ")}${e.usesComponents.length > 5 ? "…" : ""}]`;
  return desc;
}

/**
 * Builds a nested DirSummary object that mirrors the directory structure of
 * the codebase.  Entity counts are capped per directory to stay within token
 * budget while still giving the LLM full structural context.
 */
export function buildDirSummary(modules: RawModule[]): DirSummary {
  const root: DirSummary = {};

  for (const mod of modules) {
    const dirSegments = mod.path.split("/").slice(0, -1);

    let cur = root;
    for (const seg of dirSegments) {
      if (!(seg in cur)) cur[seg] = {};
      cur = cur[seg] as DirSummary;
    }

    const existing: string[] = (cur._entities as string[] | undefined) ?? [];
    if (existing.length < 20) {
      existing.push(
        ...mod.entities
          .slice(0, 20 - existing.length)
          .map(describeEntity),
      );
    }
    cur._entities = existing;

    const externalPkgs = mod.imports
      .filter((i) => !i.isInternal)
      .map((i) => {
        const s = i.specifier;
        if (s.startsWith("@")) {
          const parts = s.split("/");
          return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0];
        }
        return s.split("/")[0];
      });
    if (externalPkgs.length > 0) {
      const deps = new Set<string>(
        (cur._externalDeps as string[] | undefined) ?? [],
      );
      externalPkgs.forEach((d) => deps.add(d));
      cur._externalDeps = Array.from(deps).slice(0, 8);
    }
  }

  return root;
}

// ---------------------------------------------------------------------------
// LLM prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a software architecture analyst. \
You receive a compact module/entity summary extracted from a codebase via AST analysis. \
Your task is to produce a reduced architectural graph by:
1. Grouping related directories into 4–8 meaningful top-level packages \
   (e.g. "UI Layer", "API Client", "Domain Logic", "Data Access").
2. Retaining only architecturally significant entities — key domain classes, \
   service contracts, main interfaces — 2–6 per package.
3. Removing trivial utilities, constants, generated files, and test helpers.
4. Capturing meaningful inter-package dependencies.

Return ONLY a JSON object matching this exact schema:
{
  "label": "string — project name",
  "description": "string — one-sentence project summary",
  "type":"code",
  "packages": [
    {
      "label": "string",
      "description": "string — what this package does",
      "entities": [{ "label": "string", "kind": "class|interface|enum|type|function|component" }],
      "dependencies": ["other package labels this one depends on"]
    }
  ]
}`;

// ---------------------------------------------------------------------------
// LLM spec → Node tree conversion
// ---------------------------------------------------------------------------

function llmSpecToNode(spec: LlmGraphSpec, fallbackLabel: string): Node {
  const now = new Date().toISOString();
  const label = "Reduced:" + (spec.label || fallbackLabel);

  const pkgIdByLabel = new Map<string, string>();
  for (const pkg of spec.packages ?? []) {
    pkgIdByLabel.set(pkg.label, uuidv4());
  }

  const packageNodes: Node[] = (spec.packages ?? []).map((pkg) => {
    const id = pkgIdByLabel.get(pkg.label) ?? uuidv4();

    const entityNodes: Node[] = (pkg.entities ?? []).map((e) => ({
      id: uuidv4(),
      label: e.label,
      type: e.kind === "enum" ? "enum" : "entity",
      metadata: { language: "typescript", entityKind: e.kind },
    }));

    const references: Node["references"] = (pkg.dependencies ?? [])
      .filter((dep) => pkgIdByLabel.has(dep))
      .map((dep) => ({
        id: uuidv4(),
        type: "depends",
        target: pkgIdByLabel.get(dep)!,
        metadata: {},
      }));

    return {
      id,
      label: pkg.label,
      type: "package",
      metadata: {
        language: "typescript",
        ...(pkg.description ? { description: pkg.description } : {}),
      },
      ...(entityNodes.length > 0 ? { children: entityNodes } : {}),
      ...(references.length > 0 ? { references } : {}),
    };
  });

  return {
    id: uuidv4(),
    label,
    type: "code",
    schemaVersion: "1.0.0",
    metadata: {
      ...(spec.description ? { description: spec.description } : {}),
    },
    ...(packageNodes.length > 0 ? { children: packageNodes } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Sends the raw graph as a compact hierarchical directory summary to the LLM
 * and converts the response into a Node tree.
 */
export async function reduceWithLlm(rawGraph: RawGraph): Promise<Node> {
  const { callAi } = await import("@/controller/ai/client");

  const compactSummary = {
    codebase: rawGraph.name,
    directoryTree: buildDirSummary(rawGraph.modules),
  };

  const spec = await callAi<LlmGraphSpec>(
    SYSTEM_PROMPT,
    `Codebase: ${rawGraph.name}\n\nDirectory tree (entities per directory):\n${JSON.stringify(compactSummary, null, 2)}`,
  );

  return llmSpecToNode(spec, rawGraph.name);
}
