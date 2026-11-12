/**
 * Resolution groups and the per-element bookkeeping around them: the expanded stream partitioned
 * by `place` frame (one group per instance, the root last), an instance's view of its
 * descendants, the pre-charge for wall-deriving statements, id assignment, the placement marker,
 * demolition (`status demolish`) and opening registration.
 *
 * Invariant: an instance sees its descendants and never its parent or siblings (ADR 0016 §3), and
 * an opening finds its wall by id, never by coordinates. Step meter: nothing here calls
 * `chargeSteps`. {@link chargeDerivedElements} charges the element budget instead
 * (`MAX_ELEMENTS`, `E_ELEMENT_LIMIT`), before anything is derived.
 */

import type { AstElement, DoorNode, FurnitureNode, OpeningNode, WindowNode } from "../ast.js";
import type { Frame } from "../frame.js";
import { composeFrame, tryTransformElement } from "../frame.js";
import type { Diagnostic, Span } from "../diagnostics.js";
import { fmt3 } from "../num-format.js";
import type { Registry } from "../registry.js";
import type { WallSegment } from "../geometry.js";
import { segmentsOfWall } from "../geometry.js";
import type { RWall, RRoom, RDoor, RWindow, ROpening, ResolvedElement, ResolvedPlan } from "./types.js";
import type { Entry, ElementBudget } from "./expand.js";
import { MAX_ELEMENTS, stampProvenance } from "./expand.js";

/** One resolution group: the entries of a single coordinate frame. */
export interface ResolveGroup {
  /** The instance frame, or absent for the root plan. */
  frame?: Frame;
  entries: Entry[];
}

/** What resolving one instance group produced, held until the groups are committed. */
export interface PlacedGroup {
  /** Every diagnostic the group raised, in the order it raised them. */
  diagnostics: Diagnostic[];
  /** Each entry's element in the instance's LOCAL frame, parallel to the group's entries. */
  local: ResolvedElement[];
  /** The elements carried into plan coordinates, in entry order (dropped ones absent). */
  carried: ResolvedElement[];
}

/** How many `place`s enclose this instance's own (0 for a top-level instance). */
function frameDepth(f: Frame): number {
  let n = 0;
  for (let p = f.parent; p; p = p.parent) n++;
  return n;
}

/**
 * The instance groups in resolution order: deepest first, ties in the original order. Every
 * descendant of an instance is strictly deeper, so it resolves before the instance does.
 */
export function deepestFirst(groups: readonly ResolveGroup[]): ResolveGroup[] {
  return groups
    .flatMap((grp, i) => (grp.frame ? [{ grp, i, depth: frameDepth(grp.frame) }] : []))
    .sort((x, y) => y.depth - x.depth || x.i - y.i)
    .map((x) => x.grp);
}

/**
 * The frame that carries descendant `d`'s local coordinates into `ancestor`'s: the authored
 * `place` frames between them, composed outermost first, with ids named relative to the
 * ancestor (`g.c2.main` is `c2.main` in `g`). That is the frame `d` would have if the
 * ancestor's body were compiled as the plan, by the same frame arithmetic. It is NOT the
 * frame `d`'s elements reach the plan by: a host found on this view is carried on by the
 * ancestor's frame, `tp(A, tp(rel, p))`, while `d`'s own wall goes through the composed
 * frame, `tp(A∘rel, p)` — equal for integers, not always for floats (grid 0). Which is why
 * `registerOpenings` matches a host to its wall by id, never by coordinates.
 * `undefined` when `d` is not a descendant of `ancestor`. Walking the chain per
 * (group, descendant) pair is quadratic in the nesting, which place depth keeps small.
 */
