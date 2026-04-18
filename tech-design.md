# Graph Designer Tool — Tech Stack

**Date:** 2026-04-16
**Status:** MVP
**Parent:** [requirement.md](requirement.md)

---

## 1. Principles

These convictions govern every technology choice in this document.

**Data over picture.** The graph is a structured data document first. The visual canvas is a view over that data, not the source of truth. Technology choices must preserve that separation.

**Zero infrastructure.** The entire tool is a static bundle that runs in any browser against any file server. No accounts, no backend, no build-time secrets. Offline capability is non-negotiable for the core features.

**Offline core, AI optional.** AI-assisted editing enhances the tool but is never required. All authoring workflows must be fully functional without a network connection.

**Renderer independence.** The chosen renderer is an implementation detail, not an architectural commitment. Application logic interacts with a thin adapter, not the library directly.

**Minimal viable before extensible.** For MVP, choose the library that requires the least integration ceremony. Defer richer alternatives until the idea is validated.

---

## 2. Key Decisions

These are the decisions that the rest of the design builds on. Changing any of them would have wide ripple effects, so they should be treated as stable unless there is a strong, concrete reason to revisit.

- **Language:** TypeScript in strict mode. Consistency across the codebase makes refactoring and tooling significantly easier.
- **UI runtime:** React ≥ 19, without a meta-framework on top (not Next.js, not Remix). The tool is a pure client-side SPA; a server-rendering layer adds complexity with no benefit here.
- **Build toolchain:** Vite. Fast dev server, straightforward static output, well-supported across the React ecosystem.
- **Delivery format:** A static bundle of HTML, JS, CSS, and assets. Keeping the tool server-free is a deliberate product choice, not just a technical convenience.
- **Hosting requirement:** Any standard HTTP file server. The tool must work when files are served from disk — no process needs to run on the host.
- **Canonical data format:** Self-contained JSON (`Node` root) with an explicit `schemaVersion` field. All information needed to reconstruct a structure is in the document itself. Export and import must be lossless.
- **ID scheme:** UUID v4 for every graph, node, and reference. Stable, collision-free identifiers make cross-document references and partial imports tractable.
- **Storage boundary:** Browser-local only, using IndexedDB as the single persistence mechanism in MVP. Keeping data on-device is a core product promise, not a limitation to work around.
- **Graph-type modules:** Each root node type (document, architecture, code) is an isolated module under `src/graph-types/{type}/`. The module owns its `NodeType` definition, per-node-type metadata schemas, adapter component, and source analyzer. Code outside a module imports only through its `index.ts` — internal files are private to the module. A central registry (`src/graph-types/registry.ts`) is the only place that assembles the full catalog.
- **Source analysis stack:** Document analysis uses a no-dependency regex heading parser. Code analysis uses an **AST+LLM hybrid**: the **TypeScript Compiler API** (`typescript` package — dynamically imported via Vite code-splitting to avoid bloating the main bundle) performs a deterministic first pass over source files in-memory, extracting modules, type declarations, and their structural relationships without emitting. An LLM reduction pass then receives a compact package/entity summary (not raw source) and collapses trivial nodes into a meaningful architectural graph; this second pass is skipped when AI is unavailable. The user supplies the codebase as a `.zip` archive, extracted in-browser with `fflate`. Architecture analysis accepts a compliant JSON file conforming to the graph document format and passes it through directly — no parsing or transformation is required. Free-form prose without heading structure (document analysis only) falls back to the OpenAI-compatible AI client used for AI-assisted editing.

---

## 3. Architecture Layers

### 3.1 Model — Data and Persistence

This layer owns the canonical representation of all graph data and its storage lifecycle.

#### Canonical Data Model

The model is node-only. Every element — root graph documents, section nodes, components, classes, groups — is a `Node`. Edges are `Reference` objects owned by their source node. This uniform representation keeps serialisation, import/export, and cross-type tooling straightforward.

A `Node` carries:

