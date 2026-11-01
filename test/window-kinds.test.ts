/**
 * Window kinds and the glazed sliding door (issue #369): what each form draws, states and refuses.
 * The byte-identity law for plans that write neither is `test/window-kinds-byte-identity.test.ts`.
 *
 * Handedness is asked by consequence, on compiled Scenes, with the pairing trick of
 * `test/glyph-chirality.test.ts`: `place c() as a at (0,0)` and `place c() as a at (W,0) mirror x`
 * land a W-wide component on the same box, so with a centred window the two plans can only differ
 * in the marks of the window itself.
 */

import { readFileSync } from "node:fs";
import { describe as suite, expect, it } from "vitest";
import {
  applyFixes,
  compile,
  describe as describePlan,
  format,
  lint,
  type PlanJson,
  planFromJson,
  planToJson,
  renderAscii,
  toDxf,
} from "../src/index.js";
import { assertWindowVocab, renderGbnf } from "../scripts/gen-gbnf.js";
import { assertVocabRendered } from "../scripts/gen-llm-spec.js";
import {
  compareScenes,
  D4_ELEMENTS,
  elementNamed,
  frameFor,
  sceneOf,
  witnessPair,
  witnessViolations,
} from "./d4-oracle.js";
import { door } from "../src/elements/door.js";
import { marksEqual, mirrorNode } from "../src/elements/glyph-chirality.js";
import { doorLeaves, doorSwing } from "../src/geometry.js";
import { DOOR_KIND_CLAUSES, DOOR_KINDS, KEYWORDS, WINDOW_KIND_HINGED, WINDOW_KINDS } from "../src/grammar/tokens.js";
import { openingRows } from "../src/opening-schedule.js";
import { parse } from "../src/parser.js";
import { resolve } from "../src/ir.js";
import type { RDoor, ResolvedElement } from "../src/ir.js";
import { BUILTIN_REGISTRY } from "../src/registry.js";
import type { SceneNode } from "../src/scene.js";
import { drawUnits, storeyPassUnits } from "../src/draw-budget.js";

const plan = (body: string, head = ""): string => `plan "W" {\n  units mm\n${head}${body}\n}\n`;
const ROOM = `  room id=r at (0,0) size 6000x4000 label "Living" uses living
  walls from rooms exterior 300 partition 100
  door on r.left at center width 1000 swing into r
`;
const withWindow = (w: string, head = ""): string => plan(`${ROOM}  ${w}\n`, head);
const windowNodes = (src: string): SceneNode[] => {
  const out = compile(src, { noCache: true });
  expect(out.errors, out.errors.join(" | ")).toEqual([]);
  return out.scene!.nodes.filter((n) => n.layer === "windows");
};
const doorNodes = (src: string): SceneNode[] => {
  const out = compile(src, { noCache: true });
  expect(out.errors, out.errors.join(" | ")).toEqual([]);
  return out.scene!.nodes.filter((n) => n.layer === "doors");
};
const elementsOf = (src: string): ResolvedElement[] => resolve(parse(src, BUILTIN_REGISTRY).plan!).ir.elements;
const errorsOf = (src: string): string[] =>
  compile(src, { noCache: true })
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => d.code ?? "");

/** Every point a primitive draws through. */
function pointsOf(n: SceneNode): { x: number; y: number }[] {
  const p = n.prim;
  if (p.t === "polygon") return p.pts;
  if (p.t === "line") return [p.a, p.b];
  if (p.t === "circle")
    return [
      { x: p.center.x - p.r, y: p.center.y - p.r },
      { x: p.center.x + p.r, y: p.center.y + p.r },
    ];
  throw new Error(`unexpected primitive ${p.t}`);
}

suite("the fixture, which writes every form", () => {
  const FIXTURE = readFileSync(new URL("./fixtures/window-kinds/window-kinds.arch", import.meta.url), "utf8");

  it("compiles and lints clean, and names nothing by id in a message", () => {
    expect(compile(FIXTURE, { noCache: true }).errors).toEqual([]);
    expect(lint(FIXTURE)).toEqual([]);
  });

  it("draws no more than the drawing budget estimated, the schedule and the legend included", () => {
    const { ir } = resolve(parse(FIXTURE, BUILTIN_REGISTRY).plan!);
    const estimate =
      ir.elements.reduce((n, e) => n + drawUnits(e, BUILTIN_REGISTRY), 0) + storeyPassUnits(ir, BUILTIN_REGISTRY);
    expect(compile(FIXTURE, { noCache: true }).scene!.nodes.length).toBeLessThanOrEqual(estimate);
  });

  it("every word is highlighted: in a `KEYWORDS` bucket, once", () => {
    const bucket = Object.values(KEYWORDS).flat() as string[];
    for (const k of [...WINDOW_KINDS, "glazed_sliding"])
      expect(
        bucket.filter((w) => w === k),
        k,
      ).toHaveLength(1);
  });
});

