/**
 * Element registry: the single extension point. Each element type is one module
 * exporting an {@link ElementDef}; parse/resolve/render iterate the registry
 * rather than a hard-coded switch. Adding an element = one new module + one
 * `register` line in `elements/index.ts`.
 */

import type { Token } from "./lexer.js";
import type { AstElement, ElementKind, ExprPoint, Point } from "./ast.js";
import type { Expr, Value } from "./expr.js";
import type { Diagnostic } from "./diagnostics.js";
import type { ResolvedElement, RWall } from "./ir.js";
import type { Bounds, WallSegment } from "./geometry.js";
import type { Theme } from "./theme.js";
import type { GeometryBackend } from "./geometry/backend.js";
import type { HatchDef } from "./hatches.js";
import type { RenderPass, RenderSizes, Paint, ScenePrim, SceneNode, Scene } from "./scene.js";
import { BUILTIN_DEFS } from "./elements/defs.js";

// The layer ordering + Scene types now live in `scene.ts` (the backend-neutral
// IR). Re-exported here so existing element/render imports keep working.
export { RENDER_PASSES } from "./scene.js";
export type { RenderPass, RenderSizes, Paint, ScenePrim, SceneNode, Scene };

/** Parser facade handed to `ElementDef.parse` — the existing recursive-descent helpers. */
export interface ParseCtx {
  peek(o?: number): Token;
  next(): Token;
  eat(type: Token["type"]): Token;
  eatKeyword(kw: string): Token;
  eatIdent(): Token;
  eatNumber(): number;
  eatString(): string;
  isKeyword(kw: string, o?: number): boolean;
  isType(type: Token["type"]): boolean;
  /** Parse a `(expr, expr)` point. */
  parsePoint(): ExprPoint;
  /** Parse an arithmetic expression. */
  parseExpr(): Expr;
  /** Parse a size: either a `WxH` dimension literal or `<expr> x <expr>`. */
  parseDimensions(): { w: Expr; h: Expr };
  /** Parse a string literal as an expression (a string-interpolation template),
   *  evaluated to text at resolve via {@link ResolveCtx.evalStr}. */
  parseStringExpr(): Expr;
  parseIdOpt(): string;
  /** Report a fatal parse error at `t` (defaults to the current token); never returns. */
  fail(msg: string, t?: Token): never;
}

/** Semantic-analysis facade handed to `ElementDef.resolve`. */
export interface ResolveCtx {
  grid: number;
  snap(v: number): number;
  snapPt(p: Point): Point;
  /** Evaluate an expression against the current binding environment. */
  eval(e: Expr): number;
  /** Evaluate an expression to a string (for interpolated labels/text). */
  evalStr(e: Expr): string;
  /** Evaluate an expression-point to a concrete point. */
  evalPt(p: ExprPoint): Point;
  /** Resolved id of the element currently being resolved. */
  id: string;
  /** Resolved walls, ready before openings resolve (walls resolve first). */
  walls: RWall[];
  hostSegment(at: Point, ref?: string): WallSegment | null;
  isOnWall(at: Point, ref?: string): boolean;
  /** Active `set <kind>(…)` overrides for the element being resolved (by attr
   *  name), or undefined when none are in scope. Elements apply these only to
   *  attributes the user left unspecified. */
  defaults?: ReadonlyMap<string, Value>;
  /** Current time from the {@link import("./world.js").World} seam, when provided.
   *  Absent unless the caller supplied a World with `now` — so time-dependent
   *  output is always injectable (never a hidden `Date.now()`) and stays
   *  deterministic in tests. */
  now?(): Date;
  diag(d: Diagnostic): void;
}

/**
 * Render facade handed to `ElementDef.render`. Elements emit positioned
 * primitives ({@link SceneNode}) — no string building — so they need only the
 * resolved theme (colours), derived sizes (font/stroke numbers), and the drawing
 * bounds. Number formatting + XML escaping now live in the backends.
 */
export interface RenderCtx {
  theme: Theme;
  sizes: RenderSizes;
  bounds: Bounds;
  /**
   * Deterministic millimetre formatter for *computed label text* (e.g. a
   * dimension's measured length when no explicit `text` is given). Rounds to 2
   * decimals and strips trailing zeros, so the value an element bakes into a
   * `text` primitive reads identically in every backend (SVG, DXF, …).
   */
  fmt(n: number): string;
}

/**
 * One element type. `TNode`/`TResolved` are the concrete node/IR types; the
 * registry stores these widened to the unions, and each module narrows via the
 * `kind` discriminant.
 */
export interface ElementDef {
  /** Discriminant used for id-assignment, resolve, and scene dispatch. Built-ins
   *  use the {@link ElementKind} union; third-party plugins may introduce a new
   *  string kind (dispatch is by string equality, so any unique value works). */
  kind: ElementKind | (string & {});
  keyword: string;
  parse(ctx: ParseCtx): AstElement;
  /** Auto-id prefix (e.g. "room", or a wall/furniture's category). */
  idPrefix(node: AstElement): string;
  resolve(node: AstElement, ctx: ResolveCtx): ResolvedElement;
  /** Points this element contributes to the drawing bounds. */
  bounds(resolved: ResolvedElement): Point[];
  /** Emit positioned drawing primitives for this element (the Scene IR). */
  render(resolved: ResolvedElement, ctx: RenderCtx): SceneNode[];
}

