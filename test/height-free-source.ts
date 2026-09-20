/**
 * The **height-free derivation**: one `.arch` source, mechanically stripped of every
 * vertical-datum clause, so a plan that DOES author heights can be compared against itself.
 *
 * ## Why this module exists
 *
 * `height-byte-identity.test.ts` shipped a law of the form *"a plan that authors NO height
 * is unaffected by the feature existing"*, pinned by thirty measured hashes and guarded by
 * an assertion that **every** shipped example authors no height. That second assertion was
 * load-bearing — the law is vacuous for a plan that uses the syntax — but it also made the
 * corpus a closed set: no shipped example could ever demonstrate the headline feature of
 * v1.35, and for one release none did. The docs claimed a datum that nothing in `examples/`
 * declared, and both committed axonometric renders stood on defaults.
 *
 * The way out is not to weaken the law. It is to notice that the law being proved is the
 * WEAKER of the two available claims. What the compiler actually guarantees is
 *
 *   > a plan that DOES author heights draws, byte for byte, exactly as the same plan with
 *   > its height clauses removed — because a plan is a horizontal cut and a height is a
 *   > vertical fact.
 *
 * That claim needs **no measured baseline at all**: both sides are computable at test time,
 * so it cannot go stale, cannot be re-blessed to green a suite, and cannot be weakened by a
 * future re-measurement. It is strictly stronger than a frozen hash, and it is what this
 * module makes possible.
 *
 * ## Why it is derived and not a second committed file
 *
 * `docs/agents/iron-laws.md`: *"Derive from the source of truth, never retype it."* A
 * hand-maintained `two-storey.noheight.arch` would be a second copy of a 100-line plan to
 * keep in step with the first, and the first day it drifted the law would silently begin
 * comparing two different buildings and still pass. {@link heightFreeSource} removes clauses
 * from the one real file, so the two sides cannot describe different plans by construction.
 *
 * ## Why the derivation is trusted
 *
 * It is not trusted; it is checked, twice, by the test that uses it:
 *
 * 1. {@link authorsVerticalDatum} must be `true` for the source and `false` for the
 *    derivation. A derivation that quietly became a no-op fails here — which is the
 *    non-vacuity guard this repository has shipped a law without before.
 * 2. The derivation's digest must equal the plan's **v1.34.0 measured hash**, the one taken
 *    before a line of the datum layer existed. So the derived text is not merely
 *    height-free, it is behaviourally the plan that shipped — which is what lets the
 *    original baseline row survive the example gaining heights, rather than being retired.
 *
 * Between them those two say the derivation removed the heights and nothing else. If a
 * future author writes a form this module does not know how to strip, (1) goes red loudly
 * rather than (2) going green quietly, which is the failure mode to want.
 *
 * ## The syntax it knows, and the one it must not touch
 *
 * Four spellings carry the datum (`spec.llm.md`): the plan-level `height` setting, the
 * `level … height` header clause, the `wall … height` clause, and `sill`/`head` on an
 * opening. A fifth spelling is a false friend: `strip … height <mm>` is a plan EXTENT, a
 * horizontal dimension with the same keyword, and `attached.arch` uses it. Every rule below
 * is anchored to its statement so the strip form cannot be caught by accident — the same
 * distinction the vacuity scan in `height-byte-identity.test.ts` already had to make.
 */

/**
 * Split a line into its code and its trailing comment, respecting string literals.
 *
 * Naive `split("#")` is wrong here and the examples prove it: `themed.arch` and
 * `materials.arch` write colours as `"#1e2127"`, and `hexagon-pavilion.arch` has
 * `theme from "#2f6f4e"`. Cutting at the first `#` would truncate those statements and the
 * derived plan would no longer compile, turning a byte-identity law into a parse error.
 */
function splitComment(line: string): [code: string, comment: string] {
  let inString = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inString = !inString;
    else if (c === "#" && !inString) return [line.slice(0, i), line.slice(i)];
  }
  return [line, ""];
}

/** The code of a source with every comment removed — what both bodies below reason over. */
function codeOnly(src: string): string {
  return src
    .split("\n")
    .map((l) => splitComment(l)[0])
    .join("\n");
}

/**
 * Does this source author the vertical datum anywhere?
 *
 * The premise of BOTH halves of the corpus law, so it is asserted rather than assumed: the
 * no-height group must be `false` here (else its measured hash proves nothing about the
 * feature) and the authors-height group must be `true` (else the stronger law below is
 * checking a plan that exercises nothing).
 *
 * It reads comment-stripped code, which matters in both directions — `relational.arch`
 * writes "the bed's 1500 mm head" in prose and `library.arch` "see the head of the file",
 * and `examples/two-storey.arch`'s own comments now discuss the clauses at length.
 */
export function authorsVerticalDatum(src: string): boolean {
  const code = codeOnly(src);
  return (
    /^[ \t]*height[ \t]+\S/m.test(code) || // the plan-level setting
    /\bthickness[ \t]+\S+[ \t]+height\b/.test(code) || // a wall clause
    /\blevel[ \t]+-?\d+([ \t]+"[^"]*")?[ \t]+height\b/.test(code) || // a level header clause
    /\b(sill|head)[ \t]+\S/.test(code) // an opening's glazing bounds
  );
}

/**
 * The same source with every vertical-datum clause removed, and nothing else touched.
 *
 * Each rule is applied to a line's CODE only, so a comment that happens to contain one of
 * these shapes is left alone — the derived text is only ever compiled, never committed, but
 * a derivation that rewrote prose would make a red run harder to read for no gain.
 */
export function heightFreeSource(src: string): string {
  const out: string[] = [];
  for (const line of src.split("\n")) {
    const [code, comment] = splitComment(line);
    // 1. The plan/level-body setting on a line of its own — drop the line entirely, so the
    //    result is the text that was there before the clause was added.
    if (/^[ \t]*height[ \t]+\S/.test(code)) continue;
    let kept = code;
    // 2. A `level <n> ["Name"] height <mm> {` header.
    kept = kept.replace(/(\blevel[ \t]+-?\d+(?:[ \t]+"[^"]*")?)[ \t]+height[ \t]+\S+/, "$1");
    // 3. A `wall … thickness <t> [material …] height <mm> {` clause. Anchored on the
    //    keyword itself rather than on `thickness`, because `material … scale … angle …`
    //    may sit between the two, but only ever before the brace.
    if (/^[ \t]*wall\b/.test(kept)) kept = kept.replace(/[ \t]+height[ \t]+\S+(?=[ \t]*\{)/, "");
    // 4. `sill`/`head` on a door, window or cased opening.
    if (/^[ \t]*(door|window|opening)\b/.test(kept)) kept = kept.replace(/[ \t]+(sill|head)[ \t]+\S+/g, "");
    out.push(kept + comment);
  }
  return out.join("\n");
}
