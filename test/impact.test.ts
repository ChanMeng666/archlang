/**
 * `impact()` and `arch impact` (plan-soundness PS4.2): what changed and why, what held, what
 * broke or healed, when one number changes.
 *
 * The widening drill (§7 row 4's acceptance: "the widening drill's `impact` names every moved,
 * held and broken item correctly") is pinned in full below, human report and JSON, with every
 * line's reasoning from the source written next to it. The unit cases pin the `why` chain, the
 * `held` definition and the `--set` refusal; the broke/healed case is the drill read backwards.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe as suite, expect, it } from "vitest";
import { applyLetOverride, ERROR_CATALOG, impact, MAX_WHY_DEPTH, type ImpactReport } from "../src/index.js";

const REPRO = "docs/plans/plan-soundness/repro";
const read = (p: string): string => readFileSync(p, "utf8");
const plan = (body: string): string => `plan "t" {\n  units mm\n  grid 50\n${body}\n}\n`;

/** `impact` of `src` against itself with `NAME` set to `value` (what `--set` runs). */
function setImpact(src: string, name: string, value: string): ImpactReport {
  const o = applyLetOverride(src, name, value);
  if (!o.ok) throw new Error(JSON.stringify(o.diagnostics));
  return impact(src, o.source);
}
const changed = (r: ImpactReport, name: string) => r.changed.find((c) => c.name === name);

// ---------------------------------------------------------------------------------------
// The widening drill: repro/widen-before.arch → repro/widen-after.arch (`let AW` 4000 → 4500)

const W_BOUNDARY =
  '"Living" and "Bed" have no wall between them: they meet along 5000 mm on the line x 4500, y 0–5000 with no wall, door or opening anywhere on it, wider than a 900 mm doorway. Through that boundary they are one space that anyone walks through, but no door or opening joins them in the plan, so routes, privacy and enclosure are read as if it were walled.';
const W_DISCONNECTED = 'Room "Bed" has no door or opening — it can\'t be entered.';
const W_OUTSIDE =
  'Room "Bed" has 2 m² of its floor outside the building\'s walls, up to 400 mm past their outer face. A room drawn past the outside wall has floor no wall encloses, usually a room resized or moved while its walls stayed put.';

