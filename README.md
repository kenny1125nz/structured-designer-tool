# Graph Designer Tool

A designer for systems with a **graph-shaped structure** — components and their relationships — where the graph is data, not just a picture.

Every node, edge, and group is a first-class data entity with an open-ended metadata payload; the diagram is a view over that data.

## Features

- Graph-as-data model with node/edge/group metadata
- Visual editor with a component/graph view
- JSON editing via CodeMirror
- Import/export of the underlying data model

## Getting started

```bash
npm install
npm run dev
```

Build and type-check:

```bash
npm run build
npm run typecheck
```

## Documentation

- `requirement.md` — intent and requirements
- `tech-design.md` — technical design
- `architecture.json`, `components.json` — modelled architecture data

## Status

Early-stage design tool.
