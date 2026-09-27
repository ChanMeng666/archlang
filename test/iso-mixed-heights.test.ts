/**
 * **The view never throws on a wall set its openings consume.**
 *
 * `extrude.ts` joins the walls of one storey per resolved height and extrudes each joined
 * outline. When openings consume EVERY wall of a height subset, `joinWallSet` returns an
 * empty outline — the plan view's `lowerWallSet` already draws nothing for it — and the
 * extruder used to emit a top cap carrying zero loops. `paint.ts`'s `boundaryDepth` then read
 * `face.loops[0]` and `compile(src, { view })` threw `TypeError: ring is not iterable` on
 * valid source.
 *
 * Mixed heights are how a plan reaches it most easily (a short partition becomes a subset of
 * its own), but they are not the cause: the smallest trigger is ONE wall and ONE opening
 * wider than it, with no `height` clause anywhere. So this file pins both, plus the mixed
 * height joints the defect was first reported on, plus a generated property over a local
 * mixed-height arbitrary.
 */

import fc from "fast-check";
import { describe as suite, expect, it } from "vitest";
import { compile } from "../src/index.js";
import { resolveAll } from "../src/ir.js";
import { parse } from "../src/parser.js";
import { BUILTIN_REGISTRY } from "../src/registry.js";
import { type Face, facesOf } from "../src/view/extrude.js";

const VIEWS = ["iso", "axon"] as const;

/** Every face of a (single-file) plan, straight from the extruder. */
function faces(src: string): Face[] {
  const r = resolveAll(parse(src).plan!, BUILTIN_REGISTRY);
  const plans = r.levels.length > 0 ? r.levels.map((l) => l.ir) : [r.ir];
  return facesOf(plans.map((ir, index) => ({ ir, index })));
}

/** Compiles under both presets, twice each, and returns the first SVG of each preset. */
function renderBoth(src: string): Record<(typeof VIEWS)[number], string> {
  const out = {} as Record<(typeof VIEWS)[number], string>;
  for (const view of VIEWS) {
    const a = compile(src, { view, noCache: true });
    const b = compile(src, { view, noCache: true });
    expect(
      a.diagnostics.filter((d) => d.severity === "error"),
      view,
    ).toEqual([]);
    expect(b.svg, `${view} is deterministic`).toBe(a.svg);
    expect(a.svg.startsWith("<svg"), view).toBe(true);
    out[view] = a.svg;
  }
  return out;
}

/** The extruder's contract, which the painter relies on: a boundary with a real ring. */
function expectWellFormed(fs: readonly Face[]): void {
  for (const f of fs) {
    expect(f.loops.length, f.elementId).toBeGreaterThan(0);
    for (const l of f.loops) expect(l.length, f.elementId).toBeGreaterThanOrEqual(3);
  }
}

/** The z values every face of one element id touches. */
function zsOf(fs: readonly Face[], id: string): Set<number> {
  const zs = new Set<number>();
  for (const f of fs) if (f.elementId === id) for (const l of f.loops) for (const p of l) zs.add(p.z);
  return zs;
}

const bandIds = (fs: readonly Face[]): string[] =>
  [...new Set(fs.map((f) => f.elementId).filter((id) => id.includes(":walls@")))].sort();

