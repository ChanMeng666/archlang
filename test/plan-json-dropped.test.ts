import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { planToJson, type PlanJsonDropped, type PlanJsonDroppedClause } from "../src/index.js";
import { cmdCompile } from "../src/cli/commands-render.js";
import { type Args, makeNodeWorld, parseArgs } from "../src/cli/io.js";
import { renderArtifact } from "../src/cli/serialize.js";
import { BUILTIN_DEFS } from "../src/elements/defs.js";
import { UNPROJECTED_KINDS } from "../src/plan-json.js";
import { CANNOT_ROUND_TRIP } from "./plan-json-gaps.js";

/**
 * Issue #366: `compile -f json` says what the format could not carry, the way it has always said
 * so for keeps. The report is data on `planToJson().dropped` and on the `--json` envelope, and
 * one stderr note per clause. It never touches the document, and a plan that drops nothing has
 * no report at all.
 */

const ARGS: Args = { _: [] };

const WALL = "wall id=a exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }";
const ROOM = 'room id=r at (0,0) size 4000x3000 label "Hall"';

/** A plan with one line more than a plan that drops nothing. */
const planWith = (line: string): string => `plan "p" {\n  units mm\n  ${WALL}\n  ${ROOM}\n  ${line}\n}\n`;

/** A plan that drops two clauses, for what the CLI does with a report. */
const REPORTED = planWith("legend\n  axes { x at 0, 4000 y at 0 }");

/** One line per clause: each is the only thing its plan drops. */
const ONE_LINE: Array<[Exclude<PlanJsonDroppedClause, "keep" | "level">, string]> = [
  ["poche hatch", "wall id=h exterior thickness 200 material poche scale 2 { (0,4000) (4000,4000) }"],
  ["circle", "room id=c circle at (9000,1500) radius 1000"],
  ["label at", 'room id=l at (5000,0) size 2000x2000 label "L" at (5500,500)'],
  ["column order", "column id=k at (5000,0) size 300x300\n  furniture id=b bed at (5500,0) size 1000x2000"],
  ["stair", "stair id=s at (5000,0) size 1000x3000 dir up"],
  ["elevator", "elevator id=e at (5000,0) size 1500x1500"],
  ["escalator", "escalator id=e at (5000,0) size 1000x4000 dir up"],
  ["roof", "roof polygon (0,0) (4000,0) (4000,3000)"],
  ["void", "void id=v at (500,500) size 1000x1000"],
  ["outdoor", "outdoor id=o lawn at (5000,0) size 2000x2000"],
  ["fence", "fence id=f picket { (5000,0) (7000,0) }"],
  ["zone", 'zone west "West" { room id=z at (5000,0) size 2000x2000 }'],
  ["axes", "axes { x at 0, 4000 y at 0 }"],
  ["site boundary", "site { street south boundary (0,0) (5000,0) (5000,4000) }"],
  ["schedule rooms", "schedule rooms"],
  ["schedule openings", "schedule openings"],
  ["legend", "legend"],
  ["hidden", "north hidden"],
  ["notes", 'notes "one" "two"'],
  ["sheet text", 'sheet text { total "SUMME" }'],
  ["decimal mark", 'sheet text { decimal "," }'],
  ["theme", "theme blueprint"],
  ["style", 'style wall { stroke: "#111111" }'],
  ["accTitle", 'accTitle "Title"'],
  ["accDescr", 'accDescr "Description"'],
];

const clauses = (rows: PlanJsonDropped[] | undefined): string[] => (rows ?? []).map((r) => r.clause);

/** `compile`, in process, with stdout and stderr captured. */
async function compileCli(argv: string[]): Promise<{ exit: number; stdout: string; stderr: string }> {
  let stdout = "";
  let stderr = "";
  const out = process.stdout.write.bind(process.stdout);
  const err = process.stderr.write.bind(process.stderr);
  const sink =
    (to: "out" | "err") =>
    (chunk: string | Uint8Array): boolean => {
      const s = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
      if (to === "out") stdout += s;
      else stderr += s;
      return true;
    };
  process.stdout.write = sink("out") as typeof process.stdout.write;
  process.stderr.write = sink("err") as typeof process.stderr.write;
  try {
    const exit = await cmdCompile(parseArgs(argv));
    return { exit, stdout, stderr };
  } finally {
    process.stdout.write = out;
    process.stderr.write = err;
  }
}

