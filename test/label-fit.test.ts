/**
 * A room's label that does not fit shrinks (`fitLabels`, `src/label-fit.ts`).
 *
 * THE ORACLE for "nothing else moves" is the pass switched off (`vi.mock`, {@link state}): every
 * corpus plan is drawn both ways, so what the pass did is the difference, and a label that fits
 * has none. Everything else reads the Scene the compiler draws, never a position worked out here.
 */

import { walkFiles as walk } from "./helpers/corpus.js";
import { worldFor } from "./helpers/world.js";
import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve as resolvePath, sep } from "node:path";
import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { resolvePlan } from "../src/analyze.js";
import { toDxf } from "../src/export/dxf.js";
import { clearCache, compile, lint } from "../src/index.js";
import type { ResolvedPlan, RRoom } from "../src/ir.js";
import { fitWork, labelHeights, MAX_FIT_WORK } from "../src/label-fit.js";
import { COLLIDE_MIN } from "../src/label-placement.js";
import { extractArchBlocks } from "../src/markdown.js";
import type { RenderSizes, ScenePrim } from "../src/scene.js";
import { toScene } from "../src/scene-build.js";
import { SHEET_MM } from "../src/sheet.js";
import { inkExtent, textExtent } from "../src/text-layout.js";
import type { World } from "../src/world.js";
import { NULL_WORLD } from "../src/world.js";
import { runs } from "./setup/fast-check.js";
import { OPENINGS_BETWEEN_PLANS } from "./tables/openings-between-plans.js";

const { state } = vi.hoisted(() => ({ state: { off: false } }));

vi.mock("../src/label-fit.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/label-fit.js")>();
  return {
    ...real,
    // Off, it spends none of the count; on, the work it spent, which the pass after it reads.
    fitLabels: (...args: Parameters<typeof real.fitLabels>): number => (state.off ? 0 : real.fitLabels(...args)),
  };
});

type Text = Extract<ScenePrim, { t: "text" }>;

const OVERLAP = "W_ANNOTATION_OVERLAP";
const ROOT = resolvePath(__dirname, "..");
const of = (src: string, world?: World) => lint(src, world ? { world } : undefined).filter((d) => d.code === OVERLAP);

/**
 * Runs `f` with the pass switched off. `clearCache()` on both sides of the swap: the memos assume
 * `toScene` is a pure function of its key (`src/scene-memo.ts`), and a mock that changes the drawing
 * breaks that, so a Scene drawn on one side must never be read on the other.
 */
const off = <T>(f: () => T): T => {
  clearCache();
  state.off = true;
  try {
    return f();
  } finally {
    state.off = false;
    clearCache();
  }
};

/** The issue's plan, byte for byte in everything but the store's name. */
const issue = (name: string) => `plan "labels in small rooms" {
  units mm
  paper A4 landscape
  scale 1:50
  room id=flur at (0,0) size 3000x1400 label "Flur" uses hall
  room id=wc right-of flur size 1000x1400 label "WC" uses wc
  room id=abst below wc align left size 1200x900 label "${name}" uses storage
  walls from rooms exterior 200 partition 100
  door on flur.bottom at 800 from start width 900 swing into flur
  door between flur and wc at center width 800 swing into wc
  door between wc and abst at center width 600 swing into abst
}`;

/** One room on A4 at 1:50 (or `head` instead), plus `extra`. */
const room = (label: string, size = "4000x3000", extra = "", head = "paper A4 landscape\n  scale 1:50") => `plan "r" {
  units mm
  ${head}
  room id=r at (0,0) size ${size} ${label} uses bedroom
  walls from rooms exterior 100 partition 100
  ${extra}
}`;

/** Every text the Scene of a plan's first page holds, in drawing order. */
function textPrims(src: string, opts: { annotate?: boolean } = {}): Text[] {
  const nodes = compile(src, { noCache: true, ...opts }).scene!.nodes;
  return nodes.flatMap((n) => (n.prim.t === "text" ? [n.prim] : []));
}

/** The size of every room name a plan draws: a name is the one text of weight 600. */
const nameSizes = (src: string): number[] =>
  textPrims(src)
    .filter((t) => t.weight === 600)
    .map((t) => t.size);

/** Where the Scene drew a room's texts, name first, and the sizes it drew with. */
function drawn(src: string, id = "r"): { texts: Text[]; sizes: RenderSizes } {
  const { ir } = resolvePlan(src);
  const scene = toScene(ir!, { annotate: true });
  const texts = scene.nodes.filter((n) => n.elementId === id && n.prim.t === "text").map((n) => n.prim as Text);
  return { texts, sizes: scene.sizes };
}