suite("the kind words", () => {
  it("every kind compiles, in every placement, with its clauses in the grammar's order", () => {
    for (const k of WINDOW_KINDS) {
      expect(compile(withWindow(`window ${k} on r.top at 2000 from start width 1500`)).errors, k).toEqual([]);
      expect(compile(withWindow(`window id=w ${k} on r.top width 1500 sill 900 head 2100`)).errors, k).toEqual([]);
      expect(compile(withWindow(`window ${k} at (3000,0) width 1500 wall exterior`)).errors, k).toEqual([]);
    }
  });

  it("the words stay usable as the names they have always been", () => {
    const src = plan(`  let fixed = 900
  let tilt = 3000
  room id=casement at (0,0) size 6000x4000 uses living
  wall id=sliding exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  furniture tilt_turn at (1000,1000) size fixed x fixed
  window on sliding at tilt width fixed
  window fixed on sliding at tilt + 1500 width fixed
`);
    const out = compile(src, { noCache: true });
    expect(out.errors).toEqual([]);
    const windows = (describePlan(src) as { windows: { kind?: string }[] }).windows;
    expect(windows.map((w) => w.kind)).toEqual([undefined, "fixed"]);
  });

  it("the id comes first, as on a door: a kind before it is a parse error", () => {
    expect(errorsOf(withWindow("window fixed id=w on r.top width 1500"))).toEqual(["E_PARSE"]);
  });

  it("an unknown word is the parse error it always was", () => {
    const out = compile(withWindow("window turn_tilt on r.top width 1500"), { noCache: true });
    expect(out.errors.map((e) => e.message)).toEqual(['Expected "at" but found "turn_tilt"']);
  });

  it("both generators render the table, and each guard fires on a word it does not render", () => {
    const g = renderGbnf();
    expect(g).toContain('window-kind ::= "fixed" | "casement" | "tilt" | "tilt_turn" | "sliding"');
    const body: [string, string][] = [
      ["window-stmt", '"window" ( window-kind rws )?'],
      ["window-kind", '"fixed" | "casement" | "tilt" | "tilt_turn" | "sliding"'],
    ];
    expect(() => assertWindowVocab(body)).not.toThrow();
    expect(() => assertWindowVocab(body, [...WINDOW_KINDS, "louvre"])).toThrow(/window-kind/);
    expect(() => assertWindowVocab([body[1]!])).toThrow(/unreachable/);
    expect(() => assertVocabRendered("window [fixed|casement]", "window kind", WINDOW_KINDS)).toThrow(/window kind/);
  });

  it("`format` keeps the kind and the hinge, and is idempotent", () => {
    const src = withWindow("window id=w tilt_turn on r.top at 2000 from start width 1500 hinge right sill 900");
    const out = format(src);
    expect(out).toContain("window id=w tilt_turn on r.top at 2000 from start width 1500 hinge right sill 900");
    expect(format(out)).toBe(out);
    expect(compile(out).svg).toBe(compile(src).svg);
  });
});

suite("`hinge`: authored or absent, never defaulted", () => {
  it("only the kinds that hang on a jamb take it; anything else is refused, with a fix", () => {
    expect(WINDOW_KINDS.filter((k) => WINDOW_KIND_HINGED[k])).toEqual(["casement", "tilt_turn"]);
    for (const k of ["", ...WINDOW_KINDS.filter((x) => !WINDOW_KIND_HINGED[x])]) {
      const src = withWindow(`window ${k} on r.top width 1500 hinge left`.replace("  ", " "));
      expect(errorsOf(src), k).toEqual(["E_WINDOW_KIND_CLAUSE"]);
      const fixes = compile(src, { noCache: true }).diagnostics.flatMap((d) => d.fixes ?? []);
      expect(fixes.map((f) => f.fixId)).toEqual(["window-kind-clause"]);
      const { output } = applyFixes(src, fixes);
      expect(output).not.toContain("hinge left");
      expect(compile(output, { noCache: true }).errors, k).toEqual([]);
    }
  });

  it("`near` is a door's spelling and is refused here by the parser", () => {
    expect(errorsOf(withWindow("window casement on r.top width 1500 hinge near start"))).toEqual(["E_PARSE"]);
  });

  it("`set window(hinge: …)` is refused at the key, and any other key still parses", () => {
    const refused = compile(plan(`  set window(hinge: left)\n${ROOM}  window casement on r.top width 1500\n`), {
      noCache: true,
    });
    expect(refused.errors.map((e) => e.message)).toEqual([
      "`set` cannot supply a window's `hinge`: a side is stated on the window itself, or left unstated",
    ]);
    const other = plan(`  set window(sill: 900)\n${ROOM}  window casement on r.top width 1500\n`);
    expect(compile(other, { noCache: true }).errors).toEqual([]);
    expect(errorsOf(plan(`  set door(hinge: right)\n${ROOM}`))).toEqual([]);
  });

  it("no `set` supplies a side: a door's default does not reach a window", () => {
    const bare = windowNodes(withWindow("window casement on r.top width 1500"));
    const set = windowNodes(plan(`  set door(hinge: "right")\n${ROOM}  window casement on r.top width 1500\n`));
    expect(set).toEqual(bare);
  });

  it("with no side written the mark stands on both jambs; with one, on that jamb alone", () => {
    const jambsOf = (w: string): number[] => {
      const lines = windowNodes(withWindow(w)).filter((n) => n.lineWeight === "extraThin");
      const tips = new Map<string, number>();
      for (const n of lines) {
        if (n.prim.t !== "line") continue;
        for (const q of [n.prim.a, n.prim.b]) {
          const key = `${q.x},${q.y}`;
          tips.set(key, (tips.get(key) ?? 0) + 1);
        }
      }
      // Two arms share each point, which stands on the jamb.
      return [...tips.entries()].filter(([, c]) => c === 2).map(([k]) => Number(k.split(",")[0]));
    };
    const at = "on r.top at 3000 from start width 1500";
    expect(jambsOf(`window casement ${at}`).sort((a, b) => a - b)).toEqual([2250, 3750]);
    expect(jambsOf(`window casement ${at} hinge left`)).toEqual([2250]);
    expect(jambsOf(`window casement ${at} hinge right`)).toEqual([3750]);
    expect(jambsOf(`window tilt_turn ${at} hinge left`)).toEqual([2250]);
  });
});

/** Every form, on and off a curve, through the equivariance oracle (`test/d4-oracle.ts`). */
const WITNESS = `    wall id=w exterior thickness 300 { (0,0) (8000,0) (8000,5000) (0,5000) close }
    wall id=c exterior thickness 200 { (0,7000) arc (8000,7000) radius 6000 }
    room id=a at (0,0) size 8000x5000 label "Living" uses living
    door on w at 26000 width 1000 swing inward
    door glazed_sliding on w at 19000 width 2400 slide right open 0.25
    door id=g glazed_sliding on w at 15000 width 1800
    window fixed on w at 1000 width 1200
    window casement on w at 3000 width 1200 hinge left
    window casement on w at 5000 width 1200
    window tilt on w at 7000 width 800
    window tilt_turn on w at 9500 width 1200 hinge right
    window tilt_turn on w at 11500 width 1200
    window sliding on w at 23000 width 1500
    window casement on c at 30% width 1200 hinge left
    window tilt_turn on c at 70% width 1200 hinge right`;