function relativeFrame(ancestor: Frame, d: Frame): Frame | undefined {
  const chain: Frame[] = [];
  let f: Frame | undefined = d;
  for (; f && f !== ancestor; f = f.parent) chain.push(f);
  if (!f || chain.length === 0) return undefined;
  const localOf = (x: Frame): Frame => x.local ?? x;
  let rel = localOf(chain[chain.length - 1]!);
  for (let i = chain.length - 2; i >= 0; i--) rel = composeFrame(rel, localOf(chain[i]!));
  return { ...rel, prefix: d.prefix.slice(ancestor.prefix.length + 1) };
}

/**
 * The walls and rooms instance group `grp` can reach before its own: every descendant
 * instance's, carried into `grp`'s local frame by {@link relativeFrame}, in the original
 * group order — the order the plan-wide arrays hold instances in. Siblings and ancestors are
 * not descendants, so they never appear (a component cannot reach out of itself).
 */
export function descendantView(
  grp: ResolveGroup,
  groups: readonly ResolveGroup[],
  placed: ReadonlyMap<ResolveGroup, PlacedGroup>,
  registry: Registry,
): { walls: RWall[]; rooms: RRoom[]; refusedWalls: string[] } {
  const walls: RWall[] = [];
  const rooms: RRoom[] = [];
  const refusedWalls: string[] = [];
  for (const d of groups) {
    const done = placed.get(d);
    if (!d.frame || !done) continue;
    const rel = relativeFrame(grp.frame!, d.frame);
    if (!rel) continue;
    const derived: RWall[] = [];
    for (const local of done.local) {
      const def = registry.byKind.get(local.kind);
      if (local.kind !== "wall" && local.kind !== "room" && !def?.yieldsWalls) continue;
      const v = tryTransformElement(rel, local, def);
      // A refusal is neither a wall nor a room: the descendant's own pass already dropped
      // and reported it.
      if (typeof v === "string") continue;
      if (v.kind === "wall") {
        if (v.points.length > 0) walls.push(v);
        else refusedWalls.push(v.id);
      } else if (v.kind === "room") rooms.push(v);
      else derived.push(...(def?.yieldsWalls?.(v) ?? []));
    }
    for (const w of derived) walls.push(w);
  }
  return { walls, rooms, refusedWalls };
}

/**
 * Partition the expanded entry stream by coordinate frame — one group per `place`d
 * instance (keyed on the frame OBJECT, which every entry of that instance shares), plus
 * the root plan.
 *
 * Instance groups come FIRST, in first-appearance order, and the root LAST. That is the
 * order the groups' effects are COMMITTED in (the plan-wide wall/room arrays, `instances`,
 * diagnostics); the instances RESOLVE deepest first ({@link deepestFirst}) so each one can
 * reference its descendants, and the root resolves last so it can reference every
 * instance (`door on west.perimeter`). Element ORDER in the drawing is untouched —
 * `elements` is rebuilt from `entries` in source order after every group has resolved.
 *
 * A plan with no `place` yields exactly one group holding every entry: the historical
 * single pass.
 */
export function groupEntries(entries: Entry[]): ResolveGroup[] {
  const byFrame = new Map<Frame, Entry[]>();
  const root: Entry[] = [];
  for (const e of entries) {
    if (!e.frame) {
      root.push(e);
      continue;
    }
    const got = byFrame.get(e.frame);
    if (got) got.push(e);
    else byFrame.set(e.frame, [e]);
  }
  const out: ResolveGroup[] = [];
  for (const [frame, grouped] of byFrame) out.push({ frame, entries: grouped });
  out.push({ entries: root });
  return out;
}

/**
 * What one `walls from rooms` statement is charged per room of its group at expansion, toward
 * {@link MAX_ELEMENTS}, before anything resolves (ADR 0028 §3, "Bounds, charged before
 * allocating"): `6n` partition pieces and `4n` ring vertices for `n` rooms. It is NOT an upper
 * bound on what the statement derives: every authored wall lying on a derived line splits it
 * once more, so the derivation counts its real walls again before allocating them and charges
 * any excess over this pre-charge (`ResolveCtx.elementBudget`, `E_ELEMENT_LIMIT`).
 */