/**
 * A per-call element registry. Parsing dispatches by **keyword**; id assignment,
 * resolve, and scene-building look up by **kind**; `order` fixes id/resolve order
 * (walls first → openings host against them). Built via {@link createRegistry},
 * never mutated, so it is safe to key the compile cache on plugin identity.
 */
export interface Registry {
  byKeyword: ReadonlyMap<string, ElementDef>;
  byKind: ReadonlyMap<ElementKind | string, ElementDef>;
  order: readonly ElementDef[];
}

/**
 * Build a fresh registry from the static built-ins plus optional `plugins`. A
 * plugin whose `kind` matches a built-in **replaces it in the built-in's slot**
 * (so wall-first ordering is preserved and a kind is never resolved twice); a
 * plugin with a new kind appends after the built-ins. Always returns new objects
 * cloned from the frozen `BUILTIN_DEFS` — there is no global mutation.
 */
export function createRegistry(plugins: readonly ElementDef[] = []): Registry {
  const order: ElementDef[] = [...BUILTIN_DEFS];
  for (const p of plugins) {
    const i = order.findIndex((d) => d.kind === p.kind);
    if (i >= 0) order[i] = p;
    else order.push(p);
  }
  const byKeyword = new Map<string, ElementDef>();
  const byKind = new Map<ElementKind | string, ElementDef>();
  for (const d of order) {
    byKeyword.set(d.keyword, d);
    byKind.set(d.kind, d);
  }
  return { byKeyword, byKind, order };
}

/** The default registry (built-ins only). Used whenever no `plugins` are supplied. */
export const BUILTIN_REGISTRY: Registry = createRegistry();

/**
 * Per-call extension context threaded into scene-building. Bundles the element
 * {@link Registry} with optional per-call overrides (geometry backend; named
 * hatches/themes are consumed by later stages). All optional fields default to
 * the existing global/built-in behavior, so an absent runtime is byte-identical.
 */
export interface Runtime {
  registry: Registry;
  /** Per-call geometry backend; overrides the module-global `getGeometryBackend()`. */
  backend?: GeometryBackend | null;
  /** Per-call named themes, selectable via `theme <name>` (override built-in THEMES). */
  themes?: ThemePlugin[];
}

/** The default runtime (built-in registry, global backend). */
export const BUILTIN_RUNTIME: Runtime = { registry: BUILTIN_REGISTRY };

/**
 * Validate + pass through a third-party element. The headline extension point:
 * `compile(src, { plugins: [registerElement(myDef)] })` (or just the bare def)
 * adds an element with zero core edits. Throws on a malformed def so mistakes
 * surface at registration, not deep in the parser.
 */
export function registerElement(def: ElementDef): ElementDef {
  if (!def || typeof def !== "object") throw new TypeError("registerElement: expected an ElementDef object");
  if (!def.keyword) throw new TypeError("registerElement: def.keyword is required");
  if (!def.kind) throw new TypeError("registerElement: def.kind is required");
  for (const m of ["parse", "idPrefix", "resolve", "bounds", "render"] as const) {
    if (typeof def[m] !== "function") throw new TypeError(`registerElement: def.${m} must be a function`);
  }
  return def;
}

/** A named theme contributed per call; resolved by `theme <name> { … }` (T4.4). */
export interface ThemePlugin {
  readonly kind: "theme";
  readonly name: string;
  readonly theme: Partial<Theme>;
}

/** Register a named theme available to the importing compile (not a global). */
export function registerTheme(name: string, theme: Partial<Theme>): ThemePlugin {
  if (!name) throw new TypeError("registerTheme: name is required");
  return { kind: "theme", name, theme: { ...theme } };
}

/** The shape a custom hatch supplies (mirrors the built-in hatch metadata). */
export interface HatchMetaInput {
  /** Natural rotation (deg) baked in before the user `angle`. */
  natural: number;
  /** DXF HATCH pattern name (group code 2) for CAD export. */
  dxfPattern: string;
  /** Builds the inner `<pattern>` markup. */
  build: HatchDef;
}

/** A named hatch contributed per call, selectable via `material <name>`. */
export interface HatchPlugin extends HatchMetaInput {
  readonly kind: "hatch";
  readonly name: string;
}

/** Register a named hatch material available to the importing compile. */
export function registerHatch(name: string, def: HatchMetaInput): HatchPlugin {
  if (!name) throw new TypeError("registerHatch: name is required");
  if (typeof def?.build !== "function") throw new TypeError("registerHatch: def.build must be a function");
  return { kind: "hatch", name, natural: def.natural, dxfPattern: def.dxfPattern, build: def.build };
}

/** Validate + pass through a per-call geometry backend (overrides the global). */
export function registerBackend(backend: GeometryBackend): GeometryBackend {
  for (const m of ["union", "difference", "offset"] as const) {
    if (typeof backend?.[m] !== "function") throw new TypeError(`registerBackend: backend.${m} must be a function`);
  }
  return backend;
}
