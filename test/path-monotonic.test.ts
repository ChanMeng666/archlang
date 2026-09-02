import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describe as describePlan, lint } from "../src/index.js";
import { centreFreedomToClearWidth, DEFAULT_BODY_RADIUS_MM } from "../src/analyze/circulation.js";

/**
 * The circulation model's MONOTONICITY LAW, and the two defects it was written against
 * (`docs/backlog.md` 5.8).
 *
 * Deepening one obstacle can only ever make a walk worse. So over a sweep of an
 * obstacle's depth:
 *
 *   (i)  a room's reported clear width is NON-INCREASING, and
 *   (ii) a `W_PATH_TOO_NARROW` warning, once raised for a room, is raised at every
 *        greater depth — it never disappears.
 *
 * Both halves failed on the shipped compiler, in opposite directions. (ii) failed
 * loudest: past a certain depth the room was SEALED, so it had no `circulation.rooms[]`
 * entry, so the rule — whose domain was that array — went silent, and one cabinet took
 * `examples/furnished-flat.arch` from "squeezes to 300 mm" to CLEAN. (i) failed
 * quietly: the clearance distance transform was seeded on the body-radius-ERODED cells
 * while its formula assumed the obstacle footprints, so every furniture-derived width
 * came back one body diameter (600 mm) short — a 900 mm corridor read as 300 mm, "a
 * width nothing in that corridor actually has".
 *
 * This law is the honest gate because it fails for EITHER cause and cannot be greened by
 * tuning a number: no constant makes a disappearing warning reappear, and no constant
 * makes a non-monotone sequence monotone.
 */

/** Per room: the clear width the plan reports, with a sealed room reading a true 0 mm. */
type Widths = Map<string, number>;

/** `null` for a room that is neither measured nor reported blocked — which on a
 *  single-entrance plan is the silent omission this whole file exists to forbid. */
function widths(src: string): { widths: Widths; missing: string[] } {
  const s = describePlan(src);
  const c = s.circulation;
  const out: Widths = new Map();
  if (!c) return { widths: out, missing: [] };
  for (const r of c.rooms) out.set(r.roomId, r.bottleneckClearWidthMm);
  // A sealed room's "width" for the monotonicity law is the widest way in that exists —
  // measured, not asserted — so the law compares like with like across the seal boundary.
  for (const b of c.blocked ?? []) out.set(b.roomId, b.widestWayInMm);
  const missing = s.rooms.map((r) => r.id).filter((id) => !out.has(id));
  return { widths: out, missing };
}

const narrowWarnedRooms = (src: string): Set<string> => {
  const ids = new Set<string>();
  for (const d of lint(src)) {
    if (d.code === "W_PATH_TOO_NARROW") {
      // The message names the room by LABEL, so key on the label the summary reports.
      const m = /to "([^"]+)"/.exec(d.message);
      if (m?.[1] !== undefined) ids.add(m[1]);
    }
  }
  return ids;
};

/**
 * Assert the law over a sweep, and prove the sweep is not vacuous while doing it: it has
 * to actually cross from clean to warned, or a plan nothing ever flags would "pass".
 */