describe("every clause is reported on the plan that has it, and alone", () => {
  it.each(ONE_LINE)("%s", async (clause, line) => {
    const source = planWith(line);
    const r = planToJson(source);
    expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(clauses(r.dropped)).toEqual([clause]);
    const rendered = await renderArtifact(source, "json", ARGS, ".", "all");
    expect(rendered.notes).toHaveLength(1);
    expect(rendered.notes?.[0]).toMatch(
      /^note: Plan JSON carries no .+; this export .+ \(the \.arch source still holds (it|them)\)$/,
    );
  });

  it("counts a `sheet text`'s words and says its decimal mark apart", async () => {
    const source = planWith('sheet text { decimal "," total "SUMME" name "RAUM" }');
    expect((await renderArtifact(source, "json", ARGS, ".", "all")).notes).toEqual([
      "note: Plan JSON carries no sheet words; this export leaves out 2 sheet words (the .arch source still holds them)",
      'note: Plan JSON carries no decimal marks; this export leaves out `decimal ","` (the .arch source still holds it)',
    ]);
  });

  it("counts what the plan has, and says it or them to match", async () => {
    const r = await renderArtifact(planWith('notes "one" "two"'), "json", ARGS, ".", "all");
    expect(r.notes?.[0]).toContain("leaves out 2 sheet notes (the .arch source still holds them)");
  });

  it("names five ids in a note, and hands the rest to --json", async () => {
    const stairs = Array.from(
      { length: 7 },
      (_, i) => `stair id=s${i} at (${5000 + i * 1200},0) size 1000x3000 dir up`,
    );
    const r = await renderArtifact(planWith(stairs.join("\n  ")), "json", ARGS, ".", "all");
    expect(r.notes?.[0]).toContain("leaves out 7 stairs: s0, s1, s2, s3, s4 and 2 more (");
    expect(r.dropped?.[0]?.ids).toHaveLength(7);
  });

  it("an empty block drops nothing, so it says nothing", () => {
    expect(planToJson(planWith("theme { }")).dropped).toBeUndefined();
  });

  it("a `poche` wall with no scale or angle has no hatch to lose, and the angle alone counts", () => {
    expect(
      planToJson(planWith("wall id=h exterior thickness 200 material poche { (0,4000) (4000,4000) }")).dropped,
    ).toBeUndefined();
    expect(
      clauses(
        planToJson(planWith("wall id=h exterior thickness 200 material poche angle 30 { (0,4000) (4000,4000) }"))
          .dropped,
      ),
    ).toEqual(["poche hatch"]);
    // A material other than the default carries its own scale, so it is not reported.
    expect(
      planToJson(planWith("wall id=h exterior thickness 200 material brick scale 2 { (0,4000) (4000,4000) }")).dropped,
    ).toBeUndefined();
  });

  it("a column after the last piece of furniture has no order to lose", () => {
    const after = "furniture id=b bed at (5500,0) size 1000x2000\n  column id=k at (5000,0) size 300x300";
    expect(planToJson(planWith(after)).dropped).toBeUndefined();
  });

  it("a `place`d element is listed once, under its dotted id", () => {
    const source = `plan "p" {
  units mm
  component bay() { stair id=s at (0,0) size 1000x3000 dir up }
  place bay() as a at (0,0)
  place bay() as b at (2000,0)
}
`;
    expect(planToJson(source).dropped).toEqual([{ clause: "stair", count: 2, ids: ["a.s", "b.s"] }]);
  });
});

