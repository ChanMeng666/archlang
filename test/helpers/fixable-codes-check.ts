/**
 * The source half of `test/fixable-codes.test.ts` (card AF8): {@link sourceProblems} lists every way a
 * table of fix producers disagrees with the source under a root's `src/`, as `scripts/fix-coverage.ts`
 * reads it. A helper, so a plant can run it over a copied tree.
 */

import { applicabilityLiterals, fixCoverage } from "../../scripts/fix-coverage.js";
import { FIX_PRODUCERS, type FixProducer, type FixStage } from "../../src/fixable-codes.js";

/** The one `applicability:` literal in `src/` that is no diagnostic's fix: `arch reroll`'s own edits. */
export const NOT_A_FIX_LITERAL = [{ file: "src/cli/commands-author.ts", fn: "cmdReroll" }];

/** The stage a fix site's file gives it. */
const stageOfSite = (file: string): FixStage =>
  file.startsWith("src/lint/rules/") ? "lint" : file === "src/cli/commands-author.ts" ? "fix" : "compile";

const split = (p: FixProducer): { file: string; name?: string } => {
  const [file, name] = p.producer.split("#") as [string, string | undefined];
  return name === undefined ? { file } : { file, name };
};
const calls = (text: string, name: string): boolean => new RegExp(`\\b${name}\\(`).test(text);

/** Every way `producers` disagrees with the source under `root/src`, one line each (empty: none). */
export function sourceProblems(root: string, producers: readonly FixProducer[] = FIX_PRODUCERS): string[] {
  const out: string[] = [];
  const cov = fixCoverage(root);
  for (const s of cov.unattributed) out.push(`${s.file}:${s.line}: a fix site no code is read for`);
  for (const c of cov.uncatalogued)
    out.push(`${c}: a fix site attaches a fix to it, and the catalogue has no such code`);
  const rowOf = new Map(producers.flatMap((p) => Object.keys(p.codes).map((c) => [c, p] as const)));
  for (const c of cov.withEdit.filter((c) => !rowOf.has(c)))
    out.push(`${c}: a fix site attaches a fix to it, and no row declares it`);
  for (const c of [...rowOf.keys()].filter((c) => !cov.withEdit.includes(c)))
    out.push(`${c}: declared, and no fix site attaches a fix to it`);

  const named = producers.flatMap((p) => (split(p).name ? [split(p).name!] : []));
  for (const s of cov.sites.filter((s) => s.codes.length > 0)) {
    const where = `${s.file}:${s.line}`;
    const called = named.filter((n) => calls(s.expanded, n));
    const own = new Set(s.codes.flatMap((c) => (rowOf.get(c) ? [split(rowOf.get(c)!).name] : [])));
    for (const n of called.filter((n) => !own.has(n)))
      out.push(`${where}: the site of ${s.codes.join("/")} calls ${n}, the producer of other codes`);
    for (const c of s.codes) {
      const row = rowOf.get(c);
      if (!row) continue;
      if (row.stage !== stageOfSite(s.file))
        out.push(`${where}: ${c}'s site gives stage ${stageOfSite(s.file)}, its row says ${row.stage}`);
      const { file, name } = split(row);
      const inside = s.file === file && (name === undefined || s.fns.includes(name));
      // Only at `arch fix`'s own stage may a site that calls no producer attach what its enclosing
      // function got from one: the `while` fixes `proveWhileFixes` proved, matched back by span.
      const viaFunction = row.stage === "fix" && name !== undefined && called.length === 0 && calls(s.fnText, name);
      if (!inside && !(name !== undefined && called.includes(name)) && !viaFunction)
        out.push(`${where}: ${c}'s site neither calls nor lies in its producer ${row.producer}`);
    }
  }

  const literals = applicabilityLiterals(root);
  const inScope = (p: FixProducer, l: { file: string; fns: string[] }): boolean => {
    const { file, name } = split(p);
    return l.file === file && (name === undefined || l.fns.includes(name));
  };
  for (const p of producers) {
    // Inside a producer every applicability is written out, so the set below is all it can take.
    for (const l of literals.filter((l) => inScope(p, l) && !l.literal))
      out.push(`${l.file}:${l.line}: ${p.producer} sets an applicability the source does not write out`);
    const found = [...new Set(literals.filter((l) => inScope(p, l)).flatMap((l) => l.values))].sort();
    const want = [...p.applicability].sort();
    if (found.join("/") !== want.join("/"))
      out.push(
        `${p.producer}: its source writes applicability ${found.join("/") || "(none)"}, its row says ${want.join("/")}`,
      );
  }
  for (const l of literals.filter((l) => l.literal)) {
    if (producers.some((p) => inScope(p, l))) continue;
    if (NOT_A_FIX_LITERAL.some((x) => x.file === l.file && l.fns.includes(x.fn))) continue;
    out.push(`${l.file}:${l.line}: an applicability literal outside every producer`);
  }
  return out;
}