- **Identity and display** — a stable UUID v4 identifier and a human-readable label.
- **Type** — a token resolved against the active graph type's node type registry, which constrains the allowed children and references.
- **Containment** — an optional list of child nodes. A node with children acts as a group; there is no separate group type.
- **References** — an optional list of outgoing `Reference` objects, each with a type token, a target expression, and a metadata payload.
- **Metadata** — a flexible, arbitrary JSON payload. Domain-specific fields are documented in each graph-type module's metadata schema; none are enforced by the core model.
- **Composition** — an optional pointer to another root document, making the node a proxy for an entire graph at a higher level of abstraction.
- **Layout hints** — an optional preferred layout algorithm with parameters. An absent position triggers automatic layout on first render.
- **Document root extras** — schema version, authoring timestamps, and an optional advisory JSON Schema for metadata validation.

```typescript
interface Node {
  id: string;               // UUID v4
  label: string;
  type: string;             // id of a NodeType in the active graph-type registry
  graphRef?: string;        // id of another root Node — renders as a drillable composite node
  schemaVersion?: "1.0.0"; // present on root node when serialised as a standalone document
  children?: Node[];        // containment hierarchy; a node with children acts as a group
  references?: Reference[]; // outgoing edges owned by this node
  layoutConfig?: {
    algorithm: "hierarchical" | "force" | "radial" | "grid";
    params: Record<string, unknown>;
  };
  position?: { x: number; y: number }; // absent → auto-layout on first render
  size?: { width: number; height: number };
  metadata: Record<string, unknown>;
  createdAt?: string;       // ISO-8601; expected on root node
  updatedAt?: string;       // ISO-8601; expected on root node
  jsonSchema?: object;      // advisory only; expected on root node
}

interface Reference {
  id: string;
  label?: string;
  type: string;             // must resolve in the source node type's referenceTypes registry
  target: string;           // matching expression; resolved at runtime
  metadata: Record<string, unknown>;
}

interface ReferenceType {
  id: string;
  targetNodeTypes: string[];
}

interface NodeType {
  id: string;
  referenceTypes: Record<string, ReferenceType | string>; // string = alias to another ReferenceType id
  nodeTypes: Record<string, NodeType | string>;           // string = alias to another NodeType id
}
```

**Node type registries** are defined per graph-type module. Each entry declares which child types and reference types a node may carry. Reference types declare their allowed target node types. Aliases within a registry support recursive definitions and type reuse. The three built-in registries (document, architecture, code) live in their respective graph-type modules; domain-specific metadata conventions are documented in each module's metadata schema file.

**Integrity rules:**
- Root document identifiers are unique within a tool instance; node and reference identifiers are unique within a root document.
- The containment hierarchy and graph reference composition graph are both acyclic.
- Node types, reference types, and reference targets must be consistent with the active type registry, including aliases.
- Layout-derived position and size, and UI interaction state (selection, expand/collapse), are runtime-only and are not part of the persisted model.

#### Storage Layout

IndexedDB is the single source of truth for persisted state in MVP.

Use one database with explicit object stores (table-like):

- `graphs`: One row per root `Node` document; primary key is `id` (root `Node.id`); value is the full root `Node` JSON document (no wrapper document).

Read/write pattern for MVP:

- Mutations write through directly to IndexedDB.
- Views read from IndexedDB-backed model services.
- Session/UI state is runtime-only in browser memory and is not persisted.
- No `localStorage` fallback.

#### State and Persistence Approach

- Canonical app state: **IndexedDB**. Rationale: single source of truth that avoids duplicate state layers.
- IndexedDB access layer: **Native IndexedDB API**. Rationale: supports explicit object stores and row-based access patterns.
- React state usage: ephemeral UI state only. Rationale: keeps view concerns local while model data remains in IndexedDB.

Persistence is automatic and continuous via write-through model operations. No explicit save action is required.

---

### 3.2 View — Rendering and UI

This layer owns everything the user sees and interacts with visually.

#### Graph Renderer

