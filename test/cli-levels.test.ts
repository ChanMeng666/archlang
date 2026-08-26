import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe as suite, expect, it } from "vitest";
import { PER_STOREY_OPTIONAL_KEYS } from "../src/cli/commands-analyze.js";

/**
 * The multi-storey CLI surface (v1.21).
 *
 * A plan with `level` blocks is a drawing SET, so `compile` writes one file per storey
 * (`<stem>.L<level>.<ext>`) and reports `outputs[]`. The properties pinned here:
 *
 *  - the per-level file naming, and that `-o` chooses where the set lands;
 *  - `--level <n>` narrows the render to one storey (and is the only way `-o -` can mean
 *    anything on a multi-storey plan — otherwise it is a usage error, exit 3);
 *  - an unknown `--level`, and `--level` on a single-storey plan, are usage errors (exit
 *    3) with a message that names the levels the plan actually has;
 *  - `describe --level` is a DISPLAY filter: it never changes `ok` or the exit code.
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

const HOUSE = readFileSync("examples/two-storey.arch", "utf8");
const STUDIO = "examples/studio.arch";

/** A scratch dir + a copy of the two-storey example inside it. */
function scratch(): { dir: string; plan: string } {
  const dir = mkdtempSync(join(tmpdir(), "archlang-levels-"));
  const plan = join(dir, "house.arch");
  writeFileSync(plan, HOUSE, "utf8");
  return { dir, plan };
}

suite("v1.21 CLI — compile writes one file per storey", () => {
  it("writes <stem>.L<level>.<ext> and reports outputs[] + pages[]", () => {
    const { dir, plan } = scratch();
    const r = run(["compile", plan, "--json"]);
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(true);
    expect(out.outputs).toHaveLength(2);
    expect(out.outputs.map((p: string) => p.replace(/^.*[\\/]/, ""))).toEqual(["house.L1.svg", "house.L2.svg"]);
    expect(out.pages.map((p: { level: number; name: string }) => [p.level, p.name])).toEqual([
      [1, "Ground floor"],
      [2, "First floor"],
    ]);
    // There is no single `output` for a set — inventing one would be a lie.
    expect(out.output).toBeUndefined();
    // The whole-plan summary rides along, and its `levels[]` mirrors the pages.
    expect(out.summary.levels.map((l: { level: number }) => l.level)).toEqual([1, 2]);

    const written = readdirSync(dir).sort();
    expect(written).toEqual(["house.L1.svg", "house.L2.svg", "house.arch"]);
    for (const f of ["house.L1.svg", "house.L2.svg"]) {
      expect(readFileSync(join(dir, f), "utf8")).toMatch(/^<svg /);
    }
    // Each page is stamped with its own storey in the title block.
    expect(readFileSync(join(dir, "house.L1.svg"), "utf8")).toContain("1 — Ground floor");
    expect(readFileSync(join(dir, "house.L2.svg"), "utf8")).toContain("2 — First floor");
  });

  it("`-o <file>` decides where the set lands (the level suffix is inserted)", () => {
    const { dir, plan } = scratch();
    const r = run(["compile", plan, "-o", join(dir, "sheets/../set.dxf"), "-f", "dxf", "--json"]);
    expect(r.status).toBe(0);
    expect(readdirSync(dir).sort()).toEqual(["house.arch", "set.L1.dxf", "set.L2.dxf"]);
  });

  it("`--level <n>` renders that storey alone, to the plain -o target", () => {
    const { dir, plan } = scratch();
    const r = run(["compile", plan, "--level", "2", "-o", join(dir, "upper.svg"), "--json"]);
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.output).toMatch(/upper\.svg$/);
    expect(out.outputs).toBeUndefined();
    expect(readFileSync(join(dir, "upper.svg"), "utf8")).toContain("2 — First floor");
  });

  it("`-o -` is a usage error on a multi-storey plan, but streams with --level", () => {
    const { plan } = scratch();
    const bad = run(["compile", plan, "-o", "-"]);
    expect(bad.status).toBe(3);
    expect(bad.stderr).toMatch(/2 levels \(1, 2\)/);
    expect(bad.stderr).toMatch(/--level/);
    expect(bad.stdout).toBe("");

    const ok = run(["compile", plan, "--level", "1", "-o", "-"]);
    expect(ok.status).toBe(0);
    expect(ok.stdout).toMatch(/^<svg /);
    expect(ok.stdout).toContain("1 — Ground floor");
  });

  it("an unknown --level, or --level on a single-storey plan, exits 3 with the real levels", () => {
    const { plan } = scratch();
    const unknown = run(["compile", plan, "--level", "9"]);
    expect(unknown.status).toBe(3);
    expect(unknown.stderr).toMatch(/unknown --level 9 \(plan has 1, 2\)/);

    const single = run(["compile", STUDIO, "--level", "1"]);
    expect(single.status).toBe(3);
    expect(single.stderr).toMatch(/no `level` blocks/);
  });

  it("preview defaults to the lowest storey and honours --level", () => {
    const { plan } = scratch();
    const first = run(["preview", plan, "--ascii"]);
    expect(first.status).toBe(0);
    const upper = run(["preview", plan, "--ascii", "--level", "2"]);
    expect(upper.status).toBe(0);
    expect(upper.stdout).not.toBe(first.stdout);
    const bad = run(["preview", plan, "--ascii", "--level", "7"]);
    expect(bad.status).toBe(3);
  });
});

