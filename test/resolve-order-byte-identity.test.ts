/**
 * The byte-identity law for the resolve order (ADR 0028 §1, card PS3.2): `resolve()` places
 * every room first, freezes a datum table, then resolves walls, then openings — and a plan
 * that uses no new form resolves, draws, describes, lints and DIAGNOSES exactly as it did
 * when walls resolved first.
 *
 * The whole file corpus (examples, fixtures, recovery plans, eval plans) is already pinned
 * with `compile().diagnostics` by `test/import-module-lets.test.ts` and
 * `test/while-byte-identity.test.ts`. That corpus is almost entirely CLEAN, so it cannot see
 * the one thing a reorder of the resolver is most likely to move: the ORDER of resolve-time
 * diagnostics on a plan whose rooms and walls both diagnose. `test/resolve-order/` is that
 * missing corpus — rooms and walls that both raise, interleaved in source order; relational
 * placement errors; readers of a relational room (backlog PS0.5); instances that diagnose
 * under a turn and a mirror; an axes block that diagnoses beside its elements.
 *
 * Each row is `allStoreysDigestWithDiagnostics` (`./byte-identity-digest.ts`: every storey's
 * SVG + `describe()` + `lint()` + `compile().diagnostics`) and, readable beside it, the
 * diagnostic sequence `code@span.start`. Both were measured on `main` at `60be6a4` — a
 * `git archive` of that commit's `src/` and digest modules, through this test's own digest
 * body — and committed BEFORE the reorder, so the reorder is proven against them. A row that
 * moves is a finding to explain (`docs/testing.md` §3), never a re-pin.
 *
 * ## The one row re-measured, and why: `relational-readers.arch` (backlog PS0.5)
 *
 * The reorder itself (`5c7748d`) moved no row: this file passed unchanged against it. The
 * NEXT commit is a deliberate behaviour change — the readers of a relational room (furniture
 * side inference and `in <room>` placement, a door's `swing into`, a garage door's floor
 * probe, lint's fixture paste) now refuse only a room that could NOT be placed, since every
 * room is placed before they run. That plan's three diagnostics (`W_SWING_ROOM_NOT_ADJACENT`,
 * `E_FURN_AGAINST`, `E_PLACE_REF`) are exactly the defect, and they are gone; the door,
 * counter and table now draw, and its header comment was rewritten to say so. Every other row
 * is untouched. `test/relational-readers.test.ts` proves the plan now draws byte for byte
 * what its absolute twin (`kitchen at (5000,0)`) draws, and that an unplaced room is still
 * refused by every reader.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { describe as suite, expect, it } from "vitest";
import { compile, describe as describePlan, lint } from "../src/index.js";
import { allStoreysDigestWithDiagnostics, type CompilerApi } from "./byte-identity-digest.js";

const API: CompilerApi = { compile, describe: describePlan, lint };
const DIR = resolvePath("test/resolve-order");

/** [file, digest, diagnostic sequence] — measured on `main` at `60be6a4`. */
const BASELINE: [string, string, string[]][] = [
  // PS4.4: every row whose plan resolves re-measured once for the new totals key (gross internal area); see test/byte-identity-baseline.ts.
  [
    "axes-and-elements.arch",
    "860c6d742b5d0c602868f4342d2198c37072b8951d0a5447a9db9a20f3a4ed31",
    ["W_UNKNOWN_MATERIAL@378", "W_ROOM_LABEL_OUTSIDE@568", "E_OUT_OF_RANGE@346", "E_UNKNOWN_REF@358"],
  ],
  [
    "instance-relational.arch",
    "7fbcfec92546d856201caa046b460e0744cb3c4d4df0ecd05cabdf8236d1a07e",
    [
      "W_UNKNOWN_MATERIAL@353",
      "E_WALL_THICKNESS@618",
      "E_ROOM_SIZE@683",
      "E_LAYOUT_REF@557",
      "W_UNKNOWN_MATERIAL@353",
      "E_WALL_THICKNESS@618",
      "E_ROOM_SIZE@683",
      "E_LAYOUT_REF@557",
      "W_UNKNOWN_MATERIAL@353",
      "E_WALL_THICKNESS@618",
      "E_ROOM_SIZE@683",
      "E_LAYOUT_REF@557",
      "W_ROOM_LABEL_OUTSIDE@925",
    ],
  ],
  [
    "relational-errors.arch",
    "28a1ff7cee53d7ff853183c05f6b3176e055438967370dd1b30eea5650248e71",
    [
      "E_WALL_THICKNESS@384",
      "W_UNKNOWN_MATERIAL@778",
      "E_ROOM_SIZE@859",
      "W_ROOM_LABEL_OUTSIDE@764",
      "E_LAYOUT_REF@483",
      "E_LAYOUT_CYCLE@544",
      "E_LAYOUT_CYCLE@592",
      "E_LAYOUT_UNPLACED@640",
    ],
  ],
  [
    "relational-readers.arch",
    // Re-measured for PS0.5 (see the header): was 8bb99685…642f with
    // ["W_SWING_ROOM_NOT_ADJACENT@678", "E_FURN_AGAINST@734", "E_PLACE_REF@795"].
    "34b25542caeeaa66adf747dfeb6a0561b75847b9db04880d90203bb303663fae",
    [],
  ],
  [
    "rooms-and-walls-diagnose.arch",
    "07d6157f1908cd362374cf03ca283622699987cba56bb2e873cb78a8e07b4bd1",
    [
      "E_WALL_THICKNESS@363",
      "W_UNKNOWN_MATERIAL@474",
      "E_ROOM_SIZE@312",
      "E_UNKNOWN_REF@441",
      "E_ROOM_SIZE@411",
      "W_ROOM_LABEL_OUTSIDE@607",
      "W_DOOR_OFF_WALL@706",
      "E_FURN_SIZE@740",
      "E_FURN_AGAINST@740",
    ],
  ],
];