describe("a multi-storey plan answers for the export in hand", () => {
  const TWO_STOREYS = `plan "t" {
  units mm
  legend
  level 1 "Ground floor" {
    void id=v at (0,0) size 2000x2000
  }
  level 2 {
    stair id=s at (0,0) size 1000x3000 dir up
  }
}
`;

  it("rows held by a storey name it; a plan-wide row does not", () => {
    expect(planToJson(TWO_STOREYS).dropped).toEqual([
      { clause: "level", count: 1, text: 'level 1 "Ground floor"', level: 1 },
      { clause: "void", count: 1, ids: ["v"], level: 1 },
      { clause: "level", count: 1, text: "level 2", level: 2 },
      { clause: "stair", count: 1, ids: ["s"], level: 2 },
      { clause: "legend", count: 1 },
    ]);
  });

  it("the whole set reports every storey", async () => {
    const r = await renderArtifact(TWO_STOREYS, "json", ARGS, ".", "all");
    expect(clauses(r.dropped)).toEqual(["level", "void", "level", "stair", "legend"]);
    expect(r.notes?.[0]).toContain(
      'leaves out `level 1 "Ground floor"`, `level 2` (the .arch source still holds them)',
    );
  });

  it("--level reports that storey and the plan-wide rows, never another storey's", async () => {
    const r = await renderArtifact(TWO_STOREYS, "json", ARGS, ".", { level: 2 });
    expect(clauses(r.dropped)).toEqual(["level", "stair", "legend"]);
    expect(r.notes?.join("\n")).not.toContain("carries no voids");
  });

  it("and the other storey the other way round", async () => {
    const one = await renderArtifact(TWO_STOREYS, "json", ARGS, ".", { level: 1 });
    expect(clauses(one.dropped)).toEqual(["level", "void", "legend"]);
  });
});

describe("the keep path is the same path, and unchanged", () => {
  const KEEPS = readFileSync("test/keep-corpus/offset-fixed.arch", "utf8");

  it("droppedKeeps and the keep note stand; `dropped` counts the keeps too", async () => {
    const p = planToJson(KEEPS);
    expect(p.droppedKeeps).toBe(10);
    expect(p.dropped?.[0]).toEqual({ clause: "keep", count: 10 });
    const r = await renderArtifact(KEEPS, "json", ARGS, ".", "all");
    expect(r.notes?.[0]).toBe(
      "note: Plan JSON carries no keeps; this export leaves out the plan's 10 keeps (the .arch source still holds them)",
    );
  });
});

describe("counts and order", () => {
  it("reports the keeps first and each other clause after them", async () => {
    const src = readFileSync("test/keep-corpus/offset-fixed.arch", "utf8").replace(/}\s*$/, "  legend\n}\n");
    const r = await renderArtifact(src, "json", ARGS, ".", "all");
    expect(r.notes?.[0]).toMatch(/^note: Plan JSON carries no keeps/);
    expect(r.notes?.some((n) => n.includes("legend"))).toBe(true);
  });

  it("counts every `axes` block and every styled kind", () => {
    const lines = [
      "axes { x at 0, 4000 y at 0 }",
      'style wall { stroke: "#111111" }',
      'style room { fill: "#222222" }',
    ];
    const p = planToJson(planWith(lines.join("\n  ")));
    expect(p.dropped?.find((d) => d.clause === "style")?.count).toBe(2);
    expect(p.dropped?.find((d) => d.clause === "axes")?.count).toBeGreaterThan(0);
  });
});

