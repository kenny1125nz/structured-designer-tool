// Fallback tree builder — converts a RawGraph into a hierarchical Node tree
// that mirrors the directory + file structure of the analysed codebase.
//
// Hierarchy:
//   root (code)
//     └── directory/ (package)
//           └── file.ts (package, metadata.isFile = true)
//                 ├── MyClass (entity)
//                 └── MyInterface (entity)
//
// Each source file becomes a package node so that the entities it defines
// are visually grouped under it on the canvas.  Heritage and render-usage
// references are wired by entity name across the whole graph.

import { v4 as uuidv4 } from "uuid";
import type { Node, Reference } from "@/model/types";
import type { RawGraph, RawEntity, RawImport } from "./types";

// ---------------------------------------------------------------------------
// Internal directory tree
// ---------------------------------------------------------------------------

interface DirEntry {
  /** One node per source file that defines at least one entity. */
  fileNodes: Node[];
  subdirs: Map<string, DirEntry>;
}

function makeDir(): DirEntry {
  return { fileNodes: [], subdirs: new Map() };
}

function ensureDir(root: DirEntry, segments: string[]): DirEntry {
  let cur = root;
  for (const seg of segments) {
    if (!cur.subdirs.has(seg)) cur.subdirs.set(seg, makeDir());
    cur = cur.subdirs.get(seg)!;
  }
  return cur;
}

// ---------------------------------------------------------------------------
// Entity → Node conversion
// ---------------------------------------------------------------------------

function entityToNode(
  entity: RawEntity,
  /** Qualified key (path::name) → id — guarantees a unique id per entity instance. */
  entityIdByQualified: Map<string, string>,
  /** Bare name → first-seen id — used only for cross-file reference resolution. */
  entityIdByName: Map<string, string>,
  qualifiedKey: string,
): Node {
  const id = entityIdByQualified.get(qualifiedKey) ?? uuidv4();
  const references: Node["references"] = [];

  if (entity.extends) {
    const targetId = entityIdByName.get(entity.extends);
    if (targetId)
      references.push({ id: uuidv4(), type: "extends", target: targetId, metadata: {} });
  }
  for (const impl of entity.implements ?? []) {
    const targetId = entityIdByName.get(impl);
    if (targetId)
      references.push({ id: uuidv4(), type: "implements", target: targetId, metadata: {} });
  }
  for (const ext of entity.extendsInterfaces ?? []) {
    const targetId = entityIdByName.get(ext);
    if (targetId)
      references.push({ id: uuidv4(), type: "extends", target: targetId, metadata: {} });
  }
  for (const used of entity.usesComponents ?? []) {
    const targetId = entityIdByName.get(used);
    if (targetId && targetId !== id)
      references.push({ id: uuidv4(), type: "renders", target: targetId, metadata: {} });
  }

  const lineCount =
    entity.startLine != null && entity.endLine != null
      ? entity.endLine - entity.startLine + 1
      : undefined;

  return {
    id,
    label: entity.name,
    type: entity.kind === "enum" ? "enum" : "entity",
    metadata: {
      language: "typescript",
      entityKind: entity.kind,
      isExported: entity.isExported,
      ...(entity.startLine != null ? { startLine: entity.startLine } : {}),
      ...(entity.endLine != null ? { endLine: entity.endLine } : {}),
      ...(lineCount != null ? { lineCount } : {}),
      ...(entity.methods?.length ? { methods: entity.methods } : {}),
      ...(entity.properties?.length ? { properties: entity.properties } : {}),
      ...(entity.extends ? { extends: entity.extends } : {}),
      ...(entity.implements?.length ? { implements: entity.implements } : {}),
      ...(entity.extendsInterfaces?.length
        ? { extendsInterfaces: entity.extendsInterfaces }
        : {}),
    },
    ...(references.length > 0 ? { references } : {}),
  };
}

// ---------------------------------------------------------------------------
// DirEntry tree → Node tree
// ---------------------------------------------------------------------------

function dirToNode(name: string, entry: DirEntry): Node | null {
  const subdirNodes = Array.from(entry.subdirs.entries())
    .map(([childName, childEntry]) => dirToNode(childName, childEntry))
    .filter((n): n is Node => n !== null);

  const children = [...subdirNodes, ...entry.fileNodes];
  if (children.length === 0) return null;

  return {
    id: uuidv4(),
    label: name,
    type: "package",
    metadata: { language: "typescript" },
    children,
  };
}

// ---------------------------------------------------------------------------
// Import → Reference conversion
// ---------------------------------------------------------------------------

/**
 * Returns the npm package name from an external specifier.
 * "@scope/pkg/deep" → "@scope/pkg",  "pkg/deep" → "pkg"
 */
function externalPackageName(spec: string): string {
  if (spec.startsWith("@")) {
    const parts = spec.split("/");
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0];
  }
  return spec.split("/")[0];
}

/**
 * Build `Reference` objects from a file's import list.
 *
 * Strategy:
 *  • Internal named import  → one Reference per name; target = symbol name
 *    (readable expression, resolved to node ID in the adapter).
 *  • External library import → one Reference per unique package; target = pkgName
 *    (matches the library node's label in the Libraries package).
 *  • Namespace / side-effect → skipped (no specific target to link to).
 */
