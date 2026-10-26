import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse } from "../src/parser.js";
import {
  AUTHORING_STAGES,
  type AuthoringStage,
  codeStage,
  COMPILE_WARNING_STAGES,
  type ELEMENT_KIND_STAGES,
  ERROR_CATALOG,
  INTENT_CODE_STAGES,
  keepStage,
  LINT_CODE_LAYERS,
  LINT_CODE_STAGES,
  stageAtMost,
} from "../src/index.js";
import { LINT_RULES } from "../src/lint.js";
import type { KeepNode } from "../src/ast.js";
import { cmdValidate } from "../src/cli/commands-analyze.js";
import { parseArgs } from "../src/cli/io.js";
import { runValidate, withoutStageKeys } from "./validate-json-run.js";

/**
 * Stages as a first-class idea (plan-soundness PS7.1): the ladder, every rule's stage, and
 * `validate --stage`.
 *
 * - **The ladder and the table.** The six stages are pinned in order; every lint rule declares a
 *   stage (a required field, so a rule cannot be added without one; this file pins each code's), a
 *   rule with one map names exactly its codes, the drafting layer is exactly the drafting stage, and
 *   every catalogued compile-channel warning has a stage.
 * - **The default is unchanged.** Without `--stage`, `validate --json` gains one `stage` key, last,
 *   on each diagnostic and intent violation; removing it gives the old bytes (the digest laws K1 and
 *   K3 measure exactly that view, `validateDigestView`).
 * - **The view.** At every stage, over every example, `--stage <s>` shows exactly the errors and the
 *   warnings of stage ≤ s, `held_back` counts the rest, and `ok`/`--strict`/`next` read the shown
 *   set; taste is a `next` tier only at `drafting`; intent violations and a `--graph` mismatch are
 *   held back by their own stage.
 */

/**
 * Each lint code's stage, as decided in `docs/plans/plan-soundness/research/2026-10-26-ps71-as-built.md`.
 * A new rule adds its codes here: the row is the decision, reviewed with the rule.
 */
const DECIDED: Record<AuthoringStage, string[]> = {
  brief: [],
  rooms: ["W_ALIAS_MATCH", "W_GARAGE_TOO_NARROW", "W_OUTDOOR_OVERLAPS_ROOM", "W_ROOM_TOO_SMALL", "W_STAIR_UNMATCHED"],
  walls: ["W_BOUNDARY_NO_WALL", "W_ROOM_NOT_ENCLOSED", "W_ROOM_OUTSIDE_SHELL", "W_ROOM_TOO_NARROW"],
  openings: [
    "W_BALCONY_NO_DOOR",
    "W_BATH_VIA_BEDROOM",
    "W_BEDROOM_NO_WINDOW",
    "W_CIRCUITOUS_PATH",
    "W_CONNECTOR_AMBIGUOUS",
    "W_DOOR_CLEARANCE",
    "W_DOOR_NEAR_CORNER",
    "W_ENTRANCE_INTO_PRIVATE",
    "W_FLOOR_UNASSIGNED",
    "W_HABITABLE_NO_WINDOW",
    "W_LEAF_ACROSS_DOORWAY",
    "W_NO_ENTRANCE",
    "W_OPENING_AT_JUNCTION",
    "W_OPENING_OVERLAP",
    "W_PATH_TOO_NARROW",
    "W_POCKET_RUN",
    "W_ROOM_DISCONNECTED",
    "W_ROOM_NOT_EQUATOR_FACING",
    "W_ROOM_UNREACHABLE",
    "W_ROOM_VIA_PRIVATE",
    "W_SWING_OBSTRUCTED",
    "W_WET_ROOM_DOOR",
  ],
  fixtures: [
    "W_DOORWAY_BLOCKED",
    "W_FIXTURE_BACK_TO_ROOM",
    "W_FIXTURE_FLOATING",
    "W_FIXTURE_WRONG_ROOM",
    "W_FOOTPRINT_TRANSPOSED",
    "W_FURNITURE_OVERLAP",
    "W_FURNITURE_OVER_WINDOW",
    "W_FURNITURE_WALL_COLLISION",
    "W_FURN_CLEARANCE",
    "W_FURN_CLEAR_FRONT",
    "W_FURN_CLEAR_SIDES",
    "W_ROOM_MISSING_DEFINING",
    "W_ROOM_NO_CLEAR_PATH",
    "W_ROOM_NO_FIXTURE",
    "W_SEAT_FACING_AWAY",
    "W_WC_SIDE_CLEARANCE",
  ],
  drafting: [
    "W_ANNOTATION_OVERLAP",
    "W_DIM_INSIDE",
    "W_DIM_OVERLAP",
    "W_DIM_TEXT_MISMATCH",
    "W_OPENING_NOT_DIMENSIONED",
    "W_TITLE_OVERFLOW",
  ],
};