describe("the issue's two plans", () => {
  it("draws the store's one word smaller and clear of the swing, the wall and the floor's edge", () => {
    const before = off(() => drawn(issue("Abstellraum"), "abst")).texts;
    expect(before.map((t) => [t.size, t.at])).toEqual([
      [175, { x: 3600, y: 1950 }],
      [125, { x: 3600, y: 2142.5 }],
    ]);
    expect(off(() => of(issue("Abstellraum"))).length).toBe(1);

    const after = drawn(issue("Abstellraum"), "abst").texts;
    expect(after.map((t) => [t.size, t.at])).toEqual([
      [100, { x: 3780, y: 1965 }],
      [100, { x: 3780, y: 2075 }],
    ]);
    expect(of(issue("Abstellraum"))).toEqual([]);
  });

  it("wraps the spaced name at its space, and only there", () => {
    const [name, area] = drawn(issue("Abstell- raum"), "abst").texts;
    expect(name!.block).toEqual({ lines: ["Abstell-", "raum"], pitch: 120 });
    expect(name!.value).toBe("Abstell- raum");
    expect(name!.size).toBe(100);
    expect(area!.at.y - name!.at.y).toBeCloseTo(170, 9);
    expect(of(issue("Abstell- raum"))).toEqual([]);
  });

  it("leaves the plan's other labels exactly as they were", () => {
    for (const id of ["flur", "wc"]) {
      expect(drawn(issue("Abstellraum"), id).texts).toEqual(off(() => drawn(issue("Abstellraum"), id).texts));
    }
  });
});

describe("the heights", () => {
  it("steps from the room-name size to the furniture-label size, 2 mm on a sheet", () => {
    const { sizes } = drawn(room('label "Room"'));
    const mm = labelHeights(sizes).map((h) => [h.name / 50, h.area / 50]);
    expect(mm).toEqual([
      [3.5, 2.5],
      [3, 2.5],
      [2.5, 2.5],
      [2, 2],
    ]);
    expect(mm.at(-1)![0]).toBe(SHEET_MM.furnLabel);
  });

  it("knows a height at any scale the sheet chose, written or not", () => {
    const { sizes } = drawn(room('label "Room"', "4000x3000", "", "paper A4 landscape"));
    expect(labelHeights(sizes).at(-1)!.name).toBe(SHEET_MM.furnLabel * (sizes.roomFont / SHEET_MM.roomLabel));
  });

  it("stops at the drawing's own furniture size with no sheet at all", () => {
    const src = room('label "Abstellraumkellerflur"', "900x4000", "", "");
    const { texts, sizes } = drawn(src);
    expect(labelHeights(sizes).at(-1)!.name).toBe(sizes.furnFont);
    expect(texts[0]!.size).toBeGreaterThanOrEqual(sizes.furnFont);
    expect(texts[0]!.size).toBeLessThan(sizes.roomFont);
  });

  it("never sets the area figure larger than the name", () => {
    for (const h of labelHeights(drawn(room('label "Room"')).sizes)) expect(h.area).toBeLessThanOrEqual(h.name);
    const none = labelHeights(drawn(room('label "Room"', "4000x3000", "", "")).sizes);
    for (const h of none) expect(h.area).toBeLessThanOrEqual(h.name);
  });
});

describe("what fits, or is not the pass's to touch, stays", () => {
  it("leaves a short name in a room it fits", () => {
    const src = room('label "Bed"');
    expect(drawn(src).texts).toEqual(off(() => drawn(src).texts));
  });

  it("stands at the room's centre when that is clear, whatever a hair of the floor's edge reads", () => {
    // The floor's edge read a hair below nothing at the anchor, and a 1 mm edit flipped the label
    // 450 mm sideways: 3000 wide landed at x 1050, 3001 at x 1500.5.
    const strip = (w: number) => `plan "s" {
  units mm
  paper A4 landscape
  scale 1:50
  room id=a at (0,0) size ${w}x520 label "Corridor" uses hall
  room id=b at (0,520) size ${w}x3000 label "Living" uses living
  walls from rooms exterior 200 partition 100
  door on b.bottom at center width 900 swing into b
}`;
    for (const w of [2990, 2999, 3000, 3001]) {
      const [name] = drawn(strip(w), "a").texts;
      expect(name!.at.x).toBe(w / 2);
    }
  });

  it("does not flip a label across its room on a 1 mm edit", () => {
    // Two places of the lattice stand exactly as far from the middle, either side of the wardrobe;
    // measured, they differed by an ulp that came and went with the width.
    const sides = new Set<string>();
    for (let w = 2990; w <= 3010; w++) {
      const src = room(
        'label "Hauswirtschaft"',
        `${w}x1200`,
        `furniture wardrobe at (${w / 2 - 150},20) size 300x1160`,
      );
      const [name] = drawn(src).texts;
      sides.add(name!.at.x < w / 2 ? "left" : "right");
    }
    expect([...sides]).toEqual(["left"]);
  });

  it("takes the first height that clears, not the smallest", () => {
    // 1400 mm of clear floor. The name draws 9.6 em: 1683 mm at 3.5 mm, 1442 at 3, 1202 at 2.5.
    const [name, area] = drawn(room('label "Mmmmmmmmmmm"', "1500x3000")).texts;
    expect(name!.size).toBe(125);
    expect(area!.size).toBe(125);
  });

  it("does not resize a pinned label: the pin is the author's decision", () => {
    const src = room('label "Hauswirtschaftsraum" at (600,1000)', "1200x2000");
    expect(drawn(src).texts).toEqual(off(() => drawn(src).texts));
    expect(of(src).length).toBe(1);
  });

  it("does not resize an outdoor surface's label, which the rule does not report", () => {
    const src = room(
      'label "Room"',
      "4000x3000",
      'outdoor id=t patio at (0,3100) size 300x3900 label "Sonnenterrasse"',
    );
    expect(drawn(src, "t").texts).toEqual(off(() => drawn(src, "t").texts));
  });

  it("does not resize an unnamed room's figure", () => {
    const src = room("", "300x900");
    expect(drawn(src).texts).toEqual(off(() => drawn(src).texts));
  });

  it("does not take a rug for a reason to shrink: a name on a rug reads", () => {
    const src = room('label "Living"', "3000x3000", "furniture rug at (500,500) size 2000x2000");
    expect(drawn(src).texts).toEqual(off(() => drawn(src).texts));
    expect(of(src)).toEqual([]);
  });

  it("shrinks a name off a symbol it cannot be moved off at the full size", () => {
    // The defect corpus's plan with its pin taken away: the bed and the wardrobe leave no place.
    const file = join(ROOT, "test/defect-corpus/annotation-collisions/label-over-bed.arch");
    const src = readFileSync(file, "utf8").replace(" at (1150,2400)", "");
    expect(off(() => of(src)).map((d) => d.message)).toEqual([expect.stringContaining("printed over the bed")]);
    const [name] = drawn(src, "r_bed4").texts;
    expect(name!.size).toBeLessThan(350);
    expect(of(src)).toEqual([]);
  });
});

