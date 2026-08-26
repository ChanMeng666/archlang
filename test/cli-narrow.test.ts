import { spawnSync } from "node:child_process";
import { describe as suite, expect, it } from "vitest";
import { describe } from "../src/index.js";
import { DESCRIBE_KEYS } from "../src/cli/commands-analyze.js";

/**
 * Bounded output (v1.17) — the narrowing filters.
 *
 * `describe --room/--select` and `lint`/`validate` `--code/--severity` exist so an agent
 * can read one room, or one diagnostic class, without pulling a whole building into its
 * context. The load-bearing property, pinned below, is that they narrow only what is
 * READ: `ok` and the exit code are always computed from the UNFILTERED diagnostic set, so
 * `lint --code W_X` on a plan whose real problem is `E_Y` still fails.
 */

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}

function run(args: string[], input?: string): Run {
  const r = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
    input,
    encoding: "utf8",
    cwd: process.cwd(),
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** Two rooms joined by an interior door, plus an entrance door and a window on `liv`. */
const TWO_ROOM = `plan "T" {
  units mm
  room id=liv at (0,0) size 4000x3000 label "Living"
  room id=bed at (4000,0) size 3000x3000 label "Bedroom"
  door id=d_entry at (0,1500) width 900
  door id=d_mid at (4000,1500) width 800
  window id=w_liv at (2000,0) width 1200
  window id=w_bed at (5500,0) width 1200
  furniture sofa at (500,500) size 1800x800 in liv
  furniture wardrobe at (4500,500) size 1400x600 in bed
}`;

/**
 * Compiles clean; lints with TWO warnings and no error — a doorless bedroom is both
 * `W_ROOM_DISCONNECTED` and `W_BEDROOM_NO_WINDOW`. Two distinct codes is the point: it
 * lets a `--code` filter be a strict subset, which is what the subset assertions check.
 */
const WARNS = 'plan "W" { units mm room at (0,0) size 4000x3000 label "Bedroom" }';
/** One of WARNS' two codes — the one the filters below keep. */
const WARN_CODE = "W_ROOM_DISCONNECTED";

/** A hard ERROR (zero-size room) — the gating fixture. Its code is E_*, never W_*. */
const HAS_ERROR = 'plan "B" { units mm room at (0,0) size 0x3000 }';

suite("DESCRIBE_KEYS — no drift vs the real describe() result", () => {
  it("names every top-level key describe() actually emits", () => {
    // `scale`/`accTitle`/`accDescr` are optional, so a fixture that declares them too.
    const s = describe(`plan "K" {
      units mm
      scale 1:50
      accTitle "T"
      accDescr "D"
      room id=r at (0,0) size 4000x3000 label "R"
      door at (0,1500) width 900
    }`);
    expect(s.ok).toBe(true);
    for (const k of Object.keys(s)) {
      expect(DESCRIBE_KEYS, `describe() emits "${k}" but --select would reject it`).toContain(k);
    }
  });

  /**
   * …and the same claim as SET EQUALITY, over fixtures chosen to emit every conditional
   * key between them.
   *
   * The check above is one-directional and only walks the keys one minimal plan happens
   * to produce, so more than half of `DESCRIBE_KEYS` was never reached by it. That gap is
   * not hypothetical: `voids` shipped absent from the list and this suite stayed green,
   * because a plan with no `void` emits no `voids` key — and `arch describe --select
   * voids` was therefore a usage error, which is exactly the failure `DESCRIBE_KEYS`' own
   * doc comment promises cannot happen ("a new summary field cannot silently become
   * unselectable").
   *
   * Equality bites in BOTH directions, which is the point: a new summary key with no
   * fixture goes red (it would be unselectable), and a `DESCRIBE_KEYS` entry no plan can
   * produce goes red too (it is a key `--select` accepts and `describe()` never emits).
   * A single-storey plan and a multi-storey one are both needed — `levels`/`vertical`
   * exist only on the latter, and `axes`/`site`/`schedule`/`zones`/`instances` are
   * plan-level settings the multi-storey shape puts elsewhere.
   */
  it("DESCRIBE_KEYS is EXACTLY the set of keys describe() can emit", () => {
    const single = describe(`plan "S" {
      units mm
      paper A3 landscape
      accTitle "T"
      accDescr "D"
      site { street north }
      axes { x at 0 y at 0 }
      schedule rooms
      component unit() { room id=main at (0,0) size 3000x3000 }
      place unit() as west at (12000,0)
      zone core "Core" {
        wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }
        room id=r1 at (0,0) size 8000x6000 label "Hall" uses hall
        door id=front on shell at 4000 width 900
        stair id=s at (500,500) size 900x2600 dir up
        void id=well at (5000,1000) size 1200x1200
      }
    }`);
    const multi = describe(`plan "M" {
      units mm
      level 1 "Ground" {
        wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }
        room id=r1 at (0,0) size 8000x6000 label "Hall" uses hall
        door id=front on shell at 4000 width 900
        stair id=s at (500,500) size 900x2600 dir up
        void id=well at (5000,1000) size 1200x1200
      }
      level 2 "First" {
        wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }
        room id=r2 at (0,0) size 8000x6000 label "Landing" uses circulation
        stair id=s at (500,500) size 900x2600 dir down
      }
    }`);
    // The fixtures are only evidence if they really produced the conditional keys.
    for (const k of ["sheet", "site", "axes", "schedule", "zones", "instances", "verticals", "voids"]) {
      expect(Object.keys(single), `the single-storey fixture stopped emitting "${k}"`).toContain(k);
    }
    for (const k of ["levels", "vertical"]) {
      expect(Object.keys(multi), `the multi-storey fixture stopped emitting "${k}"`).toContain(k);
    }
    const emitted = new Set([...Object.keys(single), ...Object.keys(multi)]);
    expect(
      [...emitted].sort(),
      "DESCRIBE_KEYS and the keys describe() can actually emit have diverged. A key on the " +
        "left only is UNSELECTABLE (`--select <it>` is a usage error); a key on the right " +
        "only is one `--select` accepts and describe() never produces.",
    ).toEqual([...DESCRIBE_KEYS].sort());
  });
});

suite("describe --select", () => {
  it("emits only the envelope + the chosen keys", () => {
    const r = run(["describe", "-", "--select", "totals", "--json"], TWO_ROOM);
    expect(r.status).toBe(0);
    const o = JSON.parse(r.stdout);
    expect(Object.keys(o).sort()).toEqual(["diagnostics", "ok", "plan", "totals", "units"]);
    expect(o.totals.rooms).toBe(2);
  }, 30000);

  it("accepts several keys and keeps the summary's own key order", () => {
    const r = run(["describe", "-", "--select", "totals,rooms", "--json"], TWO_ROOM);
    expect(r.status).toBe(0);
    const keys = Object.keys(JSON.parse(r.stdout));
    expect(keys).toContain("rooms");
    expect(keys).toContain("totals");
    expect(keys).not.toContain("circulation");
    // `rooms` precedes `totals` in SceneSummary — a subset, never a reshuffle.
    expect(keys.indexOf("rooms")).toBeLessThan(keys.indexOf("totals"));
  }, 30000);

  it("rejects an unknown key with a did-you-mean, exit 3", () => {
    const r = run(["describe", "-", "--select", "romes", "--json"], TWO_ROOM);
    expect(r.status).toBe(3);
    expect(r.stderr).toContain("error:");
    expect(r.stderr).toContain('unknown --select key "romes"');
    expect(r.stderr).toContain('did you mean "rooms"');
    expect(r.stdout).toBe("");
  }, 30000);
});

suite("describe --room", () => {
  it("keeps only the named room and the elements touching it", () => {
    const r = run(["describe", "-", "--room", "liv", "--json"], TWO_ROOM);
    expect(r.status).toBe(0);
    const o = JSON.parse(r.stdout);

    expect(o.rooms.map((x: { id: string }) => x.id)).toEqual(["liv"]);
    // d_entry (exterior↔liv) and d_mid (liv↔bed) both touch liv; nothing is dropped here
    // BECAUSE both touch it — the bed-only elements are what must go.
    expect(o.windows.map((x: { id: string }) => x.id)).toEqual(["w_liv"]);
    expect(o.furniture.map((x: { category: string }) => x.category)).toEqual(["sofa"]);
    expect(Object.keys(o.input_graph)).toEqual(["liv"]);
    expect(o.access.rooms.map((x: { id: string }) => x.id)).toEqual(["liv"]);
    // freedom counts are re-tallied over what survived, never the whole plan
    expect(o.freedom.rooms.total).toBe(1);
    expect(o.freedom.elements.every((e: { id: string }) => e.id !== "bed")).toBe(true);
    // and the result says it is narrowed
    expect(o.filtered).toBe(true);
    expect(o.selected_rooms).toEqual(["liv"]);
    // plan-level facts stay whole-plan on purpose (see narrowToRooms' doc comment)
    expect(o.totals.rooms).toBe(2);
  }, 30000);

  it("drops the doors that do not touch the kept room", () => {
    const r = run(["describe", "-", "--room", "bed", "--json"], TWO_ROOM);
    expect(r.status).toBe(0);
    const o = JSON.parse(r.stdout);
    const doors = o.doors.map((x: { id: string }) => x.id);
    // d_mid joins liv↔bed (kept); d_entry is on liv's exterior wall only (dropped).
    expect(doors).toContain("d_mid");
    expect(doors).not.toContain("d_entry");
    expect(o.windows.map((x: { id: string }) => x.id)).toEqual(["w_bed"]);
    expect(o.furniture.map((x: { category: string }) => x.category)).toEqual(["wardrobe"]);
  }, 30000);

  it("takes a comma list", () => {
    const r = run(["describe", "-", "--room", "liv,bed", "--json"], TWO_ROOM);
    expect(r.status).toBe(0);
    const o = JSON.parse(r.stdout);
    expect(o.rooms).toHaveLength(2);
    expect(o.doors).toHaveLength(2);
  }, 30000);

  it("rejects an unknown room id, listing the ids the plan has, exit 3", () => {
    const r = run(["describe", "-", "--room", "lvi", "--json"], TWO_ROOM);
    expect(r.status).toBe(3);
    expect(r.stderr).toContain("error:");
    expect(r.stderr).toContain('unknown room "lvi"');
    expect(r.stderr).toContain('did you mean "liv"');
    expect(r.stderr).toContain("plan has 2:");
    expect(r.stdout).toBe("");
  }, 30000);

  it("narrows the human summary too", () => {
    const r = run(["describe", "-", "--room", "liv"], TWO_ROOM);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("(showing 1)");
    expect(r.stdout).toContain("liv");
    expect(r.stdout).not.toContain("Bedroom");
  }, 30000);

  it("composes with --select", () => {
    const r = run(["describe", "-", "--room", "liv", "--select", "rooms", "--json"], TWO_ROOM);
    expect(r.status).toBe(0);
    const o = JSON.parse(r.stdout);
    expect(o.rooms).toHaveLength(1);
    expect(o.doors).toBeUndefined();
    // the markers ride outside --select, so a narrowed read always knows it is narrowed
    expect(o.filtered).toBe(true);
  }, 30000);
});

suite("lint/validate --code, --severity — display filters, never gates", () => {
  it("GATING: an unmatched --code still exits non-zero on a plan with a real error", () => {
    // The plan's only diagnostic is an E_* error; we ask to SEE only a warning code.
    // Nothing is displayed — and the command still fails, because the exit code comes
    // from the unfiltered set. This is the property the whole feature hangs on.
    const r = run(["lint", "-", "--code", WARN_CODE, "--json"], HAS_ERROR);
    expect(r.status).toBe(2);
    const o = JSON.parse(r.stdout);
    expect(o.ok).toBe(false);
    expect(o.diagnostics).toHaveLength(0);
    expect(o.filtered).toBe(true);
    expect(o.total_diagnostics).toBeGreaterThan(0);
  }, 30000);

  it("GATING: --severity warning does not hide an error from the exit code", () => {
    const r = run(["validate", "-", "--severity", "warning", "--json"], HAS_ERROR);
    expect(r.status).toBe(2);
    const o = JSON.parse(r.stdout);
    expect(o.ok).toBe(false);
    expect(o.diagnostics.every((d: { severity: string }) => d.severity === "warning")).toBe(true);
    expect(o.total_diagnostics).toBeGreaterThan(o.diagnostics.length);
  }, 30000);

  it("GATING: --strict + a filter that hides every warning still fails", () => {
    const r = run(["lint", "-", "--strict", "--severity", "error", "--json"], WARNS);
    expect(r.status).toBe(2); // warnings exist and --strict gates on them…
    const o = JSON.parse(r.stdout);
    expect(o.ok).toBe(false);
    expect(o.diagnostics).toHaveLength(0); // …even though none are displayed
    expect(o.total_diagnostics).toBeGreaterThan(0);
  }, 30000);

  it("keeps only the requested code", () => {
    const r = run(["lint", "-", "--code", WARN_CODE, "--json"], WARNS);
    expect(r.status).toBe(0);
    const o = JSON.parse(r.stdout);
    expect(o.diagnostics.length).toBeGreaterThan(0);
    expect(o.diagnostics.every((d: { code: string }) => d.code === WARN_CODE)).toBe(true);
    expect(o.filtered).toBe(true);
    expect(o.total_diagnostics).toBeGreaterThan(o.diagnostics.length);
  }, 30000);

  it("an unfiltered run carries neither marker (the default JSON is unchanged)", () => {
    const r = run(["lint", "-", "--json"], WARNS);
    expect(r.status).toBe(0);
    const o = JSON.parse(r.stdout);
    expect(o).not.toHaveProperty("filtered");
    expect(o).not.toHaveProperty("total_diagnostics");
  }, 30000);

  it("rejects an unknown code with a did-you-mean, exit 3", () => {
    const r = run(["lint", "-", "--code", "W_ROOM_DISCONECTED", "--json"], WARNS);
    expect(r.status).toBe(3);
    expect(r.stderr).toContain("error:");
    expect(r.stderr).toContain('unknown diagnostic code "W_ROOM_DISCONECTED"');
    expect(r.stderr).toContain(`did you mean "${WARN_CODE}"`);
  }, 30000);

  it("rejects an unknown severity, exit 3", () => {
    const r = run(["lint", "-", "--severity", "fatal", "--json"], WARNS);
    expect(r.status).toBe(3);
    expect(r.stderr).toContain("error:");
    expect(r.stderr).toContain("available: error, warning");
  }, 30000);

  it("tells a human reader that what they see is a filtered subset", () => {
    const r = run(["lint", "-", "--code", WARN_CODE], WARNS);
    expect(r.status).toBe(0);
    expect(r.stderr).toContain("display filter: showing");
    expect(r.stdout).toContain("✓ ok"); // the verdict still counts every warning
  }, 30000);
});

suite("lint --profile", () => {
  it("an unknown profile is a usage error with the `error:` prefix and the real names", () => {
    const r = run(["lint", "-", "--profile", "bogus", "--json"], WARNS);
    expect(r.status).toBe(3);
    expect(r.stderr).toContain("error:");
    expect(r.stderr).toContain('unknown lint profile "bogus"');
    expect(r.stderr).toContain("available:");
    expect(r.stdout).toBe("");
  }, 30000);

  it("still accepts a real profile", () => {
    const r = run(["lint", "-", "--profile", "accessibility-advisory", "--json"], WARNS);
    expect(r.status).toBe(0);
    expect(() => JSON.parse(r.stdout)).not.toThrow();
  }, 30000);
});