- Renderer library: **React Flow** (`@xyflow/react`) — used by all graph-type adapters in MVP.
- Renderer switch: Deferred per type; any adapter can be independently replaced without touching others.
- **Per-type adapters:** Each root node type has a dedicated adapter component in its module folder (`src/graph-types/{type}/adapter.tsx`). All adapters implement the same `GraphAdapter` contract. The App selects the active adapter from the registry (`src/graph-types/registry.ts`) based on `activeGraph.type`, and keys the component on the type so the correct adapter mounts when the active graph changes.
- **Shared base:** Common React Flow utilities (node/edge flattening, event wiring, imperative handle) live in `src/view/adapter/react-flow-base.tsx` and are exposed through a `createGraphCanvas(options)` factory. Each graph-type adapter calls the factory once at module load with type-specific options (custom node components, future default layout).
- Abstraction boundary: Application logic never imports `@xyflow/react` directly — only the base and the per-type adapters do.

Adapter contract (MVP surface, unchanged):

- `setDocument(root: Node): void` — load or replace the active root node document.
- `onSelectionChange(cb): unsubscribe` — subscribe to node/reference selection events.
- `onGraphChange(cb): unsubscribe` — subscribe to move, reference-create, reference-remove, collapse events.
- `fitToView(): void` — fit entire graph into viewport.
- `setViewport(vp): void` — restore a saved viewport.
- `getViewport(): Viewport` — read current viewport for persistence.

All nodes are the same primitive. The adapter renders nodes with `children` as container nodes and nodes without as leaf nodes — no separate group type.

#### UI Components

- Panels, dialogs, menus, forms: **shadcn/ui** (Radix UI + Tailwind CSS). Rationale: copy-own components, no runtime dependency, accessible by default.
- Raw JSON metadata editing: **CodeMirror 6**. Rationale: lightweight, tree-shakeable; Monaco deferred due to bundle size.

---

### 3.3 Controller — Behavior and Integration

This layer owns the logic that translates user intent into model mutations: layout computation, AI-assisted editing, source analysis, and import/export.

#### Layout Algorithms

Each strategy is a pure function `(root: Node, params) => positions: Map<id, {x,y}>` with no side effects on the model.

- Hierarchical: **Dagre** (`@dagrejs/dagre`). Notes: rank-based, supports flow direction and spacing parameters.
- Force-directed: **d3-force**. Notes: physics simulation with tunable link distance and charge.
- Radial: in-house deterministic implementation. Notes: center node plus concentric rings; no external dependency.
- Grid: in-house deterministic implementation. Notes: uniform row/column placement; no external dependency.

Scope: full-graph layout in MVP. Scoped layout applies to a user-selected node set only; deep nested group scope is deferred.

Elk.js deferred — avoids WASM bundle overhead until MVP validates the need.

#### AI-Assisted Editing

- Activation: Feature flag `ai.enabled` (off by default).
- Provider interface: Internal `generatePatchForNodeOrReference(prompt, target): Patch`.
- Network adapter: Minimal OpenAI-compatible HTTP client; single endpoint, no SDK dependency.
- Mutation scope: Node/reference label, relation type, target criteria, and metadata fields only — no structural mutations.
- Offline behavior: AI panel hidden when flag is off or provider is unreachable; a non-blocking notice is shown.

#### Source Analysis

Each graph-type module owns its analyzer at `src/graph-types/{type}/analyzer.ts`. An analyzer is a pure async function that accepts a source string and returns a root `Node` document with no side effects on storage. The returned node is persisted only after the user reviews and confirms.

