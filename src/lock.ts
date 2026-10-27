/**
 * The lock check (preview-and-remodel card B1, decision D6): `impact(before, after, { lock })`
 * and `arch impact --against old.arch --lock <id,…>`. A lock names elements that must not
 * change between two versions of a plan; it is checked, never written in the source (no
 * syntax: `keep locked` is parked, card B2).
 *
 * **Named before locked.** A lock names an element by the `id=` its author wrote. An assigned
 * id (`room_3`, `window_2`) is positional: it shifts when a statement is inserted ahead of it
 * (PS0.23), so a lock on it could follow another element. Such a lock, and one naming no
 * element `impact` compares, is refused with `E_LOCK_UNNAMED`, and the hint says to write `id=`.
 *
 * **What a violation is.** The lock reads `impact`'s own `changed[]` (pairing by resolved id,
 * on top of `diffPlans`), so it sees exactly the change classes that report sees on the lowest
 * storey: `moved` (also an opening slid along an unchanged wall), `resized` (a wall's length,
 * a room's edges, an opening's width), `rehosted` (another wall, relation or joined spaces),
 * `rethickened`, `vanished`/`appeared`, a door's `swing` (its hinge side or swing direction),
 * and `changed` (any other resolved field: a door's kind, a window's sill, a 10 mm nudge below
 * `diffPlans`' tolerance). A relabel is not a violation: a label is not geometry. Each violation
 * is `E_LOCKED_ELEMENT_CHANGED` with the element's span on each side it exists on.
 *
 * Pure, synchronous, deterministic; one map lookup per locked id.
 */

import type { Span } from "./diagnostics.js";

/** Where an element's statement stands on one side: its byte span, in `file` when imported. */
export interface LockSpan {
  span: [number, number];
  /** The imported module the span is measured in; absent for the plan's own file. */
  file?: string;
}

/** One locked element that changed. */
export interface LockViolation {
  code: "E_LOCKED_ELEMENT_CHANGED";
  /** The locked id. */
  id: string;
  kind: string;
  change: "moved" | "resized" | "rehosted" | "rethickened" | "swing" | "changed" | "vanished" | "appeared";
  /** How it changed, as `impact` phrases it (`moved 100 mm right`, `swing in → out`). */
  detail: string;
  message: string;
  /** Its statement on the before side; absent when it appeared. */
  before?: LockSpan;
  /** Its statement on the after side; absent when it vanished. */
  after?: LockSpan;
}

/** One lock that cannot be checked. */
export interface LockRefusal {
  code: "E_LOCK_UNNAMED";
  id: string;
  message: string;
  hint: string;
  /** The element the name resolves to on each side, when it resolves to one. */
  before?: LockSpan;
  after?: LockSpan;
}

/** `ImpactReport.lock`: present only when a lock was asked for. */
export interface ImpactLock {
  /** Checked, with no violation and no refusal. */
  ok: boolean;
  /** Both sides resolved, so the lock was compared at all. */
  checked: boolean;
  /** The locked ids, deduplicated, in the order given. */
  locked: string[];
  violations: LockViolation[];
  refused: LockRefusal[];
}

/** One element of one side as the lock reads it. */
export interface LockElement {
  kind: string;
  /** The author wrote its `id=` (an assigned positional id is false). */
  written: boolean;
  span?: LockSpan;
  /** A door's `hinge`/`swing`, as `<hinge> <swing>`. */
  swing?: string;
}

/** One side: the lowest storey's elements and authored walls by id, and the ids that stand
 *  only on a storey above it (which `impact` does not compare yet). */
export interface LockSide {
  elements: ReadonlyMap<string, LockElement>;
  upper: ReadonlySet<string>;
}

/** The part of an `ImpactChange` the lock reads. */
interface ChangeLike {
  id?: string;
  kind: string;
  derived?: true;
  change: string;
  detail: string;
}

/** `a,b , c,a` → `["a", "b", "c"]`: split on commas, trimmed, empties dropped, first wins. */
export function parseLockList(text: string): string[] {
  return [...new Set(text.split(",").map((s) => s.trim()))].filter((s) => s !== "");
}

/** A span as the lock reports it. */
export function lockSpanOf(span: Span | undefined, file: string | undefined): LockSpan | undefined {
  if (!span) return undefined;
  return { span: [span.start, span.end], ...(file !== undefined ? { file } : {}) };
}

const word = (kind: string): string => (kind === "walls" ? "wall" : kind);

/**
 * Check `ids` between two sides. A side is null when it did not resolve: nothing is compared
 * then (`checked: false`), so the lock is not `ok`.
 */
export function checkLocks(
  ids: readonly string[],
  before: LockSide | null,
  after: LockSide | null,
  changed: readonly ChangeLike[],
): ImpactLock {
  const locked = [...new Set(ids)];
  const out: ImpactLock = {
    ok: false,
    checked: before !== null && after !== null,
    locked,
    violations: [],
    refused: [],
  };
  if (!before || !after) return out;
  const byId = new Map<string, ChangeLike>();
  for (const c of changed) if (c.id !== undefined && c.derived !== true) byId.set(c.id, c);
  for (const id of locked) {
    const a = before.elements.get(id);
    const b = after.elements.get(id);
    const spans = { ...(a?.span ? { before: a.span } : {}), ...(b?.span ? { after: b.span } : {}) };
    if (!a && !b) {
      const upper = before.upper.has(id) || after.upper.has(id);
      out.refused.push({
        code: "E_LOCK_UNNAMED",
        id,
        message: upper
          ? `The lock "${id}" names an element above the lowest storey, which impact does not compare yet.`
          : `The lock "${id}" names no element in either version of the plan.`,
        hint: upper
          ? "Lock elements of the lowest storey."
          : `A lock names an element by the id= written on it: write id=${id} on the element you mean, or lock an id the plan writes.`,
      });
      continue;
    }
    const auto = (a && !a.written) || (b && !b.written);
    if (auto) {
      const kind = word((b ?? a)!.kind);
      out.refused.push({
        code: "E_LOCK_UNNAMED",
        id,
        message: `The lock "${id}" names a ${kind} whose id was assigned, not written: an assigned id shifts when a statement is inserted ahead of it or the rooms around it change, so the lock could follow another ${kind}.`,
        hint: `Write an id on the ${kind} in both versions (e.g. id=entry) and lock that name.`,
        ...spans,
      });
      continue;
    }
    const c = byId.get(id);
    if (!c || c.change === "relabeled") continue;
    const kind = word((b ?? a)!.kind);
    const swung = a?.swing !== undefined && b?.swing !== undefined && a.swing !== b.swing;
    const swingPhrase = swung ? `swing ${a!.swing} → ${b!.swing}` : "";
    const change: LockViolation["change"] =
      c.change === "added"
        ? "appeared"
        : c.change === "removed"
          ? "vanished"
          : c.change === "changed" && swung
            ? "swing"
            : (c.change as LockViolation["change"]);
    const detail =
      change === "vanished"
        ? "vanished"
        : change === "appeared"
          ? "appeared"
          : change === "swing"
            ? swingPhrase
            : swung
              ? `${c.detail}; ${swingPhrase}`
              : c.detail;
    out.violations.push({
      code: "E_LOCKED_ELEMENT_CHANGED",
      id,
      kind: c.kind,
      change,
      detail,
      message: `Locked ${kind} "${id}" ${detail}.`,
      ...spans,
    });
  }
  out.ok = out.violations.length === 0 && out.refused.length === 0;
  return out;
}