function assertMonotone(sources: string[], label: string): void {
  const perDepth = sources.map((s) => ({ ...widths(s), warned: narrowWarnedRooms(s) }));

  for (const [i, d] of perDepth.entries()) {
    expect(d.missing, `${label} step ${i}: rooms neither measured nor reported blocked`).toEqual([]);
  }

  // (i) every room's reported width is non-increasing as the obstacle deepens.
  for (let i = 1; i < perDepth.length; i++) {
    for (const [id, w] of perDepth[i]!.widths) {
      const prev = perDepth[i - 1]!.widths.get(id);
      if (prev === undefined) continue;
      expect(w, `${label}: "${id}" widened from ${prev} to ${w} as the obstacle grew`).toBeLessThanOrEqual(prev);
    }
  }

  // (ii) a warning, once raised, survives every deeper obstacle.
  for (let i = 1; i < perDepth.length; i++) {
    for (const id of perDepth[i - 1]!.warned) {
      expect(
        [...perDepth[i]!.warned],
        `${label}: "${id}" was warned at step ${i - 1} and is clean at step ${i}`,
      ).toContain(id);
    }
  }

  // Non-vacuity: some room must actually CROSS from clean to warned over the sweep, or
  // the two assertions above are satisfied by a plan nothing ever flags. (The starting
  // point need not be clean — `furnished-flat` carries a warning of its own before the
  // cabinet is added at all, which is its own finding, not this law's business.)
  const first = perDepth[0]!.warned;
  const last = perDepth[perDepth.length - 1]!.warned;
  const gained = [...last].filter((id) => !first.has(id));
  expect(gained, `${label}: no room ever crosses from clean to warned, so the sweep proves nothing`).not.toEqual([]);
}

/** The reported repro: one shoe cabinet in `examples/furnished-flat.arch`'s 1100 mm
 *  hall, swept over the exact depths `docs/backlog.md` 5.8 tabulates. */
const FLAT = readFileSync(new URL("../examples/furnished-flat.arch", import.meta.url), "utf8");
const flatWith = (depth: number): string =>
  FLAT.replace(
    "  title {",
    `  furniture shoe_cabinet against wall w_hall_n offset 3400 size 800x${depth} in r_hall\n\n  title {`,
  );

/**
 * The second, independently-written repro: an 8 x 3 m two-room plan whose cabinet hangs
 * from the north wall, sweeping its depth so the gap below it closes from 1500 mm to
 * 500 mm. It falsifies the backlog's claim that 5.8 "does not reproduce in a small
 * hand-written corridor", and it is a THIRD mechanism, not a second instance of the other
 * two — on `main` it reads 100, 840, 840, 840, 500, 100, which is erratic rather than a
 * constant offset.
 *
 * The cause is the threshold carve, not the clearance transform. The connector's centre
 * was carved FIRST and, if it happened to be walkable, nothing else was: a cabinet whose
 * 300 mm halo just misses the opening's midpoint therefore left a one-cell doorway pinned
 * at the cabinet's own corner, while a DEEPER cabinet — one whose halo covered the
 * midpoint — fell through to the fallback loop and opened the whole metre of threshold
 * still walkable beside it. The plan with more furniture measured wider. Which part of a
 * connector a route may use cannot depend on the phase of its midpoint.
 */
const NORTH_CABINET = (depth: number): string => `plan "probe" {
  wall id=shell exterior thickness 100 { (0,0) (8000,0) (8000,3000) (0,3000) close }
  wall id=mid partition thickness 100 { (4000,0) (4000,3000) }
  room id=r_a at (50,50) size 3900x2900 label "A"
  room id=r_b at (4050,50) size 3900x2900 label "B"
  door id=d_in on shell at 77% width 900
  opening id=o_mid on mid at 50% width 2400
  furniture cabinet at (600,50) size 3000x${depth} in r_a
}`;