function importsToReferences(imports: RawImport[]): Reference[] {
  const refs: Reference[] = [];
  // Deduplicate library refs: one ref per package even across multiple imports.
  const libRefAdded = new Set<string>();

  for (const imp of imports) {
    if (imp.names.length === 0 || imp.names[0] === "*") continue; // side-effect / namespace

    if (imp.isInternal) {
      // One reference per named symbol; skip "default" (ambiguous label).
      for (const name of imp.names) {
        if (name === "default") continue;
        refs.push({
          id: uuidv4(),
          type: "imports",
          target: name, // readable name — resolved to node ID by adapter
          metadata: {
            specifier: imp.specifier,
            ...(imp.isDynamic ? { dynamic: true } : {}),
          },
        });
      }
    } else {
      // External library: one ref to the library node, names stored in metadata.
      const pkg = externalPackageName(imp.specifier);
      if (!libRefAdded.has(pkg)) {
        libRefAdded.add(pkg);
        refs.push({
          id: uuidv4(),
          type: "imports",
          target: pkg, // matches library node label
          metadata: {
            specifier: imp.specifier,
            names: imp.names,
            ...(imp.isDynamic ? { dynamic: true } : {}),
          },
        });
      } else {
        // Merge additional named imports into the existing ref's metadata.
        const existing = refs.find(
          (r) => r.type === "imports" && r.target === pkg,
        )!;
        const prev = (existing.metadata.names as string[] | undefined) ?? [];
        existing.metadata = {
          ...existing.metadata,
          names: [...new Set([...prev, ...imp.names])],
        };
      }
    }
  }
  return refs;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Builds a hierarchical Node tree from the raw graph without LLM assistance.
 *
 * Each source file that defines at least one entity becomes a `package` node
 * (with metadata.isFile = true) containing those entity nodes.  Directory
 * levels above the file are also `package` nodes.
 */
export function buildHierarchicalTree(rawGraph: RawGraph): Node {
  const now = new Date().toISOString();

  // Two separate ID maps:
  //   entityIdByQualified  — "path::name" → id  (unique per entity instance, used for node ids)
  //   entityIdByName       — "name"       → id  (first-seen, used only for reference targets)
  //
  // Keeping them separate means entities that share a name across files each get
  // their own unique id (fixing duplicate-key React errors), while cross-file
  // references still resolve by bare name on a best-effort basis.
  const entityIdByQualified = new Map<string, string>();
  const entityIdByName = new Map<string, string>();
  for (const mod of rawGraph.modules) {
    for (const e of mod.entities) {
      const qk = `${mod.path}::${e.name}`;
      const id = uuidv4();
      entityIdByQualified.set(qk, id);
      if (!entityIdByName.has(e.name)) entityIdByName.set(e.name, id);
    }
  }

  // Pre-pass: collect all unique external library packages across all modules.
  const libraryPackages = new Map<string, string>(); // pkgName → uuidv4 id
  for (const mod of rawGraph.modules) {
    for (const imp of mod.imports) {
      if (!imp.isInternal && imp.names.length > 0 && imp.names[0] !== "*") {
        const pkg = externalPackageName(imp.specifier);
        if (!libraryPackages.has(pkg)) libraryPackages.set(pkg, uuidv4());
      }
    }
  }

  // Build the directory tree, inserting a file node for each module.
  const root = makeDir();
  for (const mod of rawGraph.modules) {
    if (mod.entities.length === 0 && mod.imports.length === 0) continue;

    const segments = mod.path.split("/");
    const fileName = segments[segments.length - 1];
    const dirSegments = segments.slice(0, -1);

    const dir = ensureDir(root, dirSegments);

    const entityNodes = mod.entities.map((e) =>
      entityToNode(e, entityIdByQualified, entityIdByName, `${mod.path}::${e.name}`),
    );

    const importRefs = importsToReferences(mod.imports);

    const fileNode: Node = {
      id: uuidv4(),
      label: fileName,
      type: "file",
      metadata: { language: "typescript", lineCount: mod.lineCount },
      ...(entityNodes.length > 0 ? { children: entityNodes } : {}),
      ...(importRefs.length > 0 ? { references: importRefs } : {}),
    };

    dir.fileNodes.push(fileNode);
  }

  // Convert the directory tree to the Node hierarchy.
  const topLevel = Array.from(root.subdirs.entries())
    .map(([name, entry]) => dirToNode(name, entry))
    .filter((n): n is Node => n !== null);

  // Files at the root level (no parent directory segment).
  const sourceChildren = [...topLevel, ...root.fileNodes];

  // Libraries package node — one child per unique external package.
  const libraryNodes: Node[] = Array.from(libraryPackages.entries()).map(
    ([pkgName, id]) => ({
      id,
      label: pkgName,
      type: "library",
      metadata: { language: "typescript" },
    }),
  );

  const children =
    libraryNodes.length > 0
      ? [
        ...sourceChildren,
        {
          id: uuidv4(),
          label: "Libraries",
          type: "package",
          metadata: { language: "typescript" },
          children: libraryNodes,
        } satisfies Node,
      ]
      : sourceChildren;

  return {
    id: uuidv4(),
    label: "AST:" + rawGraph.name,
    type: "code",
    schemaVersion: "1.0.0",
    metadata: {},
    ...(children.length > 0 ? { children } : {}),
    createdAt: now,
    updatedAt: now,
  };
}