suite("PS4.2 — the widening drill (§7 row 4 acceptance)", () => {
  const before = read(`${REPRO}/widen-before.arch`);
  const after = read(`${REPRO}/widen-after.arch`);

  it("`--set AW=4500` on widen-before is exactly widen-after", () => {
    const o = applyLetOverride(before, "AW", "4500");
    expect(o).toEqual({ ok: true, source: after, name: "AW", before: "4000", after: "4500" });
  });

  it("names every moved, held and broken item: the human report", () => {
    // Reasoning from the source, line by line:
    // - `let AW = 4000` → 4500 is the one edit.
    // - Room a is `at (0,0) size AW x 5000`: pinned at the origin, it reads AW, so it grows by
    //   500 mm on its right edge (20 m² → 22.5 m²). Its why is the let it reads.
    // - Room b is `right-of a align top gap 0`: its depends row is `on: [a]`, so it moves
    //   500 mm right with a's right edge. Its why runs b → a → AW.
    // - door_2 is `door on p at 2500` on the absolute partition p (x 4000), which did not
    //   move, so the door did not move either; but a now covers x 0–4500 and b starts at
    //   4500, so the doorway at x 4000 stands inside a and joins no two rooms (`diffPlans`:
    //   joins a and b → nothing). Its host is unchanged, so its why is the `joins` edge: a,
    //   whose growth swallowed it, → AW.
    // - Held: the two walls written at fixed coordinates that lay ON a room edge that moved
    //   (PS4.5 contacts, read on the before side). p (x 4000, y 0–5000) lay on a.right and
    //   b.left, both now at x 4500: two 500 mm gaps. The shell lay on six edges (a.top, a.left,
    //   a.bottom, b.top, b.right, b.bottom); only b.right's line moved (x 8000 → 8500), since
    //   the top and bottom edges grew or slid along y 0 and y 5000 without leaving them. Every
    //   other element that depends on something that changed did change (b on a, door_2 by
    //   joins); door_1, window_1 and the bed (`against wall shell … side left in b`, whose
    //   explicit side keeps b out of its `on`, and whose back is on the shell's face at y 100,
    //   not on b.top at y 0) depend only on the shell, which did not change.
    // - Broke (all lint, all raised on b's statement): W_BOUNDARY_NO_WALL (a and b now meet
    //   along x 4500 where no wall stands: p is at 4000); W_ROOM_DISCONNECTED (b's only door,
    //   door_2, no longer joins it); W_ROOM_OUTSIDE_SHELL (b spans x 4500–8500, 500 mm past the
    //   shell's centreline at 8000, i.e. 400 mm past its outer face; 0.4 m × 5 m = 2 m²).
    // - Healed: none. Unchanged: 1 (W_HABITABLE_NO_WINDOW on a, before and after: the window
    //   is on b's side of the shell).
    expect(impact(before, after).summary).toEqual([
      "Lets (1):",
      "  AW: 4000 → 4500",
      "Changed (3):",
      "  room a resized (20 m² → 22.5 m²; right edge +500 mm)",
      "    why: reads AW (4000 → 4500)",
      "  room b moved 500 mm right",
      "    why: on a (resized) ← reads AW (4000 → 4500)",
      "  door door_2 re-hosted: joins a and b → nothing",
      "    why: joins a (resized) ← reads AW (4000 → 4500)",
      "Held (2):",
      "  wall p stayed at x 4000 while a.right moved to x 4500 (500 mm)",
      "  wall p stayed at x 4000 while b.left moved to x 4500 (500 mm)",
      "  wall shell stayed at x 8000 while b.right moved to x 8500 (500 mm)",
      "Broke (3):",
      `  W_BOUNDARY_NO_WALL on b: ${W_BOUNDARY}`,
      `  W_ROOM_DISCONNECTED on b: ${W_DISCONNECTED}`,
      `  W_ROOM_OUTSIDE_SHELL on b: ${W_OUTSIDE}`,
      "Healed (0): none",
      "Unchanged diagnostics: 1",
    ]);
  });

  it("the JSON report, field for field", () => {
    const { summary: _s, ...json } = impact(before, after);
    expect(json).toEqual({
      ok: true,
      lets: [{ name: "AW", before: "4000", after: "4500" }],
      changed: [
        {
          name: "a",
          id: "a",
          kind: "room",
          change: "resized",
          detail: "resized (20 m² → 22.5 m²; right edge +500 mm)",
          why: [{ via: "param", name: "AW", change: "4000 → 4500" }],
          root: "let",
        },
        {
          name: "b",
          id: "b",
          kind: "room",
          change: "moved",
          detail: "moved 500 mm right",
          why: [
            { via: "on", name: "a", change: "resized" },
            { via: "param", name: "AW", change: "4000 → 4500" },
          ],
          root: "let",
        },
        {
          name: "door_2",
          id: "door_2",
          kind: "door",
          change: "rehosted",
          detail: "re-hosted: joins a and b → nothing",
          why: [
            { via: "joins", name: "a", change: "resized" },
            { via: "param", name: "AW", change: "4000 → 4500" },
          ],
          root: "let",
        },
      ],
      held: [
        {
          name: "p",
          id: "p",
          kind: "wall",
          because: [
            {
              via: "contact",
              name: "a.right",
              change: "moved 500 mm right",
              contact: { room: "a", edge: "right", axis: "x", stayed_mm: 4000, moved_to_mm: 4500, gap_mm: 500 },
            },
            {
              via: "contact",
              name: "b.left",
              change: "moved 500 mm right",
              contact: { room: "b", edge: "left", axis: "x", stayed_mm: 4000, moved_to_mm: 4500, gap_mm: 500 },
            },
          ],
        },
        {
          name: "shell",
          id: "shell",
          kind: "wall",
          because: [
            {
              via: "contact",
              name: "b.right",
              change: "moved 500 mm right",
              contact: { room: "b", edge: "right", axis: "x", stayed_mm: 8000, moved_to_mm: 8500, gap_mm: 500 },
            },
          ],
        },
      ],
      diagnostics: {
        broke: [
          { code: "W_BOUNDARY_NO_WALL", severity: "warning", element: "b", message: W_BOUNDARY, channel: "lint" },
          { code: "W_ROOM_DISCONNECTED", severity: "warning", element: "b", message: W_DISCONNECTED, channel: "lint" },
          { code: "W_ROOM_OUTSIDE_SHELL", severity: "warning", element: "b", message: W_OUTSIDE, channel: "lint" },
        ],
        healed: [],
        unchanged_count: 1,
      },
    });
  });

  it("broke/healed: the drill read backwards heals exactly what it broke", () => {
    // Narrowing a back to 4000 removes the three warnings the widening introduced (a change
    // that removes a W_ code) and adds none; the unchanged count is the same one warning.
    const back = impact(after, before);
    expect(back.diagnostics.broke).toEqual([]);
    expect(back.diagnostics.healed.map((d) => `${d.code} ${d.element}`)).toEqual([
      "W_BOUNDARY_NO_WALL b",
      "W_ROOM_DISCONNECTED b",
      "W_ROOM_OUTSIDE_SHELL b",
    ]);
    expect(back.diagnostics.unchanged_count).toBe(1);
    expect(back.changed.map((c) => `${c.name} ${c.change}`)).toEqual(["a resized", "b moved", "door_2 rehosted"]);
  });
});

