import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  diagnosticToJson,
  LINT_CODE_LAYERS,
  lint,
  lintCoverage,
  lintWithCoverage,
  type LintCoverage,
} from "../src/index.js";
import { LINT_RULES } from "../src/lint.js";
import { coverageLine, FAMILY_NOUN, SKIP_WHY } from "../src/lint/coverage.js";

/**
 * The lint coverage report (plan-soundness PS2.13, `src/lint/coverage.ts`).
 *
 * The report is ADDITIVE: it is returned beside `lint()`'s diagnostics by `lintWithCoverage()`
 * and appended after `diagnostics` by `arch lint --json`, so nothing that reads diagnostics can
 * see it. That choice is pinned here, together with the typed seam rules declare skips through.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const EXAMPLES = readdirSync(join(ROOT, "examples"))
  .filter((f) => f.endsWith(".arch"))
  .sort();
const read = (p: string): string => readFileSync(p, "utf8");
const example = (f: string): string => read(join(ROOT, "examples", f));

const family = (c: LintCoverage | null, f: string) => c?.families.find((x) => x.family === f);

const PLAN = (body: string): string => `plan "t" {
  units mm
  grid 50
${body}
}`;
const SHELL = `  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  wall id=w_mid partition thickness 100 { (4000,0) (4000,4000) }
  door id=d_entry at (2000,4000) width 900 wall shell
  door id=d_mid at (4000,2000) width 800 wall w_mid
  window at (2000,0) width 1200 wall shell
  window at (6000,2000) width 1000 wall shell`;

describe("lint coverage: beside lint(), never inside it", () => {
  // `lint()` is `lintWithCoverage().diagnostics`, so comparing the two here would prove
  // nothing. That its output did not move is pinned by the byte-identity digest tables
  // (`test/byte-identity-baseline.ts`), which hash `lint()` over the whole corpus.
  it("is null, with no diagnostics, on a plan that does not resolve", () => {
    // `layers` is the static code → layer map (ADR 0032), returned whether or not the plan resolves.
    expect(lintWithCoverage(`plan "x" { room id=a at (0,0) size 1x }`)).toEqual({
      diagnostics: [],
      coverage: null,
      layers: LINT_CODE_LAYERS,
    });
    expect(lintCoverage(`plan "x" { room id=a at (0,0) size 1x }`)).toBeNull();
  });
});

describe("lint coverage: the seam", () => {
  it("every rule declares a family, and every family has a rule and words", () => {
    const used = new Set(LINT_RULES.map((r) => r.family));
    expect([...used].sort()).toEqual(Object.keys(FAMILY_NOUN).sort());
  });

  it("lists every family once, in the order its first rule runs", () => {
    const c = lintCoverage(example("two-bed.arch"))!;
    expect(c.families.map((f) => f.family)).toEqual([...new Set(LINT_RULES.map((r) => r.family))]);
  });

  it("gives every reason its words", () => {
    for (const [reason, why] of Object.entries(SKIP_WHY)) expect(why.length, reason).toBeGreaterThan(0);
  });

  it("is deterministic", () => {
    for (const f of EXAMPLES) expect(lintCoverage(example(f)), f).toEqual(lintCoverage(example(f)));
  });
});

describe("lint coverage: the skips rules declare", () => {
  it("no site: orientation is skipped; with a site it ran", () => {
    const rooms = `  room id=r_liv at (0,0) size 4000x4000 label "Living" uses living
  room id=r_bed at (4000,0) size 2000x4000 label "Bedroom" uses bedroom`;
    const off = lintCoverage(PLAN(`${SHELL}\n${rooms}`))!;
    expect(family(off, "orientation")).toEqual({
      family: "orientation",
      status: "skipped",
      skipped: [{ reason: "no-site", why: SKIP_WHY["no-site"] }],
    });
    const on = lintCoverage(PLAN(`  site { street south hemisphere north }\n${SHELL}\n${rooms}`))!;
    expect(family(on, "orientation")).toEqual({ family: "orientation", status: "ran" });
    expect(on.unclassifiedRooms).toEqual([]);
    expect(coverageLine(on)).toBeNull();
  });

  it("a room with no classified use: named by its label, its id only in the machine field", () => {
    const src = PLAN(`${SHELL}
  room id=r_snug at (0,0) size 4000x4000 label "Atelier"
  room id=r_bed at (4000,0) size 2000x4000 label "Bedroom" uses bedroom`);
    const c = lintCoverage(src)!;
    expect(c.unclassifiedRooms).toEqual([{ name: "Atelier", id: "r_snug" }]);
    for (const f of ["rooms", "privacy", "daylight", "contents"]) {
      expect(family(c, f), f).toEqual({
        family: f,
        status: "partial",
        skipped: [{ reason: "no-uses", why: SKIP_WHY["no-uses"], rooms: ["Atelier"], roomIds: ["r_snug"] }],
      });
    }
    const line = coverageLine(c)!;
    expect(line).toContain('"Atelier"');
    expect(line).not.toContain("r_snug");
  });

  it("an arc window the analysis gives to no room: daylight skips that room (PS2.8, PS0.12)", () => {
    // A bay closed off by a wall on its chord: the shape attributes its window to no room.
    const bay = (chordWall: boolean) => `plan "Bay" {
  units mm
  grid 50
  wall id=shell exterior thickness 200 { (0,0) (4800,0) (4800,6000) (4000,6000) arc (1400,6000) radius 2000 cw (0,6000) close }
${chordWall ? "  wall id=w_chord partition thickness 100 { (1400,6000) (4000,6000) }\n" : ""}  room id=r_living at (0,0) size 4800x6000 label "Living" uses living
  door id=d_garden at (700,6000) width 900 wall shell swing out
  window id=win_bay on shell at 13000 width 1200
}`;
    const skip = family(lintCoverage(bay(true)), "daylight")!.skipped!.find(
      (s) => s.reason === "arc-window-unattributed",
    );
    expect(skip).toEqual({
      reason: "arc-window-unattributed",
      why: SKIP_WHY["arc-window-unattributed"],
      rooms: ["Living"],
      roomIds: ["r_living"],
    });
    // Where the shape does attribute the window (the bay opens into the room through its chord),
    // nothing is skipped: hillside-villa's living-room bay is one.
    for (const src of [bay(false), example("hillside-villa.arch")])
      expect(JSON.stringify(family(lintCoverage(src), "daylight"))).not.toContain("arc-window-unattributed");
  });

  it("a stair on a one-storey plan: storey matching is skipped", () => {
    const src = PLAN(`${SHELL}
  room id=r_liv at (0,0) size 4000x4000 label "Living" uses living
  room id=r_bed at (4000,0) size 2000x4000 label "Bedroom" uses bedroom
  stair id=st at (500,500) size 900x2400 dir up`);
    expect(family(lintCoverage(src), "vertical")).toEqual({
      family: "vertical",
      status: "skipped",
      skipped: [{ reason: "single-storey", why: SKIP_WHY["single-storey"] }],
    });
    // Without a run, there is nothing to match: not a skip.
    expect(family(lintCoverage(example("two-bed.arch")), "vertical")!.status).toBe("ran");
  });

  it("no way in: the walk and reachability skip, while W_NO_ENTRANCE still runs (partial)", () => {
    const src = PLAN(`  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  wall id=w_mid partition thickness 100 { (4000,0) (4000,4000) }
  door id=d_mid at (4000,2000) width 800 wall w_mid
  room id=r_liv at (0,0) size 4000x4000 label "Living" uses living
  room id=r_bed at (4000,0) size 2000x4000 label "Bedroom" uses bedroom
  window at (2000,0) width 1200 wall shell
  window at (6000,2000) width 1000 wall shell`);
    expect(lint(src).map((d) => d.code)).toContain("W_NO_ENTRANCE");
    const c = lintCoverage(src)!;
    const noWay = [{ reason: "no-entrance", why: SKIP_WHY["no-entrance"] }];
    expect(family(c, "reachability")).toEqual({ family: "reachability", status: "partial", skipped: noWay });
    expect(family(c, "circulation")).toEqual({ family: "circulation", status: "partial", skipped: noWay });
  });

  it("a polygon garage: the garage width check declines it", () => {
    const src = PLAN(`  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,6000) (0,6000) close }
  room id=r_gar polygon (0,0) (6000,0) (6000,6000) (3000,6000) (3000,3000) (0,3000) label "Garage" uses garage
  room id=r_hall polygon (0,3000) (3000,3000) (3000,6000) (0,6000) label "Hall" uses hall
  door id=d_entry at (1500,6000) width 900 wall shell`);
    const skip = family(lintCoverage(src), "rooms")!.skipped!;
    expect(skip).toEqual([
      { reason: "non-rectangular-room", why: SKIP_WHY["non-rectangular-room"], rooms: ["Garage"], roomIds: ["r_gar"] },
    ]);
  });

  it("a plan-level skip on every storey is one entry; a family is skipped only when all its rules are", () => {
    const c = lintCoverage(example("townhouse.arch"))!;
    expect(family(c, "orientation")).toEqual({
      family: "orientation",
      status: "skipped",
      skipped: [{ reason: "no-site", why: SKIP_WHY["no-site"] }],
    });
  });
});

describe("lint coverage: review round 1 (the reviewer's repro shapes)", () => {
  it("W_BATH_VIA_BEDROOM's rule declares a room it cannot classify", () => {
    const plan = (label: string) =>
      PLAN(`  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  wall id=w_mid partition thickness 100 { (3000,0) (3000,4000) }
  room id=r_a at (0,0) size 3000x4000 label "${label}"
  room id=r_b at (3000,0) size 3000x4000 label "Bathroom" uses bath
  door id=d_front at (1500,4000) width 900 wall shell
  door id=d_ab at (3000,2000) width 800 wall w_mid
  window at (1500,0) width 1200 wall shell
  furniture double_bed at (200,200) size 1800x2000`);
    const skip = family(lintCoverage(plan("Room A")), "reachability");
    expect(skip).toEqual({
      family: "reachability",
      status: "partial",
      skipped: [{ reason: "no-uses", why: SKIP_WHY["no-uses"], rooms: ["Room A"], roomIds: ["r_a"] }],
    });
    // Classified, nothing is declared.
    expect(family(lintCoverage(plan("Bedroom")), "reachability")!.status).toBe("ran");
  });

  it("W_FIXTURE_BACK_TO_ROOM declares the polygon room it declines", () => {
    const src = PLAN(`  wall id=shell exterior thickness 200 { (0,0) (3000,0) (3000,3000) (0,3000) close }
  room id=r_bath polygon (0,0) (3000,0) (3000,3000) (0,3000) label "Bathroom" uses bath
  door id=d at (1500,3000) width 800 wall shell
  furniture wc at (1200,0) size 400x700 rotate 180`);
    expect(family(lintCoverage(src), "furniture")).toEqual({
      family: "furniture",
      status: "partial",
      skipped: [
        {
          reason: "non-rectangular-room",
          why: SKIP_WHY["non-rectangular-room"],
          rooms: ["Bathroom"],
          roomIds: ["r_bath"],
        },
      ],
    });
  });

  it("a storey whose only door out is a balcony door is not called 'no entrance'", () => {
    const src = read(join(ROOT, "test/defect-corpus/clearances/masked-route-balcony-door.arch")).replace(
      /^ {2}door id=d_front .*\n/m,
      "",
    );
    const privacy = family(lintCoverage(src), "privacy")!;
    expect(privacy.skipped).toContainEqual({
      reason: "balcony-only-entrance",
      why: "the only way in is a balcony or terrace door",
    });
    expect(privacy.skipped!.map((s) => s.reason)).not.toContain("no-entrance");
  });

  it("no-site is declared only when the orientation rule had a habitable room with a window to judge", () => {
    const fragment = `plan "Fragment" { units mm wall id=w exterior thickness 200 { (0,0) (3000,0) } }`;
    expect(coverageLine(lintCoverage(fragment)!)).toBeNull();
    for (const f of ["lib/doors.arch", "lib/fixtures.arch", "lib/furniture.arch"])
      expect(coverageLine(lintCoverage(example(f))!), f).toBeNull();
    expect(family(lintCoverage(example("two-bed.arch")), "orientation")!.skipped).toEqual([
      { reason: "no-site", why: SKIP_WHY["no-site"] },
    ]);
  });

  it("a door on an angled wall: the doorway-landing check declares it", () => {
    const src = PLAN(`  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,3000) (3000,6000) (0,6000) close }
  room id=r polygon (0,0) (6000,0) (6000,3000) (3000,6000) (0,6000) label "Cafe" uses dining
  door id=d on shell at 11100 width 900
  window on shell at 3000 width 1500`);
    expect(family(lintCoverage(src), "doors")!.skipped).toEqual([
      { reason: "unsupported-host-geometry", why: "the door's wall is angled or curved" },
    ]);
  });

  it("the human line counts what it names: same-label rooms on two storeys are named per storey", () => {
    const storey = (n: number) => `  level ${n} {
    wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
    wall id=w_mid partition thickness 100 { (3000,0) (3000,4000) }
    room id=r_store at (0,0) size 3000x4000 label "Box"
    room id=r_bed at (3000,0) size 3000x4000 label "Bedroom" uses bedroom
    door id=d_in at (4500,4000) width 900 wall shell
    door id=d_mid at (3000,2000) width 800 wall w_mid
    window at (4500,0) width 1200 wall shell
  }`;
    const c = lintCoverage(PLAN(`${storey(1)}\n${storey(2)}`))!;
    expect(c.unclassifiedRooms.map((r) => [r.name, r.level])).toEqual([
      ["Box", 1],
      ["Box", 2],
    ]);
    expect(coverageLine(c)).toContain('2 rooms with no classified use ("Box" on level 1 and "Box" on level 2)');
  });
});

describe("lint coverage: the CLI appends it", () => {
  const cli = (args: string[]) =>
    spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], { cwd: ROOT, encoding: "utf8" });

  it("--json: `coverage` is the last key, and every key before it is the report without it", () => {
    const r = cli(["lint", "examples/hillside-villa.arch", "--json"]);
    expect(r.status).toBe(0);
    const o = JSON.parse(r.stdout) as Record<string, unknown>;
    expect(Object.keys(o)).toEqual(["summary", "ok", "strict", "diagnostics", "coverage"]);
    const src = example("hillside-villa.arch");
    expect(o.diagnostics).toEqual(lint(src).map((d) => diagnosticToJson(src, d)));
    expect(o.coverage).toEqual(lintCoverage(src));
    // The bytes before the appended key are the bytes the report had without it.
    const { coverage: _c, ...rest } = o;
    expect(r.stdout.startsWith(JSON.stringify(rest, null, 2).slice(0, -2))).toBe(true);
  });

  it("--json with a display filter: coverage still follows the filter fields", () => {
    const r = cli(["lint", "examples/hillside-villa.arch", "--json", "--code", "W_PATH_TOO_NARROW"]);
    expect(Object.keys(JSON.parse(r.stdout))).toEqual([
      "summary",
      "ok",
      "strict",
      "filtered",
      "total_diagnostics",
      "diagnostics",
      "coverage",
    ]);
  });

  it("human: exactly one stderr line when something was skipped, none when nothing was, stdout unchanged", () => {
    const skipped = cli(["lint", "examples/two-bed.arch"]);
    expect(skipped.stderr.split("\n").filter((l) => l.includes("lint coverage:"))).toEqual([
      "  lint coverage: skipped orientation (the plan declares no site).",
    ]);
    const none = cli(["lint", "examples/bungalow.arch"]);
    expect(coverageLine(lintCoverage(example("bungalow.arch"))!)).toBeNull();
    expect(none.stderr).not.toContain("lint coverage");
    expect(cli(["lint", "examples/two-bed.arch", "--quiet"]).stderr).not.toContain("lint coverage");
  });

  it("validate never prints it", () => {
    const r = cli(["validate", "examples/two-bed.arch", "--json"]);
    expect(Object.keys(JSON.parse(r.stdout))).not.toContain("coverage");
    expect(cli(["validate", "examples/two-bed.arch"]).stderr).not.toContain("lint coverage");
  });
});
