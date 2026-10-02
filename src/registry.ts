/**
 * Element registry: the single extension point. Each element type is one module
 * exporting an {@link ElementDef}; parse/resolve/render iterate the registry
 * rather than a hard-coded switch. Adding an element = one new module + one
 * `register` line in `elements/index.ts`.
 */

import type { Token } from "./lexer.js";
import type { AstElement, ElementKind, ExprPoint, Point } from "./ast.js";
import type { Expr, ParseExprOpts, Value } from "./expr.js";
import type { Diagnostic } from "./diagnostics.js";
import type { ResolvedElement, RWall, RRoom } from "./ir.js";
import type { Bounds, WallSegment } from "./geometry.js";
import type { Theme } from "./theme.js";
import type { GeometryBackend } from "./geometry/backend.js";
import type { HatchDef } from "./hatches.js";
import type { RenderPass, RenderSizes, Paint, ScenePrim, SceneNode, Scene } from "./scene.js";
import type { Frame } from "./frame.js";
import type { Arc } from "./geometry/arc.js";
import type { Side } from "./algebra/d4.js";
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
  /** Is `value` a keyword that begins a plan/body statement (for parse recovery)? */
  isStatementStart(value: string): boolean;
  /** Parse a `(expr, expr)` point. */
  parsePoint(): ExprPoint;
  /** Parse an arithmetic expression. `opts` tunes the shared Pratt parser for one
   *  slot — see {@link import("./expr.js").ParseExprOpts}; there is deliberately no
   *  second expression grammar. */
  parseExpr(opts?: ParseExprOpts): Expr;
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
  /**
   * This storey's floor-to-floor height in mm (the vertical datum layer) — the
   * `level`'s own `height`, else the plan's, else `STOREY_HEIGHT` (`src/datum.ts`).
   *
   * It is on the context rather than looked up per element because the fallback chain must
   * have exactly one implementation: a wall with no `height` clause is this tall, and an
   * element that re-derived it would be the second place to get it wrong.
   */
  storeyHeight: number;
  /** Resolved walls, ready before openings resolve (walls resolve first). */
  walls: RWall[];
  /** Resolved rooms (absolute ones carry final coords; relational ones are placed
   *  after resolve, so their `at` is still a placeholder here). */
  rooms: RRoom[];
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
  /**
   * `true` when the wall lowering will **subtract every opening from the wall
   * solid** — i.e. the wall lowering has already opened a real hole at each
   * door/opening, jamb end-caps included, with the floor continuous through it.
   *
   * **`toScene` always sets it.** The joinery pass (`wall-lowering.ts`) cuts every
   * opening on every host — straight, angled and curved alike — so there is no shape of
   * plan whose passages are unvoided.
   *
   * The field stays because {@link RenderCtx} is append-only, and it stays OPTIONAL
   * because absent must keep meaning "assume nothing was voided" — a hand-built
   * `RenderCtx` (a plugin, a unit test) then keeps the safe opaque behaviour rather
   * than silently drawing a passage over solid wall.
   */
  openingsVoided?: boolean;
  /**
   * Is `p` INSIDE the building on the storey being drawn — on a room's floor, or in a
   * `void` (a stair well or double-height space has no floor here, but it is not outside)?
   * Asked of every room's own shape (its ring when it has one) and every void's rectangle,
   * after relational placement and after every `place` frame — the drawing's rooms, not
   * the partial list a resolver sees.
   *
   * A window asks it one wall thickness off its wall's CENTRELINE on each side (half a
   * thickness clear of each face) to find its EXTERIOR side — the side where the answer is
   * no — the probe `windowFacingPage` (`src/site.ts`) makes. Optional because this
   * interface is append-only: absent means "unknown", and an element must then draw
   * nothing that depends on the answer.
   */
  floorAt?(p: Point): boolean;
}

/**
 * Frame facade handed to `ElementDef.transform` — the rigid map a `place`d instance
 * applies to its resolved elements, so an element module (or a plugin) carries its own
 * fields across without importing `frame.ts`.
 *
 * The frame is a signed permutation plus a translation: exact, no trig, no float
 * introduced. Every method maps LOCAL (instance) coordinates to PLAN coordinates. Handed
 * facts — a door's swing, a dim's signed offset, a symbol's chirality — are the element's
 * own business: flip them when {@link TransformCtx.reflected} is true.
 */
