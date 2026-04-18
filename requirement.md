# Graph Designer Tool

**Date:** 2026-04-16
**Status:** Draft

---

## 1. Intentions

Designing and communicating systems that have a graph-shaped structure — components and their relationships — is a common but underserved need. Existing general-purpose diagramming tools either lock data into opaque proprietary formats, or lack the semantic depth to carry domain-specific information alongside the visual representation.

This tool exists to close that gap. The core convictions behind it are:

**Graphs are data, not just pictures.** Every node, edge, and group should be a first-class data entity carrying an open-ended metadata payload. The diagram is a view over that data, not the data itself.

**Structure should be discoverable, not manual work.** Laying out a graph by hand is tedious and error-prone. The tool should handle placement, spacing, and routing automatically, with enough tuning knobs for the user to guide the result toward their intent.

**Hierarchy is intrinsic to most real systems.** Components naturally nest — a service contains subservices, a domain owns modules. The data model and the visual representation must both express this nesting natively, not as an afterthought.

**Zero infrastructure.** The tool should run in a browser against any ordinary HTTP server and persist everything locally. No accounts, no backend, no configuration ceremony.

**Composability across abstraction levels.** A graph that describes a subsystem should be reusable as a single node inside a higher-level graph. This allows a system to be modelled at multiple levels of detail without duplicating structure — the viewer zooms into a node and sees the full graph it represents.

**AI as a first-class authoring partner.** Constructing and refining a graph should be possible through natural language as well as direct manipulation. AI assistance operates at the granularity of individual nodes and edges, so the user can describe intent and have the model apply precise, targeted changes — without losing control of the underlying data.

**Existing artifacts as a starting point.** A codebase, a document, or an architecture diagram is itself a graph waiting to be discovered. The tool should be able to read existing artifacts — source files, prose documents, diagram files — and produce a first draft of the corresponding graph, so users do not have to reconstruct from memory what already exists in their system.

---

## 2. High-Level Requirements

### 2.1 Graph Model

- A graph is a named, independently addressable document consisting of nodes, edges, and groups.
- Multiple graphs can coexist and be managed within a single tool instance.
- A graph document is fully self-contained: all nodes, edges, groups, layout configuration, and optional schema live inside it.
- The graph can be exported to and imported from an open, portable format without loss of information.
- Graphs are composable: any graph can be embedded as a node inside another graph, forming a multi-level hierarchy of graphs. The embedding node acts as a proxy for the referenced graph, and the reference is navigable (drill down / back up).

### 2.2 Nodes and Edges

- A node is an entity with an identity, a label, an optional type token, and a **flexible metadata payload** — an arbitrary JSON object with no fixed schema.
- A node may optionally reference another graph document, making it a *composite node*: it represents the entirety of the referenced graph at the current level of abstraction.
- An edge is a relationship between two nodes (or groups), carrying a directionality flag, an optional label, and the same flexible metadata payload as nodes.
- Node types are user-defined and carry no built-in semantics; they exist to allow consumers of the exported data to apply their own meaning.
- An optional JSON Schema can be attached at the graph or type level to validate metadata shape. Validation is advisory and never blocks authoring.

### 2.3 Grouping and Hierarchy

- Any set of nodes and groups can be collected into a named group, forming a containment hierarchy of arbitrary depth.
- Groups are first-class entities in the data model: they have their own identity, label, and metadata payload.
- A group can be in an expanded state (showing its contents) or a collapsed state (presenting as a single opaque element with its incident edges still visible).
- The hierarchy is acyclic; a group cannot directly or transitively contain itself.
- Edges may connect any combination of nodes and groups regardless of nesting depth.

### 2.4 Automatic Layout

- The tool must be capable of computing a collision-free, readable spatial arrangement for any graph automatically, without requiring the user to manually position elements.
- At least four layout strategies must be available: hierarchical (rank-based), force-directed (physics simulation), radial (hub-and-spoke), and grid (uniform matrix).
- Each strategy exposes a concise set of tunable parameters so the user can steer the output (e.g., flow direction, spacing, density) without implementing the algorithm themselves.
- Layout can be applied to the full graph or scoped to a subgraph or group.
- Node sizes are derived automatically from content; explicit overrides are respected.
- Manual positional adjustments made after a layout run are stable until the next explicit layout is requested.

### 2.5 Persistence

- All graph data is stored locally in the browser with no dependency on a remote server.
- Persistence is automatic and continuous; no explicit save action should be required to avoid data loss.
- The tool restores its last state on next load, including which graph was active and the last viewport position.

### 2.6 Delivery Constraints

- The tool is delivered as a self-contained package that runs entirely in the browser with no server-side component.
- Any standard HTTP file server is sufficient to host it.
- The tool has no external runtime dependencies and must function without internet connectivity.

### 2.7 AI-Assisted Graph Editing

AI can help edit the **content** of individual nodes and edges — labels, types, and metadata — through natural language. Graph structure (what exists and how things connect) remains entirely under human control; LLMs are not well-suited to making structural decisions on the user's behalf.

### 2.8 Source Analysis

The tool shall be able to analyze existing artifacts — source files, documents, and architecture descriptions — and produce a draft graph of the corresponding type. Analysis is always user-initiated and the result is a starting point for further editing, not a finished product.

Three analysis targets are supported:

- **Document analysis** produces a document graph. Documents with a clear structural hierarchy are parsed deterministically into a matching section structure. Unstructured text without a clear hierarchy may use AI assistance to propose a breakdown.
- **Codebase analysis** produces a code graph via an AST+LLM hybrid pipeline. The user uploads a zipped codebase (.zip). In the first pass the TypeScript Compiler API performs a deterministic AST extraction — pulling out modules, types, and their relationships with full accuracy and no hallucination. In the second pass an LLM receives a compact summary of the extracted graph (not raw source) and performs reduction: collapsing trivial nodes, grouping related files into meaningful architectural units, and surfacing key cross-cutting relationships. Sending a compact summary rather than raw source significantly reduces the token count. The LLM pass is skipped gracefully when AI is unavailable, falling back to the raw AST graph. TypeScript and JavaScript are the primary supported languages.
- **Architecture analysis** produces an architecture graph. The tool accepts a compliant JSON file — a document already conforming to the graph document format — and loads it directly without transformation. No parsing, inference, or AI assistance is required.

The following constraints apply to all analysis:

- Analysis is user-initiated; the tool never scans or monitors files automatically.
- Source material is never stored — only the resulting graph is persisted.
- The produced graph is a draft that the user is expected to review and refine.
- AI-assisted paths are subject to the same availability and configuration constraints as §2.7.
- Analysis does not produce spatial positions; automatic layout is applied to the draft graph on first render.

---

## 3. Out of Scope (v1)

- Real-time collaboration.
- Server-side or cloud persistence.
- Version history and branching.
- Code generation from graph structure.
- Plugin or extension system.
- Mobile / touch-first experience.
- AI-driven **blank-slate graph generation** — producing a graph purely from a natural-language prompt with no input artifact. AI-assisted analysis of an existing document, codebase, or diagram is covered by §2.8 and is in scope.
- AI layout or routing decisions (layout remains a deterministic algorithm; AI operates on data, not on spatial placement).
- Embedded / local AI model inference; an external API provider is required.