suite("v1.21 CLI — describe --level is a display filter", () => {
  it("reports the named storey's facts as the top-level ones, marked filtered", () => {
    const { plan } = scratch();
    const r = run(["describe", plan, "--level", "2", "--json"]);
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.filtered).toBe(true);
    expect(out.selected_level).toBe(2);
    expect(out.rooms.map((x: { id: string }) => x.id)).toEqual(["landing", "bath", "bed1", "bed2"]);
    expect(out.levels.map((l: { level: number }) => l.level)).toEqual([2]);
    // The envelope is untouched by the narrowing.
    expect(out.ok).toBe(true);
    expect(out.plan).toBe("Two-storey house");
  });

  it("never changes ok/exit: a plan broken on level 2 still fails when read at level 1", () => {
    const dir = mkdtempSync(join(tmpdir(), "archlang-levels-"));
    const plan = join(dir, "broken.arch");
    writeFileSync(
      plan,
      `plan "B" {
  level 1 { wall exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close } room id=r at (0,0) size 4000x3000 }
  level 2 { room id=r at (0,0) size 0x3000 }
}`,
      "utf8",
    );
    const r = run(["describe", plan, "--level", "1", "--json"]);
    expect(r.status).toBe(2);
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(false);
    expect(
      out.diagnostics.some((d: { code: string; level?: number }) => d.code === "E_ROOM_SIZE" && d.level === 2),
    ).toBe(true);
  });

  it("`--select levels` and `--room` compose with it", () => {
    const { plan } = scratch();
    const sel = JSON.parse(run(["describe", plan, "--select", "levels", "--json"]).stdout);
    expect(sel.levels).toHaveLength(2);
    expect(sel.rooms).toBeUndefined();

    const both = JSON.parse(run(["describe", plan, "--level", "2", "--room", "bath", "--json"]).stdout);
    expect(both.rooms.map((x: { id: string }) => x.id)).toEqual(["bath"]);
    expect(both.selected_level).toBe(2);
    expect(both.selected_rooms).toEqual(["bath"]);
    // A room that exists only on the OTHER storey is a usage error, not an empty result.
    expect(run(["describe", plan, "--level", "2", "--room", "kitchen"]).status).toBe(3);
  });

  /**
   * The narrowing SPREADS one storey's facts over the whole-plan ones, so an optional key
   * that storey does not have must be DELETED — otherwise the previous spread's value
   * stands and the narrowed read reports another floor's facts under its own name. The
   * list is `PER_STOREY_OPTIONAL_KEYS`, and this drives it rather than naming keys, so a
   * third one added there is checked here for free.
   */
  it("a per-storey key absent from the selected storey is DROPPED, not inherited", () => {
    const dir = mkdtempSync(join(tmpdir(), "archlang-levels-"));
    const plan = join(dir, "perstorey.arch");
    // Level 1 has both optional per-storey keys; level 2 has neither.
    writeFileSync(
      plan,
      `plan "P" {
  units mm
  level 1 {
    wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }
    room id=r1 at (0,0) size 8000x6000 label "Hall" uses hall
    door id=front on shell at 4000 width 900
    stair id=s at (500,500) size 900x2600 dir up
    void id=well at (5000,1000) size 1200x1200
  }
  level 2 {
    wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }
    room id=r2 at (0,0) size 8000x6000 label "Loft" uses storage
    door id=hatch on shell at 4000 width 900
  }
}`,
      "utf8",
    );
    const one = JSON.parse(run(["describe", plan, "--level", "1", "--json"]).stdout);
    const two = JSON.parse(run(["describe", plan, "--level", "2", "--json"]).stdout);
    for (const k of PER_STOREY_OPTIONAL_KEYS) {
      expect(one[k], `level 1 declares a ${k} and the narrowed read lost it`).toBeDefined();
      expect(two[k], `level 2 declares no ${k}, so the narrowed read must not report one`).toBeUndefined();
    }
  });
});

suite("v1.21 CLI — the level-free path is unchanged", () => {
  it("a single-storey compile still reports one `output` and no outputs[]", () => {
    const dir = mkdtempSync(join(tmpdir(), "archlang-levels-"));
    const target = join(dir, "studio.svg");
    const out = JSON.parse(run(["compile", STUDIO, "-o", target, "--json"]).stdout);
    expect(out.ok).toBe(true);
    expect(out.output).toMatch(/studio\.svg$/);
    expect(out.outputs).toBeUndefined();
    expect(out.pages).toBeUndefined();
    expect(readdirSync(dir)).toEqual(["studio.svg"]);
  });
});