export interface TransformCtx {
  /** The instance frame (read it; never mutate it). */
  readonly frame: Readonly<Frame>;
  /** The element's id, already namespaced by the instance path (`west.main`). */
  readonly id: string;
  /** Does the frame reverse orientation (`det < 0`)? */
  readonly reflected: boolean;
  /** Does the frame swap the x and y axes (a 90°/270° turn)? Then a centred `w`/`h` swap. */
  readonly swapsAxes: boolean;
  /** Map a point. */
  point(p: Point): Point;
  /** Map an axis-aligned rectangle given as TOP-LEFT + size (re-cornered, extents swapped). */
  rect(at: Point, size: { w: number; h: number }): { at: Point; size: { w: number; h: number } };
  /** Map a solved arc (sweep reverses under a reflection). */
  arc(a: Arc): Arc;
  /** Map a wall segment (a hosted opening's resolved host), namespacing its wall id. */
  segment(s: WallSegment): WallSegment;
  /** Carry a fixture's quarter-turn through the frame (the rotation part only). */
  quarterTurn(d?: number): 0 | 90 | 180 | 270;
  /** The side a rectangle side becomes (its outward normal pushed through the frame). */
  side(s: Side): Side;
  /** Namespace an id with the instance prefix (`main` → `west.main`). */
  nsId(id: string): string;
}

/**
 * Documentation for one element parameter — the single source consumed by the
 * LSP (hover, completion, signature help) and the docs. `optional` params render
 * in `[brackets]` in the synthesized signature.
 */
export interface ParamDoc {
  name: string;
  /** A short type hint, e.g. "point", "number", "string", "left|right". */
  type: string;
  /** Whether the parameter may be omitted. */
  optional?: boolean;
  /** Default applied at resolve when omitted (shown in hover). */
  default?: string;
  /** One-line human description. */
  doc: string;
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
  /**
   * Resolve one statement. Every expression it evaluates through `ctx` is charged to the
   * plan's evaluation-step budget (`MAX_EVAL_STEPS`, `E_STEP_LIMIT`). A plugin that calls
   * `compile()` (or `resolve()`) from in here starts a nested resolution with a FRESH budget
   * of its own: its work is not charged to the outer plan, and the outer budget resumes when
   * it returns. A step-limit crossing in the outer plan unwinds through this method; do not
   * catch what you did not throw.
   */
  resolve(node: AstElement, ctx: ResolveCtx): ResolvedElement;
  /** Points this element contributes to the drawing bounds. */
  bounds(resolved: ResolvedElement): Point[];
  /**
   * Every resolved coordinate and length of this element that {@link bounds} does not
   * already list (an opening's centre and width, a wall's thickness and arc radii, a
   * dimension's offset, a room's label anchor). The resolver holds these and the bounds to
   * the modelling range (`MODEL_RANGE_MM`, `E_OUT_OF_RANGE`). Optional: without it only the
   * bounds are checked.
   */
  measures?(resolved: ResolvedElement): number[];
  /**
   * An upper bound on the drawing primitives {@link render} emits for this element (a room
   * 3, a run its treads plus its arrow, a fixture its glyph). `compile()` sums every
   * element's estimate, plus one unit per point it reports in {@link bounds}, over the whole
   * building and refuses a plan past the drawing budget before anything is drawn
   * (`MAX_DRAW_UNITS`, `E_DRAWING_LIMIT`, `src/draw-budget.ts`). Optional: without it an
   * element is estimated at `DEFAULT_DRAW_COST` (72), which covers a fixed-size glyph; a kind
   * whose drawing grows with its size must declare it.
   */
  drawCost?(resolved: ResolvedElement): number;
  /** Emit positioned drawing primitives for this element (the Scene IR). */
  render(resolved: ResolvedElement, ctx: RenderCtx): SceneNode[];
  /** Parameter schema — one source for the LSP (hover/completion/signature) and
   *  the docs. Optional so third-party plugins need not provide it. */
  params?: readonly ParamDoc[];
  /** One-line summary of what the element draws (for hover). */
  doc?: string;
  /**
   * Carry a resolved element from a `place`d instance's local frame into plan
   * coordinates, returning a NEW element (never mutate `el`: a door's `host` aliases its
   * wall's points). Use `t.id` as the new id; `transformElement` stamps `_instance` /
   * `_component` afterwards. Optional for a plugin: a plugin that replaces a built-in
   * kind inherits the built-in's action, and a new kind without one is refused inside a
   * `place` with `E_INSTANCE_NO_TRANSFORM` (the element is dropped, never drawn
   * untransformed). An inherited action reads the BUILT-IN's resolved shape (its `at`,
   * `size`, `points`, …), so a replacement whose `resolve` returns a different shape must
   * provide its own `transform`.
   */
  transform?(el: ResolvedElement, t: TransformCtx): ResolvedElement;
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
  /**
   * Per-call geometry backend; overrides the module-global `getGeometryBackend()`.
   *
   * **DEPRECATED: nothing reads it.** `toScene` does not look a backend up,
   * because `wall-lowering.ts` joins every wall in closed form. Setting it is a no-op for
   * rendering; the field stays because {@link Runtime} is append-only. See ADR 0018.
   */
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
  if (def.transform !== undefined && typeof def.transform !== "function")
    throw new TypeError("registerElement: def.transform must be a function when given");
  if (def.measures !== undefined && typeof def.measures !== "function")
    throw new TypeError("registerElement: def.measures must be a function when given");
  if (def.drawCost !== undefined && typeof def.drawCost !== "function")
    throw new TypeError("registerElement: def.drawCost must be a function when given");
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
