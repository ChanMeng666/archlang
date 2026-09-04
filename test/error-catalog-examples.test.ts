/**
 * The EXECUTABLE half of the error catalog — every `example` that claims to raise a code
 * is run, and must raise it.
 *
 * ## The hole this closes
 *
 * `src/error-catalog.ts` gives every code a `cause`, a `fix` and an `example`, and until
 * this file **nothing ever executed one of them.** The checks that looked like they might:
 *
 *  - `test/explain.test.ts` asserts each field is non-EMPTY. A wrong example is non-empty.
 *  - `test/explain.test.ts`'s drift check compares `renderErrorCodes()` to the committed
 *    `docs/error-codes.md`. That proves reproducibility, never correctness — the exact
 *    blindness AGENTS.md warns about, one layer out from the generators.
 *  - `test/docs-fences.test.ts` compiles published ```` ```arch ```` fences, but
 *    `scripts/gen-error-codes.ts` emits them as `arch static` **on purpose** (v1.26: 104
 *    error examples each rendered a generic parse-error card on the public page), so the
 *    one gate that runs doc snippets deliberately skips exactly these.
 *  - `test/spec-forms.test.ts` has a NEGATIVE corpus, but its snippets are hand-written in
 *    that file. It never reads `ERROR_CATALOG[code].example`.
 *
 * So a catalog example could claim `# error: …` and raise nothing at all, for as long as
 * anyone cared to leave it there. **`E_HEIGHT_RANGE` shipped exactly that** in this
 * branch's first commit: `wall … height 3 { … }`, commented "3 mm, not 3 m", which is a
 * perfectly legal three-millimetre wall. The compiler was right and the catalog was
 * wrong, and every green gate in the repository agreed with the catalog.
 *
 * ## What is asserted, and what is excused
 *
 * `CatalogEntry.example` is documented as "a minimal snippet illustrating the cause (or
 * the fix)" — a FRAGMENT, not a program — so "every example must compile and raise" was
 * never the contract and imposing it would rewrite two thirds of the catalog. The claim
 * made here is the weaker true one, in the `NOT_REPRODUCED_HERE` idiom
 * `test/spec-forms.test.ts` already uses:
 *
 * > An example either **raises its own code** when wrapped in the smallest legal plan, or
 * > it is named below with the reason it cannot.
 *
 * And the excuse list is pruned in BOTH directions, which is what stops it rotting into a
 * place to hide a bad example: an entry that starts reproducing goes red as loudly as one
 * that stops.
 */

import { describe as suite, expect, it } from "vitest";
import { compile, ERROR_CATALOG, ERROR_CODES, lint } from "../src/index.js";

/**
 * The reasons an example legitimately cannot reproduce its own code.
 *
 * There is deliberately no "contains a literal `…`" excuse. Four examples do
 * (`E_ARGCOUNT`, `E_ASSIGN_UNDEF`, `E_RANGE_LIMIT`, `E_STRIP_NEST`) and the first draft of
 * this file excused all four on sight — then the both-directions check below caught them
 * REPRODUCING anyway: the ellipsis sits inside a body the parser walks past, and the error
 * is raised regardless. Excusing them would have been four codes silently ungated on a
 * guess. Prove it, do not assume it.
 */
const INTENT =
  "raised by `validateIntent()` on the intent channel, which `compile()`/`lint()` never run: there is no `.arch` source that produces it";
const IMPORT = "needs a `World` serving the named module; a bare snippet cannot have one";
const JSON_CHANNEL = "raised by `planFromJson()` on a JSON payload, not by compiling `.arch` source";
const DEP = "raised only when an OPTIONAL native dependency is absent, which a test process cannot arrange";
const FRAGMENT =
  "a one-line fragment: the code needs a building around it (a wall to be off, rooms to be unreachable between, a sheet to overflow), and the whole-plan spatial rules are owned by test/lint.test.ts";

/**
 * Every code whose example does not reproduce it, with why.
 *
 * 44 of 139, so **95 catalog examples are now executed and held to their own code**. That
 * ratio is the honest state of a field documented as illustrative, not a backlog: adding a
 * building to each fragment would make the catalog's snippets longer than the prose they
 * illustrate, which is the opposite of what `arch explain` is for.
 */
