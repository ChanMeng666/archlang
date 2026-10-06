/**
 * A room name too wide for its room on one line is drawn on several (`wrapLabels`,
 * `src/label-placement.ts`) — and nothing else about any drawing moves.
 *
 * THE ORACLE is the previous implementation itself: `wrapLabels` is the whole of the change
 * on the drawing side (it runs just before the relocation and is the only thing that sets a
 * text's `block`), so with it switched off (`vi.mock`, {@link state}) the compiler is exactly
 * what shipped. Every plan below is compiled both ways and compared:
 *
 * - **No name wrapped** → every node of every storey, and every SVG, is the same bit for bit.
 * - **Some name wrapped** → that name did NOT fit on one line, its wrapped block DOES fit its
 *   room where it is drawn, its string is unchanged, and the area figure sits under its last
 *   line exactly as far as it sat under the one-line name. Every node the wrap did not touch
 *   is identical, and every other room's name is the same one-line text; where a neighbour's
 *   taller block makes the relocation place another label differently, that knock-on is
 *   counted (the corpus has none).
 *
 * "Fits its room" is measured here independently of the pass: the text box lies inside the
 * room's ring (`rectInsidePolygon`) and overlaps no wall band grown by the pass's clearance —
 * the boxes, recomputed from the IR, the relocation steers by.
 *
 * Over the whole corpus and generated plans of narrow walled rooms; then the downstream
 * witnesses, `annotate`, and the three vector backends against each other.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { segmentRectangle, segmentsOfWall } from "../src/geometry.js";
import { arcTessellate } from "../src/geometry/arc.js";
import { rectInsidePolygon } from "../src/geometry/polygon.js";
import type { BBox } from "../src/geometry/rect.js";
import { compile } from "../src/index.js";
import type { ResolvedPlan } from "../src/ir.js";
import { CLEARANCE, type LabelGroup } from "../src/label-placement.js";
import { extractArchBlocks } from "../src/markdown.js";
import type { RenderSizes, SceneNode, ScenePrim } from "../src/scene.js";
import { textExtent, textLines } from "../src/text-layout.js";
import { toDxf } from "../src/export/dxf.js";
import { NULL_WORLD, type World } from "../src/world.js";

type Text = Extract<ScenePrim, { t: "text" }>;

/** One `toScene`: the nodes as the wrap step left them, and as the relocation left them. */
interface Call {
  groups: readonly LabelGroup[];
  ir: ResolvedPlan;
  sizes: RenderSizes;
  wrapped: SceneNode[];
  final: SceneNode[];
}

const { state } = vi.hoisted(() => ({
  state: { off: false, calls: [] as Call[], pending: undefined as Omit<Call, "final"> | undefined },
}));

vi.mock("../src/label-placement.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/label-placement.js")>();
  return {
    ...real,
    wrapLabels: (nodes: SceneNode[], groups: readonly LabelGroup[], ir: ResolvedPlan, sizes: RenderSizes) => {
      if (!state.off) real.wrapLabels(nodes, groups, ir, sizes);
      state.pending = { groups, ir, sizes, wrapped: nodes.slice() };
    },
    relocateLabels: (nodes: SceneNode[], groups: readonly LabelGroup[], ir: ResolvedPlan, sizes: RenderSizes) => {
      real.relocateLabels(nodes, groups, ir, sizes);
      state.calls.push({ ...state.pending!, final: nodes.slice() });
    },
  };
});

const ROOT = resolvePath(__dirname, "..");

/** Compile with the wrap step on or off; every `toScene` it made, in order. */
function run(src: string, world: World, off: boolean): { calls: Call[]; drawings: string[] } {
  state.off = off;
  state.calls = [];
  try {
    const out = compile(src, { noCache: true, world });
    return { calls: state.calls, drawings: out.pages ? out.pages.map((p) => p.svg) : [out.svg] };
  } finally {
    state.off = false;
  }
}

