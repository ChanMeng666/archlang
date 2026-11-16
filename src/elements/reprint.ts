/**
 * The memo and step charge for a fix that re-prints its whole statement (door, window, opening).
 *
 * Every such fix (and the door's hinge-flipped text `W_SWING_OBSTRUCTED` reads) re-prints the
 * whole statement, as long as its source, so each is built once per parse node and key per memo
 * scope. The scope is the storey's {@link ResolveCtx}, or for the off-wall fix the wall set it reads
 * (`ctx.walls`, reassigned per group on the same ctx), so a component placed twice never shares a
 * fix built against the other place's walls. Every scope is per compile, so a charge never depends
 * on an earlier compile; the key carries every other input the text varies by.
 *
 * The step charge is the statement's source length, taken only at the site where a fix's
 * diagnostic fires, before the build. A node's first build of each fix `kind` per ctx is free, so a
 * plan whose openings each print a fix once costs exactly what it did and no pinned step payload
 * moves. That allowance is NOT bounded by source size: a component's node is shared by every
 * storey that places it, and each storey (two under `paper`) is a new ctx, so free builds grow as
 * storeys × statement length (backlog RR.9). Every further build (a looped statement, whose shared
 * node yields a new key per iteration; a component's second place) is charged. A build with `kind`
 * undefined (the door's flip text, built for every hinged door) is never charged.
 */
import type { Span } from "../diagnostics.js";
import type { ResolveCtx } from "../registry.js";
import { chargeSteps } from "../expr.js";

/** A parse node whose fix re-prints it: keyed by identity, charged by its source span. */
export interface ReprintNode {
  span?: Span;
}

const REPRINTS = new WeakMap<object, Map<ReprintNode, Map<string, unknown>>>();
const FREE_BUILDS = new WeakMap<ResolveCtx, Map<ReprintNode, Set<string>>>();

export function reprint<T>(
  ctx: ResolveCtx,
  n: ReprintNode,
  kind: string | undefined,
  key: string,
  build: () => T,
  scope: object = ctx,
): T {
  let byNode = REPRINTS.get(scope);
  if (!byNode) {
    byNode = new Map();
    REPRINTS.set(scope, byNode);
  }
  let byKey = byNode.get(n);
  if (!byKey) {
    byKey = new Map();
    byNode.set(n, byKey);
  }
  if (byKey.has(key)) return byKey.get(key) as T;
  if (kind !== undefined) {
    let free = FREE_BUILDS.get(ctx);
    if (!free) {
      free = new Map();
      FREE_BUILDS.set(ctx, free);
    }
    let kinds = free.get(n);
    if (!kinds) {
      kinds = new Set();
      free.set(n, kinds);
    }
    if (kinds.has(kind)) chargeSteps(1 + (n.span ? n.span.end - n.span.start : 0));
    else kinds.add(kind);
  }
  const built = build();
  byKey.set(key, built);
  return built;
}
