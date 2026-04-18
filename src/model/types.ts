// Canonical data model — matches tech-design.md §3.1

export interface Node {
  id: string; // UUID v4
  label: string;
  type: string; // id of a NodeType constant in the active scenario
  graphRef?: string; // id of another root Node document — renders as a drillable composite node
  schemaVersion?: "1.0.0"; // present on root node when serialized as a standalone document
  children?: Node[]; // containment hierarchy; a node with children acts as a group
  references?: Reference[]; // references where this node is the source
  layoutConfig?: {
    algorithm: "hierarchical" | "force" | "radial" | "grid";
    params: Record<string, unknown>;
  };
  position?: { x: number; y: number }; // layout-derived; absent triggers auto-layout on first load
  size?: { width: number; height: number };
  metadata: Record<string, unknown>;
  createdAt?: string; // ISO-8601; expected on root document node
  updatedAt?: string; // ISO-8601; expected on root document node
  jsonSchema?: object; // optional, advisory only; expected on root document node
  viewport?: Viewport; // last saved canvas viewport; only meaningful on root documents
}

export interface Reference {
  id: string; // source is the owning Node; no source field needed
  label?: string;
  type: string; // value allowed by source node type mapping
  target: string; // matching expression; may resolve fuzzy or precise node sets
  metadata: Record<string, unknown>;
}

export interface ReferenceType {
  id: string;
  targetNodeTypes: string[];
}

export interface NodeType {
  id: string;
  referenceTypes: Record<string, ReferenceType | string>;
  nodeTypes: Record<string, NodeType | string>;
}

export type LayoutAlgorithm = "hierarchical" | "force" | "radial" | "grid";

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}
