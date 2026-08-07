/**
 * Lint-raised fixes must carry the FILE their spans are measured in.
 *
 * `applyFixes` refuses any `FixSuggestion` carrying a `file` — that guard is what stops an
 * imported component's edit from being spliced into the importer (the v1.22 bug class).
 * But the guard could never fire for a LINT fix: resolve-raised diagnostics get provenance
 * from `stampProvenance`, and lint runs *after* resolve, over a `ResolvedElement` that
 * carried no file at all. So every lint fix was minted with no `file`, and `applyFixes`
 * happily wrote a module's byte offsets into the middle of the importer's source.
 *
 * The first test in this file is that corruption, reproduced on an UNMODIFIED
 * `W_DIM_INSIDE`. The rest pin the fix's two halves: the diagnostic and its suggestions
 * both name the module, and a plan with no `import` is completely unchanged.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyFixes, compile, diagnosticToJson, lint, makeVirtualWorld } from "../src/index.js";
import type { Diagnostic } from "../src/diagnostics.js";

/* ---------------------------------------------------------------------------
 * The reproduction: a `dim` inside an imported component.
 * ------------------------------------------------------------------------- */

/** A component whose `dim` draws INSIDE the building — `W_DIM_INSIDE`, with the
 *  machine-applicable endpoint-swap fix. Its spans are offsets into THIS text. */
const DIM_LIB = `plan "lib" {
  component nook() {
    wall exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }
    room id=n at (0,0) size 4000x4000
    dim (0,0)->(4000,0) offset 1000
  }
}`;

/** The importer. Crucially it is LONGER than the offending statement's offsets in
 *  `DIM_LIB`, so those offsets address real (and entirely unrelated) bytes here. */
const DIM_MAIN = `plan "main" {
  grid 100
  import "lib.arch": nook
  wall exterior thickness 200 { (0,0) (9000,0) (9000,8000) (0,8000) close }
  room id=big at (5000,0) size 4000x4000
  place nook() as n1 at (0,0)
}`;

const dimWorld = () => makeVirtualWorld({ "lib.arch": DIM_LIB });

/** The same defect written directly in the compiled source — the common case, which must
 *  keep behaving exactly as before (no `file`, fix applies). */
const DIM_LOCAL = `plan "local" {
  grid 100
  wall exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }
  room id=n at (0,0) size 4000x4000
  dim (0,0)->(4000,0) offset 1000
}`;

function byCode(ds: Diagnostic[], code: string): Diagnostic {
  const d = ds.find((x) => x.code === code);
  expect(d, `expected a ${code} diagnostic, got ${ds.map((x) => x.code).join(", ")}`).toBeDefined();
  return d!;
}

describe("a lint fix from an imported module never edits the importer", () => {
  it("the plan itself is clean — the only defect is the one lint reports", () => {
    expect(compile(DIM_MAIN, { world: dimWorld() }).diagnostics).toEqual([]);
  });

  it("REGRESSION: `arch fix` used to splice the module's offsets into the importer", () => {
    const suggestions = lint(DIM_MAIN, { world: dimWorld() }).flatMap((d) => d.fixes ?? []);
    expect(suggestions.length).toBeGreaterThan(0);
    const report = applyFixes(DIM_MAIN, suggestions);

    // The whole point: nothing is applied, the importer's bytes are untouched, and the
    // author is told where the real edit belongs. Before the fix this wrote
    // `room id=big at (5000,0) sdim (4000, 0)->(0, 0) offset 1000 n1 at (0,0)`.
    expect(report.applied).toEqual([]);
    expect(report.output).toBe(DIM_MAIN);
    expect(report.skipped.map((s) => s.reason)).toEqual(['fix belongs to imported module "lib.arch" — edit that file']);
  });

  it("W_DIM_INSIDE names the module, and its span is measured THERE", () => {
    const d = byCode(lint(DIM_MAIN, { world: dimWorld() }), "W_DIM_INSIDE");
    expect(d.file).toBe("lib.arch");
    expect(DIM_LIB.slice(d.span!.start, d.span!.end)).toBe("dim (0,0)->(4000,0) offset 1000");
  });

  it("every fix on that diagnostic inherits the diagnostic's file", () => {
    const d = byCode(lint(DIM_MAIN, { world: dimWorld() }), "W_DIM_INSIDE");
    expect(d.fixes?.length).toBeGreaterThan(0);
    expect(d.fixes?.map((f) => f.file)).toEqual(d.fixes?.map(() => "lib.arch"));
  });

  it("a non-fix lint diagnostic on an imported element is stamped too", () => {
    const ds = lint(DIM_MAIN, { world: dimWorld() });
    const disconnected = ds.filter((d) => d.code === "W_ROOM_DISCONNECTED");
    // Two rooms, one per file — and each says which source its span belongs to.
    expect(disconnected.map((d) => d.file).sort()).toEqual(["lib.arch", undefined]);
  });
});

