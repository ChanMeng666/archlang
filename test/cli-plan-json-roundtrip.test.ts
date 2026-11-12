/** compile -f json → compile --from-json (the whole corpus); compile -f json writes the existing projection; the stdin pipe (the real binary) and the refusals. */

import { exampleNames } from "./helpers/corpus.js";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { describe, expect, it } from "vitest";
import { type Diagnostic, describe as describePlan, lint, planToJson } from "../src/index.js";
import { type Args, makeNodeWorld, sourceFromJson } from "../src/cli/io.js";
import { renderArtifact } from "../src/cli/serialize.js";
import { runArch, spawnArch } from "./helpers/cli.js";
import { CANNOT_ROUND_TRIP, UNRESOLVED_WAY_BACK } from "./tables/plan-json-gaps.js";

/**
 * `archlang compile -f json` writes the Plan JSON that `archlang compile --from-json` reads.
 *
 * The law: for every shipped example, the plan compiled back from the JSON is the plan the
 * source compiles to, page by page — byte-identical SVG, equal describe() facts and equal
 * lint() codes — unless the example is a listed gap. SVG alone is not enough: a plan whose
 * accessibility metadata was dropped draws the same default SVG. The corpus loop
 * drives the CLI's own render seam (`renderArtifact`, the function `cmdCompile` calls) and
 * its own `--from-json` converter (`sourceFromJson`) in process, because a process per file
 * would cost a minute; the stdin pipe itself is spawned once below, on `studio.arch`.
 *
 * The gap list is not retyped here: it is the library suite's `CANNOT_ROUND_TRIP`, minus the
 * one file the CLI rescues. The set is asserted EXACTLY, both ways, so a new example that
 * does not round-trip turns this red, and so does a gap that quietly closes.
 */

const EXAMPLES = exampleNames().sort();
const ARGS: Args = { _: [] };

/**
 * Gaps of the library suite that the CLI path closes. The library projects with no World, so
 * `import` cannot resolve; the CLI resolves it through its file World before projecting, so
 * the JSON it writes is the flat, imported geometry and compiles back to the same drawing.
 */
const CLI_CLOSES: Record<string, string> = {
  "imports.arch": "the CLI resolves `import` through its file World, so the projection is flat",
};

/** The examples `-f json` → `--from-json` cannot reproduce. */
const EXPECTED_GAPS = Object.keys(CANNOT_ROUND_TRIP)
  .filter((n) => !(n in CLI_CLOSES))
  .sort();

/**
 * The describe() keys a page's facts are compared without.
 *
 * `ok`/`diagnostics` are the run, not the plan; `levels`/`vertical`/`level`/`name` are the
 * multi-storey wrapper around a storey's facts. `freedom` is excluded BY DESIGN: it reports
 * which positions are hand-authored and which derived, and Plan JSON writes every position as
 * an absolute one, so `attached`/`strip`/relational placement comes back flattened. Measured:
 * it differs on 5 of the 8 files that round-trip (attached, garden-loft, laneway-house,
 * one-room, relational); comparing it would make the law unpassable, and the positions
 * themselves are still held by the SVG bytes and every other fact.
 */
const NOT_COMPARED = new Set(["ok", "diagnostics", "levels", "vertical", "level", "name", "freedom"]);
const facts = (s: object): Record<string, unknown> =>
  Object.fromEntries(Object.entries(s).filter(([k]) => !NOT_COMPARED.has(k)));
const lintCodes = (ds: Diagnostic[]): string[] => ds.map((d) => d.code ?? "").sort();

/**
 * One storey's outcome: the same plan back (SVG bytes, describe() facts and lint() codes all
 * equal), a different one (naming what differs), JSON the way back refuses, or a source the way
 * back writes that does not compile (its error codes; `UNRESOLVED_WAY_BACK`).
 */
type Outcome = { level?: number } & (
  | { kind: "same" }
  | { kind: "differs"; what: string[] }
  | { kind: "refused"; codes: string[] }
  | { kind: "no-compile"; codes: string[] }
);

