// AST extraction pass.
//
// Dynamically imports the TypeScript compiler so it is code-split out of the
// main bundle (~5 MB). Parses every source file in memory (no emit, no
// file-system access) and extracts declarations and import relationships.

import { SOURCE_FILE_RE } from "./file-filter";
import type { RawEntity, RawImport, RawModule, RawGraph } from "./types";

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/**
 * Many zip tools prepend a top-level folder (e.g. "repo-main/src/…").
 * This detects and strips that common prefix so paths are repo-root-relative.
 */
export function stripCommonPrefix(paths: string[]): (p: string) => string {
  if (paths.length === 0) return (p) => p;

  const sorted = [...paths].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  let i = 0;
  while (i < first.length && first[i] === last[i]) i++;

  const raw = first.slice(0, i);
  const lastSlash = raw.lastIndexOf("/");
  const prefix = lastSlash >= 0 ? raw.slice(0, lastSlash + 1) : "";

  return (p) => (p.startsWith(prefix) ? p.slice(prefix.length) : p);
}

// ---------------------------------------------------------------------------
// AST helpers (depend on the dynamically loaded `ts` module)
// ---------------------------------------------------------------------------

type TS = typeof import("typescript");

/** True when `node` carries an `export` keyword modifier. */
function hasExport(node: import("typescript").Node, ts: TS): boolean {
  return (
    (node as import("typescript").HasModifiers).modifiers?.some(
      (m) => m.kind === ts.SyntaxKind.ExportKeyword,
    ) ?? false
  );
}

/**
 * Resolve the display name from a heritage expression.
 * Handles simple `Foo` identifiers and qualified `ns.Foo` forms.
 */
function heritageText(
  expr: import("typescript").LeftHandSideExpression,
  ts: TS,
): string | undefined {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.name))
    return expr.name.text;
  return undefined;
}

/**
 * Extract method and property names from a class or interface member list.
 * Capped at `cap` total members to avoid overwhelming the graph.
 * Skips underscore-prefixed (private-convention) names.
 */
function extractMembers(
  members: import("typescript").NodeArray<
    import("typescript").ClassElement | import("typescript").TypeElement
  >,
  ts: TS,
  cap = 12,
): { methods: string[]; properties: string[] } {
  const methods: string[] = [];
  const properties: string[] = [];

  for (const m of members) {
    if (methods.length + properties.length >= cap) break;
    const name = m.name && ts.isIdentifier(m.name) ? m.name.text : null;
    if (!name || name.startsWith("_")) continue;

    if (ts.isMethodDeclaration(m) || ts.isMethodSignature(m)) {
      methods.push(name);
    } else if (ts.isPropertyDeclaration(m) || ts.isPropertySignature(m)) {
      properties.push(name);
    } else if (ts.isGetAccessor(m) || ts.isSetAccessor(m)) {
      properties.push(name);
    }
  }

  return { methods, properties };
}

/**
 * If a VariableDeclaration's initialiser is a function or arrow function
 * (possibly wrapped in a HOC call like `React.memo(fn)`), return it.
 */