describe("W_PATH_TOO_NARROW is monotone in an obstacle's depth", () => {
  it("holds over the backlog 5.8 repro — one cabinet in the flat's 1100 mm hall", () => {
    assertMonotone([200, 300, 400, 500, 600, 700].map(flatWith), "furnished-flat hall");
  });

  it("holds over the hand-written 8 x 3 m probe, whose cause is the threshold carve", () => {
    const depths = [1400, 1600, 1800, 2000, 2200, 2400];
    const read = (d: number): number | undefined =>
      describePlan(NORTH_CABINET(d)).circulation?.rooms.find((r) => r.roomId === "r_b")?.bottleneckClearWidthMm;
    const seq = depths.map(read);
    // Every room is measured at every depth: this plan never seals, so a `blocked`
    // entry here would be a different bug.
    for (const [i, v] of seq.entries()) expect(v, `depth ${depths[i]}`).toBeGreaterThan(0);
    for (let i = 1; i < seq.length; i++) {
      expect(seq[i]!, `depth ${depths[i]} widened over depth ${depths[i - 1]}`).toBeLessThanOrEqual(seq[i - 1]!);
    }
    // Non-vacuity: the sequence must actually DROP somewhere, or a constant would pass.
    expect(seq[seq.length - 1]!).toBeLessThan(seq[0]!);
    // And the first reading is no longer the corner pinch a one-cell doorway forced: at
    // 1500 mm of gap the walk is limited by the 900 mm entrance door, not by 700 mm of
    // squeeze past a cabinet it never has to go near.
    expect(seq[0]).toBe(840);
  });

  it("names the sealed rooms rather than dropping them (the false clean itself)", () => {
    // The reported table's own rows: at 200–450 mm the hall still passes a body, at
    // 500 mm and beyond the 600 mm that is left cannot, and the plan used to go CLEAN.
    const ids = (src: string): string[] => (describePlan(src).circulation?.blocked ?? []).map((b) => b.roomId);
    expect(ids(flatWith(200))).not.toContain("r_live");
    const sealed = ids(flatWith(500));
    expect(sealed).toContain("r_live");
    expect(sealed).toContain("r_bed1");
    const msgs = lint(flatWith(500))
      .filter((d) => d.code === "W_PATH_TOO_NARROW")
      .map((d) => d.message);
    // The message carries a MEASURED width, never a fabricated 0 — a real gap exists here
    // (the sofa/dining-table pair leave 500 mm), it is simply narrower than a body.
    expect(msgs.some((m) => /"Living \/ Dining" squeezes to [1-9]\d* mm and stops there/.test(m))).toBe(true);
    expect(msgs.some((m) => /"Bedroom 1" squeezes to [1-9]\d* mm and stops there/.test(m))).toBe(true);
  });
});

describe("the reported clear width is the width a body passes through", () => {
  /** Two cabinets facing each other across a room, leaving `gap` mm between them. The
   *  doors either side are wide on purpose, so the furniture is what binds. */
  const PINCH = (gap: number): string => `plan "Pinch" {
  units mm
  grid 100
  wall exterior thickness 200 { (0,0) (8000,0) (8000,4000) (0,4000) close }
  wall partition thickness 100 { (4000,0) (4000,4000) }
  room id=a at (0,0)    size 4000x4000 label "Living" uses living
  room id=b at (4000,0) size 4000x4000 label "Kitchen" uses kitchen
  door id=entry at (0,2000) width 2000 wall exterior hinge left swing in
  opening id=gap at (4000,2000) width 2000 wall partition
  furniture cabinet at (3600,300) size 700x1200 label "c1"
  furniture cabinet at (3600,${1500 + gap}) size 700x1200 label "c2"
}`;
  const readB = (gap: number): number | undefined =>
    describePlan(PINCH(gap)).circulation?.rooms.find((r) => r.roomId === "b")?.bottleneckClearWidthMm;

  it("reports a pinch within ONE CELL of the real gap, not one body diameter short", () => {
    // The defect this pins: the transform is seeded on the eroded cells (footprint ⊕ the
    // 300 mm body radius), so the hop count is a body CENTRE's freedom. Read as a width
    // it was short by the whole body — 2 × 300 mm — on every plan ArchLang has measured.
    for (const gap of [900, 1000, 1200]) {
      const got = readB(gap)!;
      // Strictly better than the old reading, which was exactly `gap − 2·bodyRadius`…
      expect(got, `a ${gap} mm gap`).toBeGreaterThan(gap - 2 * DEFAULT_BODY_RADIUS_MM);
      // …and within the grid's own quantum of the truth: one cell of slack on the
      // generous side, two on the conservative one, because the free band is measured at
      // cell CENTRES and the (2·hops − 1) run loses a cell on an even count.
      expect(got, `a ${gap} mm gap`).toBeGreaterThanOrEqual(gap - 200);
      expect(got, `a ${gap} mm gap`).toBeLessThanOrEqual(gap + 100);
    }
  });

  it("is non-increasing as the gap closes, and seals rather than reporting a fiction", () => {
    const seq = [1200, 1000, 900, 800].map((g) => readB(g)!);
    for (let i = 1; i < seq.length; i++) expect(seq[i]!).toBeLessThanOrEqual(seq[i - 1]!);
    // Below the body's own width there is no passage at all — the model says so rather
    // than inventing a bottleneck, and the room is named in `blocked` — with the width of
    // the way in that DOES exist measured rather than printed as a zero.
    const sealed = describePlan(PINCH(500)).circulation?.blocked;
    expect(sealed?.map((b) => b.roomId)).toEqual(["b"]);
    expect(sealed?.[0]?.widestWayInMm).toBeGreaterThan(0);
    expect(sealed?.[0]?.widestWayInMm).toBeLessThan(2 * DEFAULT_BODY_RADIUS_MM);
  });

  it("centreFreedomToClearWidth is the closed form, and adds exactly one body diameter", () => {
    for (const hops of [1, 2, 3, 7]) {
      expect(centreFreedomToClearWidth(hops, 100, 300)).toBe((2 * hops - 1) * 100 + 600);
      expect(centreFreedomToClearWidth(hops, 100, 0)).toBe((2 * hops - 1) * 100);
    }
    // Monotone in the hop count, which is what makes (i) above provable rather than lucky.
    expect(centreFreedomToClearWidth(2, 155, 300)).toBeGreaterThan(centreFreedomToClearWidth(1, 155, 300));
  });
});

