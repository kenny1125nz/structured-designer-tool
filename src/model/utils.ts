// Pure model utilities — no side effects, no async.

import type { Node, Reference } from "./types";

/**
 * Immutably update a single node anywhere in the tree.
 * Returns a new root with the changed node replaced; all other nodes are
 * shared by reference so the allocation is O(depth), not O(n).
 */
export function updateNodeInTree(
  root: Node,
  id: string,
  updater: (node: Node) => Partial<Node>,
): Node {
  if (root.id === id) {
    return { ...root, ...updater(root) };
  }
  if (!root.children?.length) return root;
  return {
    ...root,
    children: root.children.map((child) => updateNodeInTree(child, id, updater)),
  };
}

/** Find a node by id anywhere in the tree. Returns undefined if not found. */
export function findNodeById(root: Node, id: string): Node | undefined {
  if (root.id === id) return root;
  for (const child of root.children ?? []) {
    const found = findNodeById(child, id);
    if (found) return found;
  }
  return undefined;
}

/**
 * Remove a node (and all its descendants) from the tree by id.
 * Also removes any references that point to the removed node.
 */
export function removeNodeFromTree(root: Node, id: string): Node {
  // First pass: remove the node itself from the children arrays.
  function pruneNode(node: Node): Node {
    const children = (node.children ?? [])
      .filter((c) => c.id !== id)
      .map(pruneNode);
    return {
      ...node,
      ...(children.length > 0 ? { children } : { children: undefined }),
    };
  }

  // Second pass: remove dangling references pointing at the removed node.
  function pruneRefs(node: Node): Node {
    const references = (node.references ?? []).filter((r) => r.target !== id);
    const children = (node.children ?? []).map(pruneRefs);
    return {
      ...node,
      ...(references.length > 0 ? { references } : { references: undefined }),
      ...(children.length > 0 ? { children } : { children: undefined }),
    };
  }

  return pruneRefs(pruneNode(root));
}

/** Add a reference to a specific node in the tree. */
export function addReferenceToNode(root: Node, nodeId: string, ref: Reference): Node {
  return updateNodeInTree(root, nodeId, (node) => ({
    references: [...(node.references ?? []), ref],
  }));
}

/**
 * Find a reference by id anywhere in the tree.
 * Returns the reference and its owning (source) node, or undefined.
 */
export function findReferenceById(
  root: Node,
  refId: string,
): { ref: Reference; source: Node } | undefined {
  for (const ref of root.references ?? []) {
    if (ref.id === refId) return { ref, source: root };
  }
  for (const child of root.children ?? []) {
    const found = findReferenceById(child, refId);
    if (found) return found;
  }
  return undefined;
}

/** Remove a reference (by its id) from anywhere in the tree. */
export function removeReferenceFromTree(root: Node, refId: string): Node {
  function pruneRef(node: Node): Node {
    const references = (node.references ?? []).filter((r) => r.id !== refId);
    const children = (node.children ?? []).map(pruneRef);
    return {
      ...node,
      ...(references.length > 0 ? { references } : { references: undefined }),
      ...(children.length > 0 ? { children } : { children: undefined }),
    };
  }
  return pruneRef(root);
}

/**
 * Move a node to a new parent in the tree.
 * If newParentId is null, the node becomes a direct child of the root.
 * The node retains its existing data; only its parent changes.
 */
export function reparentNode(root: Node, nodeId: string, newParentId: string | null): Node {
  // Extract the node first.
  const target = findNodeById(root, nodeId);
  if (!target) return root;

  // Remove it from its current location.
  const pruned = function removeOnly(node: Node): Node {
    const children = (node.children ?? [])
      .filter((c) => c.id !== nodeId)
      .map(removeOnly);
    return {
      ...node,
      ...(children.length > 0 ? { children } : { children: undefined }),
    };
  }(root);

  // Insert into new parent.
  if (newParentId === null || newParentId === root.id) {
    return {
      ...pruned,
      children: [...(pruned.children ?? []), target],
    };
  }

  return updateNodeInTree(pruned, newParentId, (parent) => ({
    children: [...(parent.children ?? []), target],
  }));
}