describe("a label that still does not fit", () => {
  const long = room('label "Hauswirtschaftsraumundabstellkammer"', "1200x2000");

  it("is drawn at the smallest height and reported, never left to overflow in silence", () => {
    const [name, area] = drawn(long).texts;
    expect(name!.size).toBe(100);
    expect(area!.size).toBe(100);
    expect(of(long).map((d) => d.message)).toEqual([expect.stringContaining("runs out of the room")]);
  });

  it("says what the placer tried, and claims no more than that", () => {
    const hint = of(long)[0]!.hints![0]!;
    expect(hint).toContain("did not find a clear place");
    expect(hint).toContain("smallest lettering");
    expect(hint).not.toContain("found no clear part");
  });

  it("keeps its size when shrinking leaves it just as buried", () => {
    // A name wholly on a piece that fills the room: smaller is no less on it.
    const src = room('label "Bed"', "3000x3000", "furniture bed at (20,20) size 2960x2960");
    const size = (s: Text[]): number => s[0]!.size;
    expect(size(drawn(src).texts)).toBe(size(off(() => drawn(src).texts)));
    expect(of(src).length).toBe(1);
  });

  it("is not walked out of its room to get there", () => {
    const [name] = drawn(long).texts;
    expect(Math.abs(name!.at.x - 600)).toBeLessThanOrEqual(300);
  });
});

describe("wrapping", () => {
  it("breaks at a space and never inside a word", () => {
    const [name] = drawn(room('label "Hauswirtschaftsraum Waschen"', "1100x3000")).texts;
    expect(name!.block?.lines).toEqual(["Hauswirtschaftsraum", "Waschen"]);
  });

  it("leaves a single word on one line", () => {
    const [name] = drawn(room('label "Hauswirtschaftsraum"', "1200x2000")).texts;
    expect(name!.block).toBeUndefined();
  });

  it("is the same on every run, and the same whether the drawing is annotated or not", () => {
    const src = issue("Abstell- raum");
    expect(compile(src, { noCache: true }).svg).toBe(compile(src, { noCache: true }).svg);
    expect(textPrims(src, { annotate: true })).toEqual(textPrims(src));
  });

  it("carries through the DXF: one TEXT per line, at the height the Scene holds", () => {
    const dxf = toDxf(compile(issue("Abstell- raum"), { noCache: true }).scene!);
    const heightOf = (line: string): string | undefined =>
      new RegExp(`\\n40\\n([^\\n]+)\\n1\\n${line}\\n`).exec(dxf)?.[1];
    // The DXF states a cap height, a fixed share of the size, so read it against the full-size "Flur".
    expect(Number(heightOf("Abstell-")) / Number(heightOf("Flur"))).toBeCloseTo(100 / 175, 9);
    expect(Number(heightOf("raum"))).toBe(Number(heightOf("Abstell-")));
    expect(dxf).not.toContain("\nAbstell- raum\n");
  });
});

describe("CJK and other names", () => {
  it("reads a CJK name at one em a character, so it shrinks where the old estimate saw room", () => {
    const src = room('label "主卧室卫生间"', "1100x2000");
    const [name] = drawn(src).texts;
    expect(name!.size).toBeLessThan(175);
    expect(of(src)).toEqual([]);
  });

  it("does not shrink a short CJK name that fits", () => {
    const src = room('label "主卧"');
    expect(drawn(src).texts).toEqual(off(() => drawn(src).texts));
  });
});

/* ---------------------------------------------------------------------------
 * The corpus
 * ------------------------------------------------------------------------- */

const nameOf = (p: string): string => relative(ROOT, p).split(sep).join("/");