// ---------------------------------------------------------------------------------------
// The studio drill: examples/studio.arch with r_living widened by 500 mm. Studio has no `let`
// (every number is written in place), so the drill compares two sources (`--against`).

suite("PS4.2 — the studio widening drill (`--against`)", () => {
  const before = read("examples/studio.arch");
  const after = before.replace("size 4000x6000", "size 4500x6000");

  it("has no `let` to set, so --set refuses and names the alternative", () => {
    const o = applyLetOverride(before, "W", "4500");
    expect(o.ok).toBe(false);
    if (o.ok) return;
    expect(o.diagnostics.map((d) => d.code)).toEqual(["E_SET_OVERRIDE"]);
    expect(o.diagnostics[0]!.hints).toEqual([
      "This plan has no top-level `let`; compare two files with `--against old.arch` instead.",
    ]);
  });

  it("the human report", () => {
    // Reasoning from the source:
    // - r_living `at (0,0) size 4000x6000` → 4500x6000: its own statement was edited; it grows
    //   500 mm on its right edge (24 m² → 27 m²).
    // - o_living `at (4000,3700) … wall partition`: the partition and the opening are written
    //   absolutely and did not move, but x 4000 is now inside r_living (0–4500), so the opening
    //   joins only r_hall (was r_living and r_hall). It records no dependency on r_living, so
    //   the chain is the `joins` edge to r_living, whose statement was edited.
    // - Held: the x 4000 partition (`partition_2`, written at fixed coordinates), which lay on
    //   r_living's right edge (PS4.5 contacts) and stayed at x 4000 while that edge moved to
    //   4500. Nothing in studio depends on r_living by name (only the WC reads r_bath). The
    //   rest that should have followed (r_bed, r_hall, r_bath, the d_bath door) does not lie on
    //   an edge that moved (r_bed.left and the rest are where they were), so its breakage is
    //   under Broke. The shell lay on r_living's top, left and bottom edges, whose lines did not
    //   move; the kitchen run's backs are at y 250, off r_living.top.
    // - Broke: W_ROOM_OVERLAP on r_bed, r_hall and r_bath (r_living now covers x 4000–4500 of
    //   each; raised by the resolver, `compile` channel, on the second room's statement);
    //   the rest by lint: W_ROOM_UNREACHABLE on the same three (the
    //   living↔hall opening no longer joins living, and the entrance d_main opens into
    //   living); W_CONNECTOR_AMBIGUOUS on o_living (one side spans living and hall) and on
    //   d_bath (at x 4600 ± 400 its 4200–4500 stretch now borders living on both faces).
    // - Healed: none; unchanged: 0 (studio lints clean).
    const r = impact(before, after);
    const msg = (code: string, el: string) =>
      r.diagnostics.broke.find((d) => d.code === code && d.element === el)?.message;
    expect(r.summary).toEqual([
      "Changed (2):",
      "  opening o_living re-hosted: joins r_living and r_hall → r_hall",
      "    why: joins r_living (resized); that statement was edited",
      "  room r_living resized (24 m² → 27 m²; right edge +500 mm)",
      "    why: its own statement was edited",
      "Held (1):",
      "  wall partition_2 stayed at x 4000 while r_living.right moved to x 4500 (500 mm)",
      "Broke (8):",
      `  W_CONNECTOR_AMBIGUOUS on d_bath: ${msg("W_CONNECTOR_AMBIGUOUS", "d_bath")}`,
      `  W_CONNECTOR_AMBIGUOUS on o_living: ${msg("W_CONNECTOR_AMBIGUOUS", "o_living")}`,
      '  W_ROOM_OVERLAP on r_bath: Rooms "Living / Kitchen" and "Bath" overlap',
      '  W_ROOM_UNREACHABLE on r_bath: Room "Bath" can\'t be reached from the entrance.',
      '  W_ROOM_OVERLAP on r_bed: Rooms "Living / Kitchen" and "Bedroom" overlap',
      '  W_ROOM_UNREACHABLE on r_bed: Room "Bedroom" can\'t be reached from the entrance.',
      '  W_ROOM_OVERLAP on r_hall: Rooms "Living / Kitchen" and "Hall" overlap',
      '  W_ROOM_UNREACHABLE on r_hall: Room "Hall" can\'t be reached from the entrance.',
      "Healed (0): none",
      "Unchanged diagnostics: 0",
    ]);
    expect(msg("W_CONNECTOR_AMBIGUOUS", "d_bath")).toContain('one side spans "Living / Kitchen" (250 mm) and "Hall"');
    expect(msg("W_CONNECTOR_AMBIGUOUS", "o_living")).toContain('the other side opens into "Living / Kitchen"');
  });

  it("the JSON report", () => {
    const { summary: _s, diagnostics, ...json } = impact(before, after);
    expect(json).toEqual({
      ok: true,
      lets: [],
      changed: [
        {
          name: "o_living",
          id: "o_living",
          kind: "opening",
          change: "rehosted",
          detail: "re-hosted: joins r_living and r_hall → r_hall",
          why: [{ via: "joins", name: "r_living", change: "resized" }],
          root: "edited",
        },
        {
          name: "r_living",
          id: "r_living",
          kind: "room",
          change: "resized",
          detail: "resized (24 m² → 27 m²; right edge +500 mm)",
          why: [],
          root: "edited",
        },
      ],
      held: [
        {
          name: "partition_2",
          id: "partition_2",
          kind: "wall",
          because: [
            {
              via: "contact",
              name: "r_living.right",
              change: "moved 500 mm right",
              contact: { room: "r_living", edge: "right", axis: "x", stayed_mm: 4000, moved_to_mm: 4500, gap_mm: 500 },
            },
          ],
        },
      ],
    });
    expect(diagnostics.healed).toEqual([]);
    expect(diagnostics.unchanged_count).toBe(0);
    expect(diagnostics.broke.map((d) => [d.code, d.element, d.severity, d.channel])).toEqual([
      ["W_CONNECTOR_AMBIGUOUS", "d_bath", "warning", "lint"],
      ["W_CONNECTOR_AMBIGUOUS", "o_living", "warning", "lint"],
      ["W_ROOM_OVERLAP", "r_bath", "warning", "compile"],
      ["W_ROOM_UNREACHABLE", "r_bath", "warning", "lint"],
      ["W_ROOM_OVERLAP", "r_bed", "warning", "compile"],
      ["W_ROOM_UNREACHABLE", "r_bed", "warning", "lint"],
      ["W_ROOM_OVERLAP", "r_hall", "warning", "compile"],
      ["W_ROOM_UNREACHABLE", "r_hall", "warning", "lint"],
    ]);
  });
});