const NOT_REPRODUCED: ReadonlyMap<string, string> = new Map([
  ["E_INTENT_NO_DOOR", INTENT],
  ["E_INTENT_NO_SITE", INTENT],
  ["E_INTENT_NO_WINDOW", INTENT],
  ["E_INTENT_NOT_ADJACENT", INTENT],
  ["E_INTENT_ROOM_AREA", INTENT],
  ["E_INTENT_ROOM_COUNT", INTENT],
  ["E_INTENT_ROOM_MISSING", INTENT],
  ["E_INTENT_TOTAL_AREA", INTENT],
  ["E_INTENT_UNREACHABLE", INTENT],

  ["E_IMPORT_BAD_SPEC", IMPORT],
  ["E_IMPORT_CONFLICT", IMPORT],
  ["E_IMPORT_CYCLE", IMPORT],
  ["E_IMPORT_NOT_EXPORTED", IMPORT],
  ["E_IMPORT_PARSE", IMPORT],
  ["W_IMPORT_EMPTY_FILE", IMPORT],

  ["E_JSON_KIND", JSON_CHANNEL],
  ["E_JSON_SCHEMA", JSON_CHANNEL],

  ["E_PNG_DEPENDENCY", DEP],

  ["E_ATTACH_POS_RANGE", FRAGMENT],
  ["E_CALL_DEPTH", FRAGMENT],
  ["E_DOTTED_DECL", FRAGMENT],
  ["E_DUP_INSTANCE", FRAGMENT],
  ["E_FURN_FLUSH", FRAGMENT],
  ["E_RECURSION", FRAGMENT],
  ["E_SITE_BOUNDARY_DEGENERATE", FRAGMENT],
  ["E_STRIP_SIZE", FRAGMENT],
  ["W_BATH_VIA_BEDROOM", FRAGMENT],
  ["W_CIRCUITOUS_PATH", FRAGMENT],
  ["W_DIM_INSIDE", FRAGMENT],
  ["W_DOOR_OFF_WALL", FRAGMENT],
  ["W_DOORWAY_BLOCKED", FRAGMENT],
  ["W_FIXTURE_BACK_TO_ROOM", FRAGMENT],
  ["W_FIXTURE_WRONG_ROOM", FRAGMENT],
  ["W_FURNITURE_WALL_COLLISION", FRAGMENT],
  ["W_NO_ENTRANCE", FRAGMENT],
  ["W_OPENING_OFF_WALL", FRAGMENT],
  ["W_PATH_TOO_NARROW", FRAGMENT],
  ["W_ROOM_NO_CLEAR_PATH", FRAGMENT],
  ["W_ROOM_NOT_ENCLOSED", FRAGMENT],
  ["W_ROOM_NOT_EQUATOR_FACING", FRAGMENT],
  ["W_ROOM_UNREACHABLE", FRAGMENT],
  ["W_SCALE_OVERFLOW", FRAGMENT],
  ["W_SWING_OBSTRUCTED", FRAGMENT],
  ["W_WINDOW_OFF_WALL", FRAGMENT],
]);

/** The smallest legal plan an example fragment can be dropped into. */
const wrap = (body: string): string => `plan "E" {\n  units mm\n${body}\n}\n`;

/** Every code an example raises through both channels a `.arch` source has. */
function codesRaisedBy(example: string): string[] {
  const src = /^\s*plan\b/.test(example) ? example : wrap(example);
  try {
    return [
      ...compile(src, { noCache: true }).diagnostics.map((d) => d.code ?? "<uncoded>"),
      ...lint(src).map((d) => d.code ?? "<uncoded>"),
    ];
  } catch (e) {
    return [`<threw: ${(e as Error).message}>`];
  }
}

suite("error catalog — every example that can raise its code does", () => {
  it("no example silently raises nothing (or the wrong code) while claiming to", () => {
    const broken = ERROR_CODES.filter((c) => !NOT_REPRODUCED.has(c))
      .map((c) => ({ c, got: codesRaisedBy(ERROR_CATALOG[c]!.example) }))
      .filter((r) => !r.got.includes(r.c))
      .map((r) => `${r.c}: example raised [${r.got.join(", ") || "nothing"}]`);
    expect(
      broken,
      "These catalog examples do not raise the code they document. `arch explain <CODE>` and " +
        "docs/error-codes.md are both showing a reader a snippet that does not do what it says. " +
        "Fix the EXAMPLE (not the compiler) — or, if the code genuinely cannot be reached from a " +
        "one-line snippet, add it to NOT_REPRODUCED with the reason.",
    ).toEqual([]);
  });

  it("the excuse list does not rot — every entry is still a real code, and still unreproduced", () => {
    const known = new Set<string>(ERROR_CODES);
    const gone = [...NOT_REPRODUCED.keys()].filter((c) => !known.has(c));
    expect(gone, "NOT_REPRODUCED names codes the catalog no longer has — delete them.").toEqual([]);

    // The direction that matters most: an entry whose example was IMPROVED and now works
    // must leave the list, or the list becomes the place a future bad example hides.
    const nowWorking = [...NOT_REPRODUCED.keys()].filter((c) => codesRaisedBy(ERROR_CATALOG[c]!.example).includes(c));
    expect(
      nowWorking,
      "These examples DO now reproduce their code — remove them from NOT_REPRODUCED so the gate " +
        "starts holding them to it.",
    ).toEqual([]);
  });

  it("is not vacuous: a planted bad example is caught", () => {
    // The gate's whole value is that it fails on a plausible-looking snippet that raises
    // nothing — which is precisely what `E_HEIGHT_RANGE` shipped with. This is that exact
    // snippet, kept as the specimen.
    const planted = "wall id=w1 exterior thickness 200 height 3 { (0,0) (4000,0) close }";
    expect(codesRaisedBy(planted)).not.toContain("E_HEIGHT_RANGE");
    // …and the corrected one does raise it, so the fix is what closed it, not the wording.
    expect(codesRaisedBy(ERROR_CATALOG.E_HEIGHT_RANGE!.example)).toContain("E_HEIGHT_RANGE");
  });

  it("covers a majority of the catalog, so the excuse list cannot quietly swallow it", () => {
    // A count, not a target. If a future change pushes many codes onto the excuse list the
    // gate has been hollowed out, and this is what says so out loud.
    const reproduced = ERROR_CODES.length - NOT_REPRODUCED.size;
    expect(reproduced).toBeGreaterThan(ERROR_CODES.length / 2);
    expect(NOT_REPRODUCED.size).toBeLessThanOrEqual(44);
  });
});
