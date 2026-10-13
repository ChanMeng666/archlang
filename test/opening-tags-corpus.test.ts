/**
 * The corpus guard for `schedule openings` tags: inject the statement into every shipped
 * example that has a door or a window, draw every storey, and look at what each tag's frame
 * covers.
 *
 * - **No tag ever overlaps another tag.** No allow-list: two tags on top of each other read
 *   as neither.
 * - **No tag frame covers another element's ink** — a sampled point of any drawn primitive
 *   (furniture, a door leaf or swing, a dimension, an axis line, a room's name) or the wall
 *   poché — except the rows of {@link ALLOWED}, each with its reason. A tag lands on ink only
 *   when every candidate place is taken (it then keeps its first choice, never trading one
 *   conflict for another), or on a room name the label pass did not move.
 *
 * The allow-list may only SHRINK: a row that no longer covers anything fails here and must
 * be deleted, and a tag that newly covers ink fails until it is fixed or argued into the
 * list. The tags are `opening-schedule.ts`'s; the ink test is independent of its obstacle
 * model (sampled primitives, not boxes), so the two cannot agree by construction.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";
import type { World } from "../src/index.js";
import type { Point } from "../src/ast.js";
import type { Scene, SceneNode, ScenePrim } from "../src/scene.js";

const EXAMPLES = resolvePath("examples");
const world: World = {
  read: (p) => {
    try {
      return readFileSync(resolvePath(EXAMPLES, p), "utf8");
    } catch {
      return null;
    }
  },
  now: () => new Date(0),
};

/** Every tag that covers ink, as `file#page:tag`, with why it is allowed to. */
const ALLOWED: Record<string, string> = {
  "bungalow.arch:W02": "every candidate place is taken; the tag keeps its first choice (furniture:path)",
  "bungalow.arch:W03": "every candidate place is taken; the tag keeps its first choice (furniture:path)",
  "courtyard-house.arch:W06":
    "every candidate place is taken; the tag keeps its first choice (furniture:circle,furniture:path)",
  "courtyard-house.arch:W11":
    "every candidate place is taken; the tag keeps its first choice (furniture:line,furniture:path,poche)",
  "hexagon-pavilion.arch:D01":
    "a room name the label pass left under the tag (it moves a label only once buried past its threshold)",
  "hillside-villa.arch#L1:W06": "every candidate place is taken; the tag keeps its first choice (furniture:line)",
  "hillside-villa.arch#L2:W01": "every candidate place is taken; the tag keeps its first choice (furniture:path)",
  "laneway-house.arch:W01": "every candidate place is taken; the tag keeps its first choice (furniture:polygon)",
  "laneway-house.arch:W02":
    "every candidate place is taken; the tag keeps its first choice (furniture:line,furniture:path)",
  "library.arch:W13": "every candidate place is taken; the tag keeps its first choice (furniture:path)",
  "library.arch:W14": "every candidate place is taken; the tag keeps its first choice (furniture:polygon)",
  "materials.arch:W05":
    "every candidate place is taken; the tag keeps its first choice (furniture:line,furniture:polygon)",
  "museum-wings.arch:D05": "every candidate place is taken; the tag keeps its first choice (poche)",
  "museum-wings.arch:D06": "every candidate place is taken; the tag keeps its first choice (axes:line,poche)",
  "terrace-row.arch:D02":
    "every candidate place is taken; the tag keeps its first choice (furniture:line,furniture:path,poche)",
  "terrace-row.arch:W03":
    "every candidate place is taken; the tag keeps its first choice (furniture:circle,furniture:line,furniture:path)",
  "terrace-row.arch:W04": "every candidate place is taken; the tag keeps its first choice (poche)",
  "terrace-row.arch:W05":
    "a room name the label pass left under the tag (it moves a label only once buried past its threshold)",
  "terrace-row.arch:W06": "every candidate place is taken; the tag keeps its first choice (furniture:path,poche)",
  "terrace-row.arch:W08":
    "a room name the label pass left under the tag (it moves a label only once buried past its threshold)",
  "terrace-row.arch:W13":
    "every candidate place is taken; the tag keeps its first choice (furniture:circle,furniture:path,poche)",
  "terrace-row.arch:W16":
    "a room name the label pass left under the tag (it moves a label only once buried past its threshold)",
  "tiny-house.arch:D01":
    "every candidate place is taken; the tag keeps its first choice (furniture:line,furniture:path)",
  "tiny-house.arch:D02":
    "a room name the label pass left under the tag (it moves a label only once buried past its threshold)",
  "tiny-house.arch:D03":
    "every candidate place is taken; the tag keeps its first choice (furniture:line,furniture:path,poche)",
};

interface Tag {
  key: string;
  value: string;
  inside: (p: Point) => boolean;
  rim: Point[];
  box: { x0: number; y0: number; x1: number; y1: number };
}

const seg = (a: Point, b: Point, n = 40): Point[] =>
  Array.from({ length: n + 1 }, (_, k) => ({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n }));

/** Points along a primitive's ink (its outline; a text by its anchor). */
function samples(p: ScenePrim): Point[] {
  switch (p.t) {
    case "line":
      return seg(p.a, p.b);
    case "polygon":
      return p.pts.flatMap((q, i) => seg(q, p.pts[(i + 1) % p.pts.length]!));
    case "polyline":
      return p.pts.slice(1).flatMap((q, i) => seg(p.pts[i]!, q));
    case "circle":
      return Array.from({ length: 64 }, (_, k) => ({
        x: p.center.x + p.r * Math.cos((k * Math.PI) / 32),
        y: p.center.y + p.r * Math.sin((k * Math.PI) / 32),
      }));
    case "arc": {
      const a0 = Math.atan2(p.start.y - p.center.y, p.start.x - p.center.x);
      let d = Math.atan2(p.end.y - p.center.y, p.end.x - p.center.x) - a0;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      return Array.from({ length: 65 }, (_, k) => ({
        x: p.center.x + p.r * Math.cos(a0 + (d * k) / 64),
        y: p.center.y + p.r * Math.sin(a0 + (d * k) / 64),
      }));
    }
    case "path":
      return p.loops.flatMap((l) => {
        const out: Point[] = [];
        let from = l.start;
        for (const e of l.edges) {
          out.push(...seg(from, e.to));
          from = e.to;
        }
        return out;
      });
    case "region":
      return p.loops.flatMap((l) => l.flatMap((q, i) => seg(q, l[(i + 1) % l.length]!)));
    case "text":
      return [p.at];
    default:
      return [];
  }
}

