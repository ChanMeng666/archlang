/**
 * The helpers `test/finish*.test.ts` share: the corpus, the world, and the diagnostic-code readers the
 * finish laws are written in. Moved verbatim out of `test/finish.test.ts` when that file was split along its
 * suites (FT3c); each part imports what it uses and sets up nothing else, so no state is shared between the
 * parts (every export is a constant or a pure function).
 */

import { readFileSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { compile, type FinishResult, LINT_PROFILES, lint } from "../../src/index.js";
import { NOT_GATED_DRAFTING } from "../../src/furnish.js";
import type { World } from "../../src/world.js";
import { exampleNames } from "./corpus.js";

const EXAMPLES = resolvePath("examples");
export const world: World = {
  read: (p) => {
    try {
      return readFileSync(resolvePath(EXAMPLES, p), "utf8");
    } catch {
      return null;
    }
  },
  now: () => new Date(0),
};
export const NAMES = exampleNames()
  .map((f) => f.slice(0, -".arch".length))
  .sort();
export const srcOf = (name: string): string => readFileSync(join(EXAMPLES, `${name}.arch`), "utf8");

/** compile + lint diagnostic codes as a multiset — re-derived here, not read from `finish`. */
// TODO(EH3.4): differs from test/helpers/diag.ts in that it returns counts or a set.
export function codes(src: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const d of [...compile(src, { world, noCache: true }).diagnostics, ...lint(src, { world })])
    out.set(d.code ?? "", (out.get(d.code ?? "") ?? 0) + 1);
  return out;
}
export const errorsOf = (src: string): string[] =>
  compile(src, { world, noCache: true })
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => `${d.code}: ${d.message}`);
const OVERFLOW = ["W_SCALE_OVERFLOW", "W_DRAWING_OVERFLOW"];
export const overflows = (src: string): string[] => OVERFLOW.filter((c) => codes(src).has(c));
export const wroteSheet = (r: FinishResult): boolean =>
  r.changes.some((c) => c.statement === "paper" || c.statement === "scale");

/** Is `a` a subsequence of `b`? Every authored byte survives, in order, when nothing is replaced. */
export function isSubsequence(a: string, b: string): boolean {
  let i = 0;
  for (let j = 0; j < b.length && i < a.length; j++) if (a[i] === b[j]) i++;
  return i === a.length;
}

export const SHELL = `  wall id=w exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  room id=r at (0,0) size 6000x4000 label "Room" uses living
  door id=d on w at 60% width 900 swing in
  window id=win on w at 10% width 1500`;
export const BARE = `plan "Bare" {\n  units mm\n  grid 50\n  north up\n${SHELL}\n}\n`;

/** compile + lint codes under the default ruleset and under EVERY named profile, keyed by profile. */
export function codesUnderEveryProfile(src: string): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const profile of [undefined, ...Object.keys(LINT_PROFILES)]) {
    const m = new Map<string, number>();
    for (const d of [
      ...compile(src, { world, noCache: true }).diagnostics,
      ...lint(src, { world, ...(profile ? { profile } : {}) }),
    ])
      m.set(d.code ?? "", (m.get(d.code ?? "") ?? 0) + 1);
    out.set(profile ?? "<default>", m);
  }
  return out;
}
/** `profile: code` for every code `after` has more of than `before`, under any profile. */
export function gainedUnderAnyProfile(before: string, after: string): string[] {
  const was = codesUnderEveryProfile(before);
  const out: string[] = [];
  // The law excepts the drafting-layer codes (ADR 0024 §6, amended 2026-10-24).
  for (const [profile, now] of codesUnderEveryProfile(after))
    for (const [code, n] of now)
      if (!NOT_GATED_DRAFTING.has(code) && n > (was.get(profile)?.get(code) ?? 0)) out.push(`${profile}: ${code}`);
  return out;
}