// EH3.4: not CORPUS_DIRS (test/helpers/corpus.ts): this corpus adds test/defect-corpus and test/plans, drops test/recovery-corpus, and takes only docs pages outside docs/plans.
function corpus(): { name: string; src: string; world: World }[] {
  const out: { name: string; src: string; world: World }[] = [];
  const arch = (f: string): boolean => f.endsWith(".arch");
  for (const d of [
    "examples",
    "test/fixtures",
    "test/defect-corpus",
    "eval/goldens",
    "eval/fidelity-plans",
    "eval/faults",
    "test/plans",
  ]) {
    for (const p of walk(join(ROOT, d), arch)) {
      out.push({ name: nameOf(p), src: readFileSync(p, "utf8"), world: worldFor(dirname(p)) });
    }
  }
  const md = walk(join(ROOT, "docs"), (f) => f.endsWith(".md")).filter((p) => !nameOf(p).startsWith("docs/plans/"));
  for (const p of [...md, join(ROOT, "README.md"), join(ROOT, "spec.llm.md")]) {
    extractArchBlocks(readFileSync(p, "utf8")).forEach((b, i) => {
      out.push({ name: `${nameOf(p)}#${i}`, src: b.source, world: NULL_WORLD });
    });
  }
  return out;
}

/** A room's texts on every storey of a plan, keyed by storey and id. */
function labelsOf(src: string, world: World): Map<string, Text[]> {
  const out = new Map<string, Text[]>();
  const { ir, levels } = resolvePlan(src, { world });
  if (!ir) return out;
  const storeys: ResolvedPlan[] = levels.length > 0 ? levels.map((l) => l.ir) : [ir];
  storeys.forEach((plan, k) => {
    for (const n of toScene(plan, { annotate: true }).nodes) {
      if (n.elementKind !== "room" || n.prim.t !== "text") continue;
      const key = `${k}/${n.elementId}`;
      out.set(key, [...(out.get(key) ?? []), n.prim]);
    }
  });
  return out;
}

/**
 * The corpus plans whose drawing the pass changes, each for a label `W_ANNOTATION_OVERLAP` reports
 * with the pass off. The two `*30` fixtures draw a 3 m room with a 2.7 m label: nothing fits there.
 */
const MOVED = [
  "eval/fidelity-plans/min-bedroom-flat.faithful.arch",
  "eval/goldens/l-shaped-flat.arch",
  "eval/goldens/reception-suite.arch",
  "examples/corner-cafe.arch",
  // RM8.5's showcase plan (a subdirectory, so the walk reaches it and the example samplers do not).
  "examples/showcase/garden-courtyard.arch",
  "test/fixtures/chain30.arch",
  // The label-crowding witness: the pass shrinks the label of every room on its north strip (seven).
  "test/fixtures/dense-office.arch",
  "test/fixtures/star30.arch",
];

describe("over the corpus", () => {
  it("moves only a label the rule reports, and only the plans named", () => {
    const moved: string[] = [];
    let labels = 0;
    let shrunk = 0;
    for (const { name, src, world } of corpus()) {
      const before = off(() => labelsOf(src, world));
      const after = labelsOf(src, world);
      labels += after.size;
      const changed = [...after.keys()].filter((k) => JSON.stringify(after.get(k)) !== JSON.stringify(before.get(k)));
      if (changed.length === 0) continue;
      // The section on this very behaviour has the one fence written to shrink, and the plans an
      // audit kept (now `test/plans/`) are held to the law below without being named.
      if (!name.startsWith("docs/") && !name.startsWith("test/plans/")) moved.push(name);
      const reports = off(() => of(src, world)).map((d) => d.message);
      for (const k of changed) {
        shrunk++;
        const [text] = before.get(k)!;
        expect(
          reports.some((m) => m.includes(`"${text!.value}"`) || m.includes(text!.value)),
          `${name}: ${text!.value} moved with no report`,
        ).toBe(true);
      }
      // No height is below the floor, and the figure is never larger than the name.
      for (const [t] of after.values()) expect(t!.size).toBeGreaterThan(0);
    }
    expect(moved.sort()).toEqual([...MOVED].sort());
    expect(labels).toBeGreaterThan(300);
    expect(shrunk).toBeGreaterThan(30);
  }, 300_000);
});

/** The rooms a source resolves to, whatever order it writes them in. */
function roomsOf(src: string, world: World): string {
  const { ir } = resolvePlan(src, { world });
  const rooms = (ir?.elements ?? []).filter((e): e is RRoom => e.kind === "room");
  return JSON.stringify(rooms.map((r) => [r.id, r.label, r.at, r.size, r.poly, r.uses]).sort());
}

/** The `room` statements of a source reversed in place, every other line where it stood; null for a
 *  plan whose rooms are not all placed absolutely, on one storey, or that does not come out the
 *  same rooms: a statement written over two lines is not one line to move. */
