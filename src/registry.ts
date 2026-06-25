/**
 * Element registry: the single extension point. Each element type is one module
 * exporting an {@link ElementDef}; parse/resolve/render iterate the registry
 * rather than a hard-coded switch. Adding an element = one new module + one
 * `register` line in `elements/index.ts`.
 */

import type { Token } from "./lexer.js";
import type { AstElement, ElementKind, ExprPoint, Point } from "./ast.js";
import type { Expr } from "./expr.js";
import type { Diagnostic } from "./diagnostics.js";
import type { ResolvedElement, RWall } from "./ir.js";
import type { Bounds, WallSegment } from "./geometry.js";
import type { Theme } from "./theme.js";
import type { RenderPass, RenderSizes, Paint, ScenePrim, SceneNode, Scene } from "./scene.js";

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
  /** Evaluate an expression-point to a concrete point. */
  evalPt(p: ExprPoint): Point;
  /** Resolved id of the element currently being resolved. */
  id: string;
  /** Resolved walls, ready before openings resolve (walls resolve first). */
  walls: RWall[];
  hostSegment(at: Point, ref?: string): WallSegment | null;
  isOnWall(at: Point, ref?: string): boolean;
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
}

/**
 * One element type. `TNode`/`TResolved` are the concrete node/IR types; the
 * registry stores these widened to the unions, and each module narrows via the
 * `kind` discriminant.
 */
export interface ElementDef {
  kind: ElementKind;
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