describe("the CLI", () => {
  // In a temporary directory: a file under `test/fixtures` would join the corpus sweeps.
  const dir = mkdtempSync(join(tmpdir(), "archlang-366-"));
  const path = join(dir, "plan.arch");
  writeFileSync(path, REPORTED);
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("a green export stays green, with the report on stderr and the bytes on stdout", async () => {
    const r = await compileCli([path, "-f", "json", "-o", "-"]);
    expect(r.exit).toBe(0);
    expect(r.stderr).toContain("note: Plan JSON carries no legends;");
    expect(r.stderr).toContain("note: Plan JSON carries no axes;");
    expect(JSON.parse(r.stdout).version).toBe(1);
    expect(r.stdout).not.toContain("note:");
  });

  it("--quiet silences the notes, and leaves the exit alone", async () => {
    const r = await compileCli([path, "-f", "json", "-o", "-", "--quiet"]);
    expect(r.exit).toBe(0);
    expect(r.stderr).toBe("");
  });

  it("--json carries `dropped` beside the diagnostics, never among them", async () => {
    const r = await compileCli([path, "-f", "json", "--json"]);
    expect(r.exit).toBe(0);
    const env = JSON.parse(r.stdout);
    expect(env.ok).toBe(true);
    expect(env.dropped).toEqual(planToJson(REPORTED).dropped);
    expect(env.diagnostics).toEqual([]);
  });

  it("--json on a multi-storey plan carries it on the envelope too", async () => {
    const r = await compileCli(["examples/two-storey.arch", "-f", "json", "--json"]);
    expect(r.exit).toBe(0);
    const env = JSON.parse(r.stdout);
    expect(env.pages.map((p: { level: number }) => p.level)).toEqual([1, 2]);
    expect(clauses(env.dropped)).toContain("level");
  });

  it("a drawing format reports nothing: `dropped` belongs to Plan JSON", async () => {
    const r = await compileCli([path, "--json"]);
    expect(r.exit).toBe(0);
    expect("dropped" in JSON.parse(r.stdout)).toBe(false);
    expect(r.stderr).toBe("");
  });

  it("a plan that drops nothing has no key, no note and the bytes it always had", async () => {
    const source = readFileSync("examples/studio.arch", "utf8");
    const { json } = planToJson(source, { world: makeNodeWorld("examples") });
    const text = await compileCli(["examples/studio.arch", "-f", "json", "-o", "-"]);
    expect(text.stderr).toBe("");
    expect(text.stdout).toBe(`${JSON.stringify(json, null, 2)}\n`);
    const env = await compileCli(["examples/studio.arch", "-f", "json", "--json"]);
    expect(env.stderr).toBe("");
    expect("dropped" in JSON.parse(env.stdout)).toBe(false);
  });
});

describe("the report over the corpus", () => {
  const world = makeNodeWorld("examples");
  const EXAMPLES = readdirSync("examples").filter((f) => f.endsWith(".arch"));
  const report = (name: string) => planToJson(readFileSync(`examples/${name}`, "utf8"), { world });

  it("the report leaves the document alone: `dropped` is not in it", () => {
    for (const name of EXAMPLES) {
      const r = report(name);
      for (const doc of [r.json, ...(r.pages ?? []).map((p) => p.json)]) expect(doc).not.toHaveProperty("dropped");
    }
  });

  /**
   * The round-trip suite holds which examples come back the same. These two hold the report to
   * it, both ways: it speaks on every example that does not come back the same and on no other.
   * `imports.arch` is the library's gap and not the CLI's: with a file World it projects flat and
   * drops nothing (`cli-plan-json-roundtrip.test.ts`, `CLI_CLOSES`).
   */
  const GAPS = Object.keys(CANNOT_ROUND_TRIP).filter((n) => n !== "imports.arch");

  it("every example that does not come back the same reports something", () => {
    expect(GAPS.filter((name) => report(name).dropped === undefined)).toEqual([]);
  });

  it("every example that does come back the same reports nothing", () => {
    const same = EXAMPLES.filter((n) => !GAPS.includes(n));
    expect(same.length).toBeGreaterThanOrEqual(8);
    expect(same.filter((name) => report(name).dropped !== undefined)).toEqual([]);
  });
});

describe("the list cannot fall behind the language", () => {
  /** The element kinds `resolvedToJson` writes a row or a statement for. */
  const PROJECTED = ["wall", "room", "door", "window", "opening", "furniture", "dim", "column", "walls"];

  it("every element kind is projected or reported", () => {
    const kinds = BUILTIN_DEFS.map((d) => d.kind).sort();
    expect(kinds).toEqual([...PROJECTED, ...UNPROJECTED_KINDS].sort());
  });
});