describe("the compiled source's own diagnostics are unchanged", () => {
  it("the same defect written locally carries NO file, on the diagnostic or its fixes", () => {
    const d = byCode(lint(DIM_LOCAL), "W_DIM_INSIDE");
    expect("file" in d).toBe(false);
    expect(d.fixes?.length).toBeGreaterThan(0);
    for (const f of d.fixes ?? []) expect("file" in f).toBe(false);
  });

  it("and `arch fix` still applies it — the guard only bites on an imported span", () => {
    const suggestions = lint(DIM_LOCAL).flatMap((d) => d.fixes ?? []);
    const report = applyFixes(DIM_LOCAL, suggestions);
    expect(report.skipped).toEqual([]);
    expect(report.applied.map((f) => f.fixId)).toContain("dim-inside");
    // The swap is the fix: endpoints reversed, everything else verbatim.
    expect(report.output).toContain("dim (4000, 0)->(0, 0) offset 1000");
    // …and the rewritten source no longer trips the rule.
    expect(lint(report.output).some((d) => d.code === "W_DIM_INSIDE")).toBe(false);
  });

  it("no import-free plan gains a `file` key anywhere in its lint output", () => {
    for (const src of [DIM_LOCAL, IMPORT_FREE]) {
      // Guard against a vacuous pass: `lint()` returns [] on a fatal error.
      expect(compile(src, { noCache: true }).errors).toEqual([]);
      const ds = lint(src);
      expect(ds.some((d) => (d.fixes ?? []).length > 0)).toBe(true);
      for (const d of ds) {
        expect("file" in d, `${d.code} gained a file key`).toBe(false);
        for (const f of d.fixes ?? []) expect("file" in f, `${d.code}'s fix gained a file key`).toBe(false);
      }
    }
  });
});

/** The same three defects, written inline instead of imported — the control. */
const IMPORT_FREE = `plan "many" {
  grid 100
  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,5000) (0,5000) close }
  room id=lounge at (0,0) size 6000x5000 label "Powder room"
  dim (0,0)->(6000,0) offset 1000
  furniture wc at (100,2000) size 700x400 rotate 180
}`;

/* ---------------------------------------------------------------------------
 * The structural postcondition, over every fix-bearing lint rule.
 * ------------------------------------------------------------------------- */

describe("the fix-provenance weld holds for every rule, not just the one that broke", () => {
  /** One imported component tripping several fix-bearing rules at once:
   *  `W_ALIAS_MATCH` (alias-uses), `W_DIM_INSIDE` (dim-inside) and
   *  `W_FIXTURE_BACK_TO_ROOM` (fixture-back-to-room). */
  const MULTI_LIB = `plan "lib" {
  component wing() {
    wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,5000) (0,5000) close }
    room id=lounge at (0,0) size 6000x5000 label "Powder room"
    dim (0,0)->(6000,0) offset 1000
    furniture wc at (100,2000) size 700x400 rotate 180
  }
}`;
  const MULTI_MAIN = `plan "main" {
  grid 100
  import "lib.arch": wing
  wall exterior thickness 200 { (0,0) (20000,0) (20000,16000) (0,16000) close }
  room id=court at (8000,0) size 8000x8000
  place wing() as w1 at (0,0)
}`;
  const world = () => makeVirtualWorld({ "lib.arch": MULTI_LIB });

  it("three distinct fix-bearing rules fire from inside the module", () => {
    const withFixes = lint(MULTI_MAIN, { world: world() }).filter((d) => (d.fixes ?? []).length > 0);
    expect([...new Set(withFixes.map((d) => d.code))].sort()).toEqual([
      "W_ALIAS_MATCH",
      "W_DIM_INSIDE",
      "W_FIXTURE_BACK_TO_ROOM",
    ]);
  });

  it("POSTCONDITION: a fix's file always equals its diagnostic's file", () => {
    for (const d of lint(MULTI_MAIN, { world: world() })) {
      for (const f of d.fixes ?? []) expect(f.file, `${d.code}/${f.fixId}`).toBe(d.file);
    }
  });

  it("every one of those fixes is refused, and the importer is byte-identical", () => {
    const suggestions = lint(MULTI_MAIN, { world: world() }).flatMap((d) => d.fixes ?? []);
    const report = applyFixes(MULTI_MAIN, suggestions);
    expect(report.applied).toEqual([]);
    expect(report.skipped).toHaveLength(suggestions.length);
    expect(report.output).toBe(MULTI_MAIN);
  });
});

