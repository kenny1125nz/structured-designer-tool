// Shared internal types for the code analyzer pipeline.
// Nothing in this file has side effects.

export interface RawEntity {
  name: string;
  /**
   * class      — ES class declaration
   * interface  — TypeScript interface
   * enum       — TypeScript/JS enum
   * type       — exported type alias
   * function   — exported standalone function
   * component  — exported PascalCase function in a .tsx file (React component heuristic)
   */
  kind: "class" | "interface" | "enum" | "type" | "function" | "component";
  /** Parent class name (classes only). */
  extends?: string;
  /** Implemented interface names (classes only). */
  implements?: string[];
  /** Extended interface names (interfaces only). */
  extendsInterfaces?: string[];
  /** Method / function member names (capped at 12). */
  methods?: string[];
  /** Property names (capped at 12). */
  properties?: string[];
  /**
   * Names of other components referenced as JSX elements inside this entity's
   * render output (`<Button />`, `<Modal>…</Modal>` etc.).
   * Populated for `component` kind and class-based React components only.
   * The tree builder resolves these names to entity IDs and wires `"renders"`
   * references between nodes.
   */
  usesComponents?: string[];
  /** True when the declaration carries an `export` modifier. */
  isExported: boolean;
  /** 1-indexed line where this declaration starts in the source file. */
  startLine?: number;
  /** 1-indexed line where this declaration ends in the source file. */
  endLine?: number;
}

export interface RawImport {
  /** The raw module specifier as written in source (e.g. "./utils", "react", "@/lib/foo"). */
  specifier: string;
  /**
   * True for project-internal modules (relative paths, root-alias paths like @/ ~/ #).
   * False for third-party packages installed in node_modules.
   */
  isInternal: boolean;
  /**
   * Specific symbol names imported.
   * - Named: `import { A, B } from "…"` → ["A", "B"]
   * - Default: `import Foo from "…"` → ["Foo"]
   * - Namespace: `import * as Ns from "…"` → ["*"]
   * - Side-effect: `import "…"` → []
   * For re-exports the original exported names are used.
   */
  names: string[];
  /** True when this came from a dynamic `import()` expression. */
  isDynamic: boolean;
}

export interface RawModule {
  /** Normalised file path relative to the zip root. */
  path: string;
  /** Top-level directory segment — used as a coarse package bucket. */
  pkg: string;
  entities: RawEntity[];
  /** All imports (static and dynamic) found in this file. */
  imports: RawImport[];
  /** Total number of lines in the source file. */
  lineCount: number;
}

export interface RawGraph {
  /** Project / codebase name (derived from the zip filename). */
  name: string;
  modules: RawModule[];
}

/** Shape the LLM is asked to return. */
export interface LlmGraphSpec {
  label: string;
  description?: string;
  packages: Array<{
    label: string;
    description?: string;
    entities?: Array<{ label: string; kind: string }>;
    /** Labels of other packages this one depends on. */
    dependencies?: string[];
  }>;
}