suite("a wall set its openings consume (the throw)", () => {
  // No `height` anywhere: the defect is not a mixed-height one.
  const ONE_WALL = `plan "t" {
  wall id=w partition thickness 80 { (0,0) (1000,0) }
  opening on w at center width 1200
}
`;

  const MIXED_SHELL = `  wall id=w_shell exterior thickness 150 height 2400 { (0,0) (2300,0) (2300,7400) (0,7400) close }\n`;
  // The partition resolves to the default 3000 — its own subset — and two cased openings
  // cover all of it, overlapping in the middle and overhanging both ends.
  const MIXED = `plan "t" {
${MIXED_SHELL}  wall id=w_h1 partition thickness 80 { (0,4000) (2300,4000) }
  opening on w_h1 at 25% width 1300
  opening on w_h1 at 75% width 1300
}
`;
  const SHELL_ONLY = `plan "t" {\n${MIXED_SHELL}}\n`;

  // The fuzz counterexample (seeded `archPlan` with an injected shell height), shrunk by
  // line deletion to the lines it still threw on. A door, a window and a cased opening.
  const FOUND = `plan "Unit A" {
  wall id=w_h1 partition thickness 80 { (0,4000) (2300,4000) }
  door id=o0 barn on w_h1 at 44% width 1100 swing in slide right open 0
  opening id=o1 on w_h1 at 95% width 1400
  window id=o3 on w_h1 at 18% width 1000
}
`;

  it("one wall, one opening wider than it, no height clause: compiles, and draws no wall", () => {
    const fs = faces(ONE_WALL);
    expect(fs).toEqual([]);
    renderBoth(ONE_WALL);
  });

  it("a mixed-height partition consumed by its openings draws exactly the shell", () => {
    const fs = faces(MIXED);
    expectWellFormed(fs);
    // Only the 2400 shell stands; the consumed 3000 subset contributes no face at all.
    expect(bandIds(fs)).toEqual(["L0:walls@2400"]);
    const got = renderBoth(MIXED);
    const shell = renderBoth(SHELL_ONLY);
    // A cased opening runs its host's full height, so nothing is filled back: the drawing
    // is the shell's own, byte for byte.
    expect(got.iso).toBe(shell.iso);
    expect(got.axon).toBe(shell.axon);
  });

  it("a consumed wall still gets the blocks above and below its openings", () => {
    const fs = faces(FOUND);
    expectWellFormed(fs);
    // The consumed outline is gone ...
    expect(bandIds(fs)).toEqual([]);
    // ... but the wall above the door (head 2100 → 3000), below and above the window
    // (0 → 900, 2100 → 3000) and the glazing between still stand; the cased opening runs
    // the full 3000 and puts nothing back. Four rectangular blocks, each 4 sides + a cap.
    const ids = [...new Set(fs.map((f) => f.elementId))].sort();
    expect(ids).toEqual(["L0:w_h1#0h", "L0:w_h1#2g", "L0:w_h1#2h", "L0:w_h1#2s"]);
    expect(fs.length).toBe(4 * 5);
    expect([...zsOf(fs, "L0:w_h1#0h")].sort((a, b) => a - b)).toEqual([2100, 3000]);
    expect([...zsOf(fs, "L0:w_h1#2s")].sort((a, b) => a - b)).toEqual([0, 900]);
    expect([...zsOf(fs, "L0:w_h1#2g")].sort((a, b) => a - b)).toEqual([900, 2100]);
    renderBoth(FOUND);
  });
});

suite("mixed wall heights: every band is drawn, at its own height", () => {
  const CASES: { name: string; src: string; bands: Record<string, number> }[] = [
    {
      // The plan the defect was first reported on (it does not throw: nothing consumes a wall).
      name: "T-joint, partition lower than the shell",
      src: `plan "t" {
  wall id=w_shell exterior thickness 100 height 4200 { (0,0) (2300,0) (2300,5700) (0,5700) close }
  wall id=w_h1 partition thickness 80 { (0,3700) (2300,3700) }
  room at (0,0) size 2300x3700
}
`,
      bands: { "L0:walls@3000": 3000, "L0:walls@4200": 4200 },
    },
    {
      name: "T-joint, partition TALLER than the shell",
      src: `plan "t" {
  wall id=w_shell exterior thickness 100 height 2400 { (0,0) (2300,0) (2300,5700) (0,5700) close }
  wall id=w_h1 partition thickness 80 height 5000 { (0,3700) (2300,3700) }
}
`,
      bands: { "L0:walls@2400": 2400, "L0:walls@5000": 5000 },
    },
    {
      name: "two free walls",
      src: `plan "t" {
  wall id=a partition thickness 100 height 2400 { (0,0) (3000,0) }
  wall id=b partition thickness 100 height 3600 { (0,2000) (3000,2000) }
}
`,
      bands: { "L0:walls@2400": 2400, "L0:walls@3600": 3600 },
    },
    {
      name: "L-joint",
      src: `plan "t" {
  wall id=a exterior thickness 200 height 2700 { (0,0) (4000,0) }
  wall id=b exterior thickness 200 height 4500 { (4000,0) (4000,3000) }
}
`,
      bands: { "L0:walls@2700": 2700, "L0:walls@4500": 4500 },
    },
    {
      name: "three heights, with openings on each",
      src: `plan "t" {
  wall id=w_shell exterior thickness 200 height 4200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  wall id=w_v partition thickness 100 height 2400 { (3000,0) (3000,4000) }
  wall id=w_h partition thickness 100 { (0,2000) (3000,2000) }
  window on w_shell at 10% width 1200
  door on w_v at 50% width 900
  door on w_h at 50% width 800
}
`,
      bands: { "L0:walls@2400": 2400, "L0:walls@3000": 3000, "L0:walls@4200": 4200 },
    },
  ];

  for (const c of CASES) {
    it(c.name, () => {
      const fs = faces(c.src);
      expectWellFormed(fs);
      expect(bandIds(fs)).toEqual(Object.keys(c.bands).sort());
      // Each band runs from the floor to its own height, the taller one's upper part
      // included — nothing is clipped to the lower wall.
      for (const [id, h] of Object.entries(c.bands)) {
        expect(
          [...zsOf(fs, id)].sort((a, b) => a - b),
          id,
        ).toEqual([0, h]);
      }
      renderBoth(c.src);
    });
  }
});