/** Run one example through `-f json`, then `--from-json`, page by page, against the direct plan. */
async function roundTrip(name: string): Promise<Outcome[]> {
  const src = readFileSync(`examples/${name}`, "utf8");
  const world = makeNodeWorld("examples");
  const direct = await renderArtifact(src, "svg", ARGS, "examples", "all");
  const directFacts = describePlan(src, { world });
  const directLint = lint(src, { world });
  const json = await renderArtifact(src, "json", ARGS, "examples", "all");
  expect(json.error, `${name}: -f json failed`).toBeUndefined();
  const pages = json.pages ?? [{ level: undefined, bytes: json.bytes! }];
  const out: Outcome[] = [];
  for (const p of pages) {
    const want = p.level === undefined ? direct.bytes : direct.pages!.find((q) => q.level === p.level)!.bytes;
    const wantFacts = p.level === undefined ? directFacts : directFacts.levels!.find((l) => l.level === p.level)!;
    const wantLint = p.level === undefined ? directLint : directLint.filter((d) => d.level === p.level);
    const conv = sourceFromJson(p.bytes as string);
    if ("error" in conv) {
      out.push({ level: p.level, kind: "refused", codes: [...new Set(conv.error.map((d) => d.code ?? ""))] });
      continue;
    }
    const back = await renderArtifact(conv.source, "svg", ARGS, process.cwd(), "first");
    if (back.bytes === undefined && back.diagnostics.some((d) => d.severity === "error")) {
      const codes = [...new Set(back.diagnostics.filter((d) => d.severity === "error").map((d) => d.code ?? ""))];
      out.push({ level: p.level, kind: "no-compile", codes: codes.sort() });
      continue;
    }
    const what: string[] = [];
    if (back.bytes !== want) what.push("svg");
    if (!isDeepStrictEqual(facts(describePlan(conv.source)), facts(wantFacts))) what.push("describe");
    if (!isDeepStrictEqual(lintCodes(lint(conv.source)), lintCodes(wantLint))) what.push("lint");
    out.push(what.length === 0 ? { level: p.level, kind: "same" } : { level: p.level, kind: "differs", what });
  }
  return out;
}

describe("compile -f json → compile --from-json (the whole corpus)", () => {
  it("every example round-trips to the same SVG, describe() and lint(), except exactly the listed gaps", async () => {
    const gaps: string[] = [];
    for (const name of EXAMPLES) {
      const outcomes = await roundTrip(name);
      if (outcomes.some((o) => o.kind !== "same")) gaps.push(name);
    }
    expect(gaps).toEqual(EXPECTED_GAPS);
  }, 120_000);

  it("the way back does not compile for exactly UNRESOLVED_WAY_BACK, for the lost courtyard cover", async () => {
    const noCompile: string[] = [];
    for (const name of EXPECTED_GAPS) {
      const outcomes = await roundTrip(name);
      if (!outcomes.some((o) => o.kind === "no-compile")) continue;
      noCompile.push(name);
      // Not counted as `differs: svg`: every page is this outcome, and the refusal is the hole.
      for (const o of outcomes) {
        expect(o.kind, name).toBe("no-compile");
        if (o.kind === "no-compile") expect(o.codes, name).toContain("E_ROOMS_NOT_TILING");
      }
    }
    expect(noCompile).toEqual([...UNRESOLVED_WAY_BACK]);
  }, 120_000);

  it("a gap is refused with an E_JSON_* code or draws different bytes; it is never a crash", async () => {
    for (const name of EXPECTED_GAPS) {
      for (const o of await roundTrip(name)) {
        if (o.kind === "refused") for (const c of o.codes) expect(c, `${name}`).toMatch(/^E_JSON_/);
      }
    }
  }, 120_000);

  it("names only gaps the library suite lists, and keeps a non-vacuous covered set", () => {
    for (const n of Object.keys(CLI_CLOSES)) expect(Object.keys(CANNOT_ROUND_TRIP)).toContain(n);
    const covered = EXAMPLES.filter((n) => !EXPECTED_GAPS.includes(n));
    expect(covered.length).toBeGreaterThanOrEqual(8);
    for (const must of ["studio.arch", "one-room.arch", "garden-loft.arch", "imports.arch"])
      expect(covered).toContain(must);
  });

  it("accessible.arch is a gap only through describe(): the default SVG cannot see it", async () => {
    expect(await roundTrip("accessible.arch")).toEqual([{ level: undefined, kind: "differs", what: ["describe"] }]);
  });
});

