import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compile, describe as describePlan, lint } from "../src/index.js";

/**
 * `overlays: ["circulation"]` — the opt-in circulation render overlay (ADR 0008).
 *
 * The contract mirrors `annotate` (ADR 0007): the option OFF leaves the Scene IR and
 * SVG byte-identical (also guarded by the golden snapshots, which compile without it),
 * and it never affects the facts (`describe`) or lint. ON it appends the walk paths,
 * bottleneck markers and routes on the `annotations` layer, deterministically.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const example = (name: string) => readFileSync(join(__dirname, "..", "examples", name), "utf8");
const STUDIO = example("studio.arch"); // entrance + rooms → a drawable overlay
// A door-free room, inline rather than a shipped example: `two-bed.arch` used to have no
// exterior entrance and served this fixture, but the gallery refresh repaired its
// topology and gave it a real front door — so it now HAS a drawable overlay and can no
// longer stand in for "no modeled entrance". A minimal inline plan makes the fixture's
// own claim self-evident and immune to any future example edit.
const NO_ENTRANCE = `plan "No Entrance" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
  room id=r1 at (0,0) size 4000x3000 label "Room" uses living
}
`;

describe("circulation overlay (opt-in render)", () => {
  it("leaves default output byte-identical (off, empty, and no cross-contamination)", () => {
    for (const src of [STUDIO, NO_ENTRANCE]) {
      const plain = compile(src, { noCache: true }).svg;
      // Compiling WITH the overlay must not perturb a later default compile.
      compile(src, { noCache: true, overlays: ["circulation"] });
      expect(compile(src, { noCache: true }).svg).toBe(plain);
      // An empty overlay list is exactly the default.
      expect(compile(src, { noCache: true, overlays: [] }).svg).toBe(plain);
    }
  });

  it("appends the overlay when on (studio) and is deterministic", () => {
    const off = compile(STUDIO, { noCache: true }).svg;
    const on1 = compile(STUDIO, { noCache: true, overlays: ["circulation"] }).svg;
    const on2 = compile(STUDIO, { noCache: true, overlays: ["circulation"] }).svg;
    expect(on1).toBe(on2); // deterministic
    expect(on1).not.toBe(off); // the overlay is drawn
    expect(on1.length).toBeGreaterThan(off.length);
    // A bottleneck marker (a diamond filled with the annotation colour) is present
    // only with the overlay on, and the clear-width labels match the facts.
    const markers = (on1.match(/<polygon[^>]*fill="#333333"[^>]*stroke="none"/g) || []).length;
    expect(markers).toBe(describePlan(STUDIO).circulation?.rooms.length);
    expect(markers).toBeGreaterThan(0);
    expect((off.match(/<polygon[^>]*fill="#333333"[^>]*stroke="none"/g) || []).length).toBe(0);
  });

  it("does nothing when the plan has no modeled entrance", () => {
    // no door at all → no exterior entrance → circulation is null → the overlay is empty.
    expect(compile(NO_ENTRANCE, { noCache: true, overlays: ["circulation"] }).svg).toBe(
      compile(NO_ENTRANCE, { noCache: true }).svg,
    );
  });

  it("does not change describe() or lint()", () => {
    // The overlay is a compile-only option; the facts and lint never read it.
    const before = { d: describePlan(STUDIO), l: lint(STUDIO).map((x) => x.code) };
    compile(STUDIO, { noCache: true, overlays: ["circulation"] });
    expect(describePlan(STUDIO)).toEqual(before.d);
    expect(lint(STUDIO).map((x) => x.code)).toEqual(before.l);
  });
});

describe("circulation overlay — drawn on the grid the facts were measured on (backlog C.2)", () => {
  /** One room entered from its west wall, with (or without) a floor void across the way in. */
  const WELL = (withVoid: boolean) => `plan "Well" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,4000) (0,4000) close }
  room id=r at (0,0) size 8000x4000 label "Hall" uses living
  door id=d at (0,2000) width 900 wall shell
${withVoid ? "  void id=well at (1500,1000) size 2000x2000\n" : ""}}
`;
  /** Total length of the overlay's room-walk polylines: the annotation-colour lines. */
  const drawnWalk = (src: string): number =>
    (compile(src, { noCache: true, overlays: ["circulation"] }).scene?.nodes ?? [])
      .filter((n) => n.layer === "annotations" && n.prim.t === "line" && n.paint.stroke === "#333333")
      .reduce(
        (sum, n) => (n.prim.t === "line" ? sum + Math.hypot(n.prim.b.x - n.prim.a.x, n.prim.b.y - n.prim.a.y) : sum),
        0,
      );
  const reported = (src: string): number =>
    (describePlan(src).circulation?.rooms ?? []).reduce((sum, r) => sum + r.walkDistanceMm, 0);

  it("the void moves the walk (so the case is not vacuous)", () => {
    expect(reported(WELL(true))).toBeGreaterThan(reported(WELL(false)));
  });

  it("the drawn walk is as long as the reported one, with and without the void", () => {
    for (const withVoid of [false, true]) {
      expect(drawnWalk(WELL(withVoid)), `void: ${withVoid}`).toBe(reported(WELL(withVoid)));
    }
  });
});