export const DERIVED_ELEMENTS_PER_ROOM = 10;

/**
 * Count each wall-deriving statement (`ElementDef.yieldsWalls`) toward the element budget
 * with the upper bound of what it can derive, once expansion is done and the groups are
 * known: `DERIVED_ELEMENTS_PER_ROOM` per room its group declares. A statement that would
 * cross the cap is `E_ELEMENT_LIMIT` at the statement, reported once, and it and every later
 * deriving statement are removed, so nothing past the cap is derived. A plan with no such
 * statement is untouched.
 */
export function chargeDerivedElements(
  entries: Entry[],
  groups: ResolveGroup[],
  registry: Registry,
  budget: ElementBudget,
  diagnostics: Diagnostic[],
): Map<Entry, number> {
  const charged = new Map<Entry, number>();
  const refused = new Set<Entry>();
  for (const grp of groups) {
    let rooms = -1;
    for (const e of grp.entries) {
      const def = registry.byKind.get(e.node.kind);
      // A statement that is no deriver may still count toward the budget beyond itself (a
      // `wall … around` ring, ADR 0028 §4): `ElementDef.expansionCharge`.
      const extra = def?.yieldsWalls ? undefined : def?.expansionCharge?.(e.node);
      if (!def?.yieldsWalls && !(extra && extra.count > 0)) continue;
      if (budget.capped) {
        refused.add(e);
        continue;
      }
      let count: number;
      let what: string;
      if (extra) {
        count = extra.count;
        what = extra.what;
      } else {
        if (rooms < 0) rooms = grp.entries.filter((x) => x.node.kind === "room").length;
        count = DERIVED_ELEMENTS_PER_ROOM * rooms;
        charged.set(e, count);
        what = `\`walls from rooms\` over ${rooms} rooms may derive up to ${count} walls`;
      }
      budget.count += count;
      if (budget.count <= MAX_ELEMENTS) continue;
      budget.capped = true;
      refused.add(e);
      diagnostics.push(
        stampProvenance(
          {
            severity: "error",
            message: `Plan expands to more than ${MAX_ELEMENTS} elements: ${what}, so it derives none`,
            code: "E_ELEMENT_LIMIT",
            ...(e.node.span ? { span: e.node.span } : {}),
          },
          e.frame,
          e.file,
        ),
      );
    }
  }
  if (refused.size === 0) return charged;
  const keep = (e: Entry): boolean => !refused.has(e);
  const kept = entries.filter(keep);
  entries.length = 0;
  entries.push(...kept);
  for (const grp of groups) grp.entries = grp.entries.filter(keep);
  return charged;
}

/** Assign ids in registry order: explicit ids are checked for duplicates; missing
 *  ones get `<prefix>_<n>` numbered globally per kind, so auto-ids stay unique
 *  across component instances. */
export function assignIds(entries: Entry[], registry: Registry, diagnostics: Diagnostic[]): void {
  const seen = new Set<string>();
  const assignId = (provided: string, prefix: string, idx: number, span?: Span): string => {
    if (provided) {
      if (seen.has(provided)) {
        diagnostics.push({ severity: "error", message: `Duplicate id "${provided}"`, code: "E_DUP_ID", span });
      }
      seen.add(provided);
      return provided;
    }
    let auto = `${prefix}_${idx}`;
    while (seen.has(auto)) auto = `${auto}_`;
    seen.add(auto);
    return auto;
  };
  for (const def of registry.order) {
    let idx = 0;
    for (const e of entries) {
      if (e.node.kind !== def.kind) continue;
      idx++;
      e.idAuthored = Boolean(e.node.id);
      e.id = assignId(e.node.id, def.idPrefix(e.node), idx, e.node.span);
    }
  }
  // The ids a statement gives the elements it derives (`ElementDef.authoredChildIds`): checked
  // against every other id, after them, so a duplicate is reported on the later name.
  for (const e of entries) {
    for (const c of registry.byKind.get(e.node.kind)?.authoredChildIds?.(e.node) ?? []) assignId(c.id, "", 0, c.span);
  }
}