suite("on an L-shaped room", () => {
  const L = (openings: string): string =>
    plan(`  room id=liv polygon (0,0) (6000,0) (6000,3000) (3000,3000) (3000,6000) (0,6000) label "Living" uses living
  walls from rooms exterior 300 partition 100
  door on liv.left at 1500 from start width 1000 swing inward
${openings}
`);
  const FORMS = `  window casement on liv.top at 1500 from start width 1200 hinge left
  window fixed on liv.top at 4500 from start width 1200
  window tilt_turn on liv.right at center width 1200
  door glazed_sliding on liv.bottom at center width 2000 slide right`;

  it("every form stands on a side of the L, and the facts read it", () => {
    const out = compile(L(FORMS), { noCache: true });
    expect(out.errors).toEqual([]);
    const d = describePlan(L(FORMS));
    expect(d.windows.map((w) => [w.kind, w.room])).toEqual([
      ["casement", "liv"],
      ["fixed", "liv"],
      ["tilt_turn", "liv"],
    ]);
    expect(d.doors.at(-1)).toMatchObject({ kind: "glazed_sliding", between: ["exterior", "liv"] });
    expect(lint(L(FORMS)).map((x) => x.code)).not.toContain("W_LEAF_TOO_WIDE");
  });

  it("a kind moves no fact the plain plan states, and no room", () => {
    const plain = L(
      FORMS.replace("window casement", "window")
        .replace(" hinge left", "")
        .replace("window fixed", "window")
        .replace("window tilt_turn", "window")
        .replace("door glazed_sliding", "door sliding"),
    );
    const strip = (src: string) => {
      const d = describePlan(src);
      return {
        rooms: d.rooms,
        windows: d.windows.map(({ kind: _k, ...w }) => w),
        doors: d.doors.map(({ kind: _k, ...x }) => x),
        totals: d.totals,
      };
    };
    expect(strip(L(FORMS))).toEqual(strip(plain));
  });

  it("passes the oracle: facts, lint and marks are carried by a turn and a reflection", () => {
    const body = `    room id=liv polygon (0,0) (6000,0) (6000,3000) (3000,3000) (3000,6000) (0,6000) label "Living" uses living
    walls from rooms exterior 300 partition 100
    door on liv.left at 1500 from start width 1000 swing inward
${FORMS.replace(/^ {2}/gm, "    ")}`;
    expect(compile(witnessPair(body, elementNamed("mx")).p0, { noCache: true }).errors).toEqual([]);
    for (const name of ["r90", "mx", "r90mx"]) expect(witnessViolations(body, elementNamed(name)), name).toEqual([]);
  });

  it("a notch edge, on which a side reads nothing, is refused as for a plain window", () => {
    const codes = (w: string): (string | undefined)[] =>
      compile(L(`  ${w}`), { noCache: true })
        .diagnostics.filter((x) => x.severity === "error")
        .map((x) => x.code);
    expect(codes("window fixed on liv.right at 5000 from start width 1200")).toEqual(
      codes("window on liv.right at 5000 from start width 1200"),
    );
  });
});

suite("the equivariance oracle", () => {
  it("the witness compiles: a refused plan has nothing to compare", () => {
    const { p0 } = witnessPair(WITNESS, elementNamed("mx"));
    expect(compile(p0, { noCache: true }).errors).toEqual([]);
  });

  it.each(D4_ELEMENTS.filter((g) => g.name !== "e").map((g) => [g.name, g] as const))(
    "%s: facts, lint and every drawn mark are carried by the group",
    (_name, g) => {
      expect(witnessViolations(WITNESS, g)).toEqual([]);
    },
  );

  it("the comparison can fail: a hinge on the wrong jamb is seen as a drawing violation", () => {
    const g = elementNamed("mx");
    const { p0, gP } = witnessPair(WITNESS, g, { fixedSheet: true });
    const wrong = gP.replace("width 1200 hinge left", "width 1200 hinge right");
    expect(wrong).not.toBe(gP);
    const paths = compareScenes(sceneOf(p0), sceneOf(wrong), frameFor(g, 50)).map((v) => v.key);
    expect(paths.join(" ")).toContain("window");
  });
});

/** One centred window on a W-wide component's top wall, plain or mirrored onto the same box. */
const W = 6000;
const mirrored = (stmt: string, mirror: "" | "x"): string => `plan "M" {
  component c() {
    wall id=w exterior thickness 300 { (0,0) (${W},0) (${W},4000) (0,4000) close }
    room id=a at (0,0) size ${W}x4000 uses living
    ${stmt}
  }
  place c() as i at ${mirror ? `(${W},0)` : "(0,0)"}${mirror ? " mirror x" : ""}
}
`;
const TOP = `on w at ${W / 2} width 1500`;

