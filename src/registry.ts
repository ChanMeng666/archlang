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

/**
 * Ordered render layers. Element ops are bucketed by pass and emitted in this
 * order, preserving source order within a pass — this exactly reproduces the
 * v0.1 global draw order (all wall fills, then all wall faces, doors before
 * windows, labels above fills, …).
 */
export const RENDER_PASSES = [
  "floor",
  "furniture",
  "wallFill",
  "wallFace",
  "doors",
  "windows",
  "labels",
  "dims",
  "annotations",
] as const;
export type RenderPass = (typeof RENDER_PASSES)[number];

export interface RenderOp {
  pass: RenderPass;
  svg: string;
}

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

export interface RenderSizes {
  refDim: number;
  wallStroke: number;
  thin: number;
  roomFont: number;
  areaFont: number;
  dimFont: number;
  furnFont: number;
  margin: number;
  hatchGap: number;
}

/** Render facade: number formatting, theme, derived sizes, and drawing bounds. */
export interface RenderCtx {
  fmt(v: number): string;
  pt(p: Point): string;
  xml(s: string): string;
  theme: Record<string, string>;
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
  render(resolved: ResolvedElement, ctx: RenderCtx): RenderOp[];
}
