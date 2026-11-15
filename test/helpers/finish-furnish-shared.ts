/**
 * The helpers `test/finish-furnish*.test.ts` share: the corpus, the world, the diagnostic-code readers and the
 * flat the furnish laws are written in. Moved verbatim out of `test/finish-furnish.test.ts` when that file was split
 * along its suites (FT3c); each part imports what it uses and sets up nothing else, so no state is shared between
 * the parts (every export is a constant or a pure function).
 */

import { readFileSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { NOT_GATED_DRAFTING } from "../../src/furnish.js";
import { compile, lint } from "../../src/index.js";
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
// TODO(EH3.4): differs from test/helpers/diag.ts in that it takes options, returns counts or a set.
export function codes(src: string, w: World | undefined = world): Map<string, number> {
  const out = new Map<string, number>();
  const env = w ? { world: w } : {};
  for (const d of [...compile(src, { ...env, noCache: true }).diagnostics, ...lint(src, env)])
    out.set(d.code ?? "", (out.get(d.code ?? "") ?? 0) + 1);
  return out;
}
export const gainedBy = (before: string, after: string, w?: World): string[] => {
  const was = codes(before, w);
  // The drafting-layer codes the law exempts (`NOT_GATED_DRAFTING`, ADR 0032).
  return [...codes(after, w)].filter(([c, n]) => !NOT_GATED_DRAFTING.has(c) && n > (was.get(c) ?? 0)).map(([c]) => c);
};
export const errorsOf = (src: string): string[] =>
  compile(src, { world, noCache: true })
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => `${d.code}: ${d.message}`);
/** `out` is `src` with one run of bytes inserted at one offset. */
export function isOneInsertion(src: string, out: string): boolean {
  let p = 0;
  while (p < src.length && src[p] === out[p]) p++;
  let s = 0;
  while (s < src.length - p && src[src.length - 1 - s] === out[out.length - 1 - s]) s++;
  return out.length >= src.length && p + s === src.length;
}
export const furnitureLines = (src: string): string[] => src.split(/\r?\n/).filter((l) => /^\s*furniture /.test(l));
/** Every note but the ones on a room outside the furnish table: what the stage tried and refused. */
export const refused = <N extends { scope?: string }>(r: { unresolved: readonly N[] }): N[] =>
  r.unresolved.filter((u) => u.scope === undefined);
/** A flat: a bedroom, a bathroom and a hall off one corridor wall. Nothing is furnished. */
export const FLAT = `plan "Flat" {
  units mm
  grid 50
  # the shell
  wall id=w_ext exterior thickness 200 { (0,0) (7000,0) (7000,5000) (0,5000) close }
  wall id=w_mid partition thickness 100 { (0,3600) (7000,3600) }
  wall id=w_bb partition thickness 100 { (4200,0) (4200,3600) }
  room id=r_bed at (0,0) size 4200x3600 label "Bedroom" uses bedroom
  room id=r_bath at (4200,0) size 2800x3600 label "Bathroom" uses bath
  room id=r_hall at (0,3600) size 7000x1400 label "Hall" uses hall
  door id=d_bed on w_mid at 3400 width 900 swing into r_bed
  door id=d_bath on w_mid at 6200 width 800 swing into r_bath
  door id=d_front on w_ext at 62% width 1000 swing in
  window id=win_bed on w_ext at 2100 width 1600
}
`;