suite("handedness", () => {
  const symmetric = ["fixed", "tilt", "sliding", "casement", "tilt_turn"];

  it("a window with no hinge written states no hand: mirrored, it draws the same marks", () => {
    // Marks, not bytes: a reflection walks a plain window's own cover the other way round too.
    for (const k of ["", ...symmetric]) {
      const stmt = `window ${k} ${TOP}`.replace("  ", " ");
      expect(marksEqual(windowNodes(mirrored(stmt, "x")), windowNodes(mirrored(stmt, ""))), k).toBe(true);
    }
  });

  it("a written hinge is a hand: mirrored, the window draws the reflection, and not a copy", () => {
    for (const k of ["casement", "tilt_turn"]) {
      const stmt = `window ${k} ${TOP} hinge left`;
      const plain = windowNodes(mirrored(stmt, ""));
      const flipped = windowNodes(mirrored(stmt, "x"));
      expect(
        marksEqual(
          flipped,
          plain.map((n) => mirrorNode(n, W / 2)),
        ),
        k,
      ).toBe(true);
      expect(marksEqual(flipped, plain), k).toBe(false);
    }
  });

  it("`hinge` survives a reflection as the mirror image, on the jamb it was carried to", () => {
    const left = windowNodes(mirrored(`window casement ${TOP} hinge left`, ""));
    const right = windowNodes(mirrored(`window casement ${TOP} hinge right`, ""));
    const flipped = windowNodes(mirrored(`window casement ${TOP} hinge left`, "x"));
    // Reflected, `left` draws what `right` draws on the plain wall, which is the point of riding
    // the traversal: nothing needs flipping and nothing is flipped twice.
    expect(marksEqual(flipped, right)).toBe(true);
    expect(marksEqual(flipped, left)).toBe(false);
  });

  it("the symmetry fact sees the kind and the written side, and not an unwritten one", () => {
    const pair = (a: string, b: string): string =>
      plan(`  wall id=w exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  room id=r at (0,0) size 6000x4000 uses living
  window ${a} on w at 1500 width 1200
  window ${b} on w at 4500 width 1200
`);
    const full = (src: string) =>
      (describePlan(src, { facts: ["symmetry"] }) as { symmetry?: { layers: { full: unknown } } }).symmetry?.layers
        .full;
    const axis = expect.objectContaining({ group: "D1", axis: "x" });
    expect(full(pair("casement", "casement"))).toEqual(axis);
    expect(full(pair("fixed", "fixed"))).toEqual(axis);
    // A kind each side of the axis is two different windows.
    expect(full(pair("fixed", "tilt"))).not.toEqual(axis);
    // The same written side on both jambs' ways is no mirror image; opposite sides are.
    const walled = (a: string, b: string): string =>
      plan(`  wall id=w exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  room id=r at (0,0) size 6000x4000 uses living
  window casement on w at 1500 width 1200 ${a}
  window casement on w at 4500 width 1200 ${b}
`);
    expect(full(walled("hinge left", "hinge left"))).not.toEqual(axis);
    expect(full(walled("hinge left", "hinge right"))).toEqual(axis);
  });
});

