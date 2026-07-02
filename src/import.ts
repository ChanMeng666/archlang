/**
 * Module linking — the `import` system.
 *
 * Between parse and resolve, `link()` walks a plan's `import` statements,
 * resolves each spec to a module path, reads it through the {@link World},
 * parses it, and merges the requested **components** into the importing plan.
 * This is the compiler's only file-reading phase; parse and resolve stay pure.
 *
 * Spec shapes (borrowed from Typst): a relative `.arch` path (`"lib/x.arch"`,
 * `"./x.arch"`) resolved against the importer's directory, or a namespaced
 * package `@local/name:major.minor.patch`. Named items may be renamed with
 * `as`; `*` brings in every component. Cyclic imports yield a diagnostic rather
 * than looping; a plan with no imports is a strict no-op (same PlanNode back).
 */

import type { ComponentDef, ImportNode, PlanNode } from "./ast.js";
import type { Diagnostic, Span } from "./diagnostics.js";
import type { Registry } from "./registry.js";
import type { World } from "./world.js";
import { parse } from "./parser.js";

/** Directory portion of a forward-slash path ("" for a bare filename). */
function dirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

/** Join + normalize a base dir with a relative spec into a canonical path (pure; no node:path). */
function joinPath(base: string, rel: string): string {
  const out: string[] = [];
  for (const seg of (base ? base.split("/") : []).concat(rel.split("/"))) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (out.length && out[out.length - 1] !== "..") out.pop();
      else out.push(seg);
    } else out.push(seg);
  }
  return out.join("/");
}

/** A namespaced package spec: `@namespace/name:major.minor.patch`. */
const PKG_SPEC = /^@([a-z0-9_-]+)\/([a-z0-9_./-]+):(\d+\.\d+\.\d+)$/i;

/** Resolve an import spec to a canonical module path, or an error message. */
function resolveSpec(spec: string, baseDir: string): { path: string } | { error: string } {
  if (spec.startsWith("@")) {
    const m = PKG_SPEC.exec(spec);
    if (!m) return { error: `Malformed package spec "${spec}" (expected @namespace/name:major.minor.patch)` };
    const [, ns, name, ver] = m;
    if (ns !== "local")
      return { error: `Unknown package namespace "@${ns}" in "${spec}" (only "@local" is supported)` };
    return { path: `@local/${name}/${ver}/index.arch` };
  }
  return { path: joinPath(baseDir, spec) };
}

type CompMap = Map<string, ComponentDef>;

/**
 * Load a module's component set (its own components plus those it imports),
 * memoized per canonical path. Returns `null` (and emits a diagnostic at the
 * import site) on a missing module or a cycle.
 */
function loadModule(
  path: string,
  world: World,
  registry: Registry,
  diagnostics: Diagnostic[],
  atSpan: Span | undefined,
  stack: Set<string>,
  cache: Map<string, CompMap | null>,
): CompMap | null {
  const cached = cache.get(path);
  if (cached !== undefined) return cached;
  if (stack.has(path)) {
    diagnostics.push({
      severity: "error",
      code: "E_IMPORT_CYCLE",
      message: `Cyclic import of module "${path}"`,
      span: atSpan,
    });
    return null;
  }
  const src = world.read(path);
  if (src == null) {
    diagnostics.push({
      severity: "error",
      code: "E_IMPORT_NOT_FOUND",
      message: `Cannot resolve imported module "${path}"`,
      span: atSpan,
    });
    cache.set(path, null);
    return null;
  }
  stack.add(path);
  const { plan, diagnostics: pdiags } = parse(src, registry);
  // Module spans don't map onto the importing source, so surface parse *errors*
  // at the import site, prefixed with the module path. (Warnings are dropped.)
  for (const d of pdiags) {
    if (d.severity === "error") {
      diagnostics.push({
        severity: "error",
        code: "E_IMPORT_PARSE",
        message: `In module "${path}": ${d.message}`,
        span: atSpan,
      });
    }
  }
  const comps: CompMap = new Map(plan?.components ?? []);
  if (plan) {
    for (const imp of plan.imports) mergeImport(comps, imp, dirOf(path), world, registry, diagnostics, stack, cache);
  }
  stack.delete(path);
  cache.set(path, comps);
  return comps;
}

/** Resolve one import statement and merge its components into `target`. */
function mergeImport(
  target: CompMap,
  imp: ImportNode,
  baseDir: string,
  world: World,
  registry: Registry,
  diagnostics: Diagnostic[],
  stack: Set<string>,
  cache: Map<string, CompMap | null>,
): void {
  const r = resolveSpec(imp.spec, baseDir);
  if ("error" in r) {
    diagnostics.push({ severity: "error", code: "E_IMPORT_BAD_SPEC", message: r.error, span: imp.span });
    return;
  }
  const mod = loadModule(r.path, world, registry, diagnostics, imp.span, stack, cache);
  if (!mod) return;

  const bind = (name: string, as: string): void => {
    const def = mod.get(name);
    if (!def) {
      diagnostics.push({
        severity: "error",
        code: "E_IMPORT_NOT_EXPORTED",
        message: `Module "${r.path}" has no exported component "${name}"`,
        span: imp.span,
      });
      return;
    }
    if (target.has(as)) {
      diagnostics.push({
        severity: "error",
        code: "E_IMPORT_CONFLICT",
        message: `Imported name "${as}" conflicts with an existing component`,
        span: imp.span,
      });
      return;
    }
    target.set(as, def);
  };

  if (imp.star) {
    for (const name of mod.keys()) bind(name, name);
  } else {
    for (const it of imp.items) bind(it.name, it.alias ?? it.name);
  }
}

/**
 * Resolve a plan's imports, returning a plan whose `components` map is augmented
 * with the imported ones. A no-import plan is returned **unchanged** (same
 * reference), guaranteeing byte-identical output for every import-free source.
 */
export function link(plan: PlanNode, world: World, registry: Registry): { plan: PlanNode; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  if (plan.imports.length === 0) return { plan, diagnostics };

  // Clone the components map so the (possibly stage-cached) parsed AST is never mutated.
  const merged: CompMap = new Map(plan.components);
  const stack = new Set<string>();
  const cache = new Map<string, CompMap | null>();
  for (const imp of plan.imports) mergeImport(merged, imp, "", world, registry, diagnostics, stack, cache);

  return { plan: { ...plan, components: merged }, diagnostics };
}