/**
 * Record how an element's position was authored — the degrees-of-freedom marker
 * read by `describe().freedom`. Pure classification from the AST node (and the
 * strip origin); sets an internal `_placement` field that never reaches the Scene.
 * `node.kind === r.kind` here (the resolve loop matches by kind), so the casts are safe.
 */
export function markPlacement(r: ResolvedElement, node: AstElement, fromStrip: boolean): void {
  switch (r.kind) {
    case "room":
      r._placement = fromStrip ? "strip" : r._rel !== undefined ? "relational" : "absolute";
      return;
    case "door":
    case "window":
    case "opening":
      // A relational opening (ADR 0028 §5) marked itself when it resolved.
      if (r._placement === "relational") return;
      r._placement = (node as DoorNode | WindowNode | OpeningNode).attach !== undefined ? "attached" : "absolute";
      return;
    case "furniture": {
      const fn = node as FurnitureNode;
      r._placement =
        fn.againstEdge !== undefined
          ? "relational"
          : fn.against !== undefined
            ? "against-wall"
            : fn.place !== undefined
              ? "anchored"
              : "absolute";
      return;
    }
    // Kinds `describe().freedom` does not place: no `_placement`.
    case "wall":
    case "dim":
    case "column":
    case "stair":
    case "elevator":
    case "escalator":
    case "roof":
    case "void":
    case "outdoor":
    case "fence":
    case "walls":
    case "section":
      return;
    default: {
      // A new element kind with no case fails the typecheck here.
      const unhandled: never = r;
      void unhandled;
    }
  }
}

/**
 * Each hosted door/window/opening voids its wall's solid. The owning wall is found by
 * IDENTITY: the host segment came from `segmentsOfWall`, so it carries its wall's id, and a
 * `place` frame namespaces that id with the same `nsId` as the wall's own. Coordinates are
 * not an identity: a host an instance found on a DESCENDANT's wall was carried by the
 * descendant's frame and then by the instance's (`tp(P, tp(C, s))`), while the wall itself
 * was carried by the composed frame (`tp(P∘C, s)`) — the same point by two float evaluation
 * orders, which need not be equal when the grid is 0. Endpoint equality survives only to
 * choose among walls that share an id (an `E_DUP_ID` plan), and as the fallback for a host
 * whose id names no wall.
 */
/**
 * {@link ResolvedPlan}'s `elements`/`walls`/`drawn` from the storey as resolved (B3a): the very
 * arrays when no wall is `status demolish`, else the plan after the demolition plus `drawn`.
 *
 * The plan after the demolition drops every demolished wall and every opening a `walls from rooms
 * … status demolish` statement derived on one (it stood in the wall). An opening step 3d re-hosted
 * on a standing wall is a copy carrying its new host, and that wall a copy carrying the opening,
 * so the drawn objects (the hosting the drawing always had) are never touched.
 *
 * The plan as drawn drops that derived opening too (A8): it goes with its wall, so the sheet draws
 * no opening, tags none and schedules none that `describe()` does not know. The demolished wall
 * keeps the void the opening cut in it: that gap is the wall's own outline as it stands before the
 * works, and the wall is drawn dashed with it.
 */