describe("the stage ladder and the per-rule table", () => {
  it("the ladder is brief → rooms → walls → openings → fixtures → drafting", () => {
    expect([...AUTHORING_STAGES]).toEqual(["brief", "rooms", "walls", "openings", "fixtures", "drafting"]);
    expect(stageAtMost("rooms", "walls")).toBe(true);
    expect(stageAtMost("walls", "rooms")).toBe(false);
    expect(stageAtMost("drafting", "drafting")).toBe(true);
  });

  it("every rule declares a stage; a per-code map names exactly the rule's codes", () => {
    for (const r of LINT_RULES) {
      expect(r.stage, r.name).toBeDefined();
      if (typeof r.stage === "string") expect(AUTHORING_STAGES, r.name).toContain(r.stage);
      else {
        expect(Object.keys(r.stage).sort(), r.name).toEqual([...r.codes].sort());
        for (const s of Object.values(r.stage)) expect(AUTHORING_STAGES, r.name).toContain(s);
      }
    }
  });

  it("each lint code has exactly one stage, the one decided for it (a new code adds its row above)", () => {
    expect(Object.keys(LINT_CODE_STAGES).sort()).toEqual(Object.keys(LINT_CODE_LAYERS).sort());
    const decided = new Map<string, AuthoringStage>();
    for (const [s, codes] of Object.entries(DECIDED) as Array<[AuthoringStage, string[]]>)
      for (const c of codes) {
        expect(decided.has(c), `${c} decided twice`).toBe(false);
        decided.set(c, s);
      }
    expect(Object.fromEntries([...decided].sort())).toEqual(
      Object.fromEntries(Object.entries(LINT_CODE_STAGES).sort(([a], [b]) => (a < b ? -1 : 1))),
    );
  });

  it("the per-stage counts are the as-built note's table", () => {
    const counts = Object.fromEntries(AUTHORING_STAGES.map((s) => [s, 0]));
    for (const s of Object.values(LINT_CODE_STAGES)) counts[s]!++;
    expect(counts).toEqual({ brief: 0, rooms: 5, walls: 4, openings: 22, fixtures: 16, drafting: 6 });
  });

  it("the drafting layer is exactly the drafting stage, and no lint code is a brief finding", () => {
    for (const [c, layer] of Object.entries(LINT_CODE_LAYERS)) {
      expect(LINT_CODE_STAGES[c] === "drafting", c).toBe(layer === "drafting");
      expect(LINT_CODE_STAGES[c], c).not.toBe("brief");
    }
  });

  it("every catalogued compile-channel warning has a stage, and only those are listed", () => {
    const compileWarnings = Object.keys(ERROR_CATALOG).filter(
      (c) => c.startsWith("W_") && LINT_CODE_LAYERS[c] === undefined,
    );
    expect(compileWarnings.length).toBeGreaterThan(15);
    expect(Object.keys(COMPILE_WARNING_STAGES).sort()).toEqual(compileWarnings.sort());
  });

  it("each compile-channel warning's stage is the one decided for it", () => {
    expect({ ...COMPILE_WARNING_STAGES }).toEqual({
      W_EMPTY_PLAN: "brief",
      W_IMPORT_EMPTY_FILE: "brief",
      W_WHILE_DEPRECATED: "brief",
      W_REASSIGN_DEPRECATED: "brief",
      W_KEEP_VIOLATED: "brief",
      W_ROOM_OVERLAP: "rooms",
      W_DOOR_OFF_WALL: "openings",
      W_WINDOW_OFF_WALL: "openings",
      W_OPENING_OFF_WALL: "openings",
      W_SWING_ROOM_NOT_ADJACENT: "openings",
      W_CJK_FONT_MISSING: "drafting",
      W_GLYPH_UNSUPPORTED: "drafting",
      W_DUP_ACC_METADATA: "drafting",
      W_HATCH_SCALE: "drafting",
      W_SANITIZED_CONFIG: "drafting",
      W_UNKNOWN_MATERIAL: "drafting",
      W_UNKNOWN_STYLE_KEY: "drafting",
      W_UNKNOWN_THEME_KEY: "drafting",
      W_ROOM_LABEL_OUTSIDE: "drafting",
      W_DIM_NO_WALL: "drafting",
      W_SCALE_OVERFLOW: "drafting",
      W_DRAWING_OVERFLOW: "drafting",
    });
  });

  it("every intent code has a stage, the earliest its predicate can be judged at", () => {
    const intentCodes = Object.keys(ERROR_CATALOG).filter((c) => c.startsWith("E_INTENT_"));
    expect(Object.keys(INTENT_CODE_STAGES).sort()).toEqual(intentCodes.sort());
    expect(codeStage("E_INTENT_ROOM_DIMENSION")).toBe("rooms");
    expect(codeStage("E_INTENT_GROSS_AREA")).toBe("walls");
    expect(codeStage("E_INTENT_NOT_ADJACENT")).toBe("openings");
  });

  it("errors map by family; an uncoded or unknown diagnostic is brief", () => {
    expect(codeStage("E_PARSE")).toBe("brief");
    expect(codeStage("E_ROOMS_NOT_TILING")).toBe("rooms");
    expect(codeStage("E_WALL_THICKNESS")).toBe("walls");
    expect(codeStage("E_OPENING_NIB")).toBe("openings");
    expect(codeStage("E_FURN_SIZE")).toBe("fixtures");
    expect(codeStage("E_DIM_CURVE_REF")).toBe("drafting");
    expect(codeStage(undefined)).toBe("brief");
    expect(codeStage("E_NOT_A_CODE")).toBe("brief");
    for (const c of Object.keys(ERROR_CATALOG)) expect(AUTHORING_STAGES, c).toContain(codeStage(c));
  });
});

