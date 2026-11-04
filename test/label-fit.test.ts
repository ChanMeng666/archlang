/**
 * A room's label that does not fit shrinks (`fitLabels`, `src/label-fit.ts`).
 *
 * THE ORACLE for "nothing else moves" is the pass switched off (`vi.mock`, {@link state}): every
 * corpus plan is drawn both ways, so what the pass did is the difference, and a label that fits
 * has none. Everything else reads the Scene the compiler draws, never a position worked out here.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve as resolvePath, sep } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { resolvePlan } from "../src/analyze.js";
import { toDxf } from "../src/export/dxf.js";
import { compile, lint } from "../src/index.js";
import type { ResolvedPlan, RRoom } from "../src/ir.js";
import { fitWork, labelHeights, MAX_FIT_WORK } from "../src/label-fit.js";
import { extractArchBlocks } from "../src/markdown.js";
import type { RenderSizes, ScenePrim } from "../src/scene.js";
import { toScene } from "../src/scene-build.js";
import { SHEET_MM } from "../src/sheet.js";
import type { World } from "../src/world.js";
import { NULL_WORLD } from "../src/world.js";

const { state } = vi.hoisted(() => ({ state: { off: false } }));

vi.mock("../src/label-fit.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/label-fit.js")>();
  return {
    ...real,
    fitLabels: (...args: Parameters<typeof real.fitLabels>) => {
      if (!state.off) real.fitLabels(...args);
    },
  };
});

type Text = Extract<ScenePrim, { t: "text" }>;

const OVERLAP = "W_ANNOTATION_OVERLAP";
const ROOT = resolvePath(__dirname, "..");
const of = (src: string, world?: World) => lint(src, world ? { world } : undefined).filter((d) => d.code === OVERLAP);

const off = <T>(f: () => T): T => {
  state.off = true;
  try {
    return f();
  } finally {
    state.off = false;
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

function corpus(): { name: string; src: string; world: World }[] {
  const out: { name: string; src: string; world: World }[] = [];
  const worldFor = (dir: string): World => ({
    read: (p) => {
      try {
        return readFileSync(resolvePath(dir, p), "utf8");
      } catch {
        return null;
      }
    },
  });
  const walk = (dir: string, keep: (f: string) => boolean, files: string[] = []): string[] => {
    for (const f of readdirSync(dir).sort()) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p, keep, files);
      else if (keep(f)) files.push(p);
    }
    return files;
  };
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
  "test/fixtures/chain30.arch",
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

  it("holds over the corpus: where the passes before it agree, this one does", () => {
    let held = 0;
    let acted = 0;
    let before = 0;
    for (const { name, src, world } of corpus()) {
      const other = roomsReversed(src, world);
      if (other === null) continue;
      // `relocateLabels` visits in element order: where its result differs, the order is its own.
      const a = off(() => textsOf(src, world));
      const b = off(() => textsOf(other, world));
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        before++;
        continue;
      }
      const after = textsOf(src, world);
      expect(textsOf(other, world), name).toEqual(after);
      held++;
      if (JSON.stringify(after) !== JSON.stringify(a)) acted++;
    }
    expect(held).toBeGreaterThan(200);
    expect(acted).toBeGreaterThan(5);
    // Few, or the comparison above is excusing what it is meant to hold.
    expect(before).toBeLessThanOrEqual(4);
  }, 300_000);
});

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
