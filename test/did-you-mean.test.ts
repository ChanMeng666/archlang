/**
 * AF2: one did-you-mean producer (`spelling`, `src/expr.ts`; `spellingFix`, `src/fix-producers.ts`),
 * after TypeScript's `getSpellingSuggestion` and its one spelling codefix. It serves an unknown
 * statement word (`dor`, and a misspelt clause word that ended a statement early: `lable`), an
 * unknown relational reference (`right-of hal`), a clause word the parser expected (`betwen`,
 * `widht`) and a `uses` word (`bedrom`). Each fix rewrites the offending word alone.
 *
 * It is `machine-applicable` only when all three hold (fix round 1 of #978): the misspelt word is
 * no word of the language (a word spelled right in the wrong place is never rewritten) and no
 * name the plan declares; the candidates are a whole closed set, never the one word a position
 * expected; and the word is the only candidate under the distance limit. A user's room ids are an
 * open set, so every id suggestion is `maybe-incorrect`, its hint still naming the room. The
 * `W_UNKNOWN_FURNITURE` fix (`sofaa`) is narrowed to the same shape, and stays `maybe-incorrect`.
 *
 * Only diagnostics of plans that already fail moved, plus the `W_UNKNOWN_FURNITURE` span and fix:
 * the corpus sweep and its RM-D56 swap-back are in the PR, and the moved rows are re-pinned where
 * they live (`test/resolve-order-byte-identity.test.ts`, `test/rectilinear-rooms-byte-identity.test.ts`).
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe as suite, expect, it } from "vitest";
import { applyFixes, compile } from "../src/index.js";
import type { Diagnostic } from "../src/diagnostics.js";
import { spelling } from "../src/expr.js";
import { KEYWORDS, STATEMENT_STARTS } from "../src/grammar/tokens.js";
import { USE_KINDS } from "../src/ast.js";
import { makeVirtualWorld } from "../src/world.js";
import { runArch } from "./helpers/cli.js";

/** The words a statement can start with: the fixed ones and the element keywords. */
const STARTS = [...STATEMENT_STARTS, ...KEYWORDS.element];
const plan = (...lines: string[]): string => `plan "p" {\n${lines.map((l) => `  ${l}`).join("\n")}\n}\n`;
const ROOMS = [
  'room id=hall at (0,0) size 4000x3000 label "Hall" uses hall',
  'room id=bed right-of hall size 3000x3000 label "Bed" uses bedroom',
  "walls from rooms exterior 200 partition 100",
];
const MA = "machine-applicable";
const MI = "maybe-incorrect";

/** Each diagnostic carrying a spelling fix, as the text its span and its one edit cover. */
function spelt(src: string): { code: string; span: string; hint: string | undefined; fix: [string, string, string] }[] {
  return compile(src, { noCache: true })
    .diagnostics.filter((d) => d.fixes?.some((f) => f.fixId === "spelling"))
    .map((d: Diagnostic) => {
      const f = d.fixes!.find((x) => x.fixId === "spelling")!;
      const e = f.edits[0]!;
      expect(f.edits).toHaveLength(1);
      return {
        code: d.code!,
        span: src.slice(d.span!.start, d.span!.end),
        hint: d.hints?.at(-1),
        fix: [f.applicability, src.slice(e.span.start, e.span.end), e.newText],
      };
    });
}

/** The applicabilities of every spelling fix a plan carries. */
const tiers = (src: string): string[] => spelt(src).map((s) => s.fix[0]);

/** `arch fix`'s pass at a tier: apply the fixes, then compile again. */
function fixed(src: string, unsafe = false): { out: string; codes: string[] } {
  const fixes = compile(src, { noCache: true }).diagnostics.flatMap((d) => d.fixes ?? []);
  const out = applyFixes(src, fixes, unsafe ? { maxApplicability: MI } : {}).output;
  return { out, codes: compile(out, { noCache: true }).diagnostics.map((d) => d.code!) };
}