/** Deep equality with `Object.is` at the leaves; the first path that differs, or null. */
function differs(a: unknown, b: unknown, path = ""): string | null {
  if (typeof a === "number" || typeof b === "number")
    return Object.is(a, b) ? null : `${path}: ${String(a)} vs ${String(b)}`;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object")
    return a === b ? null : `${path}: ${String(a)} vs ${String(b)}`;
  const ka = Object.keys(a as object).sort();
  const kb = Object.keys(b as object).sort();
  if (ka.join() !== kb.join()) return `${path}: keys ${ka.join()} vs ${kb.join()}`;
  for (const k of ka) {
    const d = differs((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`);
    if (d) return d;
  }
  return null;
}

/** Wall bands grown by the pass's clearance, from the IR. */
function bands(ir: ResolvedPlan, sizes: RenderSizes): BBox[] {
  const clear = sizes.roomFont * CLEARANCE;
  const out: BBox[] = [];
  for (const w of ir.walls) {
    for (const s of segmentsOfWall(w)) {
      const pts = s.arc ? arcTessellate(s.arc) : [s.a, s.b];
      for (let k = 0; k + 1 < pts.length; k++) {
        const r = segmentRectangle(pts[k]!, pts[k + 1]!, s.thickness);
        const xs = r.map((p) => p.x);
        const ys = r.map((p) => p.y);
        const x = Math.min(...xs);
        const y = Math.min(...ys);
        out.push({
          x: x - clear,
          y: y - clear,
          w: Math.max(...xs) - x + 2 * clear,
          h: Math.max(...ys) - y + 2 * clear,
        });
      }
    }
  }
  return out;
}

/** The box a text draws in (unrotated: room names never turn). */
function box(p: Text): BBox {
  const { w, h } = textExtent(p);
  return { x: p.at.x - w / 2, y: p.at.y - h / 2, w, h };
}

/** On the room's floor and clear of every wall band. */
function fitsRoom(b: BBox, ring: LabelGroup["ring"], walls: readonly BBox[]): boolean {
  if (!rectInsidePolygon(b, ring)) return false;
  for (const w of walls) {
    if (Math.min(b.x + b.w, w.x + w.w) > Math.max(b.x, w.x) && Math.min(b.y + b.h, w.y + w.h) > Math.max(b.y, w.y))
      return false;
  }
  return true;
}

/** A group's name and area nodes (indices), when it has a name. */
function nameAndArea(nodes: readonly SceneNode[], g: LabelGroup): [number, number] | null {
  const texts: number[] = [];
  for (let i = g.from; i < g.to; i++) if (nodes[i]!.layer === "labels" && nodes[i]!.prim.t === "text") texts.push(i);
  return texts.length === 2 ? [texts[0]!, texts[1]!] : null;
}

interface Tally {
  plans: number;
  wrapped: number;
  knockOns: number;
  /** Wrapped names, `plan: "name" → lines`, for the record. */
  seen: string[];
}

/** The law, for one source. */
function law(name: string, src: string, world: World, t: Tally): void {
  const before = run(src, world, true);
  const after = run(src, world, false);
  t.plans++;
  expect(after.calls.length, name).toBe(before.calls.length);
  let any = false;
  for (let k = 0; k < after.calls.length; k++) {
    const a = before.calls[k]!;
    const b = after.calls[k]!;
    expect(b.wrapped.length, name).toBe(a.wrapped.length);
    const touched = new Set<number>();
    const walls = bands(b.ir, b.sizes);
    for (const g of b.groups) {
      const idx = nameAndArea(b.wrapped, g);
      if (!idx) continue;
      const [ni, ai] = idx;
      const one = a.wrapped[ni]!.prim as Text;
      const wrapped = b.wrapped[ni]!.prim as Text;
      if (!wrapped.block) {
        // Not wrapped: the very same one-line text — only the relocation may have moved it.
        expect(differs({ ...wrapped, at: 0 }, { ...one, at: 0 }), `${name}: ${one.value}`).toBeNull();
        const fa = a.final[ni]!.prim as Text;
        const fb = b.final[ni]!.prim as Text;
        if (differs(fb.at, fa.at) !== null) t.knockOns++;
        continue;
      }
      any = true;
      t.wrapped++;
      touched.add(ni).add(ai);
      t.seen.push(
        `${name}: ${JSON.stringify(one.value)} → ${wrapped.block.lines.map((l) => JSON.stringify(l)).join(" / ")}`,
      );
      // The name as data is untouched, and it was drawn where the one-line name was centred.
      expect(wrapped.value, name).toBe(one.value);
      expect(differs({ ...wrapped, block: 0 }, { ...one, block: 0 }), name).toBeNull();
      expect(wrapped.block.lines.join(" ").replace(/ +/g, " "), name).toBe(one.value.trim().replace(/ +/g, " "));
      // It did not fit on one line; its block does, where it is drawn.
      expect(fitsRoom(box(one), g.ring, walls), `${name}: one-line ${one.value}`).toBe(false);
      expect(fitsRoom(box(wrapped), g.ring, walls), `${name}: wrapped ${one.value}`).toBe(true);
      // The area figure keeps its gap under the LAST line, and nothing else about it moves.
      const areaA = a.wrapped[ai]!.prim as Text;
      const areaB = b.wrapped[ai]!.prim as Text;
      const last = textLines(wrapped).at(-1)!;
      expect(areaB.at.y - last.at.y, name).toBeCloseTo(areaA.at.y - one.at.y, 6);
      expect(
        differs({ ...areaB, at: { x: areaB.at.x, y: 0 } }, { ...areaA, at: { x: areaA.at.x, y: 0 } }),
        name,
      ).toBeNull();
    }
    // The wrap step touched nothing but those two nodes per wrapped room.
    for (let i = 0; i < b.wrapped.length; i++) {
      if (touched.has(i)) continue;
      expect(differs(b.wrapped[i], a.wrapped[i], `${name} node ${i}`), name).toBeNull();
    }
    if (touched.size === 0) {
      for (let i = 0; i < b.final.length; i++)
        expect(differs(b.final[i], a.final[i], `${name} final node ${i}`), name).toBeNull();
    }
  }
  // A plan with no wrapped name draws exactly what it drew before, every storey.
  if (!any) expect(after.drawings, name).toEqual(before.drawings);
}

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
  const walk = (dir: string, keep: (f: string) => boolean): string[] => {
    const files: string[] = [];
    for (const f of readdirSync(dir).sort()) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) files.push(...walk(p, keep));
      else if (keep(f)) files.push(p);
    }
    return files;
  };
  for (const d of ["examples", "test/fixtures", "test/recovery-corpus", "eval"])
    for (const p of walk(join(ROOT, d), (f) => f.endsWith(".arch")))
      out.push({ name: p.slice(ROOT.length + 1), src: readFileSync(p, "utf8"), world: worldFor(dirname(p)) });
  const md = [
    ...walk(join(ROOT, "docs"), (f) => f.endsWith(".md")),
    ...readdirSync(ROOT)
      .filter((f) => f.endsWith(".md"))
      .map((f) => join(ROOT, f)),
  ];
  for (const p of md)
    for (const b of extractArchBlocks(readFileSync(p, "utf8")))
      out.push({ name: `${p.slice(ROOT.length + 1)}#${b.index}`, src: b.source, world: NULL_WORLD });
  return out;
}

describe("room-name wrapping against the previous implementation", () => {
  it("the corpus: only names that did not fit moved, and each now fits its room", () => {
    const t: Tally = { plans: 0, wrapped: 0, knockOns: 0, seen: [] };
    for (const c of corpus()) law(c.name, c.src, c.world, t);
    expect(t.plans).toBeGreaterThan(250);
    // The drawings that move, named — a new one is a finding to list, not a number to bump.
    expect(t.seen.sort()).toEqual([
      'eval/fidelity-plans/wide-doorways.faithful.arch: "Wet Room" → "Wet" / "Room"',
      'eval/fidelity-plans/wide-doorways.laundered.arch: "Wet Room" → "Wet" / "Room"',
      'eval/goldens/core-and-shell.arch: "Circulation Core" → "Circulation" / "Core"',
      'eval/goldens/three-bed-2bath.arch: "Main Bathroom" → "Main" / "Bathroom"',
      'eval/goldens/three-bed-2bath.arch: "Master Bedroom" → "Master" / "Bedroom"',
      'eval/goldens/two-bed-hall.arch: "Kitchen / Living" → "Kitchen /" / "Living"',
      'examples/clinic.arch: "Accessible WC" → "Accessible" / "WC"',
      'test/recovery-corpus/clinic.arch: "Accessible WC" → "Accessible" / "WC"',
    ]);
    expect(t.knockOns).toBe(0);
  }, 600_000);

  it("generated plans of narrow walled rooms: the law holds", () => {
    const WORDS = ["Accessible", "WC", "Bedroom", "3", "Sleeping", "Alcove", "Living", "/", "Kitchen", "Wet", "Room"];
    const t: Tally = { plans: 0, wrapped: 0, knockOns: 0, seen: [] };
    const roomSpec = fc.record({
      w: fc.integer({ min: 6, max: 50 }).map((n) => n * 100),
      words: fc.array(fc.constantFrom(...WORDS), { minLength: 1, maxLength: 4 }),
      pin: fc.boolean(),
      bed: fc.boolean(),
    });
    fc.assert(
      fc.property(
        fc.array(roomSpec, { minLength: 1, maxLength: 6 }),
        fc.integer({ min: 15, max: 70 }).map((n) => n * 100),
        fc.constantFrom("", "  paper A3 landscape\n  scale 1:50\n"),
        (rooms, h, sheet) => {
          let x = 0;
          const lines: string[] = [];
          for (const [i, r] of rooms.entries()) {
            const label = r.words.join(" ");
            const pin = r.pin ? ` at (${x + r.w / 2},${h / 3})` : "";
            lines.push(`  room id=r${i} at (${x},0) size ${r.w}x${h} label "${label}"${pin}`);
            if (r.bed && r.w >= 1200) lines.push(`  furniture bed at (${x + 150},${h / 2}) size ${r.w - 300}x${h / 3}`);
            if (i > 0) lines.push(`  wall partition thickness 100 { (${x},0) (${x},${h}) }`);
            x += r.w;
          }
          const src = `plan "G" {\n  units mm\n${sheet}  wall exterior thickness 200 { (0,0) (${x},0) (${x},${h}) (0,${h}) close }\n${lines.join("\n")}\n}\n`;
          law("generated", src, NULL_WORLD, t);
        },
      ),
      { numRuns: 120, seed: 4242 },
    );
    // Not vacuous: plenty of names wrapped, and plenty did not.
    expect(t.wrapped).toBeGreaterThan(40);
    expect(t.plans).toBe(120);
  }, 600_000);

  it("polygon and circle rooms: the law holds", () => {
    const t: Tally = { plans: 0, wrapped: 0, knockOns: 0, seen: [] };
    law(
      "shapes",
      `plan "S" {
  units mm
  wall exterior thickness 200 { (0,0) (12000,0) (12000,8000) (0,8000) close }
  room id=l polygon (0,0) (2600,0) (2600,5000) (6000,5000) (6000,8000) (0,8000) label "Sleeping Alcove"
  room id=c circle at (9000,4000) radius 1300 label "Accessible WC"
  room id=t polygon (6000,0) (12000,0) (12000,1600) (6000,1600) label "Living / Kitchen / Dining Room"
}`,
      NULL_WORLD,
      t,
    );
    expect(t.wrapped).toBeGreaterThan(0);
  });
});

/** The downstream witnesses' numbers: clear widths between wall faces, at the label size of a
 *  display drawing whose "Accessible WC" is ≈3060 mm wide (font ≈379.8 mm). */
const WITNESS = (sheet = ""): string => `plan "Witness" {
  units mm
${sheet}  wall exterior thickness 200 { (0,0) (12460,0) (12460,6000) (0,6000) close }
  wall partition thickness 200 { (2425,0) (2425,6000) }
  wall partition thickness 200 { (4675,0) (4675,6000) }
  wall partition thickness 200 { (6675,0) (6675,6000) }
  room id=wc at (0,0) size 2425x6000 label "Accessible WC"
  room id=b3 at (2425,0) size 2250x6000 label "Bedroom 3"
  room id=al at (4675,0) size 2000x6000 label "Sleeping Alcove"
  room id=lk at (6675,0) size 5785x6000 label "Living / Kitchen"
}`;

/** One `<tag …>…</tag>` (or self-closing `<tag …/>`) of an SVG string. */
interface Element {
  /** The opening tag, `<` to `>`. */
  open: string;
  /** What lies between the opening and the closing tag ("" when self-closing). */
  inner: string;
  /** The whole element. */
  whole: string;
}

/**
 * Every `<tag>` element of `svg`, in document order — found by an `indexOf` scan, never a regular
 * expression, so the cost is linear however many times the drawing repeats a tag. The backends
 * escape `<`, `>` and `"` inside text and attribute values, and a `<text>` or `<tspan>` never
 * nests its own tag, so the next `>` ends an opening tag and the next `</tag>` ends its element.
 */
function elements(svg: string, tag: string): Element[] {
  const out: Element[] = [];
  const close = `</${tag}>`;
  for (let i = 0; ; ) {
    const start = svg.indexOf(`<${tag}`, i);
    if (start < 0) return out;
    const next = svg[start + tag.length + 1];
    // `<text` is also the start of `<textPath`: only a space, `>` or `/` ends the name.
    if (next !== " " && next !== ">" && next !== "/") {
      i = start + 1;
      continue;
    }
    const gt = svg.indexOf(">", start);
    if (gt < 0) return out;
    const open = svg.slice(start, gt + 1);
    if (svg[gt - 1] === "/") {
      out.push({ open, inner: "", whole: open });
      i = gt + 1;
      continue;
    }
    const end = svg.indexOf(close, gt);
    if (end < 0) return out;
    out.push({ open, inner: svg.slice(gt + 1, end), whole: svg.slice(start, end + close.length) });
    i = end + close.length;
  }
}

/** The value of attribute `name` on an opening tag, or undefined — an `indexOf` scan. */
function attr(open: string, name: string): string | undefined {
  const key = ` ${name}="`;
  const at = open.indexOf(key);
  if (at < 0) return undefined;
  const from = at + key.length;
  const end = open.indexOf('"', from);
  return end < 0 ? undefined : open.slice(from, end);
}

/** Every room name drawn in an SVG: the `<text>` and its lines. */
function drawnNames(svg: string): { text: string; lines: string[] }[] {
  return elements(svg, "text")
    .filter((e) => attr(e.open, "font-weight") === "600")
    .map((e) => {
      const tspans = elements(e.inner, "tspan").map((t) => t.inner);
      return { text: e.whole, lines: tspans.length > 0 ? tspans : [e.inner] };
    });
}

describe("the downstream witnesses", () => {
  it("at the display size: a name that fits wrapped wraps; one that fits neither way is one line, as before", () => {
    const t: Tally = { plans: 0, wrapped: 0, knockOns: 0, seen: [] };
    law("witness", WITNESS(), NULL_WORLD, t);
    const { scene, svg } = compile(WITNESS(), { noCache: true });
    expect(scene!.sizes.roomFont).toBeCloseTo(379.8, 6);
    expect(drawnNames(svg).map((n) => n.lines)).toEqual([
      // "Accessible" alone is 10 × 0.62 × 379.8 = 2355 mm by the shared estimate, wider than
      // the 2225 mm clear: no wrapped form fits, so the overflowing line is left as it was.
      ["Accessible WC"],
      // 1974 mm-class: 2119 mm in a room 2050 mm clear, which no position clears.
      ["Bedroom", "3"],
      // "Sleeping" alone (1884 mm) is wider than the 1800 mm alcove.
      ["Sleeping Alcove"],
      ["Living / Kitchen"],
    ]);
  });

  it("on an A3 sheet (smaller text) the same names fit on one line, and nothing moves", () => {
    const t: Tally = { plans: 0, wrapped: 0, knockOns: 0, seen: [] };
    const src = WITNESS("  paper A3 landscape\n  scale 1:50\n");
    law("A3", src, NULL_WORLD, t);
    expect(t.wrapped).toBe(0);
    expect(drawnNames(compile(src, { noCache: true }).svg).every((n) => n.lines.length === 1)).toBe(true);
  });

  it("a single word wider than its room stays one line (and a label pinned off the floor)", () => {
    const t: Tally = { plans: 0, wrapped: 0, knockOns: 0, seen: [] };
    const src = `plan "P" {
  units mm
  wall exterior thickness 200 { (0,0) (9000,0) (9000,6000) (0,6000) close }
  wall partition thickness 200 { (1500,0) (1500,6000) }
  room id=a at (0,0) size 1500x6000 label "Kitchenette"
  room id=b at (1500,0) size 7500x6000 label "Bedroom 3" at (-500,3000)
}`;
    law("single word", src, NULL_WORLD, t);
    expect(t.wrapped).toBe(0);
  });

  it("`label … at (x,y)` still pins the block: the wrapped name is centred on the pinned point", () => {
    const src = WITNESS().replace('label "Bedroom 3"', 'label "Bedroom 3" at (3550,1800)');
    const { svg } = compile(src, { noCache: true });
    const b3 = drawnNames(svg).find((n) => n.lines[0] === "Bedroom")!;
    expect(b3.lines).toEqual(["Bedroom", "3"]);
    // The `<text>`'s own anchor is the pinned point less the name's usual 0.2-font lift.
    expect(b3.text).toMatch(/^<text x="3550" y="1724.04" /);
  });
});

describe("annotate: the name is data, only the drawing wraps", () => {
  it("data-arch-label and the accessible name carry the one-line name; one <text> per name", () => {
    const { svg } = compile(WITNESS(), { noCache: true, annotate: true, accessible: true });
    const floor = elements(svg, "polygon").find((e) => attr(e.open, "data-arch-id") === "b3")!.open;
    expect(floor).toContain('data-arch-label="Bedroom 3"');
    expect(floor).toContain('aria-label="Room Bedroom 3"');
    const texts = elements(svg, "text").filter((e) => attr(e.open, "data-arch-id") === "b3");
    // The name and the area figure — two elements, as before, and the name holds both lines.
    expect(texts).toHaveLength(2);
    expect(texts[0]!.whole).toContain('data-arch-label="Bedroom 3"');
    expect(texts[0]!.whole).toContain('aria-hidden="true"');
    // Its content is exactly two `<tspan x y>` lines, "Bedroom" then "3", and nothing else.
    const lines = elements(texts[0]!.inner, "tspan");
    expect(lines.map((t) => t.inner)).toEqual(["Bedroom", "3"]);
    expect(lines.map((t) => t.whole).join("")).toBe(texts[0]!.inner);
    for (const t of lines) {
      const x = attr(t.open, "x");
      const y = attr(t.open, "y");
      expect(x && y).toBeTruthy();
      expect(t.open).toBe(`<tspan x="${x}" y="${y}">`);
    }
  });
});

describe("the backends agree on a wrapped name", () => {
  /** The witness's scene, and the SVG's lines of "Bedroom 3" — none when it did not wrap. */
  const drawn = () => {
    const { scene, svg } = compile(WITNESS(), { noCache: true });
    const name = drawnNames(svg).find((n) => n.text.includes("Bedroom"))!;
    const tspans = elements(name.text, "tspan").map((t) => {
      const x = attr(t.open, "x")!;
      const y = attr(t.open, "y")!;
      // Exactly `<tspan x y>`: no other attribute rides a line.
      expect(t.open).toBe(`<tspan x="${x}" y="${y}">`);
      return { value: t.inner, x: Number(x), y: Number(y) };
    });
    return { scene, tspans };
  };

  it("SVG: the tspans are the scene's lines at the scene's positions", () => {
    const { scene, tspans } = drawn();
    expect(tspans.map((l) => l.value)).toEqual(["Bedroom", "3"]);
    const prim = scene!.nodes.map((n) => n.prim).find((p): p is Text => p.t === "text" && p.block !== undefined)!;
    expect(tspans).toEqual(textLines(prim).map((l) => ({ value: l.value, x: l.at.x, y: l.at.y })));
  });

  it("DXF: one TEXT per line, at the same points (y flipped)", () => {
    const { scene, tspans } = drawn();
    expect(tspans).toHaveLength(2);
    const dxf = toDxf(scene!);
    const texts = [
      ...dxf.matchAll(
        /\n0\nTEXT\n8\n[^\n]*\n(?:6\n[^\n]*\n)?10\n([^\n]+)\n20\n([^\n]+)\n40\n[^\n]+\n1\n([^\n]*)(?=\n)/g,
      ),
    ].map((m) => ({ value: m[3]!, x: Number(m[1]), y: -Number(m[2]) }));
    for (const l of tspans) expect(texts).toContainEqual(l);
    expect(texts.some((t) => t.value === "Bedroom 3")).toBe(false);
  });

  it("PDF: one string per line, a pitch apart, in order", async () => {
    const { scene, tspans } = drawn();
    expect(tspans).toHaveLength(2);
    let toPdf: typeof import("../src/export/pdf.js").toPdf;
    try {
      await import("pdfkit" as string);
      ({ toPdf } = await import("../src/export/pdf.js"));
    } catch {
      if (process.env.CI) throw new Error("optional dep pdfkit missing in CI — the PDF backend was not exercised");
      return; // absent locally: the SVG/DXF halves above still ran
    }
    const { inflateSync } = await import("node:zlib");
    const pdf = Buffer.from(await toPdf(scene!));
    let ops = "";
    for (let i = 0; ; ) {
      const s = pdf.indexOf("stream", i);
      if (s < 0) break;
      const p = pdf[s + 6] === 0x0d ? s + 8 : s + 7;
      const e = pdf.indexOf("endstream", p);
      try {
        const t = inflateSync(pdf.subarray(p, e)).toString("latin1");
        if (t.includes(" cm\n")) ops = t;
      } catch {
        /* a font file */
      }
      i = e + 9;
    }
    // Each drawn string's `Tm` (page space: y up) and font size, in draw order.
    const runs = [...ops.matchAll(/1 0 0 1 ([-\d.]+) ([-\d.]+) Tm\n\/F\d+ ([\d.]+) Tf/g)].map((m) => ({
      x: Number(m[1]),
      y: Number(m[2]),
      size: Number(m[3]),
    }));
    const size = scene!.sizes.roomFont;
    // Both lines are drawn at the name's size, one after the other, exactly one pitch apart:
    // the SVG's two tspans are `pitch` apart down the page, so the PDF's are `pitch` apart up it.
    const pitch = tspans[1]!.y - tspans[0]!.y;
    const named = runs.filter((r) => Math.abs(r.size - size) < 1e-6);
    const pair = named.findIndex((r, i) => i + 1 < named.length && Math.abs(r.y - named[i + 1]!.y - pitch) < 1e-3);
    expect(pair).toBeGreaterThanOrEqual(0);
  });
});