const read = (name: string): string => readFileSync(join(DIR, name), "utf8");

suite("resolve order — byte identity with compile().diagnostics, order included", () => {
  it("covers every file in test/resolve-order — the corpus cannot silently shrink", () => {
    const files = readdirSync(DIR)
      .filter((f) => f.endsWith(".arch"))
      .sort();
    expect(BASELINE.map(([n]) => n)).toEqual(files);
  });

  it.each(BASELINE)("digest unchanged: %s", (name, hash) => {
    expect(allStoreysDigestWithDiagnostics(API, read(name))).toBe(hash);
  });

  it.each(BASELINE)("diagnostic order unchanged: %s", (name, _hash, order) => {
    const got = compile(read(name), { noCache: true }).diagnostics.map((d) => `${d.code}@${d.span?.start}`);
    expect(got).toEqual(order);
  });

  it("is not vacuous: swapping two diagnosing statements moves the digest and the order", () => {
    const name = "rooms-and-walls-diagnose.arch";
    const src = read(name);
    const wall = "  wall exterior thickness -5 { (0,0) (6000,0) }\n";
    const room = '  room id=a at (0,0) size 0x3000 label "Zero wide"\n';
    expect(src.includes(wall) && src.includes(room)).toBe(true);
    // Same statements, same byte length, the wall now written first: every span moves, so
    // the digest must; and the codes' order must stay registry order (walls first).
    const swapped = src.replace(room + wall, wall + room);
    expect(swapped).not.toBe(src);
    expect(allStoreysDigestWithDiagnostics(API, swapped)).not.toBe(BASELINE.find(([n]) => n === name)![1]);
    const codes = compile(swapped, { noCache: true }).diagnostics.map((d) => d.code);
    expect(codes.slice(0, 3)).toEqual(["E_WALL_THICKNESS", "W_UNKNOWN_MATERIAL", "E_ROOM_SIZE"]);
  });
});