suite("spelling(): TypeScript's getSpellingSuggestion rules", () => {
  it("finds the near word, and calls it unique when no other word is under the limit", () => {
    // `for` stands at the limit (a changed letter counts two): no suggestion itself, but near enough
    // to make `door` a guess (fix round 2 of #978).
    expect(spelling("dor", STARTS)).toEqual({ word: "door", unique: false });
    expect(spelling("bedrom", USE_KINDS)).toEqual({ word: "bedroom", unique: true });
    // A changed letter counts two (`dor` is not one edit from `for`), as in TypeScript.
    expect(spelling("dor", ["for"])).toBeNull();
  });

  it("breaks a tie by the set's own order, and says it is not unique", () => {
    expect(spelling("abcd", ["abc", "bcd"])).toEqual({ word: "abc", unique: false });
    expect(spelling("abcd", ["bcd", "abc"])).toEqual({ word: "bcd", unique: false });
    // A nearer word wins over an earlier one; the earlier one still makes it not unique.
    expect(spelling("tablet", ["tables", "table"])).toEqual({ word: "table", unique: false });
  });

  it("offers nothing for a word of the set, a far word, an excluded word, or a two-letter word in the same case", () => {
    expect(spelling("door", STARTS)).toBeNull();
    expect(spelling("zzqqxx", STARTS)).toBeNull();
    expect(spelling("hal", ["hall"], "hall")).toBeNull();
    expect(spelling("wx", ["wc"])).toBeNull();
    expect(spelling("WC", ["wc"])).toEqual({ word: "wc", unique: true });
  });

  it("makes no search a budget cannot pay for, and takes what it spends off the budget", () => {
    const budget = { steps: 3 };
    expect(spelling("hal", ["hall", "bed", "bath", "wc"], undefined, budget)).toBeNull();
    expect(budget.steps).toBe(3);
    const roomy = { steps: 1000 };
    expect(spelling("hal", ["hall"], undefined, roomy)).toEqual({ word: "hall", unique: true });
    expect(roomy.steps).toBe(1000 - 1 - 4 * 5);
  });

  it("is a function of its input: the same answer every time", () => {
    const words = [...STARTS];
    const first = spelling("wal", words);
    for (let i = 0; i < 5; i++) expect(spelling("wal", words)).toEqual(first);
  });
});