/* ---------------------------------------------------------------------------
 * Byte-identity: adding `_file` to the IR must not touch any rendered output.
 * ------------------------------------------------------------------------- */

describe("`_file` is internal — it never reaches the drawing", () => {
  it("an imported plan's SVG is byte-identical across two compiles", () => {
    const a = compile(DIM_MAIN, { world: dimWorld() }).svg;
    const b = compile(DIM_MAIN, { world: dimWorld() }).svg;
    expect(a).toBe(b);
    expect(a).not.toContain("lib.arch");
  });
});

/* ---------------------------------------------------------------------------
 * The `--json` projection: `file` was never emitted at all, so a consumer got a
 * confidently-wrong `line`/`col` in the file it was reading, with no clue.
 * ------------------------------------------------------------------------- */

describe("diagnosticToJson carries the provenance through to `--json`", () => {
  it("an imported diagnostic emits `file` + `span` and NO line/col", () => {
    const d = byCode(lint(DIM_MAIN, { world: dimWorld() }), "W_DIM_INSIDE");
    const j = diagnosticToJson(DIM_MAIN, d);
    expect(j.file).toBe("lib.arch");
    expect(j.span).toEqual([d.span!.start, d.span!.end]);
    // Line/col can only be derived from the text the offsets index into.
    expect("line" in j).toBe(false);
    expect("col" in j).toBe(false);
    expect(j.fixes?.map((f) => f.file)).toEqual(["lib.arch"]);
  });

  it("a local diagnostic's projection is completely unchanged", () => {
    const j = diagnosticToJson(DIM_LOCAL, byCode(lint(DIM_LOCAL), "W_DIM_INSIDE"));
    expect(j.line).toBe(5);
    expect(j.col).toBe(3);
    expect("file" in j).toBe(false);
    for (const f of j.fixes ?? []) expect("file" in f).toBe(false);
  });
});

/* ---------------------------------------------------------------------------
 * End to end through the real CLI — `arch fix` must SAY why it declined, and must
 * leave the file on disk byte-identical.
 * ------------------------------------------------------------------------- */

describe("`arch fix` on an importer declines, explains, and writes nothing", () => {
  function fixture(): { dir: string; main: string } {
    const dir = mkdtempSync(join(tmpdir(), "archlang-fileprov-"));
    writeFileSync(join(dir, "lib.arch"), DIM_LIB);
    const main = join(dir, "main.arch");
    writeFileSync(main, DIM_MAIN);
    return { dir, main };
  }

  it("reports the skip reason (not silence) and leaves the bytes alone", () => {
    const { main } = fixture();
    const r = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", "fix", main, "--json"], {
      encoding: "utf8",
      cwd: process.cwd(),
    });
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.applied).toEqual([]);
    expect(j.wrote).toBe(false);
    // Before this fix the loop broke on "zero progress" BEFORE recording the reason, so
    // an author saw only `unresolved` and no explanation at all.
    expect(j.skipped).toEqual([
      { code: "W_DIM_INSIDE", reason: 'fix belongs to imported module "lib.arch" — edit that file' },
    ]);
    expect(readFileSync(main, "utf8")).toBe(DIM_MAIN);
  }, 60000);

  it("`lint --json` names the module and drops the meaningless line/col", () => {
    const { main } = fixture();
    const r = spawnSync(
      process.execPath,
      ["--import", "tsx", "src/cli.ts", "lint", main, "--json", "--code", "W_DIM_INSIDE"],
      { encoding: "utf8", cwd: process.cwd() },
    );
    expect(r.status).toBe(0);
    const [d] = JSON.parse(r.stdout).diagnostics;
    expect(d.file).toBe("lib.arch");
    expect(d.line).toBeUndefined();
    expect(d.fixes[0].file).toBe("lib.arch");
  }, 60000);
});