// ---------------------------------------------------------------------------
// The generated property. A LOCAL arbitrary on purpose: `test/arbitrary-plan.ts` gets its
// wall-height option back separately; this one only has to reach the configurations that
// threw — a closed shell and up to three partitions, each at its own height or none, each
// with up to three openings whose widths may exceed the wall.
// ---------------------------------------------------------------------------

const HEIGHT = fc.constantFrom<number | undefined>(undefined, 2400, 3000, 3600, 4200, 5000);
const OPENING = fc.record({
  kind: fc.constantFrom("opening", "door", "window"),
  at: fc.integer({ min: 0, max: 100 }),
  width: fc.integer({ min: 300, max: 3000 }),
});
const PARTITION = fc.record({
  axis: fc.constantFrom("v", "h"),
  /** Position across the shell, % of its extent. */
  at: fc.integer({ min: 10, max: 90 }),
  /** Full span (a T at both ends), or a stub from one side (a T and a free end). */
  stub: fc.boolean(),
  length: fc.integer({ min: 400, max: 3000 }),
  height: HEIGHT,
  openings: fc.array(OPENING, { maxLength: 3 }),
});
const MIXED_PLAN = fc
  .record({
    w: fc.integer({ min: 2000, max: 8000 }),
    d: fc.integer({ min: 2000, max: 8000 }),
    shellHeight: HEIGHT,
    shellOpenings: fc.array(OPENING, { maxLength: 2 }),
    partitions: fc.array(PARTITION, { minLength: 1, maxLength: 3 }),
  })
  .map(({ w, d, shellHeight, shellOpenings, partitions }) => {
    const hc = (h: number | undefined) => (h === undefined ? "" : ` height ${h}`);
    const ops = (id: string, list: readonly { kind: string; at: number; width: number }[]) =>
      list.map((o) => `  ${o.kind} on ${id} at ${o.at}% width ${o.width}\n`).join("");
    let s = `plan "fuzz" {\n  wall id=w_shell exterior thickness 150${hc(shellHeight)} { (0,0) (${w},0) (${w},${d}) (0,${d}) close }\n`;
    s += ops("w_shell", shellOpenings);
    partitions.forEach((p, i) => {
      const id = `w_p${i}`;
      const span = p.axis === "v" ? d : w;
      const end = p.stub ? Math.min(span, p.length) : span;
      const c = Math.round(((p.axis === "v" ? w : d) * p.at) / 100);
      const pts = p.axis === "v" ? `(${c},0) (${c},${end})` : `(0,${c}) (${end},${c})`;
      s += `  wall id=${id} partition thickness 80${hc(p.height)} { ${pts} }\n`;
      s += ops(id, p.openings);
    });
    return `${s}}\n`;
  });

suite("mixed wall heights — generated", () => {
  it("200 generated mixed-height plans compile under iso and axon, never throw, same bytes twice", () => {
    let clean = 0;
    fc.assert(
      fc.property(MIXED_PLAN, (src) => {
        for (const view of VIEWS) {
          const a = compile(src, { view, noCache: true });
          const b = compile(src, { view, noCache: true });
          expect(b.svg).toBe(a.svg);
        }
        if (compile(src, { noCache: true }).errors.length === 0) {
          clean++;
          expectWellFormed(faces(src));
        }
      }),
      { numRuns: 200 },
    );
    // The property is over drawings, not over refusals.
    expect(clean).toBeGreaterThan(150);
  });
});