suite("the producers: a word-level span and a fix that rewrites that word alone", () => {
  it("an unknown statement word", () => {
    // `for` at the distance limit makes `door` a guess: the hint, and a fix for `--unsafe`.
    expect(spelt(plan(...ROOMS, "dor on hall.bottom at 1000 from start width 900"))).toEqual([
      { code: "E_PARSE", span: "dor", hint: "did you mean `door`?", fix: [MI, "dor", "door"] },
    ]);
    expect(spelt(plan("levle 1 {", "  room id=a at (0,0) size 4000x3000", "}"))).toEqual([
      { code: "E_PARSE", span: "levle", hint: "did you mean `level`?", fix: [MA, "levle", "level"] },
    ]);
  });

  it("a candidate at the distance limit makes the nearest a guess (`dism`, `siet`, `ste`)", () => {
    const pre = 'room id=a at (0,0) size 4000x3000 label "A" uses living';
    expect(spelt(plan("dism auto all", pre)).map((x) => x.fix)).toEqual([[MI, "dism", "dim"]]);
    expect(spelt(plan("siet { street north hemisphere north }", pre)).map((x) => x.fix)).toEqual([[MI, "siet", "set"]]);
    expect(spelt(plan(pre, "ste door(width: 900)")).map((x) => x.fix)).toEqual([[MI, "ste", "site"]]);
    // A value word can stand on a statement's line: `roomss` after `dims auto` is one slip from `rooms`.
    expect(spelt(plan("dims auto roomss", pre)).map((x) => x.fix)).toEqual([[MI, "roomss", "rooms"]]);
  });

  it("a misspelt clause word that ended its statement early", () => {
    // `slab` stands at the limit of `lable`: the hint, and a fix for `--unsafe`.
    expect(spelt(plan('room id=a at (0,0) size 4000x3000 lable "A"'))).toEqual([
      { code: "E_PARSE", span: "lable", hint: "did you mean `label`?", fix: [MI, "lable", "label"] },
    ]);
    expect(spelt(plan("uses bedrom"))).toEqual([]);
    expect(spelt(plan('room id=a at (0,0) size 4000x3000 label "A" uses living bedrom'))).toEqual([
      { code: "E_PARSE", span: "bedrom", hint: "did you mean `bedroom`?", fix: [MA, "bedrom", "bedroom"] },
    ]);
  });

  it("an unknown relational reference: spanned on the id, and an id is never a machine fix", () => {
    expect(spelt(plan(ROOMS[0]!, 'room id=b right-of hal size 3000x3000 label "B"'))).toEqual([
      { code: "E_LAYOUT_REF", span: "hal", hint: "did you mean `hall`?", fix: [MI, "hal", "hall"] },
    ]);
    // Two rooms as near: the first declared. The room itself is no candidate.
    const two = plan(
      "room id=hall1 at (0,0) size 3000x3000",
      "room id=hall2 at (0,3000) size 3000x3000",
      "room id=halls right-of hall size 3000x3000",
    );
    expect(spelt(two)).toEqual([
      { code: "E_LAYOUT_REF", span: "hall", hint: "did you mean `hall1`?", fix: [MI, "hall", "hall1"] },
    ]);
    // A room whose declaration is missing (`bedroom2`), or one whose fix would close a cycle
    // (`dinning`): the hint names the near room; the fix waits for the author.
    expect(
      tiers(plan("room id=bedroom1 at (0,0) size 4000x3000", "room id=bath right-of bedroom2 size 3000x3000")),
    ).toEqual([MI]);
    expect(
      tiers(plan("room id=kitchen right-of dinning size 4000x3000", "room id=dining right-of kitchen size 3000x3000")),
    ).toEqual([MI]);
    // No near room: the span is still the id, and no fix is offered.
    const far = plan(ROOMS[0]!, "room id=b right-of ghost size 3000x3000");
    const d = compile(far, { noCache: true }).diagnostics.find((x) => x.code === "E_LAYOUT_REF")!;
    expect(far.slice(d.span!.start, d.span!.end)).toBe("ghost");
    expect(d.fixes).toBeUndefined();
    expect(d.hints).toBeUndefined();
  });

  it("a clause word: machine-applicable only against a position's whole closed set", () => {
    const body = (clause: string): string =>
      plan(ROOMS[0]!, ROOMS[1]!, `walls from rooms exterior 200 partition 100 {\n    ${clause}\n  }`);
    // The body's three clause words are the whole set that can stand there.
    expect(spelt(body("betwen hall and bed thickness 150"))).toEqual([
      { code: "E_PARSE", span: "betwen", hint: "did you mean `between`?", fix: [MA, "betwen", "between"] },
    ]);
    // One expected word (`eatKeyword`, a missing clause) is not a set: the fix waits for the author.
    expect(spelt(body("open betwen hall and bed"))).toEqual([
      { code: "E_PARSE", span: "betwen", hint: "did you mean `between`?", fix: [MI, "betwen", "between"] },
    ]);
    expect(spelt(plan(...ROOMS, "door on hall.bottom at 1000 from start widht 900"))).toEqual([
      {
        code: "E_PARSE",
        span: "door on hall.bottom at 1000 from start",
        hint: "did you mean `width`?",
        fix: [MI, "widht", "width"],
      },
    ]);
    // `open between hall land`: `land` is a room the author named, one slip from the `and` the
    // parser expected. Rewriting it would delete a room reference.
    const land = plan(
      "room id=hall at (0,0) size 4000x3000",
      "room id=land at (4000,0) size 4000x3000",
      "walls from rooms exterior 200 partition 100 { open between hall land }",
    );
    expect(tiers(land)).toEqual([MI]);
  });

  it("a `uses` word, in a room and in a strip", () => {
    expect(spelt(plan("room id=a at (0,0) size 4000x3000 uses bedrom"))).toEqual([
      { code: "E_PARSE", span: "bedrom", hint: "did you mean `bedroom`?", fix: [MA, "bedrom", "bedroom"] },
    ]);
    expect(spelt(plan("strip right at (0,0) gap 0 height 3000 {\n    room size 3000 uses kitchn\n  }"))).toEqual([
      { code: "E_PARSE", span: "kitchn", hint: "did you mean `kitchen`?", fix: [MA, "kitchn", "kitchen"] },
    ]);
  });

  it("a word of the language out of place is never rewritten by a machine fix", () => {
    const pre = [
      'room id=a at (0,0) size 4000x3000 label "A" uses living',
      "walls from rooms exterior 200 partition 100",
    ];
    expect(spelt(plan("room id=a at (0,0) size 4000x3000", "slab 200"))).toEqual([]);
    expect(spelt(plan("room id=a at (0,0) size 4000x3000", "offset 200"))).toEqual([]);
    // `left` (a hinge or slide word) after a complete door: spelled right, so no fix.
    expect(tiers(plan(...pre, "door on a.bottom at 1000 from start width 900 left"))).toEqual([]);
    // `closet` (a furniture kind) after a `uses` list: no fix.
    expect(tiers(plan('room id=a at (0,0) size 4000x3000 label "A" uses bedroom closet'))).toEqual([]);
    // `uses all`: `all` is a word of the language one slip from `hall`; the hint, not a rewrite.
    expect(spelt(plan('room id=a at (0,0) size 4000x3000 label "A" uses all'))).toEqual([
      { code: "E_PARSE", span: "all", hint: "did you mean `hall`?", fix: [MI, "all", "hall"] },
    ]);
  });

  it("a word the source writes anywhere else is never rewritten by a machine fix", () => {
    expect(
      tiers(plan(...ROOMS, "component wal() {", "  furniture sofa at (500,500) size 1500x900", "}", "wal")),
    ).toEqual([MI]);
    expect(tiers(plan(...ROOMS, "let rom = 3", "rom"))).toEqual([MI]);
    // A component parameter, and an imported name (fix round 2 of #978).
    const param = plan(
      "component c(labl) {",
      "  room id=r at (0,0) size 3000x3000 labl",
      "}",
      "place c(3000) as u at (0,0)",
    );
    expect(spelt(param).map((x) => x.fix)).toEqual([[MI, "labl", "label"]]);
    const lib = plan("component stairs() {", "  stair at (500,500) size 1000x2500 dir up", "}");
    const main = plan('import "lib.arch": stairs', ...ROOMS, "stairs");
    const d = compile(main, { noCache: true, world: makeVirtualWorld({ "lib.arch": lib }) }).diagnostics.find((x) =>
      x.fixes?.some((f) => f.fixId === "spelling"),
    )!;
    expect(d.fixes!.map((f) => [f.applicability, f.edits[0]!.newText])).toEqual([[MI, "stair"]]);
    // The red team's swap fuzz: two neighbouring words exchanged leave a word the plan uses elsewhere.
    expect(tiers(plan(...ROOMS, "DOOR let = 900", "door on hall.bottom at 1000 from start width DOOR"))).toEqual([MI]);
    const swapped = plan("unit component(w) {", "  room id=r at (0,0) size w x 3000", "}", "unit(4000)");
    expect(tiers(swapped).filter((t) => t === MA)).toEqual([]);
  });

  it("`W_UNKNOWN_FURNITURE` is spanned on the kind word and its fix rewrites only that word", () => {
    const src = plan('room id=a at (0,0) size 4000x3000 label "A"', "furniture sofaa at (500,500) size 2000x900");
    const d = compile(src, { noCache: true }).diagnostics.find((x) => x.code === "W_UNKNOWN_FURNITURE")!;
    expect(src.slice(d.span!.start, d.span!.end)).toBe("sofaa");
    expect(d.fixes).toEqual([
      {
        title: "write the catalogued kind `sofa`",
        applicability: MI,
        edits: [{ span: d.span, newText: "sofa" }],
      },
    ]);
    // The rest of the statement keeps its bytes: `(500,500)` is not reprinted as `(500, 500)`.
    const out = applyFixes(src, d.fixes!, { maxApplicability: MI }).output;
    expect(out).toBe(src.replace("sofaa", "sofa"));
  });
});