// ---------------------------------------------------------------------------------------
// why chains

suite("PS4.2 — why chains", () => {
  const twoRooms = (extra: string) =>
    plan(`  let W = 3000
  room id=a at (0,0) size W x 3000 label "A"
  room id=b right-of a align top gap 0 size 3000x3000 label "B"
${extra}`);

  it("a door `between A and B` whose room moved: why = [door → room → let]", () => {
    const r = setImpact(
      twoRooms(`  walls from rooms exterior 200 partition 100
  door id=d between a and b at 1000 from start width 800`),
      "W",
      "3500",
    );
    // d's row: on [a, b], host the derived a|b partition. a (resized) is the first changed
    // id in `on`, and a reads W.
    expect(changed(r, "d")).toMatchObject({
      change: "moved",
      detail: "moved 500 mm right",
      why: [
        { via: "on", name: "a", change: "resized" },
        { via: "param", name: "W", change: "3000 → 3500" },
      ],
      root: "let",
    });
    // The derived partition is named by its rooms, never `a|b`.
    expect(changed(r, 'the partition between "a" and "b"')).toMatchObject({ derived: true, change: "moved" });
    expect(JSON.stringify(r)).not.toContain("a|b");
  });

  it("a piece `against wall` on a derived wall whose room grew: why runs through the host", () => {
    const r = setImpact(
      twoRooms(`  walls from rooms exterior 200 partition 100 { open between a and b }
  furniture id=k counter against wall exterior segment 1 offset 1500 side right size 600x600 in b`),
      "W",
      "3500",
    );
    // `side right` is written, so `in b` does not enter k's `on`: its only dependency is the
    // ring it backs onto (hostWallId, a derived wall), whose row is on [a, b].
    expect(changed(r, "k")).toMatchObject({
      change: "moved",
      why: [
        { via: "host", name: "the exterior wall derived from the rooms", change: "resized" },
        { via: "on", name: "a", change: "resized" },
        { via: "param", name: "W", change: "3000 → 3500" },
      ],
      root: "let",
    });
    // The derived `open between` opening is named by its clause, never `a|b:open`.
    expect(changed(r, "opening between a and b")).toMatchObject({ derived: true, change: "moved" });
    expect(JSON.stringify(r)).not.toContain(":open");
  });

  it("a `let`-driven position, and a `let` read through another `let`", () => {
    const src = plan(`  let W = 3000
  let X = W + 500
  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }
  room id=a at (0,0) size 3000x3000 label "A"
  furniture id=t table at (X, 4000) size 800x800`);
    const r = setImpact(src, "W", "3500");
    // X's text is unchanged, but it reads W, so it is a changed let too, and t's chain runs
    // t → X → W.
    expect(r.lets).toEqual([
      { name: "W", before: "3000", after: "3500" },
      { name: "X", before: "W + 500", after: "W + 500", reads: ["W"] },
    ]);
    expect(changed(r, "t")).toMatchObject({
      kind: "furniture",
      change: "moved",
      detail: "moved 500 mm right",
      why: [
        { via: "param", name: "X", change: "reads W" },
        { via: "param", name: "W", change: "3000 → 3500" },
      ],
      root: "let",
    });
  });

  it("chains are bounded by a count and a cycle terminates", () => {
    expect(MAX_WHY_DEPTH).toBe(32);
    // A relational chain longer than the bound: r0 reads W; r(i) is right-of r(i-1).
    const n = MAX_WHY_DEPTH + 5;
    const rooms = Array.from({ length: n }, (_, i) =>
      i === 0
        ? "  room id=r0 at (0,0) size W x 1000"
        : `  room id=r${i} right-of r${i - 1} align top gap 0 size 1000x1000`,
    ).join("\n");
    const r = setImpact(plan(`  let W = 1000\n${rooms}`), "W", "1500");
    const last = changed(r, `r${n - 1}`)!;
    expect(last.why).toHaveLength(MAX_WHY_DEPTH);
    expect(last.truncated).toBe(true);
    expect(changed(r, "r1")!.why.map((s) => s.name)).toEqual(["r0", "W"]);
  });
});