- **Document analyzer** — Markdown headings are extracted and mapped to section node nesting depth. Plain-text input without heading structure may fall back to the AI provider when `ai.enabled` is on. No external library dependency.
- **Code analyzer (TypeScript / JavaScript)** — Two-pass hybrid pipeline. *Pass 1 — AST:* the TypeScript Compiler API parses each source file in memory (no file-system access, no emit) and extracts module paths, class/interface/enum declarations, heritage clauses (extends/implements), and import statements. Files are grouped by directory into packages; external (node_modules) imports are recorded as library dependencies. The output is a compact package-and-entity summary. *Pass 2 — LLM reduction:* the compact summary is sent to the AI provider (when `ai.enabled` is on), which merges small packages, removes trivial utilities, and returns a reduced architectural graph in the tool's Node format. If AI is unavailable the raw AST graph is returned directly as the draft. Call graphs are not extracted in v1.
- **Code analyzer (Python / Java / C#)** — Deferred. TypeScript/JavaScript AST extraction with LLM reduction covers the primary target codebase. Multi-language support added when validated by user need.
- **Architecture analyzer** — Accepts a compliant JSON file already conforming to the graph document format. The analyzer validates the document against the expected schema and returns it as the draft root `Node` — no parsing, shape extraction, or AI inference is performed. This is a straight passthrough.

---

### 3.4 Graph-Type Modules

Each root node type is packaged as an isolated module under `src/graph-types/{type}/`.

**Module file layout:**

| File | Contents |
|------|----------|
| `node-type.ts` | `NodeType` constant with reference type and child node type registries. |
| `metadata-schema.ts` | JSON Schema (draft-07) objects keyed by node-type id; advisory only. |
| `adapter.tsx` | React component implementing `GraphAdapter` for this graph type. |
| `analyzer.ts` | Source analyzer — accepts a source string and returns a draft root `Node` document; no storage side effects. |
| `index.ts` | Public re-export surface — the only file imported from outside the module. |

**Registry** (`src/graph-types/registry.ts`):

- `NODE_TYPES` — ordered list of all active node type definitions.
- `ADAPTER_REGISTRY` — maps root type id to its adapter component.
- `ANALYZER_REGISTRY` — maps root type id to its analyzer function.

**Metadata schemas:**

Each module's `metadata-schema.ts` exports a `Record<string, object>` keyed by node-type id. Each value is a JSON Schema draft-07 object governing the `metadata` field for nodes of that type. Schemas are advisory only — validation never blocks authoring. They may be embedded in a root node's `jsonSchema` field for tooling consumers.

**Default layout per type (to be wired once the layout controller is integrated):**

| Graph type | Default layout | Rationale |
|---|---|---|
| document | hierarchical | Section trees have a natural reading order matching rank-based flow. |
| architecture | force | Service graphs are networks; force layout surfaces natural clusters. |
| code | hierarchical | Package/class containment is a tree; rank-based layout reflects nesting. |

**Module tree:**

```
src/graph-types/
├── registry.ts              ← NODE_TYPES + ADAPTER_REGISTRY + ANALYZER_REGISTRY
├── document/
│   ├── index.ts
│   ├── node-type.ts
│   ├── metadata-schema.ts
│   ├── adapter.tsx
│   └── analyzer.ts          ← heading-based Markdown / AI fallback
├── architecture/
│   ├── index.ts
│   ├── node-type.ts
│   ├── metadata-schema.ts
│   ├── adapter.tsx
│   └── analyzer.ts          ← JSON passthrough (compliant graph document)
└── code/
    ├── index.ts
    ├── node-type.ts
    ├── metadata-schema.ts
    ├── adapter.tsx
    └── analyzer.ts          ← AST extraction (TypeScript Compiler API) + LLM reduction pass
```

---

## 4. Deferred to Post-MVP

- Renderer alternatives (Cytoscape, custom): Idea not yet validated; React Flow covers MVP needs.
- Elk.js layout engine: WASM overhead not justified until layout quality is a confirmed pain point.
- Type-level JSON Schema: Adds authoring complexity; graph-level schema covers MVP validation.
- Deep scoped layout for nested groups: Requires advanced group traversal logic; full-graph layout is sufficient for MVP.
- Rich AI provider abstraction (multi-provider, local model): Single OpenAI-compatible endpoint is sufficient for MVP.
- Multi-language code analysis (Python / Java / C#): TypeScript/JavaScript covers the primary use case; extend when validated.
- Worker-thread AST processing for very large codebases: synchronous in-browser extraction is sufficient for typical project sizes; offload to a Worker if performance becomes a problem.
- Full Mermaid parser library (`mermaid` package): Bundle size not justified until Mermaid is confirmed as a common input path; flowchart/graph pattern extraction covers the primary cases.
- AI-assisted section detection for plain-text documents without headings: Niche path; heading-based Markdown parsing covers the primary document analysis use case.
