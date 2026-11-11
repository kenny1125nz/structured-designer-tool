import type { Node } from "@/model/types";
import { TRANSFORM_REGISTRY } from "@/graph-types/registry";
import type { GraphTransformFn } from "@/graph-types/registry";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const TYPE_LABELS: Record<string, string> = {
  document: "Document",
  architecture: "Architecture",
  code: "Code",
};

// ---------------------------------------------------------------------------
// Tree traversal utilities
// ---------------------------------------------------------------------------

export function buildParentMap(root: Node): Map<string, Node> {
  const parentOf = new Map<string, Node>();
  function collect(n: Node, parent?: Node) {
    if (parent) parentOf.set(n.id, parent);
    n.children?.forEach((c) => collect(c, n));
  }
  collect(root);
  return parentOf;
}

/**
 * Returns ancestors from the first child of root down to (but not including)
 * nodeId.
 */
export function getAncestorPath(
  nodeId: string,
  root: Node,
  parentOf: Map<string, Node>,
): Node[] {
  const path: Node[] = [];
  let cur = parentOf.get(nodeId);
  while (cur && cur.id !== root.id) {
    path.unshift(cur);
    cur = parentOf.get(cur.id);
  }
  return path;
}

// ---------------------------------------------------------------------------
// Graph-type resolution
// ---------------------------------------------------------------------------

function findGraphTypeByNode(node: Node, root: Node): string | null {
  const parents = getAncestorPath(node.id, root, buildParentMap(root));
  for (const n of [node, ...parents.reverse()]) {
    if (n.type && TRANSFORM_REGISTRY[n.type]) return n.type;
  }
  return null;
}

export function findTransformer(node: Node, root: Node): GraphTransformFn | null {
  const type = findGraphTypeByNode(node, root);
  if (!type) return null;
  return TRANSFORM_REGISTRY[type] ?? null;
}

// ---------------------------------------------------------------------------
// buildFocusedView
//
// Derives a canvas root from a single focused node.
// The focused node acts as the compound container; its direct children are the
// primary canvas nodes.  References from any descendant to nodes outside the
// focused subtree become external stubs alongside those children.
// ---------------------------------------------------------------------------

export function buildFocusedView(focusedNode: Node, fullGraph: Node): Node {
  // 1. Collect all IDs inside the focused subtree.
  const focusedIds = new Set<string>();
  function collectFocusedIds(n: Node) {
    focusedIds.add(n.id);
    n.children?.forEach(collectFocusedIds);
  }
  collectFocusedIds(focusedNode);

  // 2. Build lookup maps for the full graph.
  //
  // Library nodes (external npm packages) are kept in a separate map so that a
  // project entity with the same label as an npm package (e.g. "utils", "model")
  // is never mistaken for an external dependency.  This mirrors the distinction
  // ast-extractor.ts makes via isInternalSpecifier() and that buildHierarchicalTree
  // encodes via node.type === "library".
  const byId = new Map<string, Node>();
  const byLabel = new Map<string, Node>();        // project nodes (file, package, entity, …)
  const libraryByLabel = new Map<string, Node>(); // library nodes only
  const parentOf = new Map<string, Node>();
  function collectAll(n: Node, parent?: Node) {
    byId.set(n.id, n);
    if (parent) parentOf.set(n.id, parent);
    if (n.type === "library") {
      libraryByLabel.set(n.label, n);
    } else {
      // First-writer-wins: keep the shallowest (earliest) project node for each
      // label so that re-exported names or duplicate class names don't overwrite
      // the primary declaration.
      if (!byLabel.has(n.label)) byLabel.set(n.label, n);
    }
    n.children?.forEach((c) => collectAll(c, n));
  }
  collectAll(fullGraph);

  // 3. Walk up to find the nearest file/library ancestor (for grouping stubs).
  function containerAncestor(n: Node): Node | null {
    let cur: Node | undefined = parentOf.get(n.id);
    while (cur) {
      if (cur.type === "file" || cur.type === "library") return cur;
      cur = parentOf.get(cur.id);
    }
    return null;
  }

  // 4. Collect external reference targets from descendants of focusedNode.
  type StubGroup = { containerNode: Node; entities: Map<string, Node> };
  const stubs = new Map<string, StubGroup>();

  function registerRef(refTarget: string) {
    // Lookup order:
    //   1. byId          – entity-to-entity refs use UUID targets; always unambiguous.
    //   2. byLabel       – internal import refs use symbol names; project entities first.
    //   3. libraryByLabel – external import refs use package names; libraries last.
    // This order prevents an npm package whose name matches a project entity from
    // being incorrectly classified as an external dependency (aligns with the
    // isInternalSpecifier() distinction in ast-extractor.ts and the type-based
    // separation in buildHierarchicalTree).
    const targetNode =
      byId.get(refTarget) ?? byLabel.get(refTarget) ?? libraryByLabel.get(refTarget);
    if (!targetNode || focusedIds.has(targetNode.id)) return;

    if (targetNode.type === "library" || targetNode.type === "file") {
      if (!stubs.has(targetNode.id)) {
        stubs.set(targetNode.id, { containerNode: targetNode, entities: new Map() });
      }
      return;
    }

    const container = containerAncestor(targetNode);
    const containerNode =
      container && !focusedIds.has(container.id) ? container : targetNode;
    if (focusedIds.has(containerNode.id)) return;

    if (!stubs.has(containerNode.id)) {
      stubs.set(containerNode.id, { containerNode, entities: new Map() });
    }
    if (containerNode.id !== targetNode.id) {
      stubs.get(containerNode.id)!.entities.set(targetNode.id, {
        ...targetNode,
        children: undefined,
        references: undefined,
      });
    }
  }

  function walkRefs(n: Node) {
    for (const ref of n.references ?? []) registerRef(ref.target);
    n.children?.forEach(walkRefs);
  }
  for (const child of focusedNode.children ?? []) {
    walkRefs(child);
  }

  // 5. Build stub nodes with an _externalRef marker.
  const stubNodes: Node[] = Array.from(stubs.values()).map(
    ({ containerNode, entities }) => ({
      id: containerNode.id,
      label: containerNode.label,
      type: containerNode.type,
      metadata: {
        ...containerNode.metadata,
        _externalRef: containerNode.type === "library" ? "external" : "internal",
      },
      children: entities.size > 0 ? Array.from(entities.values()) : undefined,
    }),
  );

  // 6. Return a view root that triggers auto-fit when navigation changes.
  return {
    id: fullGraph.id,
    type: findGraphTypeByNode(focusedNode, fullGraph) ?? fullGraph.type,
    label: fullGraph.label,
    metadata: fullGraph.metadata,
    children: [focusedNode, ...stubNodes],
  };
}