export function afterDemolition(
  elements: ResolvedElement[],
  walls: RWall[],
  rehosted: ReadonlyMap<ResolvedElement, WallSegment>,
): Pick<ResolvedPlan, "elements" | "walls" | "drawn"> {
  if (!walls.some((w) => w.status === "demolish")) return { elements, walls };
  const demolished = (e: ResolvedElement): boolean => e.kind === "wall" && (e as RWall).status === "demolish";
  const onDemolished = (e: ResolvedElement): boolean =>
    e.kind === "opening" && e._derived !== undefined && !!e.host && hostWallOf(e.host, walls)?.status === "demolish";
  const standingWalls = walls.filter((w) => !demolished(w));
  // The standing walls that take a re-hosted opening, as copies with the opening appended.
  const copies = new Map<RWall, RWall>();
  const moved = new Map<ResolvedElement, ResolvedElement>();
  for (const [el, seg] of rehosted) {
    const o = el as RDoor | RWindow | ROpening;
    const target = hostWallOf(seg, standingWalls);
    if (!target) continue;
    const copy = copies.get(target) ?? { ...target, openings: [...target.openings] };
    copy.openings.push({
      at: o.at,
      width: o.width,
      kind: o.kind,
      ownerId: o.id,
      sill: o.kind === "window" ? o.sill : 0,
      head: o.head,
    });
    copies.set(target, copy);
    moved.set(el, { ...o, host: seg });
  }
  const after = (e: ResolvedElement): ResolvedElement =>
    moved.get(e) ?? (e.kind === "wall" ? (copies.get(e as RWall) ?? e) : e);
  return {
    elements: elements.filter((e) => !demolished(e) && !onDemolished(e)).map(after),
    walls: standingWalls.map((w) => copies.get(w) ?? w),
    drawn: { elements: elements.filter((e) => !onDemolished(e)), walls },
  };
}

/** `E_OPENING_ON_DEMOLISHED_WALL`: a door, window or opening stands in a `status demolish` wall.
 *  Named as a person would (the kind and the line the wall runs on); the ids are in the hint. */
export function demolishedHostDiagnostic(el: RDoor | RWindow | ROpening, host: RWall): Diagnostic {
  const s = el.host!;
  const line =
    s.a.x === s.b.x && s.a.y !== s.b.y
      ? ` at x ${fmt3(s.a.x)}`
      : s.a.y === s.b.y && s.a.x !== s.b.x
        ? ` at y ${fmt3(s.a.y)}`
        : "";
  const kind = host.category === "partition" ? "partition" : `${host.category} wall`;
  return {
    severity: "error",
    code: "E_OPENING_ON_DEMOLISHED_WALL",
    message: `A ${el.kind} stands in the ${kind}${line}, which is marked \`status demolish\`: a demolished wall hosts nothing`,
    ...(el.span ? { span: el.span } : {}),
    hints: [
      `The ${el.kind} is "${el.id}" and the wall "${host.id}". Remove the ${el.kind} (it goes with the wall), host it on a wall that stays, or keep the wall (\`status existing\`).`,
    ],
  };
}

/** The wall a hosted opening's segment belongs to: by id when that is unique, else the wall
 *  (among the named ones, or all) that has exactly this segment. */
export function hostWallOf(seg: WallSegment, walls: readonly RWall[]): RWall | undefined {
  const sameSegment = (w: RWall) =>
    segmentsOfWall(w).some((s) => s.a.x === seg.a.x && s.a.y === seg.a.y && s.b.x === seg.b.x && s.b.y === seg.b.y);
  const named = walls.filter((w) => w.id === seg.wallId);
  if (named.length === 1) return named[0];
  return (named.length > 1 ? named : walls).find(sameSegment);
}

export function registerOpenings(elements: ResolvedElement[], walls: RWall[]): void {
  const wallOfSegment = (seg: WallSegment): RWall | undefined => hostWallOf(seg, walls);
  for (const el of elements) {
    if ((el.kind === "door" || el.kind === "window" || el.kind === "opening") && el.host) {
      // `kind`/`ownerId`/`sill`/`head` are APPENDED facts: the wall lowering reads
      // `at` and `width` and nothing else — a door's hole and a window's hole are the same
      // hole — so no drawing moves. They are here because this list is the only place a
      // wall knows what is cut into it, which is what a 2.5D slice at a given height needs.
      wallOfSegment(el.host)?.openings.push({
        at: el.at,
        width: el.width,
        kind: el.kind,
        ownerId: el.id,
        sill: el.kind === "window" ? el.sill : 0,
        head: el.head,
      });
    }
  }
}