describe("a blocked room is a claim about FURNITURE, and is proved differentially", () => {
  it("stays silent when the nav grid cannot route a plan for reasons that are not furniture", () => {
    // hexagon-pavilion is six galleries round a 1200 mm-thick curved drum whose openings
    // mostly touch three rooms at once and so never become carved thresholds at all. Three
    // of its galleries are unreachable ON THE GRID with no furniture anywhere near them;
    // reporting those as sealed rooms would hand the reader a fiction. The furniture-free
    // control is what tells the two apart.
    const src = readFileSync(new URL("../examples/hexagon-pavilion.arch", import.meta.url), "utf8");
    expect(describePlan(src).circulation?.blocked).toBeUndefined();
    expect(lint(src).map((d) => d.code)).not.toContain("W_PATH_TOO_NARROW");
  });

  it("stays silent for a dwelling reached through its OWN front door, not the first one", () => {
    // Four houses on one sheet. The walk is measured from `entrances[0]`, so three of them
    // are unreachable from it by construction — an ordinary fact about a terrace, and not
    // furniture sealing twelve rooms.
    const src = readFileSync(new URL("../examples/terrace-row.arch", import.meta.url), "utf8");
    expect(describePlan(src).circulation?.blocked).toBeUndefined();
    expect(lint(src).map((d) => d.code)).not.toContain("W_PATH_TOO_NARROW");
  });
});

describe("a room whose label point is pocketed still gets its facts", () => {
  it("measures furnished-flat's bath, which used to vanish from the summary", () => {
    // The room's representative cell was "the free cell nearest the label point", chosen
    // with no regard to whether it could be reached: the bath's own label point sits in a
    // gap between its fixtures that the entrance cannot get to, so the whole room fell out
    // of `circulation.rooms` — and out of the bedroom→bath routes with it.
    const c = describePlan(FLAT).circulation;
    expect(c?.rooms.map((r) => r.roomId)).toContain("r_bath");
    expect(c?.routes.map((r) => `${r.fromRoomId}->${r.toRoomId}`)).toContain("r_bed2->r_bath");
  });
});