describe("a keep's stage is the stage of its measure", () => {
  const keepsOf = (src: string): KeepNode[] => {
    const out: KeepNode[] = [];
    const walk = (n: unknown): void => {
      if (Array.isArray(n)) for (const x of n) walk(x);
      else if (n && typeof n === "object") {
        if ((n as { kind?: string }).kind === "keep") out.push(n as KeepNode);
        else for (const v of Object.values(n)) walk(v);
      }
    };
    walk(parse(src));
    return out;
  };
  it("room datums are rooms; a wall makes it walls; min clear is walls; a stacked room is rooms", () => {
    const kinds: Record<string, keyof typeof ELEMENT_KIND_STAGES> = { p: "wall", a: "room", b: "room", d: "door" };
    const kindOf = (id: string) => kinds[id];
    const src = `plan "k" {
  units mm
  level 1 {
    room id=a at (0,0) size 4000x5000
    room id=b right-of a size 4000x5000
    keep align a.right b.left
    keep align a.right b.left p
    keep min clear b 3800 soft
    keep offset d from a.left 500
  }
  level 2 { room id=b at (0,0) size 4000x5000 }
  keep stacked b on levels 1 2 advisory
}`;
    expect(keepsOf(src).map((k) => keepStage(k, kindOf))).toEqual(["rooms", "walls", "walls", "openings", "rooms"]);
  });
});

