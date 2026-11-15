/**
 * The digest bodies of the clause-order law (`test/clause-order-byte-identity.test.ts`),
 * importable WITHOUT vitest, so the baseline was taken by this very code against the tree
 * before the change (`test/helpers/byte-identity-digest.ts` says why a lookalike will not do).
 *
 * Two digests per plan:
 *  - the whole agent-facing surface, every storey's SVG + `describe()` + `lint()` +
 *    `compile().diagnostics` ({@link allStoreysDigestWithDiagnostics});
 *  - the PARSE: the `PlanNode` as JSON, its key order included (`arch ast --json` prints it),
 *    plus the parse diagnostics. The clause-order change lives in the parser, so this is the
 *    digest that would move first.
 */

import { readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { allStoreysDigestWithDiagnostics, type CompilerApi, sha256 } from "./byte-identity-digest.js";
import type { World } from "../../src/world.js";

export interface ClauseLawApi extends CompilerApi {
  parse(src: string): { plan?: unknown; diagnostics: unknown[] };
  /** A file-system World rooted at a plan's folder, for its `import`s. */
  worldAt(dir: string): World;
}

/** A `Map` (the plan's `components`) as its entries, so it reaches the digest at all. */
const mapsAsEntries = (_k: string, v: unknown): unknown => (v instanceof Map ? { map: [...v.entries()] } : v);

/** The parse of `src`: the AST, key order included, and its diagnostics. */
export function astPayload(api: ClauseLawApi, src: string): string {
  const { plan, diagnostics } = api.parse(src);
  return JSON.stringify([plan, diagnostics], mapsAsEntries);
}

export function astDigest(api: ClauseLawApi, src: string): string {
  return sha256(astPayload(api, src));
}

export function surfaceDigest(api: ClauseLawApi, src: string, file: string): string {
  return allStoreysDigestWithDiagnostics(api, src, { world: api.worldAt(dirname(file)) });
}

// —— The permutation property's helpers ————————————————————————————————————————

interface Span {
  start: number;
  end: number;
}
interface LexedToken {
  type: string;
  value: string;
  start: number;
  end: number;
}
/** What the permutation needs from the compiler: its lexer and its parser. */
export interface PermuteApi {
  lex(src: string): { tokens: LexedToken[] };
  parse(src: string): { plan?: unknown };
}

/** The statements whose clauses after the placement are permuted, and each one's clause words. */
export const PERMUTED: Record<string, ReadonlySet<string>> = {
  furniture: new Set(["size", "label", "rotate", "facing", "mirror", "clear", "in"]),
  room: new Set(["size", "label", "uses", "floor"]),
  door: new Set(["width", "wall", "hinge", "swing", "slide", "open", "head"]),
  window: new Set(["width", "wall", "hinge", "sill", "head"]),
  opening: new Set(["width", "wall", "head"]),
  outdoor: new Set(["size", "label", "rail"]),
};
/** Clause words whose next token is the clause's value, never a clause word. */
const VALUE_AFTER = new Set(["facing", "in", "wall"]);

/** Every statement {@link PERMUTED} names (strip rooms included) the parse of a file holds. */
export function permutable(planNode: unknown): { kind: string; span: Span }[] {
  const out: { kind: string; span: Span }[] = [];
  const seen = new Set<number>();
  const visit = (v: unknown, stripRoom: boolean): void => {
    if (Array.isArray(v)) {
      for (const x of v) visit(x, stripRoom);
      return;
    }
    if (v instanceof Map) {
      for (const x of v.values()) visit(x, false);
      return;
    }
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    const kind = typeof o.kind === "string" && o.kind in PERMUTED ? o.kind : stripRoom ? "room" : undefined;
    const span = o.span as Span | undefined;
    if (kind && span && !seen.has(span.start)) {
      seen.add(span.start);
      out.push({ kind, span });
    }
    for (const [k, x] of Object.entries(o)) if (k !== "span") visit(x, o.kind === "strip" && k === "rooms");
  };
  visit(planNode, false);
  return out;
}

/**
 * The clauses after the placement of one single-line statement, as source slices, and where the
 * first one starts; `null` when it has fewer than two (or spans lines, which the sweep leaves alone).
 */
export function clausesOf(
  api: PermuteApi,
  src: string,
  kind: string,
  span: Span,
): { from: number; parts: string[] } | null {
  if (src.slice(span.start, span.end).includes("\n")) return null;
  const ts = api.lex(src).tokens.filter((t) => t.type !== "eof" && t.start >= span.start && t.end <= span.end);
  if (ts[0]?.value !== kind) return null;
  let i = 1;
  const skipId = (): void => {
    if (ts[i]?.value === "id" && ts[i + 1]?.type === "equals") i += 3;
  };
  skipId();
  if (kind === "furniture" || kind === "outdoor") {
    i++; // the category or the surface kind
    skipId();
    if (kind === "furniture" && ts[i]?.value === "in") i += 2; // the room-relative placement's `in <room>`
  } else if ((kind === "door" || kind === "window") && !["at", "on", "between"].includes(ts[i]?.value ?? "")) {
    i++; // the kind word
    skipId();
  }
  const words = PERMUTED[kind]!;
  const starts: number[] = [];
  let depth = 0;
  for (let j = i; j < ts.length; j++) {
    const t = ts[j]!;
    if (t.type === "lparen") depth++;
    else if (t.type === "rparen") depth--;
    else if (
      depth === 0 &&
      t.type === "ident" &&
      words.has(t.value) &&
      ts[j + 1]?.type !== "lparen" &&
      ts[j + 1]?.type !== "equals" &&
      !VALUE_AFTER.has(ts[j - 1]?.value ?? "")
    )
      starts.push(j);
  }
  if (starts.length < 2) return null;
  const parts = starts.map((s, k) => src.slice(ts[s]!.start, ts[(starts[k + 1] ?? ts.length) - 1]!.end));
  return { from: ts[starts[0]!]!.start, parts };
}

/** `src` with every statement's clauses put in the order `order` gives, at the same length. */
export function permuted(
  api: PermuteApi,
  src: string,
  order: (parts: string[]) => string[],
): { src: string; count: Record<string, number> } {
  const edits: { start: number; end: number; text: string }[] = [];
  const count: Record<string, number> = {};
  for (const s of permutable(api.parse(src).plan)) {
    const c = clausesOf(api, src, s.kind, s.span);
    if (!c) continue;
    count[s.kind] = (count[s.kind] ?? 0) + 1;
    const text = src.slice(s.span.start, c.from) + order(c.parts).join(" ");
    edits.push({ start: s.span.start, end: s.span.end, text: text.padEnd(s.span.end - s.span.start, " ") });
  }
  let out = src;
  for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return { src: out, count };
}

/** Every `.arch` under `dir`, recursively, as root-relative POSIX paths, sorted by code unit. */
export function archFilesUnder(root: string, dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith(".arch")) out.push(relative(root, p).split("\\").join("/"));
    }
  };
  walk(join(root, dir));
  return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