describe("compile -f json writes the existing projection", () => {
  it("is planToJson's document, two-space indented and newline-terminated", async () => {
    const src = readFileSync("examples/studio.arch", "utf8");
    const r = await renderArtifact(src, "json", ARGS, "examples", "all");
    const { json } = planToJson(src, { world: makeNodeWorld("examples") });
    expect(r.bytes).toBe(`${JSON.stringify(json, null, 2)}\n`);
    expect(JSON.parse(r.bytes as string).version).toBe(1);
  });

  it("a multi-storey plan writes one document per storey, and --level picks one", async () => {
    const src = readFileSync("examples/two-storey.arch", "utf8");
    const all = await renderArtifact(src, "json", ARGS, "examples", "all");
    const { pages } = planToJson(src, { world: makeNodeWorld("examples") });
    expect(all.pages?.map((p) => p.level)).toEqual([1, 2]);
    expect(all.pages?.map((p) => JSON.parse(p.bytes as string))).toEqual(pages?.map((p) => p.json));
    const two = await renderArtifact(src, "json", ARGS, "examples", { level: 2 });
    expect(JSON.parse(two.bytes as string)).toEqual(pages?.[1]?.json);
    const none = await renderArtifact(src, "json", ARGS, "examples", { level: 9 });
    expect(none.badLevel).toBe(true);
  });

  it("a single-storey plan's planToJson result carries no `pages` (unchanged shape)", () => {
    expect("pages" in planToJson(readFileSync("examples/studio.arch", "utf8"))).toBe(false);
  });
});

describe("the stdin pipe (the real binary) and the refusals", () => {
  // The pipe case spawns the binary: what it proves is a real stdin pipe between two processes.
  const spawn = (args: string[], input?: string) => spawnArch(args, { input });

  it("compile -f json -o - | compile --from-json - -o - draws the same SVG as compile -o -", () => {
    const json = spawn(["compile", "examples/studio.arch", "-f", "json", "-o", "-"]);
    expect(json.status).toBe(0);
    const back = spawn(["compile", "--from-json", "-", "-o", "-"], json.stdout);
    const direct = spawn(["compile", "examples/studio.arch", "-o", "-"]);
    expect(back.status).toBe(0);
    expect(direct.status).toBe(0);
    expect(back.stdout).toBe(direct.stdout);
  }, 60_000);

  it("--view with -f json is a usage error (exit 3): Plan JSON is not a drawing", async () => {
    const r = await runArch(["compile", "examples/studio.arch", "-f", "json", "--view", "iso", "-o", "-"]);
    expect(r.status).toBe(3);
    expect(r.stderr).toContain("-f json");
  }, 60_000);

  it("so are the drawing-only flags, named in one message (exit 3), for compile and batch", async () => {
    const flags = ["--accessible", "--overlay", "circulation", "--width", "800", "--scale", "2"];
    const c = await runArch(["compile", "examples/studio.arch", "-f", "json", ...flags, "-o", "-"]);
    expect(c.status).toBe(3);
    expect(c.stdout).toBe("");
    expect(c.stderr).toContain("--accessible, --overlay, --width, --scale cannot be combined with -f json");
    const b = await runArch(["batch", "examples/studio.arch", "-f", "json", "--width", "800"]);
    expect(b.status).toBe(3);
    expect(b.stderr).toContain("--width cannot be combined with -f json");
  }, 60_000);
});