function asFunctionLike(
  decl: import("typescript").VariableDeclaration,
  ts: TS,
):
  | import("typescript").FunctionExpression
  | import("typescript").ArrowFunction
  | undefined {
  const init = decl.initializer;
  if (!init) return undefined;
  if (ts.isFunctionExpression(init) || ts.isArrowFunction(init)) return init;
  if (ts.isCallExpression(init) && init.arguments.length > 0) {
    const first = init.arguments[0];
    if (ts.isFunctionExpression(first) || ts.isArrowFunction(first))
      return first;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// JSX component reference scanning
// ---------------------------------------------------------------------------

/**
 * Walks `root` recursively and collects the names of every uppercase JSX
 * element used — `<Button />`, `<Modal>…</Modal>`, `<Foo.Bar />` etc.
 * Lowercase tags (`<div>`, `<span>`) are HTML intrinsics and are ignored.
 */
function collectJsxRefs(root: import("typescript").Node, ts: TS): string[] {
  const refs = new Set<string>();

  function walk(n: import("typescript").Node) {
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
      const tag = n.tagName;
      if (ts.isIdentifier(tag) && /^[A-Z]/.test(tag.text)) {
        refs.add(tag.text);
      } else if (
        ts.isPropertyAccessExpression(tag) &&
        ts.isIdentifier(tag.expression)
      ) {
        // <Namespace.Component /> — record the namespace identifier
        refs.add(tag.expression.text);
      }
    }
    ts.forEachChild(n, walk);
  }

  walk(root);
  return Array.from(refs);
}

/**
 * Finds the `render()` method in a class body and returns its body block,
 * or `undefined` if no render method exists.
 */
function findRenderBody(
  members: import("typescript").NodeArray<import("typescript").ClassElement>,
  ts: TS,
): import("typescript").Block | undefined {
  for (const m of members) {
    if (
      ts.isMethodDeclaration(m) &&
      ts.isIdentifier(m.name) &&
      m.name.text === "render" &&
      m.body
    ) {
      return m.body;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Import helpers
// ---------------------------------------------------------------------------

/**
 * Returns true for project-internal module specifiers.
 * Relative paths and common root aliases (@/, ~/, #) are internal;
 * bare package names and scoped packages (@scope/pkg) are external.
 */
function isInternalSpecifier(spec: string): boolean {
  return (
    spec.startsWith(".") ||
    spec.startsWith("/") ||
    spec.startsWith("@/") ||
    spec.startsWith("~/") ||
    spec.startsWith("#")
  );
}

/**
 * Resolve the npm package name from an external specifier.
 * "@scope/name/deep" → "@scope/name"
 * "pkg/deep"        → "pkg"
 */
function packageName(spec: string): string {
  if (spec.startsWith("@")) {
    const parts = spec.split("/");
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0];
  }
  return spec.split("/")[0];
}

/**
 * If `node` is (or wraps) a dynamic `import("specifier")` call, return the
 * specifier string; otherwise return null.
 * Handles: `import("x")` and `await import("x")`.
 */
function dynamicImportSpecifier(
  node: import("typescript").Expression | undefined,
  ts: TS,
): string | null {
  if (!node) return null;
  if (ts.isAwaitExpression(node))
    return dynamicImportSpecifier(node.expression, ts);
  if (
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword
  ) {
    const arg = node.arguments[0];
    if (arg && ts.isStringLiteral(arg)) return arg.text;
  }
  return null;
}

/**
 * Extract destructured binding names from `ObjectBindingPattern`.
 * `const { a, b: localB }` → ["a", "b"]  (original names, not aliases).
 */
function objectBindingNames(
  pattern: import("typescript").BindingName,
  ts: TS,
): string[] {
  if (!ts.isObjectBindingPattern(pattern)) return [];
  return pattern.elements
    .map((el) => {
      // el.propertyName is the original name when aliased: { b: localB }
      const original = el.propertyName ?? el.name;
      return ts.isIdentifier(original) ? original.text : null;
    })
    .filter((n): n is string => n !== null);
}

// ---------------------------------------------------------------------------
// Line number helper
// ---------------------------------------------------------------------------

/**
 * Returns the 1-indexed start and end line numbers for a TypeScript AST node.
 * Uses `getStart` (skips leading trivia like comments) for the start position.
 */
function nodeLines(
  node: import("typescript").Node,
  sourceFile: import("typescript").SourceFile,
): { startLine: number; endLine: number } {
  const startChar = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const endChar = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  return { startLine: startChar.line + 1, endLine: endChar.line + 1 };
}

// ---------------------------------------------------------------------------
// Per-file extraction
// ---------------------------------------------------------------------------

function extractFromFile(
  path: string,
  content: string,
  ts: TS,
): Pick<RawModule, "entities" | "imports"> {
  const isTsx = path.endsWith(".tsx") || path.endsWith(".jsx");
  const segments = path.split("/");
  const fileName = segments[segments.length - 1].replace(/\.[jt]sx?$/, "");

  const sourceFile = ts.createSourceFile(
    path,
    content,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
  );

  const imports: RawImport[] = [];

  // ── Pass 1: collect static imports & re-exports ───────────────────────────
  // We also build `importedNames` (localName → specifier) for the JSX
  // component-usage scan in Pass 2.
  const importedNames = new Map<string, string>();

  ts.forEachChild(sourceFile, (node) => {
    // ── Static import declarations ─────────────────────────────────────────
    if (ts.isImportDeclaration(node)) {
      if (!ts.isStringLiteral(node.moduleSpecifier)) return;
      const spec = node.moduleSpecifier.text;
      const isInternal = isInternalSpecifier(spec);
      const names: string[] = [];

      const clause = node.importClause;
      if (clause) {
        // import Foo from '…'
        if (clause.name) {
          names.push(clause.name.text);
          importedNames.set(clause.name.text, spec);
        }
        if (clause.namedBindings) {
          if (ts.isNamedImports(clause.namedBindings)) {
            // import { A, B as LocalB } from '…'
            for (const el of clause.namedBindings.elements) {
              const original = el.propertyName?.text ?? el.name.text;
              names.push(original);
              importedNames.set(el.name.text, spec);
            }
          } else if (ts.isNamespaceImport(clause.namedBindings)) {
            // import * as Ns from '…'
            names.push("*");
            importedNames.set(clause.namedBindings.name.text, spec);
          }
        }
        // side-effect import (no clause) → names stays []
      }
      imports.push({ specifier: spec, isInternal, names, isDynamic: false });
      return;
    }

    // ── Re-export declarations ─────────────────────────────────────────────
    // export { A, B } from '…'  /  export * from '…'
    if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      if (!ts.isStringLiteral(node.moduleSpecifier)) return;
      const spec = node.moduleSpecifier.text;
      const isInternal = isInternalSpecifier(spec);
      const names: string[] = [];
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const el of node.exportClause.elements) {
          names.push(el.propertyName?.text ?? el.name.text);
        }
      } else {
        names.push("*"); // export * from '…'
      }
      imports.push({ specifier: spec, isInternal, names, isDynamic: false });
    }
  });

  // ── Pass 1b: dynamic imports ───────────────────────────────────────────────
  // Walk the full tree looking for `const { … } = await import("…")` patterns
  // and bare `import("…")` call expressions.
  function walkDynamic(node: import("typescript").Node) {
    if (ts.isVariableDeclaration(node)) {
      const spec = dynamicImportSpecifier(node.initializer, ts);
      if (spec !== null) {
        const isInternal = isInternalSpecifier(spec);
        const names = objectBindingNames(node.name, ts);
        imports.push({ specifier: spec, isInternal, names, isDynamic: true });
        return; // children of this declaration already handled
      }
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      // Bare import("…") not covered by a VariableDeclaration above
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteral(arg)) {
        const spec = arg.text;
        // Only add if not already captured as part of a variable binding
        const alreadyCaptured = imports.some(
          (i) => i.isDynamic && i.specifier === spec,
        );
        if (!alreadyCaptured) {
          imports.push({
            specifier: spec,
            isInternal: isInternalSpecifier(spec),
            names: [],
            isDynamic: true,
          });
        }
      }
      return;
    }
    ts.forEachChild(node, walkDynamic);
  }
  ts.forEachChild(sourceFile, walkDynamic);

  // ── Pass 2: extract entities ───────────────────────────────────────────────
  const entities: RawEntity[] = [];

  ts.forEachChild(sourceFile, (node) => {
    // ── Re-export declarations ─────────────────────────────────────────────
    // Already captured as RawImport entries in Pass 1 — skip here so they
    // are not mistakenly processed as entity declarations.
    if (ts.isExportDeclaration(node) && node.moduleSpecifier) return;

    // ── Class declarations ─────────────────────────────────────────────────
    if (ts.isClassDeclaration(node) && node.name) {
      const entity: RawEntity = {
        name: node.name.text,
        kind: "class",
        isExported: hasExport(node, ts),
      };
      for (const clause of node.heritageClauses ?? []) {
        if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
          entity.extends = heritageText(clause.types[0]?.expression, ts);
        } else if (clause.token === ts.SyntaxKind.ImplementsKeyword) {
          entity.implements = clause.types
            .map((t) => heritageText(t.expression, ts))
            .filter((s): s is string => !!s);
        }
      }
      const { methods, properties } = extractMembers(node.members, ts);
      if (methods.length) entity.methods = methods;
      if (properties.length) entity.properties = properties;

      // Class-based React components: scan the render() method body.
      const renderBody = findRenderBody(node.members, ts);
      if (renderBody) {
        const used = collectJsxRefs(renderBody, ts).filter(
          (n) => n !== entity.name,
        );
        if (used.length) entity.usesComponents = used;
      }

      Object.assign(entity, nodeLines(node, sourceFile));
      entities.push(entity);
      return;
    }

    // ── export default class expression ───────────────────────────────────
    if (
      ts.isExportAssignment(node) &&
      ts.isClassExpression(node.expression) &&
      node.expression.name
    ) {
      entities.push({
        name: node.expression.name.text,
        kind: "class",
        isExported: true,
        ...nodeLines(node, sourceFile),
      });
      return;
    }

    // ── Interface declarations ─────────────────────────────────────────────
    if (ts.isInterfaceDeclaration(node)) {
      const entity: RawEntity = {
        name: node.name.text,
        kind: "interface",
        isExported: hasExport(node, ts),
      };
      const extClause = (node.heritageClauses ?? []).find(
        (c) => c.token === ts.SyntaxKind.ExtendsKeyword,
      );
      if (extClause) {
        entity.extendsInterfaces = extClause.types
          .map((t) => heritageText(t.expression, ts))
          .filter((s): s is string => !!s);
      }
      const { methods, properties } = extractMembers(node.members, ts);
      if (methods.length) entity.methods = methods;
      if (properties.length) entity.properties = properties;
      Object.assign(entity, nodeLines(node, sourceFile));
      entities.push(entity);
      return;
    }

    // ── Enum declarations ──────────────────────────────────────────────────
    if (ts.isEnumDeclaration(node)) {
      entities.push({
        name: node.name.text,
        kind: "enum",
        isExported: hasExport(node, ts),
        properties: node.members
          .slice(0, 12)
          .map((m) => (ts.isIdentifier(m.name) ? m.name.text : ""))
          .filter(Boolean),
        ...nodeLines(node, sourceFile),
      });
      return;
    }

    // ── Exported type aliases ──────────────────────────────────────────────
    if (ts.isTypeAliasDeclaration(node) && hasExport(node, ts)) {
      entities.push({
        name: node.name.text,
        kind: "type",
        isExported: true,
        ...nodeLines(node, sourceFile),
      });
      return;
    }

    // ── Function declarations ──────────────────────────────────────────────
    if (ts.isFunctionDeclaration(node) && node.name) {
      const exported = hasExport(node, ts);
      const isComponent = isTsx && /^[A-Z]/.test(node.name.text);
      const entity: RawEntity = {
        name: node.name.text,
        kind: isComponent ? "component" : "function",
        isExported: exported,
        ...nodeLines(node, sourceFile),
      };
      if (isComponent && node.body) {
        const used = collectJsxRefs(node.body, ts).filter(
          (n) => n !== entity.name && importedNames.has(n),
        );
        if (used.length) entity.usesComponents = used;
      }
      entities.push(entity);
      return;
    }

    // ── export default function / arrow ───────────────────────────────────
    if (
      ts.isExportAssignment(node) &&
      (ts.isFunctionExpression(node.expression) ||
        ts.isArrowFunction(node.expression))
    ) {
      const fnNode = node.expression;
      const entity: RawEntity = {
        name: fileName,
        kind: isTsx ? "component" : "function",
        isExported: true,
        ...nodeLines(node, sourceFile),
      };
      if (isTsx && fnNode.body) {
        const body = ts.isBlock(fnNode.body) ? fnNode.body : fnNode.body;
        const used = collectJsxRefs(body, ts).filter(
          (n) => n !== entity.name && importedNames.has(n),
        );
        if (used.length) entity.usesComponents = used;
      }
      entities.push(entity);
      return;
    }

    // ── Exported const / let with function value ───────────────────────────
    if (ts.isVariableStatement(node) && hasExport(node, ts)) {
      for (const decl of node.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) continue;
        const fnLike = asFunctionLike(decl, ts);
        if (!fnLike) continue;
        const declName = decl.name.text;
        const isComponent = isTsx && /^[A-Z]/.test(declName);
        const entity: RawEntity = {
          name: declName,
          kind: isComponent ? "component" : "function",
          isExported: true,
          ...nodeLines(decl, sourceFile),
        };
        if (isComponent && fnLike.body) {
          const body = fnLike.body;
          const used = collectJsxRefs(body, ts).filter(
            (n) => n !== declName && importedNames.has(n),
          );
          if (used.length) entity.usesComponents = used;
        }
        entities.push(entity);
      }
    }
  });

  return { entities, imports };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Runs the AST extraction pass over every file in the map.
 * The TypeScript compiler is dynamically imported to keep it out of the main bundle.
 */
export async function extractAstGraph(
  files: Map<string, string>,
  name: string,
): Promise<RawGraph> {
  const ts = await import("typescript");

  const normalize = stripCommonPrefix(Array.from(files.keys()));
  const modules: RawModule[] = [];

  for (const [rawPath, content] of files) {
    const path = normalize(rawPath);
    if (!path || !SOURCE_FILE_RE.test(path)) continue;

    const segments = path.split("/");
    const pkg = segments.length > 1 ? segments[0] : "root";

    const { entities, imports } = extractFromFile(path, content, ts);
    const lineCount = content.split("\n").length;

    if (entities.length > 0 || imports.some((i) => !i.isInternal)) {
      modules.push({ path, pkg, entities, imports, lineCount });
    }
  }

  return { name, modules };
}