/** The examples, sorted. */
const EXAMPLES = readdirSync("examples")
  .filter((f) => f.endsWith(".arch"))
  .sort()
  .map((f) => `examples/${f}`);

interface Out {
  summary: string;
  ok: boolean;
  diagnostics: Array<{ code?: string; severity: string; stage: AuthoringStage }>;
  at_stage?: { stage: AuthoringStage; held_back: number; clean: boolean };
  next: { tier: string; code: string | null } | null;
  intent?: { ok: boolean; violations: Array<{ code: string; stage: AuthoringStage }> };
  graph?: unknown;
}
const run = (argv: string[]): { exit: number; out: Out; stdout: string } => {
  const r = runValidate(argv);
  return { exit: r.exit, out: JSON.parse(r.stdout) as Out, stdout: r.stdout };
};

describe("validate --json without --stage: one stage key per diagnostic, last", () => {
  it("over every example, the key is the last of each diagnostic and the code's stage; removing it is lossless", () => {
    for (const f of EXAMPLES) {
      const { stdout, out } = run([f, "--json"]);
      for (const d of out.diagnostics) {
        expect(Object.keys(d).at(-1), f).toBe("stage");
        if (d.code !== "W_KEEP_VIOLATED") expect(d.stage, `${f} ${d.code}`).toBe(codeStage(d.code));
      }
      const stripped = JSON.parse(withoutStageKeys(stdout)) as Out;
      expect(stripped.diagnostics.length).toBe(out.diagnostics.length);
      for (const d of stripped.diagnostics) expect(Object.keys(d), f).not.toContain("stage");
      expect(Object.keys(out), f).not.toContain("at_stage");
    }
  }, 300_000);
});

describe("validate --stage <s> over every example, at every stage", () => {
  const counts: string[] = [];
  afterAll(() => {
    // The per-example table the as-built note quotes (`--stage rooms`: shown / held back).
    if (process.env.PS71_COUNTS) console.log(counts.join("\n"));
  });
  it("shows exactly the errors and the warnings of stage ≤ s, and held_back counts the rest", () => {
    for (const f of EXAMPLES) {
      const all = run([f, "--json"]).out.diagnostics;
      const row: string[] = [];
      for (const s of AUTHORING_STAGES) {
        const { out } = run([f, "--json", "--stage", s]);
        const want = all.filter((d) => d.severity === "error" || stageAtMost(d.stage, s));
        expect(out.diagnostics, `${f} --stage ${s}`).toEqual(want);
        expect(out.at_stage?.stage).toBe(s);
        expect(out.at_stage?.held_back, `${f} --stage ${s}`).toBe(all.length - want.length);
        expect(out.summary.startsWith(`stage ${s}: `), out.summary).toBe(true);
        if (out.next !== null && out.next.code !== null) expect(stageAtMost(codeStage(out.next.code), s)).toBe(true);
        expect(out.at_stage?.clean).toBe(out.next === null);
        row.push(`${s} ${want.length}/${all.length - want.length}`);
      }
      // At drafting, nothing is held back: the view is the whole report.
      expect(row.at(-1)).toBe(`drafting ${all.length}/0`);
      counts.push(`${f}: ${row.join(", ")}`);
    }
  }, 600_000);
});

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "arch-stage-"));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const file = (name: string, text: string): string => {
  const p = join(dir, name);
  writeFileSync(p, text);
  return p;
};

// Rooms only: a WC under its 1.1 m² floor (a rooms finding), and no walls, doors or windows.
const ROOMS_ONLY = `plan "Flat" {
  units mm
  room id=living at (0,0) size 5000x4000 label "Living" uses living
  room id=bed right-of living size 3000x4000 label "Bedroom" uses bedroom
  room id=wc below bed size 1000x900 label "WC" uses wc
}
`;
// The same rooms, the WC grown to 1.2 m²: clean at rooms, not at walls.
const ROOMS_CLEAN = ROOMS_ONLY.replace("size 1000x900", "size 1000x1200");