function roomsReversed(src: string, world: World): string | null {
  const lines = src.split("\n");
  if (lines.some((l) => /^\s*(level|component|place)\b/.test(l))) return null;
  const rooms = lines.flatMap((l, i) => (/^\s*room\b/.test(l) ? [i] : []));
  if (rooms.length < 2) return null;
  if (
    rooms.some(
      (i) => !/\bat \(|\bcircle\b|\bpolygon\b/.test(lines[i]!) || /\b(right-of|left-of|above|below)\b/.test(lines[i]!),
    )
  )
    return null;
  const out = [...lines];
  rooms.forEach((i, k) => {
    out[i] = lines[rooms[rooms.length - 1 - k]!]!;
  });
  const reversed = out.join("\n");
  return roomsOf(reversed, world) === roomsOf(src, world) ? reversed : null;
}

/** Every room's drawn texts, whatever order they were drawn in. */
function textsOf(src: string, world: World): string[] {
  const out: string[] = [];
  for (const texts of labelsOf(src, world).values()) out.push(...texts.map((t) => JSON.stringify(t)));
  return out.sort();
}

describe("the order of the source", () => {
  const row = (id: string, x: number, name: string) =>
    `  room id=${id} at (${x},0) size 1200x900 label "${name}" uses storage\n`;
  const rooms = [
    row("a", 0, "储藏室储藏室储藏"),
    row("b", 1200, "Αποθήκη Αποθήκη"),
    row("g", 2400, "Abstell raum tabs"),
    row("h", 3600, "Abstell  raum  double"),
    row("j", 4800, "Abstell- raum"),
  ];
  const plan = (order: readonly string[]) =>
    `plan "o" {\n  units mm\n  paper A3 landscape\n  scale 1:50\n${order.join("")}  walls from rooms exterior 200 partition 100\n}\n`;

  it("draws the same texts whichever way the rooms are written", () => {
    const first = textsOf(plan(rooms), NULL_WORLD);
    const [a, b, c, d, e] = rooms as [string, string, string, string, string];
    for (const order of [
      [b, a, c, d, e],
      [e, d, c, b, a],
      [c, e, a, d, b],
    ]) {
      expect(textsOf(plan(order), NULL_WORLD)).toEqual(first);
    }
  });

  it("holds over the corpus, before this pass and after it", () => {
    let held = 0;
    let acted = 0;
    for (const { name, src, world } of corpus()) {
      const other = roomsReversed(src, world);
      if (other === null) continue;
      // `relocateLabels` takes its turns in an order read off the plan (`plotOrder`, card AL3a), so
      // what it leaves this pass agrees too. Five plans were excused here before it did.
      const a = off(() => textsOf(src, world));
      expect(
        off(() => textsOf(other, world)),
        name,
      ).toEqual(a);
      const after = textsOf(src, world);
      expect(textsOf(other, world), name).toEqual(after);
      held++;
      if (JSON.stringify(after) !== JSON.stringify(a)) acted++;
    }
    expect(held).toBeGreaterThan(200);
    expect(acted).toBeGreaterThan(5);
  }, 300_000);

  // Generated strips of rooms whose names are often wider than the room, beside a corridor, the room
  // statements in two orders: the same texts, with this pass and without it (card AL3a).
  it("draws the same texts in any order of the room statements, generated", () => {
    const NAMES = [
      "Store / IT",
      "Kitchenette / Break",
      "Accessible WC",
      "WC",
      "Hauswirtschaftsraum",
      "Dressing",
      "Office",
    ];
    const spec = fc.record({ w: fc.constantFrom(1200, 1500, 1800, 2400, 3000), name: fc.constantFrom(...NAMES) });
    fc.assert(
      fc.property(
        fc.array(spec, { minLength: 2, maxLength: 7 }),
        fc.constantFrom("", "  paper A3 landscape\n  scale 1:50\n", "  paper A4 landscape\n  scale 1:100\n"),
        fc.integer({ min: 0, max: 1_000_000 }),
        (rooms, paper, shuffleSeed) => {
          let x = 0;
          const lines = rooms.map((r, i) => {
            const line = `  room id=r${i} at (${x},0) size ${r.w}x3000 label "${r.name}" uses storage`;
            x += r.w;
            return line;
          });
          lines.push(`  room id=hall at (0,3000) size ${x}x1500 label "Corridor" uses circulation`);
          let state = shuffleSeed;
          const other = [...lines];
          for (let i = other.length - 1; i > 0; i--) {
            state = (state * 1103515245 + 12345) % 2147483648;
            const j = state % (i + 1);
            [other[i], other[j]] = [other[j]!, other[i]!];
          }
          const plan = (ls: readonly string[]) =>
            `plan "o" {\n  units mm\n${paper}${ls.join("\n")}\n  walls from rooms exterior 200 partition 100\n}\n`;
          expect(textsOf(plan(other), NULL_WORLD)).toEqual(textsOf(plan(lines), NULL_WORLD));
          expect(off(() => textsOf(plan(other), NULL_WORLD))).toEqual(off(() => textsOf(plan(lines), NULL_WORLD)));
        },
      ),
      { numRuns: runs(40), seed: 3141 },
    );
  }, 120_000);

  // The five plans the corpus law excused until card AL3a, in every rotation of their room lines,
  // not only reversed: each is a plan whose names do not fit their rooms, so every label's place
  // depends on its neighbours'.
  it.each(FORMERLY_EXCUSED)(
    "%s draws the same in every rotation of its rooms",
    (file) => {
      const src = readFileSync(file, "utf8");
      const world = worldFor(dirname(resolvePath(ROOT, file)));
      const lines = src.split("\n");
      const rooms = lines.flatMap((l, i) => (/^\s*room\b/.test(l) ? [i] : []));
      const rotated = (k: number): string => {
        const out = [...lines];
        rooms.forEach((i, j) => {
          out[i] = lines[rooms[(j + k) % rooms.length]!]!;
        });
        return out.join("\n");
      };
      const first = textsOf(src, world);
      const unfitted = off(() => textsOf(src, world));
      for (const k of [1, 2, Math.floor(rooms.length / 2), rooms.length - 1]) {
        const other = rotated(k);
        expect(roomsOf(other, world), `${file} rotated ${k}`).toBe(roomsOf(src, world));
        expect(textsOf(other, world), `${file} rotated ${k}`).toEqual(first);
        expect(
          off(() => textsOf(other, world)),
          `${file} rotated ${k}, unfitted`,
        ).toEqual(unfitted);
      }
    },
    120_000,
  );
});

// A red-team case from AL3w's review (S1), kept as a record of what is drawn: card AL3e, "a label
// pushed off its floor still claims it, so its neighbour shrinks (case352)". "NEWSROOM" is wider than
// its room, so it stands off its floor wherever the relocation puts it, and `fitLabels` will change
// it. Read at its full size, its box reaches into the gym, so the relocation moves "GYM", which stood
// clear at the room's anchor, and the fit then shrinks it (350 to 300). Letting such a label give up
// its floor was tried in card AL3a and ruled out: the labels it released were then printed over each
// other. Until AL3e, this pins the shrunk GYM; a fix turns it back to the room's full size.
describe("a neighbour's label that does not fit", () => {
  const plan = (newsroom: string) => `plan "p" {
  units mm
  paper A3 landscape
  scale 1:100
  dims auto
  wall id=wn exterior thickness 200 { (0,0) (6550,0) }
  wall id=we exterior thickness 200 { (6550,0) (6550,2150) }
  wall id=ws exterior thickness 200 { (0,2150) (6550,2150) }
  wall id=ww exterior thickness 200 { (0,0) (0,2150) }
  room id=r0 at (0,0) size 1900x2150 label "Lobby"
  door on wn at 400 width 800 hinge near start swing into r0
  window on ws at 800 width 800
  wall id=wp1 partition thickness 100 { (1900,0) (1900,2150) }
  room id=r1 at (1900,0) size 1450x2150${newsroom}
  furniture table at (2250,150) size 800x1250
  furniture table at (2050,200) size 1050x1350
  door on wn at 2100 width 800 hinge near start swing into r1
  wall id=wp2 partition thickness 100 { (3350,0) (3350,2150) }
  room id=r2 at (3350,0) size 1450x2150 label "GYM"
  furniture plinth at (4669,-50) size 650x1900
  door on wn at 3600 width 800 hinge near start swing into r2
  wall id=wp3 partition thickness 100 { (4800,0) (4800,2150) }
  room id=r3 at (4800,0) size 1750x2150 label "Workroom"
  furniture sofa at (5050,100) size 1200x1800
  furniture fridge at (6132,200) size 400x1850
}
`;

  it("moves and shrinks the gym's name for its neighbour's full-size box (card AL3e)", () => {
    const { texts, sizes } = drawn(plan(` label "NEWSROOM"`), "r2");
    expect(texts.map((t) => [t.value, t.size, t.at])).toEqual([
      ["GYM", 300, { x: 4075, y: 1015 }],
      ["3.1 m²", 250, { x: 4075, y: 1345 }],
    ]);
    // With no name next door it is drawn at the full size, at the room's anchor.
    const alone = drawn(plan(""), "r2").texts;
    expect(alone.map((t) => [t.value, t.size, t.at])).toEqual([
      ["GYM", sizes.roomFont, { x: 4075, y: 1005 }],
      ["3.1 m²", 250, { x: 4075, y: 1390 }],
    ]);
  });
});

// Why every placed label keeps its floor (CI on #964): at `1fdd5dee` a label off its own floor gave it
// up, but the fit never redraws an area figure drawn alone, so the neighbour that ignored one stayed
// drawn over it. In the relational-openings table's `frames` (one unit in eight turns and mirrors on
// one sheet, its text 1,610 mm high) rooms `a` and `b` draw only an area figure, each wider than its
// room; `b`'s stood over `a`'s by 29 % in four of the copies. One dodging the other leaves 1.25 %.
describe("an area figure drawn alone", () => {
  it("keeps its floor, so the next room's figure is placed off it", () => {
    const src = OPENINGS_BETWEEN_PLANS.find((p) => p[0] === "frames")![1];
    const { ir } = resolvePlan(src);
    const scene = toScene(ir!, { annotate: true });
    const ink = (id: string) => {
      const texts = scene.nodes.filter((n) => n.elementId === id && n.prim.t === "text").map((n) => n.prim as Text);
      expect(
        texts.map((t) => t.value),
        id,
      ).toEqual(["20.0 m²"]);
      const { w, h } = inkExtent(texts[0]!);
      return { x: texts[0]!.at.x - w / 2, y: texts[0]!.at.y - h / 2, w, h };
    };
    for (const copy of ["r0", "m0", "r90", "m90", "r180", "m180", "r270", "m270"]) {
      const a = ink(`${copy}.a`);
      const b = ink(`${copy}.b`);
      const w = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
      const h = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      expect(w * h, copy).toBeLessThanOrEqual(COLLIDE_MIN * a.w * a.h);
    }
  });
});

// The red team's first round on #964, each case a pin that fails on `1fdd5dee`. Overprints are read
// as the red team read them: two rooms' texts whose ink boxes (drawn width, estimated height) share
// more than `COLLIDE_MIN` of the smaller.
describe("order-free placement: the red team's cases (#964)", () => {
  const labels = (src: string, dx = 0, dy = 0) => {
    const { ir } = resolvePlan(src);
    const scene = toScene(ir!, { annotate: true });
    return scene.nodes
      .filter(
        (n) => (n.elementKind === "room" || n.elementKind === "outdoor") && n.layer === "labels" && n.prim.t === "text",
      )
      .map((n) => ({ id: n.elementId!, prim: n.prim as Text, dx, dy }));
  };
  /** Each label as drawn, relative to the plan's offset, in a fixed order. */
  const drawnAs = (src: string, dx = 0, dy = 0): string[] =>
    labels(src, dx, dy)
      .map(({ id, prim }) =>
        [
          id,
          prim.value,
          (prim.at.x - dx).toFixed(3),
          (prim.at.y - dy).toFixed(3),
          prim.size,
          prim.block?.lines.join("/") ?? "",
        ].join(" "),
      )
      .sort();
  const overprints = (src: string): string[] => {
    const ls = labels(src);
    const box = (p: Text) => {
      const w = inkExtent(p).w;
      const h = textExtent(p).h;
      return { x0: p.at.x - w / 2, x1: p.at.x + w / 2, y0: p.at.y - h / 2, y1: p.at.y + h / 2, a: w * h };
    };
    const out: string[] = [];
    for (let i = 0; i < ls.length; i++)
      for (let j = i + 1; j < ls.length; j++) {
        if (ls[i]!.id === ls[j]!.id) continue;
        const a = box(ls[i]!.prim);
        const b = box(ls[j]!.prim);
        const w = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
        const h = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
        if (w * h > COLLIDE_MIN * Math.min(a.a, b.a)) out.push(`${ls[i]!.prim.value} x ${ls[j]!.prim.value}`);
      }
    return out;
  };
  const plan = (name: string, rooms: string[], tail = "  walls from rooms exterior 200 partition 100\n") =>
    `plan "${name}" {\n  units mm\n  paper A3 landscape\n  scale 1:100\n${rooms.map((r) => `  ${r}\n`).join("")}${tail}}\n`;
  /** The same rooms in both orders: no overprint in either, and the same labels. */
  const bothOrders = (name: string, rooms: string[], tail?: string) => {
    const ab = plan(name, rooms, tail);
    const ba = plan(name, [...rooms].reverse(), tail);
    expect(overprints(ab), "as written").toEqual([]);
    expect(overprints(ba), "reversed").toEqual([]);
    expect(drawnAs(ba)).toEqual(drawnAs(ab));
  };

  it("a room with no name keeps its floor (S1 a)", () => {
    bothOrders("unnamed", [
      "room id=a at (0,0) size 500x3000 uses storage",
      'room id=b at (500,0) size 900x3000 label "Bath" uses bath',
      'room id=c at (1400,0) size 3000x3000 label "Bedroom" uses bedroom',
    ]);
  });

  it("a name too wide for its room at every height keeps its floor (S1 b)", () => {
    bothOrders("wide", [
      'room id=a at (0,0) size 650x2400 label "Wardrobe" uses storage',
      'room id=b at (650,0) size 900x2400 label "Bath" uses bath',
      'room id=c at (1550,0) size 3000x2400 label "Bedroom" uses bedroom',
    ]);
  });

  it("an authored label is an obstacle from the first turn (S2)", () => {
    bothOrders("pin", [
      'room id=a at (0,0) size 2000x3000 label "Bath" uses bath',
      'room id=b at (2000,0) size 3000x3000 label "Living Room" at (2300,1700) uses living',
    ]);
  });

  it("a room's label and a surface's alike take the same turns in either order (N1)", () => {
    bothOrders(
      "tie",
      [
        'room id=a at (0,0) size 4000x3000 label "Deck" uses living',
        'outdoor deck id=o at (0,0) size 4000x3000 label "Deck"',
        'room id=c at (4000,0) size 3000x3000 label "Bath" uses bath',
      ],
      "",
    );
  });

  it("the same plan moved by a decimal offset draws the same labels relative to it (S4)", () => {
    const strip = (dx: number, dy: number) => {
      const xs = [0, 1200, 1950, 4100, 6250];
      const names = ["Den", "MASTER BEDROOM", "MASTER BEDROOM", "Accessible WC"];
      const p = (x: number, y: number) => `(${x + dx},${y + dy})`;
      const rooms = names.map(
        (name, k) =>
          `room id=r${k} polygon ${p(xs[k]!, 0)} ${p(xs[k + 1]!, 0)} ${p(xs[k + 1]!, 2350)} ${p(xs[k]!, 2350)} label "${name}" uses storage`,
      );
      const tables = [
        [1400, 1200, 350, 550],
        [3000, 350, 750, 1500],
        [4200, 700, 750, 400],
      ].map(([x, y, w, h]) => `furniture table at ${p(x!, y!)} size ${w}x${h}`);
      return `plan "t" {\n  units mm\n  paper A2 landscape\n  scale 1:100\n${[...rooms, ...tables].map((l) => `  ${l}\n`).join("")}}\n`;
    };
    expect(drawnAs(strip(1234.7, 777.3), 1234.7, 777.3)).toEqual(drawnAs(strip(0, 0)));
    // Ten kilometres out, where a coordinate carries about 1e-9 mm of rounding: the order is read on a
    // micrometre grid, so the noise never decides a turn (#964 round 2).
    expect(drawnAs(strip(10000001.2, 9000000.9), 10000001.2, 9000000.9)).toEqual(drawnAs(strip(0, 0)));
  });
});

/** The corpus plans whose labels depended on the order of the source until card AL3a (the owner-
 *  approved `ORDER_EXCUSED` list, now empty and gone). */
const FORMERLY_EXCUSED = [
  "test/fixtures/chain30.arch",
  "test/fixtures/dense-office.arch",
  "test/fixtures/star30.arch",
  "test/plans/plan-soundness/audits/first-contact-plans/2026-10-24-rerun/2-house.arch",
  "test/plans/plan-soundness/audits/first-contact-plans/2026-10-26-walls-first/6-clinic.arch",
];

describe("the count", () => {
  it("shrinks every label of an honest plan of many rooms", () => {
    const n = 14;
    let s = 'plan "g" {\n  units mm\n  paper A0 landscape\n  scale 1:200\n';
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++)
        s += `  room id=r${x}_${y} at (${x * 1500},${y * 1500}) size 1500x1500 label "Hauswirtschaftsraum ${x}" uses storage\n`;
    s += "  walls from rooms exterior 200 partition 100\n}\n";
    const sizes = nameSizes(s);
    expect(sizes.length).toBe(n * n);
    expect(sizes.every((size) => size === 400)).toBe(true);
  }, 60_000);

  it("charges a round room's 48-gon and still reaches a plan's worth of them", () => {
    let s = 'plan "c" {\n  units mm\n  paper A1 landscape\n  scale 1:100\n';
    for (let i = 0; i < 40; i++) {
      s += `  room id=r${i} circle at (${(i % 8) * 1400 + 600},${Math.floor(i / 8) * 1400 + 600}) radius 600 label "Hauswirtschaft ${i}" uses storage\n`;
    }
    const sizes = nameSizes(`${s}}\n`);
    expect(sizes.length).toBe(40);
    expect(sizes.every((size) => size !== 350)).toBe(true);
  }, 60_000);

  it("stops at the count on a hostile pile: the labels after it keep their size, the same every run", () => {
    // A room a label can stand clear in nowhere: a narrow hall of beds, every label searched to the end.
    let s = 'plan "c" {\n  units mm\n  paper A0 landscape\n  scale 1:100\n';
    for (let i = 0; i < 1500; i++) {
      s += `  room id=r${i} at (${(i % 40) * 3000},${Math.floor(i / 40) * 3000}) size 2900x2900 label "Room ${i}" uses bedroom\n`;
    }
    for (let i = 0; i < 1500; i++) {
      s += `  furniture bed at (${(i % 40) * 3000 + 100},${Math.floor(i / 40) * 3000 + 100}) size 2700x1300\n`;
      s += `  furniture bed at (${(i % 40) * 3000 + 100},${Math.floor(i / 40) * 3000 + 1500}) size 2700x1300\n`;
    }
    const src = `${s}}\n`;
    const first = compile(src, { noCache: true });
    const sizes = nameSizes(src);
    expect(sizes.length).toBe(1500);
    expect(sizes.at(-1)).toBe(350);
    expect(sizes[0]).not.toBe(350);
    expect(compile(src, { noCache: true }).svg).toBe(first.svg);
  }, 120_000);

  it("shares the count between storeys, so a plan of many levels cannot multiply it", () => {
    const level = (n: number): string =>
      `  level ${n} {\n    room id=r${n} at (0,0) size 3000x3000 label "Room" uses bedroom\n  }\n`;
    const { levels } = resolvePlan(`plan "s" {\n  units mm\n${level(1)}${level(2)}${level(3)}}\n`);
    expect(levels.map((l) => fitWork(l.ir))).toEqual([MAX_FIT_WORK / 3, MAX_FIT_WORK / 3, MAX_FIT_WORK / 3]);
    expect(fitWork(resolvePlan(room('label "Room"')).ir!)).toBe(MAX_FIT_WORK);
  });
});
