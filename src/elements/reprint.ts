/**
 * The memo and step charge for a fix that re-prints its whole statement (door, window, opening,
 * and the endpoint-swapped text a `dim` carries for `W_DIM_INSIDE`).
 *
 * Every such fix (and the door's hinge-flipped text `W_SWING_OBSTRUCTED` reads) re-prints the
 * whole statement, as long as its source, so each is built once per parse node and key per memo
 * scope. The scope is the storey's {@link ResolveCtx}, or for the off-wall fix the wall set it reads
 * (`ctx.walls`, reassigned per group on the same ctx), so a component placed twice never shares a
 * fix built against the other place's walls. Every scope is per compile, so a charge never depends
 * on an earlier compile; the key carries every other input the text varies by.
 *
 * The charge to the step meter is `1 +` the statement's source length, taken at the build, before
 * it. A build is free only when the statement is at most {@link REPRINT_FREE_BYTES} long AND it is
 * the node's first build of that fix `kind` in this ctx (a `kind` undefined, the door's flip text
 * built for every hinged door, has only the length test). Every other build is charged: a looped
 * statement, whose shared node yields a new key per iteration; a component's second place on one
 * storey; and every build of a statement past the allowance, on every storey.
 *
 * The free first build is per ctx, so it recurs per storey (two ctxs under `paper`): a component's
 * node is shared by every storey that places it. The byte allowance is what bounds that (backlog
 * RR.9): a free build prints at most {@link REPRINT_FREE_BYTES} bytes, a constant per statement
 * placed on a storey, which that placement already paid steps to resolve; a longer statement pays
 * its length on every storey, so a long statement placed by many storeys runs out of steps instead
 * of growing as storeys × statement length uncharged. The allowance cannot be one per compile: a
 * storey's resolution is memoised on that storey's own inputs (`resolveCached`, `src/ir.ts`), so
 * its charge may not depend on what an earlier storey built. Every shipped door, window, opening
 * and dim statement is far shorter than the allowance, so their step payloads are what they were.
 *
 * The dim's swap text varies by nothing but its node, so its key is constant and a ctx builds it
 * once: like the flip text it is built whether or not its warning fires, so it is bound by the same
 * allowance. `W_UNKNOWN_FURNITURE`'s fix keeps its own memo (`categoryFix`,
 * `src/elements/furniture.ts`), which charges every build, the first included.
 */
import type { Span } from "../diagnostics.js";
import type { ResolveCtx } from "../registry.js";
import { chargeSteps } from "../expr.js";

/** A parse node whose fix re-prints it: keyed by identity, charged by its source span. */
export interface ReprintNode {
  span?: Span;
}

/**
 * The longest statement (source bytes) whose first build of a fix `kind` per ctx is free: a few
 * times longer than any door, window, opening or dim statement in the shipped examples, so no
 * pinned step payload moves. The free work it leaves is up to 256 bytes per build, per kind, per
 * statement placed on a storey: linear in placements, but not small. A hinged door builds its flip
 * text on every placement, so 550 hinged 255-byte doors in a component placed by 550 levels took
 * about 26 s within budget at review time (backlog RR.25).
 */
export const REPRINT_FREE_BYTES = 256;

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
  const length = n.span ? n.span.end - n.span.start : 0;
  if (length > REPRINT_FREE_BYTES) chargeSteps(1 + length);
  else if (kind !== undefined) {
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
    if (kinds.has(kind)) chargeSteps(1 + length);
    else kinds.add(kind);
  }
  const built = build();
  byKey.set(key, built);
  return built;
}