suite("the search is bounded like the diagnostics it enriches", () => {
  const badRefs = (n: number): string =>
    plan(
      "room id=anchor at (0,0) size 1000x1000",
      ...Array.from({ length: n }, (_, i) => `room id=rm${i} right-of ghost${i} size 1000x1000`),
    );
  const pad = (i: number): string => String(i).padStart(4, "0");
  const refs = (k: number, ind: string): string[] => [
    `${ind}room id=r0000 at (0,0) size 1000x1000`,
    ...Array.from({ length: k - 1 }, (_, i) => `${ind}room id=r${pad(i + 1)} right-of q${pad(i + 1)} size 1000x1000`),
  ];
  const keepsMain = (src: string): void => {
    const codes = compile(src, { noCache: true }).diagnostics.map((d) => d.code);
    expect(codes.filter((c) => c === "E_LAYOUT_REF")).toHaveLength(500);
    expect(codes.filter((c) => c !== "E_LAYOUT_REF")).toEqual(["E_DIAGNOSTIC_LIMIT"]);
  };
  it.each([1000, 3000])("%i bad references keep main's 500 E_LAYOUT_REF and E_DIAGNOSTIC_LIMIT", (n) => {
    keepsMain(badRefs(n));
  });
  // The search budget is the whole resolution's, not each pass's (fix round 2 of #978).
  it("a component of 250 bad references placed 6 times keeps main's report, no E_STEP_LIMIT", () => {
    const places = [0, 1, 2, 3, 4, 5].map((i) => `place c() as u${i} at (0,${i * 5000})`);
    keepsMain(plan("component c() {", ...refs(250, "  "), "}", ...places));
  });
  it("6 storeys of 250 bad references keep main's report, no E_STEP_LIMIT", () => {
    keepsMain(plan(...[1, 2, 3, 4, 5, 6].flatMap((l) => [`level ${l} {`, ...refs(250, "  "), "}"])));
  });
});