suite("what each kind draws", () => {
  const glass = (nodes: SceneNode[]): SceneNode[] =>
    nodes.filter((n) => n.prim.t === "line" && n.lineWeight === undefined && n.paint.stroke !== undefined);

  it("`fixed` is one glass line on the centreline where a plain window has two", () => {
    const plain = glass(windowNodes(withWindow("window on r.top width 1500")));
    const fixed = glass(windowNodes(withWindow("window fixed on r.top width 1500")));
    expect(plain).toHaveLength(4); // the two wall faces and two panes
    expect(fixed).toHaveLength(3);
    const pane = fixed.filter((n) => n.paint.stroke === plain[2]!.paint.stroke);
    expect(pane).toHaveLength(1);
    expect(pane[0]!.prim).toMatchObject({ a: { y: 0 }, b: { y: 0 } });
  });

  it("an impossible width is the refusal it always was, on every kind", () => {
    for (const k of WINDOW_KINDS) {
      for (const width of ["0", "-400"]) {
        const out = compile(withWindow(`window ${k} on r.top at 3000 from start width ${width}`), { noCache: true });
        expect(
          out.diagnostics.map((d) => d.code),
          k,
        ).toContain("E_WINDOW_WIDTH");
        expect(out.svg, k).not.toMatch(/NaN|Infinity|r="-/);
      }
    }
  });

  it("the kinds are five different drawings, and none is the plain window", () => {
    const at = "on r.top at 3000 from start width 1500";
    const drawings = new Set(
      ["", ...WINDOW_KINDS].map((k) => JSON.stringify(windowNodes(withWindow(`window ${k} ${at}`)))),
    );
    expect(drawings.size).toBe(WINDOW_KINDS.length + 1);
  });

  it("a kind reads no height: the sill and head move no mark", () => {
    for (const k of WINDOW_KINDS) {
      const at = `window ${k} on r.top width 1500`;
      const low = windowNodes(withWindow(`${at} sill 0 head 1800`));
      const high = windowNodes(withWindow(`${at} sill 1500 head 2400`));
      expect(low, k).toEqual(high);
    }
  });

  it("every mark stays in the reveal: within the wall's thickness and the opening's width", () => {
    // 1 mm of the corner is a rounding margin on the rotated wall.
    for (const width of [160, 600, 1500, 4000]) {
      for (const k of WINDOW_KINDS) {
        const src = withWindow(`window ${k} on r.top at 3000 from start width ${width}`);
        const marks = windowNodes(src).slice(5);
        for (const n of marks.filter((m) => m.paint.stroke === windowNodes(src)[3]!.paint.stroke)) {
          for (const p of pointsOf(n)) {
            expect(Math.abs(p.x - 3000), `${k} ${width}`).toBeLessThanOrEqual(width / 2);
            expect(Math.abs(p.y), `${k} ${width}`).toBeLessThanOrEqual(150);
          }
        }
      }
    }
  });

  it("a thick wall draws no fan: a mark's spread is capped by the half-width, as its reach is", () => {
    const thick = (w: string): string =>
      plan(`  wall id=t exterior thickness 1500 { (0,0) (6000,0) }\n  ${w} at (3000,0) width 300 wall t\n`);
    const offWall = (n: SceneNode): number => Math.max(...pointsOf(n).map((p) => Math.abs(p.y)));
    const marks = (w: string): SceneNode[] =>
      windowNodes(thick(w)).filter((n) => n.lineWeight === "extraThin" || n.paint.fill === n.paint.stroke);
    for (const n of marks("window casement")) expect(offWall(n)).toBeLessThanOrEqual(75);
    for (const n of marks("window sliding")) expect(offWall(n)).toBeLessThanOrEqual(0.3 * 150);
    const arrow = doorNodes(
      thick("door glazed_sliding").replace(" at (3000,0) width 300 wall t", " at (3000,0) width 400 wall t"),
    )
      .filter((n) => n.prim.t === "polygon" && n.paint.fill === n.paint.stroke)
      .flatMap(pointsOf);
    const ys = arrow.map((p) => p.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(2 * 55); // a quarter of the 220 mm panel
  });

  it("marks follow a curved wall's tangent, as the glazing does", () => {
    const src = plan(`  wall id=w exterior thickness 200 { (0,0) arc (8000,0) radius 6000 }
  window casement on w at 50% width 1200 hinge left
`);
    const nodes = windowNodes(src);
    expect(nodes.filter((n) => n.lineWeight === "extraThin")).toHaveLength(2);
  });

  it("no kind draws more than `drawCost` says, and a plain window still says 6", () => {
    const { ir } = resolve(parse(withWindow("window on r.top width 1500"), BUILTIN_REGISTRY).plan!);
    const plain = ir.elements.find((e) => e.kind === "window")!;
    expect(drawUnits(plain, BUILTIN_REGISTRY)).toBe(6);
    for (const k of WINDOW_KINDS) {
      for (const hinge of WINDOW_KIND_HINGED[k] ? ["", " hinge left"] : [""]) {
        const src = withWindow(`window ${k} on r.top width 1500${hinge}`);
        const el = elementsOf(src).find((e) => e.kind === "window")!;
        expect(windowNodes(src).length, k).toBeLessThanOrEqual(drawUnits(el, BUILTIN_REGISTRY));
      }
    }
  });

  it("the ASCII backend still finds the window by its cover, and the door by its", () => {
    const ascii = (src: string): string => renderAscii(compile(src, { noCache: true }).scene!);
    const plain = ascii(withWindow("window on r.top width 1500"));
    for (const k of WINDOW_KINDS) expect(ascii(withWindow(`window ${k} on r.top width 1500`)), k).toBe(plain);
    const sliding = ascii(plan(`${ROOM}  door sliding on r.bottom at center width 2400\n`));
    expect(ascii(plan(`${ROOM}  door glazed_sliding on r.bottom at center width 2400\n`))).toBe(sliding);
  });

  it("DXF carries the marks on the glazing layer and the glass door on the door layer", () => {
    const layersOf = (src: string): string[] =>
      [...toDxf(compile(src, { noCache: true }).scene!).matchAll(/\n8\n(A-[A-Z-]+)\n/g)].map((m) => m[1]!);
    const count = (src: string, layer: string): number => layersOf(src).filter((l) => l === layer).length;
    const plain = withWindow("window on r.top width 1500");
    const marked = withWindow("window tilt_turn on r.top width 1500");
    expect(count(marked, "A-GLAZ")).toBe(count(plain, "A-GLAZ") + 5);
    const sliding = plan(`${ROOM}  door sliding on r.bottom at center width 2400\n`);
    const glazed = plan(`${ROOM}  door glazed_sliding on r.bottom at center width 2400\n`);
    expect(count(glazed, "A-DOOR")).toBeGreaterThan(count(plan(ROOM), "A-DOOR"));
    expect(count(glazed, "A-GLAZ")).toBe(count(sliding, "A-GLAZ"));
  });
});

suite("`describe --json` and the schedule", () => {
  const SHEET = "  schedule openings\n";

  it("a written kind is `windows[].kind`, in the place a door's sits; none adds no key", () => {
    const rows = (src: string) => describePlan(src).windows as unknown as Record<string, unknown>[];
    expect(Object.keys(rows(withWindow("window fixed on r.top width 1500"))[0]!)).toEqual([
      "id",
      "room",
      "width",
      "relation",
      "kind",
      "facing",
    ]);
    expect(rows(withWindow("window on r.top width 1500"))[0]).not.toHaveProperty("kind");
    expect(rows(withWindow("window casement on r.top width 1500 hinge left"))[0]).not.toHaveProperty("hinge");
  });

  it("the TYPE column prints the kind, `window` for none, and HAND stays `-`", () => {
    const src = plan(
      `${ROOM}  window tilt_turn on r.top at 1500 from start width 1500 hinge left
  window on r.top at 4500 from start width 1500
  door glazed_sliding on r.bottom at center width 2400
`,
      SHEET,
    );
    const rows = openingRows(elementsOf(src));
    expect(rows.map((r) => [r.tag, r.type, r.hand])).toEqual([
      ["D01", "hinged", "left"],
      ["D02", "glazed_sliding", "-"],
      ["W01", "tilt_turn", "-"],
      ["W02", "window", "-"],
    ]);
  });

  it("the column widens only for a word that would not fit: `sliding` keeps its width", () => {
    const typeW = (w: string): number => {
      const nodes = compile(plan(`${ROOM}  ${w}\n`, SHEET), { noCache: true }).scene!.nodes;
      const headings = nodes.filter((n) => n.prim.t === "text" && ["TYPE", "HAND"].includes(n.prim.value));
      const xs = headings.map((n) => (n.prim.t === "text" ? n.prim.at.x : 0));
      return xs[1]! - xs[0]!;
    };
    const plain = typeW("window on r.top width 1500");
    expect(typeW("window sliding on r.top width 1500")).toBe(plain);
    expect(typeW("window tilt on r.top width 1500")).toBe(plain);
    expect(typeW("window tilt_turn on r.top width 1500")).toBeGreaterThan(plain);
    expect(typeW("door glazed_sliding on r.bottom at center width 2400")).toBeGreaterThan(plain);
  });

  it("a glazed door's tag stands where a `sliding` door's does: the panel is in the wall", () => {
    const tagAt = (kind: string): unknown => {
      const nodes = compile(plan(`${ROOM}  door id=x ${kind} on r.bottom at center width 2400\n`, SHEET), {
        noCache: true,
      }).scene!.nodes;
      return nodes.find((n) => n.prim.t === "text" && n.prim.value === "D02")?.prim;
    };
    expect(tagAt("glazed_sliding")).toEqual(tagAt("sliding"));
  });
});

suite("`schedule rooms net`", () => {
  const SHEET = "  schedule rooms net\n  schedule openings\n  legend\n";
  const KINDS = `${ROOM}  window tilt_turn on r.top at 1500 from start width 1500 hinge left
  window fixed on r.top at 4500 from start width 1500
  door glazed_sliding on r.bottom at center width 2400 slide right
`;
  const TWIN = `${ROOM}  window on r.top at 1500 from start width 1500
  window on r.top at 4500 from start width 1500
  door sliding on r.bottom at center width 2400 slide right
`;
  const stamps = (src: string): string[] =>
    compile(src, { noCache: true })
      .scene!.nodes.filter((n) => n.layer === "labels")
      .flatMap((n) => (n.prim.t === "text" ? [n.prim.value] : []));

  it("the stamp and the schedule read the walls: a kind moves neither", () => {
    expect(compile(plan(KINDS, SHEET), { noCache: true }).errors).toEqual([]);
    expect(stamps(plan(KINDS, SHEET)).join(" ")).toContain("net");
    expect(stamps(plan(KINDS, SHEET))).toEqual(stamps(plan(TWIN, SHEET)));
    expect(describePlan(plan(KINDS, SHEET)).schedule).toEqual(describePlan(plan(TWIN, SHEET)).schedule);
  });

  it("a kind's marks stay out of the stamp's way, net or not: the label lands where the twin's does", () => {
    const labels = (src: string) =>
      compile(src, { noCache: true })
        .scene!.nodes.filter((n) => n.layer === "labels")
        .map((n) => n.prim);
    expect(labels(plan(KINDS, SHEET))).toEqual(labels(plan(TWIN, SHEET)));
  });
});

suite("the legend", () => {
  const rowsOf = (src: string): string[] => {
    const nodes = compile(src, { noCache: true }).scene!.nodes;
    const at = nodes.findIndex((n) => n.prim.t === "text" && n.prim.value === "LEGEND");
    return nodes
      .slice(at)
      .flatMap((n) => (n.prim.t === "text" && n.layer === "annotations" ? [n.prim.value] : []))
      .slice(1);
  };

  it("a row per kind in use, in the table's order, after the fixtures, and none otherwise", () => {
    const src = plan(
      `${ROOM}  furniture sofa at (2000,2000) size 2000x900
  window tilt on r.top at 1000 from start width 800
  window casement on r.top at 3000 from start width 800
  window casement on r.top at 5000 from start width 800
  door glazed_sliding on r.bottom at center width 2400
`,
      "  legend\n",
    );
    expect(rowsOf(src)).toEqual(["poche", "sofa", "casement window", "tilt window", "glazed_sliding door"]);
    expect(rowsOf(plan(`${ROOM}  window on r.top width 800\n`, "  legend\n"))).toEqual(["poche"]);
    expect(rowsOf(plan(`${ROOM}  door sliding on r.bottom at center width 2400\n`, "  legend\n"))).toEqual(["poche"]);
  });

  it("the name column holds its longest row, and a legend without one keeps its width", () => {
    const widthOf = (body: string): number => {
      const nodes = compile(plan(`${ROOM}${body}`, "  legend\n"), { noCache: true }).scene!.nodes;
      const frame = nodes
        .slice(nodes.findIndex((n) => n.prim.t === "text" && n.prim.value === "LEGEND") - 1)
        .find((n) => n.prim.t === "polygon");
      const xs = frame!.prim.t === "polygon" ? frame!.prim.pts.map((p) => p.x) : [];
      return Math.max(...xs) - Math.min(...xs);
    };
    const plain = widthOf("");
    expect(widthOf("  window tilt_turn on r.top width 800\n")).toBe(plain);
    expect(widthOf("  door glazed_sliding on r.bottom at center width 2400\n")).toBeGreaterThan(plain);
  });

  it("the sheet fit counts those rows, on the drawing it is measured on", () => {
    const body = `${ROOM}  window fixed on r.top at 1000 from start width 800
  window tilt on r.top at 3000 from start width 800
  window sliding on r.top at 5000 from start width 800
`;
    const out = compile(plan(body, "  paper A4 landscape\n  scale 1:50\n  legend\n"), { noCache: true });
    expect(out.errors).toEqual([]);
    expect(out.svg).toContain("sliding window");
  });

  it("is within the drawing budget's estimate", () => {
    const src = plan(`${ROOM}  window tilt_turn on r.top width 800\n`, "  legend\n");
    expect(compile(src, { noCache: true }).errors).toEqual([]);
  });
});

/** Every rule the door family answers to, on one plan: the same plan with `sliding` and with the
 *  glass kind must agree on all of them, but for the one reading the kind changes on purpose. */
const TERRACE = (kind: string, width = 2400): string =>
  plan(`  room id=hall at (0,0) size 2000x4000 label "Hall" uses hall
  room id=liv at (2000,0) size 6000x4000 label "Living" uses living
  walls from rooms exterior 300 partition 100
  door on hall.left at center width 1000 swing inward
  door between hall and liv at center width 900 swing into liv
  door ${kind} on liv.bottom at center width ${width}
  outdoor balcony at (3000,4300) size 4000x1500
`);

suite("`door glazed_sliding` is a door", () => {
  it("is in the family's table: `slide` and `open` as `sliding`", () => {
    expect(DOOR_KINDS).toContain("glazed_sliding");
    expect(DOOR_KIND_CLAUSES.glazed_sliding).toEqual(DOOR_KIND_CLAUSES.sliding);
    expect(errorsOf(TERRACE("glazed_sliding").replace("width 2400", "width 2400 slide right open 0.25"))).toEqual([]);
    for (const clause of ["hinge left", "swing in"]) {
      expect(errorsOf(TERRACE("glazed_sliding").replace("width 2400", `width 2400 ${clause}`))).toEqual([
        "E_DOOR_KIND_CLAUSE",
      ]);
    }
  });

  it("is refused on a curved wall, as its family is", () => {
    const src = plan(`  wall id=w exterior thickness 200 { (0,0) arc (8000,0) radius 6000 }
  door glazed_sliding on w at 50% width 1800
`);
    expect(errorsOf(src)).toEqual(["E_DOOR_KIND_CURVED"]);
  });

  it("sweeps nothing: `doorSwing` is null, `doorLeaves` empty, the hand `-`", () => {
    const d = elementsOf(TERRACE("glazed_sliding")).find(
      (e): e is RDoor => e.kind === "door" && e.doorKind === "glazed_sliding",
    )!;
    expect(doorSwing(d)).toBeNull();
    expect(doorLeaves(d)).toEqual([]);
    expect(d.slide).toBe("left");
    expect(d.open).toBe(0.5);
  });

  it("the access graph, the entrance and every door rule read it as `sliding`, but for the width", () => {
    const facts = (kind: string) => {
      const d = describePlan(TERRACE(kind));
      return { main: d.access.mainEntrance, doors: d.doors.map(({ kind: _k, ...rest }) => rest) };
    };
    expect(facts("glazed_sliding")).toEqual(facts("sliding"));
    const codes = (src: string): string[] => lint(src).map((x) => x.code ?? "");
    expect(codes(TERRACE("glazed_sliding"))).toEqual(codes(TERRACE("sliding")));
  });

  it("no wide-leaf warning, and it serves a balcony", () => {
    const codes = lint(TERRACE("glazed_sliding", 3000)).map((x) => x.code);
    expect(codes).not.toContain("W_LEAF_TOO_WIDE");
    expect(codes).not.toContain("W_BALCONY_NO_DOOR");
    expect(lint(TERRACE("", 1800)).map((x) => x.code)).toContain("W_LEAF_TOO_WIDE");
  });

  it("a person passes through the panel that moves: the width that is read is half", () => {
    const wide = lint(TERRACE("glazed_sliding", 1800));
    expect(wide.map((x) => x.code)).not.toContain("W_DOOR_CLEARANCE");
    const narrow = lint(TERRACE("glazed_sliding", 1200)).filter((x) => x.code === "W_DOOR_CLEARANCE");
    expect(narrow).toHaveLength(1);
    expect(narrow[0]!.message).toContain("600 mm");
    expect(narrow[0]!.hints?.[0]).toContain("1400 mm");
    // `door sliding` keeps its reading of the whole width (the byte law holds it).
    expect(lint(TERRACE("sliding", 1200)).map((x) => x.code)).not.toContain("W_DOOR_CLEARANCE");
  });

  it("is not a garage door: the vehicle rules do not read it", () => {
    const garage = (kind: string): string =>
      plan(`  room id=g at (0,0) size 3000x6200 label "Garage" uses garage
  walls from rooms exterior 300 partition 100
  door ${kind} on g.bottom at center width 2400
  door on g.top at center width 900 swing inward
  furniture car at (600,800) size 1800x4600 in g
`);
    expect(lint(garage("glazed_sliding")).map((x) => x.code)).toEqual(lint(garage("sliding")).map((x) => x.code));
    expect(lint(garage("glazed_sliding")).map((x) => x.code)).toEqual(
      expect.arrayContaining(lint(garage("sliding")).map((x) => x.code)),
    );
  });

  it("draws glass in the window's ink, one fixed and one moving panel, and an arrow", () => {
    const src = plan(`${ROOM}  door glazed_sliding on r.bottom at center width 2400 open 0\n`);
    const nodes = doorNodes(src).slice(-5);
    const pane = windowNodes(withWindow("window on r.top width 1500"))[3]!.paint.stroke;
    expect(nodes.filter((n) => n.paint.stroke === pane)).toHaveLength(2);
    expect(nodes.filter((n) => n.prim.t === "line")).toHaveLength(1);
    expect(nodes[0]!.paint.fill).toBe("none"); // the cover, then the four the budget counts
    expect(nodes).toHaveLength(door.drawCost!(elementsOf(src).at(-1)!));
  });

  it("`open` moves the moving panel and leaves the fixed one, and `slide` swaps them", () => {
    const panels = (clause: string): string[] =>
      doorNodes(plan(`${ROOM}  door glazed_sliding on r.bottom at center width 2400 ${clause}\n`))
        .filter((n) => n.prim.t === "polygon" && n.paint.stroke !== undefined && n.paint.fill !== n.paint.stroke)
        .slice(-2)
        .map((n) => JSON.stringify(n.prim));
    const [fixed0, moving0] = panels("open 0");
    const [fixed1, moving1] = panels("open 1");
    expect(fixed0).toBe(fixed1);
    expect(moving0).not.toBe(moving1);
    expect(panels("slide left open 0")).not.toEqual(panels("slide right open 0"));
  });

  it("mirrored, it draws the reflection: the track is a handed choice it shares with `sliding`", () => {
    const stmt = `door glazed_sliding ${TOP} open 0`;
    const plain = doorNodes(mirrored(stmt, ""));
    const flipped = doorNodes(mirrored(stmt, "x"));
    const axis = W / 2;
    const q = (ns: SceneNode[]): SceneNode[] => ns.filter((n) => n.prim.t !== "path");
    expect(
      marksEqual(
        q(flipped),
        q(plain).map((n) => mirrorNode(n, axis)),
      ),
    ).toBe(true);
    expect(marksEqual(q(flipped), q(plain))).toBe(false);
  });

  it("the symmetry fact reads its track as `sliding`'s, not a `swing` it does not draw", () => {
    const stmtAt = (x: number, s: string): string => `  door glazed_sliding on w at ${x} width 1200 slide ${s}`;
    const src = (a: string, b: string): string =>
      plan(`  wall id=w exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  room id=r at (0,0) size 6000x4000 uses living
${stmtAt(1500, a)}
${stmtAt(4500, b)}
`);
    const facts = (s: string) =>
      describePlan(s, { facts: ["symmetry"] }) as { symmetry?: { layers: { full: unknown } } };
    const pairSliding = (a: string, b: string): string => src(a, b).replaceAll("glazed_sliding", "sliding");
    expect(JSON.stringify(facts(src("left", "right")).symmetry?.layers.full)).toBe(
      JSON.stringify(facts(pairSliding("left", "right")).symmetry?.layers.full),
    );
    expect(JSON.stringify(facts(src("left", "left")).symmetry?.layers.full)).toBe(
      JSON.stringify(facts(pairSliding("left", "left")).symmetry?.layers.full),
    );
  });

  it("`measures()` reaches what it draws, and a plainer door's stay three numbers", () => {
    const els = elementsOf(TERRACE("glazed_sliding"));
    const glazed = els.find((e): e is RDoor => e.kind === "door" && e.doorKind === "glazed_sliding")!;
    const plain = els.find((e): e is RDoor => e.kind === "door" && e.doorKind === undefined)!;
    expect(door.measures!(plain)).toHaveLength(3);
    const m = door.measures!(glazed);
    expect(Math.max(...m)).toBe(glazed.at.x + glazed.width / 2 + 150);
    expect(Math.min(...m)).toBeLessThanOrEqual(glazed.at.x - glazed.width / 2 - 150);
  });
});

suite("`W_BALCONY_NO_DOOR` reads what a kind says", () => {
  const balcony = (w: string): string =>
    plan(`  room id=liv at (0,0) size 6000x4000 uses living
  walls from rooms exterior 300 partition 100
  door on liv.left at center width 1000 swing inward
  ${w}
  outdoor balcony at (1000,4300) size 4000x1500
`);
  const warned = (w: string) => lint(balcony(w)).filter((x) => x.code === "W_BALCONY_NO_DOOR");

  it("a pane that does not open, or a sash that only tilts, is no way out, even at the floor", () => {
    for (const w of ["window fixed", "window tilt"]) {
      for (const sill of ["", " sill 0"]) {
        const hit = warned(`${w} on liv.bottom at center width 2000${sill}`);
        expect(hit, `${w}${sill}`).toHaveLength(1);
        expect(hit[0]!.message).toContain("is not one to walk through");
        expect(hit[0]!.hints?.[0]).toContain("`casement`");
        expect(hit[0]!.hints?.[0]).not.toContain("sill 0");
      }
    }
  });

  it("a window that opens counts as a plain one does, and the old wording is untouched", () => {
    for (const k of ["casement", "tilt_turn", "sliding", ""]) {
      expect(warned(`window ${k} on liv.bottom at center width 2000`.replace("  ", " ")), k).toEqual([]);
      expect(
        warned(`window ${k} on liv.bottom at center width 2000 sill 900`.replace("  ", " "))[0]?.message,
        k,
      ).toContain("has its sill at 900 mm");
    }
  });

  it("names windows, not ids, in the message", () => {
    const hit = warned("window id=pane fixed on liv.bottom at center width 2000");
    expect(hit[0]!.message).not.toContain("pane");
    expect(hit[0]!.hints?.[0]).toContain("`pane`");
  });
});

suite("Plan JSON", () => {
  const roundTrip = (src: string): string => {
    const { json, dropped } = planToJson(src) as { json: PlanJson; dropped?: { clause: string }[] };
    expect((dropped ?? []).map((d) => d.clause)).toEqual([]);
    const { source, diagnostics } = planFromJson(json);
    expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    return source!;
  };

  it("carries a window's kind and a written hinge, and the same drawing comes back", () => {
    for (const k of WINDOW_KINDS) {
      for (const hinge of WINDOW_KIND_HINGED[k] ? ["", " hinge right"] : [""]) {
        const src = withWindow(`window id=w ${k} on r.top at 2000 from start width 1500${hinge}`);
        const row = (planToJson(src).json as PlanJson).openings!.find((o) => o.id === "w")!;
        expect(row.window_kind, k).toBe(k);
        expect(row.hinge, k).toBe(hinge ? "right" : undefined);
        expect(compile(roundTrip(src), { noCache: true }).svg, `${k}${hinge}`).toBe(
          compile(src, { noCache: true }).svg,
        );
      }
    }
  });

  it("a `hinge` on a window with no kind that takes it is refused, not dropped", () => {
    for (const [kind, id] of [
      [undefined, "w"],
      ["fixed", "w"],
    ] as const) {
      const json = structuredClone(planToJson(withWindow("window id=w on r.top width 1500")).json as PlanJson);
      const row = json.openings!.find((o) => o.id === id)!;
      row.hinge = "left";
      if (kind) row.window_kind = kind;
      const { source, diagnostics } = planFromJson(json);
      expect(source, kind).toBeUndefined();
      expect(diagnostics.map((d) => d.message).join(" "), kind).toContain("`casement` or `tilt_turn`");
    }
  });

  it("a plain window's row has neither key", () => {
    const row = (planToJson(withWindow("window id=w on r.top width 1500")).json as PlanJson).openings!.find(
      (o) => o.id === "w",
    )!;
    expect(Object.keys(row)).not.toContain("window_kind");
    expect(Object.keys(row)).not.toContain("hinge");
  });

  it("carries the door's kind by the table, and refuses a kind on the wrong row", () => {
    const src = plan(`${ROOM}  door id=x glazed_sliding on r.bottom at center width 2400 slide right\n`);
    const row = (planToJson(src).json as PlanJson).openings!.find((o) => o.id === "x")!;
    expect(row).toMatchObject({ door_kind: "glazed_sliding", slide: "right" });
    expect(compile(roundTrip(src), { noCache: true }).svg).toBe(compile(src, { noCache: true }).svg);
    const json = structuredClone(planToJson(src).json as PlanJson);
    json.openings!.find((o) => o.id === "x")!.window_kind = "fixed";
    expect(planFromJson(json).diagnostics.map((d) => d.severity)).toContain("error");
    const bad = structuredClone(planToJson(withWindow("window id=w on r.top width 1500")).json as PlanJson);
    (bad.openings!.find((o) => o.id === "w") as { window_kind?: string }).window_kind = "louvre";
    expect(planFromJson(bad).diagnostics.map((d) => d.severity)).toContain("error");
  });
});