describe("--strict and ok read the shown set only", () => {
  it("a rooms-stage warning fails --strict --stage rooms; later-stage ones do not", () => {
    const bad = file("rooms-bad.arch", ROOMS_ONLY);
    const clean = file("rooms-clean.arch", ROOMS_CLEAN);
    expect(run([bad, "--json", "--strict", "--stage", "rooms"]).exit).toBe(2);
    const r = run([clean, "--json", "--strict", "--stage", "rooms"]);
    expect(r.exit).toBe(0);
    expect(r.out.ok).toBe(true);
    expect(r.out.diagnostics).toEqual([]);
    expect(r.out.at_stage).toEqual({ stage: "rooms", held_back: r.out.at_stage!.held_back, clean: true });
    expect(r.out.at_stage!.held_back).toBeGreaterThan(0);
    expect(r.out.summary).toMatch(/^stage rooms: no warnings \(\d+ later-stage findings? held back\)$/);
    // Without --stage the same plan fails --strict: the default gate is unchanged.
    expect(run([clean, "--json", "--strict"]).exit).toBe(2);
    expect(run([clean, "--json", "--strict", "--stage", "walls"]).exit).toBe(2);
  });

  it("errors are never held back, even a later stage's (a fixtures error at --stage rooms)", () => {
    const broken = file(
      "broken.arch",
      `plan "x" {\n  units mm\n  room id=living at (0,0) size 5000x4000 label "Living" uses living\n  furniture id=f wc in living anchor top-left\n}\n`,
    );
    for (const s of ["brief", "rooms"] as const) {
      const r = run([broken, "--json", "--stage", s]);
      expect(r.exit, s).toBe(2);
      expect(r.out.ok, s).toBe(false);
      expect(
        r.out.diagnostics.filter((d) => d.severity === "error").map((d) => [d.code, d.stage]),
        s,
      ).toEqual([["E_FURN_SIZE", "fixtures"]]);
      expect(r.out.next?.tier, s).toBe("error");
      expect(r.out.at_stage?.clean, s).toBe(false);
    }
  });

  it("an unknown stage, or --stage with no value, is bad usage (exit 3)", () => {
    const clean = file("u.arch", ROOMS_CLEAN);
    expect(runValidate([clean, "--json", "--stage", "room"]).exit).toBe(3);
    expect(runValidate([clean, "--stage"]).exit).toBe(3);
    expect(runValidate([clean, "--json", "--stage"]).exit).toBe(3);
  });
});