// ---------------------------------------------------------------------------------------
// held

suite("PS4.2 — held", () => {
  const src = plan(`  let W = 3000
  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }
  wall id=w partition thickness 100 { (W,0) (W,3000) }
  room id=a at (0,0) size W x 3000 label "A"
  room id=c at (0,3000) size min(W, 3000) x 3000 label "C"
  door id=dw on w at 1000 width 800`);
  const r = setImpact(src, "W", "3500");

  it("a room that reads the changed let but is pinned `at (x,y)`: resized, not held", () => {
    expect(changed(r, "a")).toMatchObject({ change: "resized", root: "let" });
    expect(r.held.map((h) => h.name)).not.toContain("a");
  });

  it("a door `at <mm>` on a wall that moved: moved with it, not held", () => {
    // `door on w at 1000` measures from w's start, and w is `(W,0) (W,3000)`.
    expect(changed(r, "dw")).toMatchObject({
      change: "moved",
      detail: "moved 500 mm right",
      why: [
        { via: "host", name: "w", change: "moved 500 mm right" },
        { via: "param", name: "W", change: "3000 → 3500" },
      ],
    });
    expect(r.held.map((h) => h.name)).not.toContain("dw");
  });

  it("a genuine held element: a room whose read of W is absorbed by `min(W, 3000)`", () => {
    // c reads W, W went 3000 → 3500, and c did not change: min(3500, 3000) is still 3000. Its
    // dependency changed and it stayed, which is exactly the question `held` asks the author:
    // should c have followed a? (Here the clamp says no; a wall written to follow a room and
    // forgotten would say yes.)
    expect(r.held).toEqual([
      { name: "c", id: "c", kind: "room", because: [{ via: "param", name: "W", change: "3000 → 3500" }] },
    ]);
    expect(changed(r, "c")).toBeUndefined();
  });

  it("a door on an edge that did not move, of a room that did, is held", () => {
    // `door on a.left`: a grew to the right, its left edge stayed; the door depends on a and
    // on the derived ring, both changed, and it rightly stayed. Held is a question, not a fault.
    const s = plan(`  let W = 3000
  room id=a at (0,0) size W x 3000 label "A"
  room id=b right-of a align top gap 0 size 3000x3000 label "B"
  walls from rooms exterior 200 partition 100 { open between a and b }
  door id=e on a.left at 1500 from start width 900`);
    expect(setImpact(s, "W", "3500").held).toEqual([
      {
        name: "e",
        id: "e",
        kind: "door",
        because: [
          { via: "on", name: "a", change: "resized" },
          { via: "host", name: "the exterior wall derived from the rooms", change: "resized" },
        ],
      },
    ]);
  });

  it("a relabel does not make a dependant held", () => {
    const a = plan(`  room id=a at (0,0) size 3000x3000 label "A"
  room id=b right-of a align top gap 0 size 3000x3000 label "B"`);
    const r2 = impact(a, a.replace('label "A"', 'label "Alpha"'));
    expect(r2.changed.map((c) => `${c.name} ${c.change} ${c.root}`)).toEqual(["a relabeled edited"]);
    expect(r2.held).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------
// --set refusals, and a side that does not resolve

suite("PS4.2 — `--set` refuses with E_SET_OVERRIDE", () => {
  const src = plan(`  let W = 3000
  let f(n) = n * 2
  let R = 1
  R = 2
  component c(Q) { let INNER = 1 room at (0,0) size Q x 1000 }
  room id=a at (0,0) size W x 3000`);
  const code = (name: string, value = "1") => {
    const o = applyLetOverride(src, name, value);
    return o.ok ? "ok" : o.diagnostics.map((d) => d.code).join(",");
  };

  it("the catalog example is executed and raises its code", () => {
    const example = ERROR_CATALOG.E_SET_OVERRIDE!.example;
    const o = applyLetOverride(plan(example), "D", "4500");
    expect(o.ok).toBe(false);
    if (!o.ok) {
      expect(o.diagnostics.map((d) => d.code)).toEqual(["E_SET_OVERRIDE"]);
      expect(o.diagnostics[0]!.message).toBe('`--set D=…`: "D" is not a top-level `let` of this plan');
    }
  });

  it("NAME absent (with a did-you-mean), a value-function, reassigned, or inside a component", () => {
    const o = applyLetOverride(src, "WW", "1");
    expect(o.ok ? [] : o.diagnostics[0]!.hints).toEqual(['Did you mean "W"?', "The top-level lets are: R, W, f."]);
    expect(code("f")).toBe("E_SET_OVERRIDE");
    expect(code("R")).toBe("E_SET_OVERRIDE");
    expect(code("INNER")).toBe("E_SET_OVERRIDE");
    expect(code("Q")).toBe("E_SET_OVERRIDE");
    expect(code("W")).toBe("ok");
  });

  it("a value that is not one numeric literal", () => {
    expect(code("W", "W*2")).toBe("E_SET_OVERRIDE");
    expect(code("W", "abc")).toBe("E_SET_OVERRIDE");
    expect(code("W", "1 2")).toBe("E_SET_OVERRIDE");
    for (const v of ["4500", "4.5m", "450cm", "-200"]) expect(code("W", v)).toBe("ok");
  });

  it("replaces only the expression text, unit as written", () => {
    const o = applyLetOverride(src, "W", "3.5m");
    expect(o.ok && o.source).toBe(src.replace("let W = 3000", "let W = 3.5m"));
  });

  it("a side that does not resolve: nothing compared, its errors under broke", () => {
    const good = plan("  room id=a at (0,0) size 3000x3000");
    const bad = plan("  room id=a at (0,0) size 0x3000");
    const r = impact(good, bad);
    expect(r.ok).toBe(false);
    expect(r.changed).toEqual([]);
    // An unresolved side has no elements to key by, so its errors carry no element.
    expect(r.diagnostics.broke.map((d) => [d.code, d.element, d.channel])).toEqual([
      ["E_ROOM_SIZE", undefined, "compile"],
    ]);
    expect(r.summary[0]).toMatch(/^Not compared/);
  });

  it("is deterministic: the same inputs give the same bytes", () => {
    const a = read(`${REPRO}/widen-before.arch`);
    const b = read(`${REPRO}/widen-after.arch`);
    expect(JSON.stringify(impact(a, b))).toBe(JSON.stringify(impact(a, b)));
  });
});

// ---------------------------------------------------------------------------------------
// The CLI

function run(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
    encoding: "utf8",
    cwd: process.cwd(),
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

suite("PS4.2 — `arch impact`", () => {
  const before = `${REPRO}/widen-before.arch`;

  it("--set prints the drill report and exits 0", () => {
    const r = run(["impact", before, "--set", "AW=4500"]);
    expect(r.status).toBe(0);
    const lines = r.stdout.trimEnd().split("\n");
    expect(lines[0]).toBe("AW: 4000 → 4500");
    expect(lines.slice(1)).toEqual(impact(read(before), read(`${REPRO}/widen-after.arch`)).summary);
  });

  it("--json carries the set and the whole report; --against gives the same sections", () => {
    const j = JSON.parse(run(["impact", before, "--set", "AW=4500", "--json"]).stdout);
    expect(j.ok).toBe(true);
    expect(j.set).toEqual({ name: "AW", before: "4000", after: "4500" });
    const dir = mkdtempSync(join(tmpdir(), "arch-impact-"));
    const old = join(dir, "old.arch");
    writeFileSync(old, read(before), "utf8");
    const k = JSON.parse(run(["impact", `${REPRO}/widen-after.arch`, "--against", old, "--json"]).stdout);
    expect(k.set).toBeUndefined();
    const { set: _set, ...rest } = j;
    expect(k).toEqual(rest);
  });

  it("a refused --set exits 2 with E_SET_OVERRIDE; usage errors exit 3", () => {
    const r = run(["impact", before, "--set", "NOPE=1", "--json"]);
    expect(r.status).toBe(2);
    expect(JSON.parse(r.stdout).diagnostics[0].code).toBe("E_SET_OVERRIDE");
    expect(run(["impact", before]).status).toBe(3);
    expect(run(["impact", before, "--set", "AW=1", "--against", before]).status).toBe(3);
    expect(run(["impact", before, "--set", "AW"]).status).toBe(3);
  });

  it("--against resolves each file's imports against its own directory (red team N4)", () => {
    // old.arch sits in another directory and imports a sibling module that exists only there.
    // Resolved against the new file's directory it would fail to import, and nothing would be
    // compared; resolved against its own, both sides resolve.
    const lib = `plan "lib" {\n  units mm\n  component bed(x, y) {\n    furniture bed at (x, y) size 1500x2000\n  }\n}\n`;
    const body = (bedX: number) =>
      `plan "t" {\n  units mm\n  import "lib.arch": bed\n  wall id=s exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }\n  room id=r at (0,0) size 4000x4000 label "Bed"\n  door on s at 500 width 900\n  bed(${bedX}, 300)\n}\n`;
    const oldDir = mkdtempSync(join(tmpdir(), "arch-impact-old-"));
    const newDir = mkdtempSync(join(tmpdir(), "arch-impact-new-"));
    writeFileSync(join(oldDir, "lib.arch"), lib, "utf8");
    writeFileSync(join(newDir, "lib.arch"), lib.replace("1500x2000", "1600x2000"), "utf8");
    writeFileSync(join(oldDir, "old.arch"), body(300), "utf8");
    writeFileSync(join(newDir, "new.arch"), body(300), "utf8");
    const j = JSON.parse(
      run(["impact", join(newDir, "new.arch"), "--against", join(oldDir, "old.arch"), "--json"]).stdout,
    );
    expect(j.ok).toBe(true);
    // The only difference is the sibling module each file imports: the bed is 100 mm wider.
    expect(j.changed.map((c: { kind: string; change: string }) => `${c.kind} ${c.change}`)).toEqual([
      "furniture resized",
    ]);
  });
});

// ---------------------------------------------------------------------------------------
// Red team round 1, B1: a door's width is not its host wall's geometry

suite("PS4.2 — a wider door does not change its wall (red team B1)", () => {
  const src = read("examples/parametric.arch");

  it("`--set DOOR=1100`: the three doors widen because they read DOOR; no wall changes, nothing held", () => {
    // Each `door … width DOOR wall exterior` reads DOOR directly. The wall it stands in keeps its
    // points, arcs and thickness (its cut list is the door's business, not the wall's), so no
    // wall is changed, and the windows on those walls depend on nothing that changed.
    const r = setImpact(src, "DOOR", "1100");
    expect(r.summary).toEqual([
      "Lets (1):",
      "  DOOR: 900 → 1100",
      "Changed (3):",
      "  door door_1 width 900 mm → 1100 mm",
      "    why: reads DOOR (900 → 1100)",
      "  door door_2 width 900 mm → 1100 mm",
      "    why: reads DOOR (900 → 1100)",
      "  door door_3 width 900 mm → 1100 mm",
      "    why: reads DOOR (900 → 1100)",
      "Held (0): none",
      "Broke (0): none",
      "Healed (0): none",
      "Unchanged diagnostics: 0",
    ]);
  });

  it("`--set WIN=1800`: the windows widen; no door is held", () => {
    const r = setImpact(src, "WIN", "1800");
    expect(r.changed.map((c) => `${c.name} ${c.change} ${c.why.map((s) => s.name).join(">")} ${c.root}`)).toEqual([
      "window_1 resized WIN let",
      "window_2 resized WIN let",
      "window_3 resized WIN let",
    ]);
    expect(r.held).toEqual([]);
  });

  it("the chain prefers an edge that reaches a root over an earlier one that dead-ends", () => {
    // b is `right-of u.r` (on, first in order) and reads W (param). The edit is made with
    // `--against` so that u.r moves while its own statement and its place's `at` are
    // unchanged: the place `at (X, 0)` reads X, and X is the only edited `let`. Read through
    // the place, u.r's chain reaches X; b's first edge (on u.r) reaches it too. To make the
    // first edge dead-end, the place is edited to a literal, which no `let` explains, and u.r
    // has no statement of its own that changed: its chain ends `unexplained`, so b must take
    // its second edge, `reads W`.
    const src = plan(`  let W = 3000
  component unit() {
    room id=r at (0,0) size 3000x3000 label "R"
  }
  place unit() as u at (0, 0)
  room id=b right-of u.r align top gap 0 size W x 3000 label "B"`);
    const after = src.replace("at (0, 0)", "at (500, 0)").replace("let W = 3000", "let W = 3500");
    const r = impact(src, after);
    expect(changed(r, "u.r")).toMatchObject({ change: "moved", why: [], root: "unexplained" });
    expect(changed(r, "b")).toMatchObject({
      why: [{ via: "param", name: "W", change: "3000 → 3500" }],
      root: "let",
    });
  });

  it("an instance's elements follow its `place … at` (red team N1)", () => {
    const src = plan(`  let X = 0
  component unit() {
    room id=r at (0,0) size 3000x3000 label "R"
  }
  place unit() as u at (X, 0)`);
    expect(changed(setImpact(src, "X", "500"), "u.r")).toMatchObject({
      change: "moved",
      why: [{ via: "param", name: "X", change: "0 → 500" }],
      root: "let",
    });
  });

  it("a `place` argument reaches only the elements that read its parameter (red team B2)", () => {
    // terrace-row.arch: `place unit(W1, DEPTH, 1) as u1 …`, four times. DEPTH is the `d`
    // argument. Inside `unit`, the shell, the front door, the living-side windows and `FRONT`
    // (`d - BACK - HALLD`, read by the living room) read `d`; `room id=bed at (0,0) size BEDW x
    // BACK` reads only BEDW (`w - BATHW`) and BACK (4000), neither of which reads d, so the bed
    // room does not depend on DEPTH and must not be held by it.
    const r = setImpact(read("examples/terrace-row.arch"), "DEPTH", "9900");
    expect(r.held).toHaveLength(30);
    expect(r.held.map((h) => h.name)).not.toContain("u1.bed");
    expect(changed(r, "u1.bed")).toBeUndefined();
    expect(r.changed.filter((c) => c.root === "unexplained")).toEqual([]);
  });

  it("two instances of one component: an argument reaches only its own instance (red team B2)", () => {
    // p's `w` is A, q's is B. Setting A moves p.r and leaves q.r alone: q.r reads `w`, but its
    // `w` is B, which did not change, so it is neither changed nor held.
    const src = plan(`  let A = 3000
  let B = 3000
  component unit(w) {
    room id=r at (0,0) size w x 3000 label "R"
  }
  place unit(A) as p at (0, 0)
  place unit(B) as q at (10000, 0)`);
    const r = setImpact(src, "A", "3500");
    expect(changed(r, "p.r")).toMatchObject({
      change: "resized",
      why: [{ via: "param", name: "A", change: "3000 → 3500" }],
      root: "let",
    });
    expect(changed(r, "q.r")).toBeUndefined();
    expect(r.held).toEqual([]);
  });

  it("a loop-local `let` reading the changed one explains what reads it (red team N1)", () => {
    // parametric.arch: `for i in 0..COUNT { let x = i * W … furniture bed at (x + 300, 300) … }`.
    const r = setImpact(read("examples/parametric.arch"), "W", "4500");
    expect(changed(r, "bed_3")).toMatchObject({
      change: "moved",
      why: [
        { via: "param", name: "x", change: "reads W" },
        { via: "param", name: "W", change: "4000 → 4500" },
      ],
      root: "let",
    });
    expect(r.changed.filter((c) => c.root === "unexplained")).toEqual([]);
  });
});