suite("`arch fix` applies each machine-applicable fix cleanly: fix, recompile, the error is gone", () => {
  it.each([
    [
      "levle",
      plan("levle 1 {", "  room id=a at (0,0) size 4000x3000", "  walls from rooms exterior 200 partition 100", "}"),
    ],
    [
      "betwen",
      plan(
        ROOMS[0]!,
        ROOMS[1]!,
        "walls from rooms exterior 200 partition 100 {\n    betwen hall and bed thickness 150\n  }",
      ),
    ],
    ["bedrom", plan("room id=a at (0,0) size 4000x3000 uses bedrom", "walls from rooms exterior 200 partition 100")],
  ])("%s", (_word, src) => {
    expect(compile(src, { noCache: true }).diagnostics.some((d) => d.severity === "error")).toBe(true);
    const { out, codes } = fixed(src);
    expect(out).not.toBe(src);
    expect(codes.filter((c) => c.startsWith("E_"))).toEqual([]);
  });

  it.each([
    ["dor", plan(...ROOMS, "dor on hall.bottom at 1000 from start width 900")],
    ["lable", plan('room id=a at (0,0) size 4000x3000 lable "A"', "walls from rooms exterior 200 partition 100")],
    ["hal", plan(ROOMS[0]!, 'room id=b right-of hal size 3000x3000 label "B"', ROOMS[2]!)],
    [
      "open betwen",
      plan(ROOMS[0]!, ROOMS[1]!, "walls from rooms exterior 200 partition 100 { open betwen hall and bed }"),
    ],
    ["widht", plan(...ROOMS, "door on hall.bottom at 1000 from start widht 900")],
  ])("%s: left alone by `arch fix`, applied by `--unsafe`", (_word, src) => {
    expect(fixed(src).out).toBe(src);
    const { out, codes } = fixed(src, true);
    expect(out).not.toBe(src);
    expect(codes.filter((c) => c.startsWith("E_"))).toEqual([]);
  });
});

suite("a fix inside an imported module is never applied to the importing file (#978 B1)", () => {
  const LIB = plan(
    "component unit() {",
    "  room id=living at (0,0) size 3000x3000",
    "  room id=side right-of livng size 2000x3000",
    "}",
  );
  const MAIN = plan(
    'import "lib.arch": unit',
    'room id=kitchen at (20000,0) size 4000x3000 label "Kitchen and family dining room"',
    "place unit() as u at (0,0)",
  );

  it("a compiling plan's warning on an imported relational room names its module too", () => {
    const lib = plan(
      "component unit() {",
      "  room id=a at (0,0) size 3000x3000",
      '  room id=b right-of a size 2000x3000 label "B" at (90000,0)',
      "}",
    );
    const main = plan('import "lib.arch": unit', "place unit() as u at (0,0)");
    const ds = compile(main, { noCache: true, world: makeVirtualWorld({ "lib.arch": lib }) }).diagnostics;
    // On main the warning had no `file`, so a reader looked for its span in the importing file.
    expect(ds.map((d) => [d.code, d.file])).toEqual([["W_ROOM_LABEL_OUTSIDE", "lib.arch"]]);
  });

  it("the diagnostic and its fix name the module; `arch fix` and `--unsafe` leave both files as they are", async () => {
    const dir = mkdtempSync(join(tmpdir(), "af2-import-"));
    try {
      writeFileSync(join(dir, "lib.arch"), LIB);
      writeFileSync(join(dir, "main.arch"), MAIN);
      const c = await runArch(["compile", "main.arch", "--json", "-o", "out.svg"], { cwd: dir });
      const ds = (JSON.parse(c.stdout) as { diagnostics: Diagnostic[] }).diagnostics.filter(
        (d) => d.code === "E_LAYOUT_REF",
      );
      expect(ds).toHaveLength(1);
      expect(ds[0]!.file).toBe("lib.arch");
      expect(ds[0]!.fixes?.map((f) => [f.applicability, f.file])).toEqual([[MI, "lib.arch"]]);
      for (const extra of [[], ["--unsafe"]]) {
        const r = await runArch(["fix", "main.arch", ...extra, "--json"], { cwd: dir });
        expect(JSON.parse(r.stdout).applied).toEqual([]);
        expect(readFileSync(join(dir, "main.arch"), "utf8")).toBe(MAIN);
        expect(readFileSync(join(dir, "lib.arch"), "utf8")).toBe(LIB);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