describe("intent, --graph and taste under --stage", () => {
  it("a window assertion is an openings finding: held back at rooms, shown at openings", () => {
    const plan = file("i.arch", ROOMS_CLEAN);
    const brief = file("brief.json", JSON.stringify({ roomsInclude: [{ concept: "bedroom", windows: { min: 1 } }] }));
    const atRooms = run([plan, "--json", "--intent", brief, "--stage", "rooms"]);
    expect(atRooms.out.intent?.violations).toEqual([]);
    expect(atRooms.out.intent?.ok).toBe(true);
    expect(atRooms.exit).toBe(0);
    const atOpenings = run([plan, "--json", "--intent", brief, "--stage", "openings"]);
    expect(atOpenings.out.intent?.violations.map((v) => [v.code, v.stage])).toEqual([
      ["E_INTENT_NO_WINDOW", "openings"],
    ]);
    expect(atOpenings.exit).toBe(2);
    // Without --stage every violation carries its stage, and nothing else changed.
    const plain = run([plan, "--json", "--intent", brief]);
    expect(plain.out.intent?.violations.map((v) => v.stage)).toEqual(["openings"]);
  });

  it("a --graph mismatch reads the door graph: no graph block before openings", () => {
    const plan = file("g.arch", ROOMS_CLEAN);
    const graph = file("g.json", JSON.stringify({ living: ["bed"] }));
    const atRooms = run([plan, "--json", "--graph", graph, "--stage", "rooms"]);
    expect(Object.keys(atRooms.out)).not.toContain("graph");
    expect(atRooms.exit).toBe(0);
    expect(run([plan, "--json", "--graph", graph, "--stage", "openings"]).exit).toBe(2);
  });

  it("taste is a next tier only at drafting (bungalow: taste is plain --taste's next)", () => {
    const plan = "examples/bungalow.arch";
    const plain = run([plan, "--json", "--taste", "generic"]).out;
    expect(plain.next?.tier).toBe("taste");
    const draft = run([plan, "--json", "--taste", "generic", "--stage", "drafting"]).out;
    expect(draft.next).toEqual(plain.next);
    // Taste never gates: the stage is clean even though taste has an item.
    expect(draft.at_stage?.clean).toBe(true);
    for (const s of AUTHORING_STAGES.slice(0, -1)) {
      const out = run([plan, "--json", "--taste", "generic", "--stage", s]).out;
      expect(out.next, s).toBeNull();
      expect(out.at_stage?.clean, s).toBe(true);
    }
  });

  it("the intent block's measures and violations follow the stage; at_stage carries the staged counts", () => {
    const plan = file("m.arch", ROOMS_CLEAN);
    const brief = file(
      "m.json",
      JSON.stringify({
        grossInternalAreaM2: { min: 10, max: 20, source: "brief" },
        roomDimensions: [{ room: "living", widthMm: { min: 6000, source: "brief" } }],
      }),
    );
    type M = Out & {
      intent: Out["intent"] & { satisfied: number; total: number; measures: Array<{ path: string }> };
      at_stage: NonNullable<Out["at_stage"]> & { intent?: { satisfied: number; total: number } };
    };
    const at = (s: string): M => run([plan, "--json", "--intent", brief, "--stage", s]).out as M;
    const rooms = at("rooms");
    expect(rooms.intent.measures.map((m) => m.path)).toEqual(["/roomDimensions/0/widthMm"]);
    expect(rooms.intent.violations.map((v) => v.stage)).toEqual(["rooms"]);
    expect(rooms.at_stage.intent).toEqual({ satisfied: 0, total: 1 });
    // The whole brief's meter is unchanged in the intent block itself.
    const plain = run([plan, "--json", "--intent", brief]).out as M;
    expect([rooms.intent.satisfied, rooms.intent.total]).toEqual([plain.intent.satisfied, plain.intent.total]);
    const walls = at("walls");
    expect(walls.intent.measures.map((m) => m.path)).toEqual(["/grossInternalAreaM2", "/roomDimensions/0/widthMm"]);
    expect(walls.at_stage.intent).toEqual({ satisfied: 0, total: 2 });
    expect(Object.keys(plain)).not.toContain("at_stage");
  });

  it("the text report always says the stage, with --intent or --graph too", () => {
    const plan = file("t.arch", ROOMS_CLEAN);
    const graph = file("t.json", JSON.stringify({ living: ["bed"] }));
    let err = "";
    const writeErr = process.stderr.write.bind(process.stderr);
    const write = process.stdout.write.bind(process.stdout);
    process.stderr.write = ((c: string | Uint8Array): boolean => {
      err += typeof c === "string" ? c : Buffer.from(c).toString("utf8");
      return true;
    }) as typeof process.stderr.write;
    process.stdout.write = (() => true) as typeof process.stdout.write;
    try {
      cmdValidate(parseArgs([plan, "--graph", graph, "--stage", "rooms"]));
    } finally {
      process.stderr.write = writeErr;
      process.stdout.write = write;
    }
    expect(err.split("\n")[0]).toMatch(/^stage rooms: no warnings \(\d+ later-stage findings? held back\)$/);
    expect(err).toContain("(stage rooms is clean: advance to --stage walls");
  });
});
