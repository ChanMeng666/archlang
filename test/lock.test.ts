/**
 * The lock check (preview-and-remodel card B1, decision D6): `impact(before, after, { lock })`
 * and `arch impact --against old.arch --lock <id,…>`. No syntax: the lock is a CLI/library
 * argument, and a lock names only an element whose `id=` its author wrote (README §2 principle 6).
 *
 * Laws: identity (a plan against itself breaks no lock), symmetry (a lock that sees an element
 * vanish one way sees it appear the other way, with the spans swapped), and the PS0.23
 * auto-id shift refused. The acceptance pair: the exterior ring, the entry door and two windows
 * locked; an interior partition moves (exit 0), then a locked window moves 100 mm (exit 2, both
 * spans).
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe as suite, expect, it } from "vitest";
import { ERROR_CATALOG, impact, type ImpactLock, parseLockList } from "../src/index.js";

const FX = "test/fixtures";
const read = (p: string): string => readFileSync(p, "utf8");
const BEFORE = read(`${FX}/lock-before.arch`);
const LOCKS = ["shell", "entry", "w1", "w2"];
const lockOf = (a: string, b: string, ids: readonly string[] = LOCKS): ImpactLock => impact(a, b, { lock: ids }).lock!;
const plan = (body: string): string => `plan "t" {\n  units mm\n  grid 50\n${body}\n}\n`;
const slice = (src: string, s: { span: [number, number] } | undefined): string =>
  s ? src.slice(s.span[0], s.span[1]) : "";

suite("B1 — acceptance: the exterior ring, the entry door and two windows locked", () => {
  it("an interior partition moves: the locks hold", () => {
    const l = lockOf(BEFORE, read(`${FX}/lock-partition-moved.arch`));
    expect(l).toEqual({ ok: true, checked: true, locked: LOCKS, violations: [], refused: [] });
  });

  it("a locked window moves 100 mm: one violation with both spans", () => {
    const after = read(`${FX}/lock-window-moved.arch`);
    const l = lockOf(BEFORE, after);
    expect(l.ok).toBe(false);
    expect(l.refused).toEqual([]);
    expect(l.violations).toHaveLength(1);
    const v = l.violations[0]!;
    expect(v).toMatchObject({
      code: "E_LOCKED_ELEMENT_CHANGED",
      id: "w2",
      kind: "window",
      change: "moved",
      detail: "moved 100 mm right",
    });
    expect(slice(BEFORE, v.before)).toBe("window id=w2 on shell at 6000 width 1500");
    expect(slice(after, v.after)).toBe("window id=w2 on shell at 6100 width 1500");
  });
});

suite("B1 — laws", () => {
  it("identity: a plan against itself breaks no lock (every written id of three examples)", () => {
    for (const f of ["laneway-house", "furnished-flat", "relational"]) {
      const src = read(`examples/${f}.arch`);
      const ids = [...src.matchAll(/\bid=([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]!);
      expect(ids.length, f).toBeGreaterThan(3);
      const l = lockOf(src, src, ids);
      expect(l.checked, f).toBe(true);
      expect(l.violations, f).toEqual([]);
    }
  });

  it("symmetry: vanished one way is appeared the other, with the spans swapped", () => {
    const gone = BEFORE.replace("  window id=w1 on shell at 2500 width 1500\n", "");
    const ab = lockOf(BEFORE, gone);
    const ba = lockOf(gone, BEFORE);
    expect(ab.violations.map((v) => [v.id, v.change])).toEqual([["w1", "vanished"]]);
    expect(ba.violations.map((v) => [v.id, v.change])).toEqual([["w1", "appeared"]]);
    expect(ab.violations[0]!.before).toEqual(ba.violations[0]!.after);
    expect(ab.violations[0]!.after).toBeUndefined();
    expect(ba.violations[0]!.before).toBeUndefined();
  });

  it("symmetry: the same ids break both ways for every change class", () => {
    const variants = [
      read(`${FX}/lock-window-moved.arch`),
      BEFORE.replace("door id=entry on shell at 1000 width 900", "door id=entry on shell at 1000 width 900 swing out"),
      BEFORE.replace("w1 on shell at 2500 width 1500", "w1 on shell at 2500 width 1200"),
      BEFORE.replace("wall id=shell exterior thickness 200", "wall id=shell exterior thickness 250"),
    ];
    for (const after of variants) {
      const ab = lockOf(BEFORE, after).violations.map((v) => v.id);
      const ba = lockOf(after, BEFORE).violations.map((v) => v.id);
      expect(ab.length).toBe(1);
      expect(ba).toEqual(ab);
    }
  });

  it("PS0.23: a lock on an auto-id is refused, because the id shifts", () => {
    // Before: the window at 6000 is the second window, `window_2`. Inserting a window ahead
    // of it shifts it to `window_3` and gives `window_2` to the new one, so a lock on the
    // name would follow another window. Refused on either side, whatever the geometry says.
    const before = plan(
      '  wall id=s exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }\n  room id=r at (0,0) size 8000x5000 label "R"\n  door id=d on s at 500 width 900\n  window on s at 2500 width 1200\n  window on s at 6000 width 1200',
    );
    const after = before.replace(
      "  window on s at 2500 width 1200\n",
      "  window on s at 2500 width 1200\n  window on s at 4200 width 1200\n",
    );
    for (const [a, b] of [
      [before, after],
      [before, before],
    ] as const) {
      const l = lockOf(a, b, ["window_2"]);
      expect(l.ok).toBe(false);
      expect(l.violations).toEqual([]);
      expect(l.refused.map((r) => r.code)).toEqual(["E_LOCK_UNNAMED"]);
      expect(l.refused[0]!.hint).toContain("id=");
    }
  });
});

suite("B1 — change classes and refusals", () => {
  const one = (after: string, ids: string[] = LOCKS) => {
    const l = lockOf(BEFORE, after, ids);
    expect(l.violations).toHaveLength(1);
    return l.violations[0]!;
  };

  it("a door's swing", () => {
    const v = one(
      BEFORE.replace("door id=entry on shell at 1000 width 900", "door id=entry on shell at 1000 width 900 swing out"),
    );
    expect([v.id, v.change, v.detail]).toEqual(["entry", "swing", "swing left in → left out"]);
  });

  it("a window's width, a wall's thickness, a re-hosted door", () => {
    expect(one(BEFORE.replace("w1 on shell at 2500 width 1500", "w1 on shell at 2500 width 1200")).change).toBe(
      "resized",
    );
    expect(
      one(BEFORE.replace("wall id=shell exterior thickness 200", "wall id=shell exterior thickness 250")).change,
    ).toBe("rethickened");
    const r = one(BEFORE.replace("door id=inner on p at 2500 width 800", "door id=inner on shell at 3000 width 800"), [
      "inner",
    ]);
    expect(r.change).toBe("rehosted");
  });

  it("a relabel is not a change", () => {
    const l = lockOf(BEFORE, BEFORE.replace('label "Living"', 'label "Lounge"'), ["living"]);
    expect(l.ok).toBe(true);
  });

  it("a name no element carries is refused; a duplicate in the list is checked once", () => {
    const l = lockOf(BEFORE, BEFORE, ["nope", "w1", "w1"]);
    expect(l.locked).toEqual(["nope", "w1"]);
    expect(l.refused.map((r) => [r.code, r.id])).toEqual([["E_LOCK_UNNAMED", "nope"]]);
  });

  it("an element above the lowest storey is refused (impact compares the lowest storey)", () => {
    const src = plan(
      '  level 0 {\n    wall id=g exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }\n    room id=a at (0,0) size 4000x4000 label "A"\n  }\n  level 1 {\n    wall id=u exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }\n    room id=b at (0,0) size 4000x4000 label "B"\n  }',
    );
    const l = lockOf(src, src, ["g", "u"]);
    expect(l.refused.map((r) => r.id)).toEqual(["u"]);
    expect(l.refused[0]!.message).toContain("above the lowest storey");
  });

  it("a side that does not resolve checks nothing and is not ok", () => {
    const l = lockOf(BEFORE, "plan {", ["w1"]);
    expect(l).toMatchObject({ ok: false, checked: false, violations: [], refused: [] });
  });

  it("without a lock the report has no lock section", () => {
    expect("lock" in impact(BEFORE, BEFORE)).toBe(false);
  });

  it("parseLockList splits, trims, drops empties and duplicates", () => {
    expect(parseLockList(" a, b ,,a,c ")).toEqual(["a", "b", "c"]);
    expect(parseLockList(" , ")).toEqual([]);
  });

  it("both codes are catalogued", () => {
    expect(ERROR_CATALOG.E_LOCKED_ELEMENT_CHANGED?.severity).toBe("error");
    expect(ERROR_CATALOG.E_LOCK_UNNAMED?.fix).toContain("id=");
  });
});

function run(args: string[]): { status: number | null; stdout: string } {
  const r = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], { encoding: "utf8" });
  return { status: r.status, stdout: r.stdout };
}

suite("B1 — `arch impact --lock`", () => {
  const lock = ["--lock", LOCKS.join(",")];

  it("the partition pair exits 0; the window pair exits 2 with both spans in --json", () => {
    const ok = run(["impact", `${FX}/lock-partition-moved.arch`, "--against", `${FX}/lock-before.arch`, ...lock]);
    expect(ok.status).toBe(0);
    const bad = run([
      "impact",
      `${FX}/lock-window-moved.arch`,
      "--against",
      `${FX}/lock-before.arch`,
      ...lock,
      "--json",
    ]);
    expect(bad.status).toBe(2);
    const j = JSON.parse(bad.stdout);
    expect(j.lock.violations).toEqual(lockOf(BEFORE, read(`${FX}/lock-window-moved.arch`)).violations);
    expect(j.lock.violations[0].before.span).toHaveLength(2);
    expect(j.lock.violations[0].after.span).toHaveLength(2);
  });

  it("the human report names both locations", () => {
    const r = run(["impact", `${FX}/lock-window-moved.arch`, "--against", `${FX}/lock-before.arch`, ...lock]);
    expect(r.status).toBe(2);
    expect(r.stdout).toContain('E_LOCKED_ELEMENT_CHANGED: Locked window "w2" moved 100 mm right.');
    expect(r.stdout).toContain(`w2: ${FX}/lock-before.arch:11:3 → ${FX}/lock-window-moved.arch:11:3`);
  });

  it("a refused lock exits 2; an empty --lock is a usage error (exit 3)", () => {
    const f = `${FX}/lock-before.arch`;
    expect(run(["impact", f, "--against", f, "--lock", "living,room_9"]).status).toBe(2);
    expect(run(["impact", f, "--against", f, "--lock", ","]).status).toBe(3);
  });
});