function inLoops(pt: Point, loops: readonly (readonly Point[])[]): boolean {
  let c = false;
  for (const l of loops)
    for (let i = 0, j = l.length - 1; i < l.length; j = i++) {
      const a = l[i]!;
      const b = l[j]!;
      if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) c = !c;
    }
  return c;
}

/** The tags of one page: a frame (circle or box) on the annotations pass, then its text. */
function tagsOf(nodes: readonly SceneNode[], page: string): Tag[] {
  const out: Tag[] = [];
  for (let i = 1; i < nodes.length; i++) {
    const t = nodes[i]!.prim;
    const f = nodes[i - 1]!;
    if (nodes[i]!.layer !== "annotations" || f.layer !== "annotations" || t.t !== "text") continue;
    if (!/^[DW]\d{2,}$/.test(t.value)) continue;
    const fp = f.prim;
    if (fp.t === "circle") {
      const { center: c, r } = fp;
      out.push({
        key: `${page}:${t.value}`,
        value: t.value,
        inside: (p) => Math.hypot(p.x - c.x, p.y - c.y) < r - 1e-6,
        rim: samples(fp),
        box: { x0: c.x - r, y0: c.y - r, x1: c.x + r, y1: c.y + r },
      });
    } else if (fp.t === "polygon" && fp.pts.length === 4) {
      const xs = fp.pts.map((p) => p.x);
      const ys = fp.pts.map((p) => p.y);
      const b = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
      out.push({
        key: `${page}:${t.value}`,
        value: t.value,
        inside: (p) => p.x > b.x0 + 1e-6 && p.x < b.x1 - 1e-6 && p.y > b.y0 + 1e-6 && p.y < b.y1 - 1e-6,
        rim: samples(fp),
        box: b,
      });
    }
  }
  return out;
}

const examplesWithOpenings = (): string[] =>
  readdirSync(EXAMPLES)
    .filter((f) => f.endsWith(".arch"))
    .filter((f) => /^\s*(door|window)\b/m.test(readFileSync(join(EXAMPLES, f), "utf8")))
    .sort();

const withTags = (src: string): string =>
  /^\s*schedule openings\b/m.test(src) ? src : src.replace(/(plan\s+"[^"]*"\s*\{)/, "$1\n  schedule openings");

/** Per example: every tag key, the tag pairs that overlap, and every tag that covers ink. */
function survey(file: string): { tags: string[]; overlaps: string[]; ink: Map<string, string[]> } {
  const out = compile(withTags(readFileSync(join(EXAMPLES, file), "utf8")), { noCache: true, world });
  expect(out.errors, file).toEqual([]);
  const pages: { scene: Scene; name: string }[] = out.pages
    ? out.pages.map((p) => ({ scene: p.scene, name: `${file}#L${p.level}` }))
    : [{ scene: out.scene!, name: file }];
  const tags: string[] = [];
  const overlaps: string[] = [];
  const ink = new Map<string, string[]>();
  for (const { scene, name } of pages) {
    const nodes = scene.nodes;
    const ts = tagsOf(nodes, name);
    const walls = nodes
      .filter((n) => n.layer === "wallFace" && n.prim.t === "region")
      .map((n) => (n.prim as { loops: Point[][] }).loops);
    for (const t of ts) {
      tags.push(t.key);
      for (const o of ts)
        if (o !== t && t.key < o.key && o.rim.some((p) => t.inside(p))) overlaps.push(`${t.key} x ${o.value}`);
      const hits = new Set<string>();
      for (const n of nodes) {
        if (n.layer === "annotations" || n.layer === "floor" || n.layer === "wallFill" || n.layer === "wallFace")
          continue;
        if (samples(n.prim).some((p) => t.inside(p))) hits.add(`${n.layer}:${n.prim.t}`);
      }
      if (walls.some((L) => t.rim.some((p) => inLoops(p, L)))) hits.add("poche");
      if (hits.size > 0) ink.set(t.key, [...hits].sort());
    }
  }
  return { tags, overlaps, ink };
}

describe("schedule openings over the corpus — tags clear of each other and of the drawing", () => {
  const files = examplesWithOpenings();
  const results = new Map(files.map((f) => [f, survey(f)]));

  it("is not vacuous: most shipped examples have openings, and they draw many tags", () => {
    expect(files.length).toBeGreaterThan(20);
    expect([...results.values()].reduce((s, r) => s + r.tags.length, 0)).toBeGreaterThan(250);
  });

  it("no tag overlaps another tag, anywhere", () => {
    expect([...results.values()].flatMap((r) => r.overlaps)).toEqual([]);
  });

  it("no tag covers ink outside the allow-list — and every allow-list row still does (it only shrinks)", () => {
    const covering = [...results.values()].flatMap((r) => [...r.ink].map(([k, v]) => `${k} ${v.join(",")}`));
    const keys = covering.map((c) => c.split(" ")[0]!).sort();
    expect(keys, covering.join("\n")).toEqual(Object.keys(ALLOWED).sort());
  });
});
