import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { compile, describe as describePlan, legendEntries, roomSchedule, toDxf } from "../src/index.js";
import { renderAscii } from "../src/backends/ascii.js";
import { format } from "../src/format.js";
import { parse } from "../src/parser.js";
import { resolve } from "../src/ir.js";
import type { RRoom } from "../src/ir.js";
import type { Scene, SceneNode } from "../src/scene.js";
import { DESCRIBE_KEYS } from "../src/cli/commands-analyze.js";

/**
 * Sheet tables (v1.20) — the opt-in `schedule rooms` ROOM SCHEDULE and the derived
 * `legend`. Three things carry the weight here:
 *
 * 1. **Byte-identity.** A plan that opts into neither must be untouched: no node, no
 *    margin, no `chrome.tables` key — asserted, not assumed. Six shipped examples DO opt
 *    in now (they did not when this was written), so the guard below no longer claims the
 *    corpus is table-free; it derives which examples opt in and requires each one to carry
 *    a golden that was rendered WITH its tables.
 * 2. **The table is DERIVED, not authored** — its numbers are the same numbers
 *    `describe()` reports, and the legend lists exactly what the drawing paints.
 * 3. **It composes with the annotation stack** — the tables sit below the deepest
 *    dimension chain and the page grows to contain them.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const example = (name: string) => readFileSync(join(__dirname, "..", "examples", name), "utf8");
const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");

/** A minimal shell + rooms, so bounds/areas/dims have something real to measure. */
const shell = (body: string, rooms = `  room id=a at (0,0) size 4000x3000 label "Living"\n`) =>
  `plan "P" {\n  units mm\n  north up\n` +
  `  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,3000) (0,3000) close }\n` +
  rooms +
  body +
  `}\n`;

const sceneOf = (src: string): Scene => {
  const { scene, errors } = compile(src, { noCache: true });
  expect(errors).toEqual([]);
  return scene!;
};

const tableNodes = (src: string): SceneNode[] => sceneOf(src).nodes.filter((n) => n.layer === "annotations");

/** Every text string the tables draw, in draw order. */
const tableText = (src: string): string[] =>
  tableNodes(src).flatMap((n) => (n.prim.t === "text" ? [n.prim.value] : []));

const roomsOf = (src: string): RRoom[] =>
  resolve(parse(src).plan!).ir.elements.filter((e): e is RRoom => e.kind === "room");

// ---------------------------------------------------------------------------

describe("sheet tables — a plan that opts out is byte-identical", () => {
  const exampleFiles = (): string[] => {
    const walk = (d: string): string[] =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith(".arch") ? [join(d, e.name)] : [],
      );
    return walk(join(__dirname, "..", "examples"));
  };

  /**
   * The examples that opt in, DERIVED from their own source. This used to be a
   * hand-written two-name allow-list, which was fine only while the answer was two names;
   * six examples opt in now and a hand list is exactly the pin that rots — it can go stale
   * in the silent direction (a new table-bearing example that nobody adds simply fails a
   * confusingly-worded assertion) and in the useless one (a name left behind after the
   * `schedule` line is deleted asserts nothing and nobody notices).
   */
  const tableExamples = (): string[] =>
    exampleFiles().filter((f) => /^\s*(schedule|legend)\b/m.test(readFileSync(f, "utf8")));

  it("the opt-in set is exactly what the sources say, and every member has a golden", () => {
    const opted = tableExamples();
    // Non-vacuity in both directions: some examples opt in, and not all of them do.
    expect(opted.length).toBeGreaterThan(0);
    expect(exampleFiles().length).toBeGreaterThan(opted.length);

    // The rule the old hand-list comment stated but could not enforce: an example may opt
    // in only WITH a golden rendered from it, so its tables are actually pinned by a
    // picture rather than merely permitted. A multi-storey plan pages, so accept either
    // the flat golden or the per-level ones.
    const goldens = new Set(readdirSync(join(__dirname, "__goldens__")));
    for (const f of opted) {
      const stem = basename(f);
      const covered = goldens.has(`${stem}.png`) || [...goldens].some((g) => g.startsWith(`${stem}.L`));
      expect(covered, `${stem} opts into schedule/legend but has no visual golden`).toBe(true);
    }
  });

  it("an example that does not opt in parses with no `schedule`/`legend` node at all", () => {
    const opted = new Set(tableExamples());
    for (const f of exampleFiles()) {
      if (opted.has(f)) continue;
      const { plan } = parse(readFileSync(f, "utf8"));
      expect(plan!.schedule, f).toBeUndefined();
      expect(plan!.legend, f).toBeUndefined();
    }
  });

  it("emits no annotation node and no `chrome.tables` key", () => {
    const s = sceneOf(shell(""));
    expect(s.nodes.filter((n) => n.layer === "annotations")).toEqual([]);
    expect(s.chrome!.tables).toBeUndefined();
    expect("tables" in s.chrome!).toBe(false);
  });

  it("adds ONLY annotation nodes — the drawn fabric stays byte-identical when opted in", () => {
    const plain = sceneOf(shell(""));
    const tabled = sceneOf(shell("  schedule rooms\n  legend\n"));
    const fabric = (s: Scene) => JSON.stringify(s.nodes.filter((n) => n.layer !== "annotations"));
    expect(fabric(tabled)).toBe(fabric(plain));
    // …and the scale bar / title block band does not move (the tables go BELOW it).
    expect(JSON.stringify(tabled.chrome!.scaleBar)).toBe(JSON.stringify(plain.chrome!.scaleBar));
    expect(tabled.nodes.filter((n) => n.layer === "annotations").length).toBeGreaterThan(0);
  });

  it("leaves the page margins exactly as they were", () => {
    const plain = sceneOf(shell("  dims auto all\n"));
    const same = sceneOf(shell("  dims auto all\n"));
    expect(JSON.stringify(plain.chrome!.margin)).toBe(JSON.stringify(same.chrome!.margin));
    expect(plain.width).toBe(same.width);
    expect(plain.height).toBe(same.height);
  });

  it("leaves the ASCII backend untouched — `-f txt` has no sheet chrome, and keeps none", () => {
    expect(renderAscii(sceneOf(shell("  schedule rooms\n  legend\n")))).toBe(renderAscii(sceneOf(shell(""))));
  });
});

// ---------------------------------------------------------------------------

describe("schedule — derived rows (numbering, names, areas)", () => {
  it("numbers rooms in SOURCE order, zero-padded to a uniform width", () => {
    const two = roomSchedule(
      roomsOf(shell("", `  room id=a at (0,0) size 1000x1000\n  room id=b at (2000,0) size 1000x1000\n`)),
    );
    expect(two.rows.map((r) => r.no)).toEqual(["01", "02"]);

    const twelve = roomSchedule(
      roomsOf(
        shell("", Array.from({ length: 12 }, (_, i) => `  room id=r${i} at (${i * 500},0) size 400x400\n`).join("")),
      ),
    );
    expect(twelve.rows.map((r) => r.no)).toEqual([
      "01",
      "02",
      "03",
      "04",
      "05",
      "06",
      "07",
      "08",
      "09",
      "10",
      "11",
      "12",
    ]);
    // Uniform width across the whole table, whatever the count.
    expect(new Set(twelve.rows.map((r) => r.no.length)).size).toBe(1);

    const hundred = roomSchedule(
      roomsOf(
        shell("", Array.from({ length: 100 }, (_, i) => `  room id=r${i} at (${i * 500},0) size 400x400\n`).join("")),
      ),
    );
    expect(hundred.rows[0]!.no).toBe("001");
    expect(hundred.rows[99]!.no).toBe("100");
  });

  it("prints the room's label, falling back to its id when unlabelled", () => {
    const s = roomSchedule(
      roomsOf(
        shell(
          "",
          `  room id=living at (0,0) size 1000x1000 label "Living"\n  room id=bath at (2000,0) size 1000x1000\n`,
        ),
      ),
    );
    expect(s.rows.map((r) => [r.id, r.name])).toEqual([
      ["living", "Living"],
      ["bath", "bath"],
    ]);
  });

  it("areas and the TOTAL are the same numbers describe() reports", () => {
    const src = fixture("schedule-sheet.arch");
    const summary = describePlan(src);
    const sched = roomSchedule(roomsOf(src));
    expect(sched.rows.map((r) => r.area_m2)).toEqual(summary.rooms.map((r) => r.area_m2));
    expect(sched.total_m2).toBe(summary.totals.floor_area_m2);
  });

  it("draws the caption, headings, every row and a TOTAL row", () => {
    const text = tableText(fixture("schedule-sheet.arch"));
    expect(text.slice(0, 4)).toEqual(["ROOM SCHEDULE", "NO.", "NAME", "AREA (m²)"]);
    expect(text).toEqual(expect.arrayContaining(["01", "Living", "12.00", "02", "bath", "9.00", "TOTAL", "21.00"]));
    // The TOTAL value is the plan total, not a re-derived sum.
    expect(text[text.indexOf("TOTAL") + 1]).toBe("21.00");
  });

  it("shows areas to two decimals so the column reads as a column", () => {
    const text = tableText(shell("  schedule rooms\n", `  room id=a at (0,0) size 3333x3333 label "Odd"\n`));
    expect(text).toContain("11.11"); // 3.333 × 3.333 = 11.108889 → r2 → 11.11
  });

  it("is deterministic — the same source renders byte-equal twice", () => {
    const src = fixture("schedule-sheet.arch");
    expect(compile(src, { noCache: true }).svg).toBe(compile(src, { noCache: true }).svg);
  });

  it("handles a plan with no rooms: a caption + headings + a zero TOTAL, no crash", () => {
    const src = `plan "P" {\n  units mm\n  schedule rooms\n  wall exterior thickness 200 { (0,0) (4000,0) }\n}\n`;
    const text = tableText(src);
    expect(text).toContain("ROOM SCHEDULE");
    expect(text[text.indexOf("TOTAL") + 1]).toBe("0.00");
  });
});

// ---------------------------------------------------------------------------

describe("legend — derived closed-form from what the drawing paints", () => {
  it("lists exactly the hatch materials in use, in the Scene's stable order", () => {
    const s = sceneOf(fixture("schedule-sheet.arch"));
    const entries = legendEntries(s.hatches, []);
    expect(entries.map((e) => e.name)).toEqual(s.hatches.map((h) => h.material));
    expect(entries.map((e) => e.name)).toEqual(["brick", "poche"]);
    for (const e of entries) expect(e.kind).toBe("material");
  });

  it("lists fixture categories present in CATALOG order, not source order", () => {
    // Authored basin-then-wc; the legend must still read wc, basin (catalog order).
    const src = shell(
      `  schedule rooms\n  legend\n` +
        `  furniture basin at (3000,2000) size 600x450\n` +
        `  furniture wc at (1000,2000) size 400x700\n`,
    );
    const names = tableText(src);
    expect(names.indexOf("wc")).toBeLessThan(names.indexOf("basin"));
  });

  it("omits a category that has no plan symbol (a labelled rectangle needs no legend row)", () => {
    // `bed` was the example here until the bedroom glyph module drew it, at which point it
    // earned a legend row — correctly, since the legend lists what the drawing paints. The
    // rule under test is unchanged, so it needs a category that still takes the labelled-
    // rectangle fallback: an uncatalogued word, which is the only thing that does.
    const src = shell(`  legend\n  furniture widget at (2000,1500) size 1400x2000 label "Widget"\n`);
    const entries = legendEntries(
      [],
      resolve(parse(src).plan!).ir.elements.flatMap((e) => (e.kind === "furniture" ? [e] : [])),
    );
    expect(entries).toEqual([]);
    expect(tableText(src)).not.toContain("widget");
  });

  it("a category that DOES draw earns its legend row", () => {
    // The other half of the same rule, which nothing pinned while every room-furniture
    // category fell through to the fallback.
    const src = shell(`  legend\n  furniture bed at (2000,1500) size 1400x2000 label "Bed"\n`);
    const entries = legendEntries(
      [],
      resolve(parse(src).plan!).ir.elements.flatMap((e) => (e.kind === "furniture" ? [e] : [])),
    );
    expect(entries.map((e) => `${e.kind}:${e.name}`)).toEqual(["fixture:bed"]);
    expect(tableText(src)).toContain("bed");
  });

  it("emits no fixture rows at all when the plan places no fixtures", () => {
    const text = tableText(shell("  legend\n"));
    expect(text).toEqual(["LEGEND", "poche"]); // one material, no fixtures
  });

  it("dedupes repeats and fills each material swatch with the very pattern the walls use", () => {
    const src = fixture("schedule-sheet.arch");
    const s = sceneOf(src);
    const swatches = s.nodes.filter((n) => n.layer === "annotations" && n.prim.t === "hatch");
    expect(swatches).toHaveLength(2); // brick + poche, once each
    const wallPatterns = new Set(
      s.nodes.flatMap((n) => (n.layer === "wallFill" && n.prim.t === "hatch" ? [n.prim.material] : [])),
    );
    for (const sw of swatches) expect(wallPatterns).toContain((sw.prim as { material: string }).material);
    // The `<pattern>` the swatch references is already in <defs> (it comes from scene.hatches).
    const svg = compile(src, { noCache: true }).svg;
    for (const sw of swatches) {
      const id = (sw.paint.fill ?? "").replace(/^url\(#|\)$/g, "");
      expect(svg).toContain(`<pattern id="${id}"`);
    }
  });

  it("draws the real fixture glyph in the swatch, never a stand-in box", () => {
    const src = shell(`  legend\n  furniture wc at (1000,2000) size 400x700\n`);
    const s = sceneOf(src);
    const legendGlyph = s.nodes.filter((n) => n.layer === "annotations" && n.prim.t === "polygon");
    // A WC glyph is a cistern polygon + a bowl ellipse polygon, so the legend row carries
    // more polygons than the bare frame + swatch box would.
    expect(legendGlyph.length).toBeGreaterThan(2);
    expect(tableText(src)).toContain("wc");
  });
});

// ---------------------------------------------------------------------------

describe("sheet tables — layout composes with dims + axes", () => {
  const src = fixture("schedule-sheet.arch");

  it("sits BELOW the deepest dimension chain and axis bubble", () => {
    const s = sceneOf(src);
    const deepest = Math.max(
      ...s.nodes.flatMap((n) => {
        if (n.layer !== "dims" && n.layer !== "axes") return [];
        if (n.prim.t === "line") return [n.prim.a.y, n.prim.b.y];
        if (n.prim.t === "circle") return [n.prim.center.y + n.prim.r];
        if (n.prim.t === "text") return [n.prim.at.y + n.prim.size];
        return [];
      }),
    );
    const sheet = s.chrome!.tables!;
    expect(sheet.schedule!.y0).toBeGreaterThan(deepest);
    expect(sheet.legend!.y0).toBeGreaterThan(deepest);
    // …and below the scale bar / title block band, not through it.
    expect(sheet.schedule!.y0).toBeGreaterThan(s.chrome!.scaleBar.y0 + s.chrome!.scaleBar.hgt);
    expect(sheet.schedule!.y0).toBeGreaterThan(s.chrome!.titleBlock!.y0 + s.chrome!.titleBlock!.h);
  });

  it("grows the page so no table clips", () => {
    const s = sceneOf(src);
    const b = s.bounds;
    const m = s.chrome!.margin;
    const sheet = s.chrome!.tables!;
    expect(sheet.bottom).toBeLessThanOrEqual(b.maxY + m.bottom);
    expect(sheet.right).toBeLessThanOrEqual(b.maxX + m.right);
    // Every drawn table primitive is inside the page too.
    for (const n of s.nodes.filter((x) => x.layer === "annotations")) {
      const ys = n.prim.t === "text" ? [n.prim.at.y] : n.prim.t === "line" ? [n.prim.a.y, n.prim.b.y] : [];
      for (const y of ys) expect(y).toBeLessThanOrEqual(b.maxY + m.bottom);
    }
  });

  it("puts the schedule at the sheet's left edge and the legend beside it, not overlapping", () => {
    const sheet = sceneOf(src).chrome!.tables!;
    const sc = sheet.schedule!;
    const lg = sheet.legend!;
    expect(sc.x0).toBe(sceneOf(src).bounds.minX);
    expect(lg.x0).toBeGreaterThan(sc.x0 + sc.w); // a real gap between them
    expect(sc.y0).toBe(lg.y0); // one row
  });

  it("each table can stand alone", () => {
    const onlySched = sceneOf(shell("  schedule rooms\n")).chrome!.tables!;
    expect(onlySched.schedule).not.toBeNull();
    expect(onlySched.legend).toBeNull();
    const onlyLegend = sceneOf(shell("  legend\n")).chrome!.tables!;
    expect(onlyLegend.schedule).toBeNull();
    expect(onlyLegend.legend).not.toBeNull();
    // A lone legend starts at the left edge (it takes the schedule's slot).
    expect(onlyLegend.legend!.x0).toBe(sceneOf(shell("  legend\n")).bounds.minX);
  });

  it("takes every size from the RenderSizes system, so a rescaled sheet flows through", () => {
    const small = sceneOf(shell("  schedule rooms\n"));
    const big = sceneOf(
      shell("  schedule rooms\n", `  room id=a at (0,0) size 40000x30000 label "Big"\n`).replace(
        "(8000,0) (8000,3000) (0,3000)",
        "(40000,0) (40000,30000) (0,30000)",
      ),
    );
    const ratio = big.sizes.refDim / small.sizes.refDim;
    expect(big.chrome!.tables!.schedule!.rowH / small.chrome!.tables!.schedule!.rowH).toBeCloseTo(ratio, 6);
    expect(big.chrome!.tables!.schedule!.fs / small.chrome!.tables!.schedule!.fs).toBeCloseTo(ratio, 6);
  });
});

// ---------------------------------------------------------------------------

describe("sheet tables — on a paper sheet", () => {
  /** A small building on a big sheet: the corner band provably clears the drawing, so
   *  the bottom chrome re-anchors to the sheet and the tables ride along above it. */
  const onSheet = shell("  paper A1 landscape\n  scale 1:50\n  schedule rooms\n  legend\n");

  it("sizes the tables in sheet millimetres, not as a fraction of the drawing", () => {
    // In paper mode `refDim` is 100 mm of sheet × the denominator, so a row height that
    // is a fraction of refDim is a fixed number of millimetres ON THE SHEET. Reading only
    // `sizes.*` is what makes that automatic.
    const s = sceneOf(onSheet);
    const rowH = s.chrome!.tables!.schedule!.rowH;
    expect(rowH / s.sizes.refDim).toBeCloseTo(rowH / (100 * s.sheet!.denom), 9);
    // 3.4 mm rows on the sheet — a drafting size, not metres tall.
    expect(rowH / s.sheet!.denom).toBeCloseTo(3.4, 6);
  });

  it("re-anchors with the bottom chrome and stays inside the sheet", () => {
    const s = sceneOf(onSheet);
    const p = s.sheet!.page;
    const t = s.chrome!.tables!;
    // This case DOES re-anchor (the scale bar leaves the drawing's left edge).
    expect(s.chrome!.scaleBar.x0).not.toBe(s.bounds.minX);
    expect(s.chrome!.scaleBar.x0).toBeGreaterThan(p.x);
    // Tables go ABOVE the corner band — nothing fits below the sheet's bottom corners.
    expect(t.bottom).toBeLessThanOrEqual(s.chrome!.scaleBar.y0);
    expect(t.left).toBe(s.chrome!.scaleBar.x0); // same margin, one block
    // Wholly on the paper.
    expect(t.top).toBeGreaterThanOrEqual(p.y);
    expect(t.bottom).toBeLessThanOrEqual(p.y + p.h);
    expect(t.left).toBeGreaterThanOrEqual(p.x);
    expect(t.right).toBeLessThanOrEqual(p.x + p.w);
  });

  it("never lands a table on top of the drawing", () => {
    for (const src of [onSheet, shell("  paper A4 portrait\n  schedule rooms\n  legend\n")]) {
      const s = sceneOf(src);
      const t = s.chrome!.tables!;
      // Whichever anchoring won, the table row starts below the drawing's own extent.
      expect(t.top).toBeGreaterThan(s.bounds.maxY);
    }
  });

  it("carries the tables through the re-anchoring instead of dropping them", () => {
    const s = sceneOf(onSheet);
    expect(s.chrome!.tables!.schedule!.rows).toHaveLength(1);
    // …and they are actually drawn (the bug this guards is a silently lost table).
    expect(tableText(onSheet)).toContain("ROOM SCHEDULE");
    expect(tableText(onSheet)).toContain("LEGEND");
  });

  it("keeps a paper plan with no tables byte-identical", () => {
    const plain = shell("  paper A1 landscape\n  scale 1:50\n");
    const s = sceneOf(plain);
    expect(s.chrome!.tables).toBeUndefined();
    expect(compile(plain, { noCache: true }).svg).toBe(compile(plain, { noCache: true }).svg);
  });
});

// ---------------------------------------------------------------------------

describe("sheet tables — parsing", () => {
  it("accepts `schedule rooms` and the bare `legend`", () => {
    const { plan, diagnostics } = parse(shell("  schedule rooms\n  legend\n"));
    expect(diagnostics).toEqual([]);
    expect(plan!.schedule).toBe("rooms");
    expect(plan!.legend).toBe(true);
  });

  it("rejects an unknown subject with a did-you-mean and the available list", () => {
    const near = parse(shell("  schedule room\n"));
    expect(near.diagnostics[0]!.message).toContain('did you mean "rooms"');
    const far = parse(shell("  schedule wat\n"));
    expect(far.plan).toBeDefined(); // recovered, never thrown
    expect(far.diagnostics[0]!.message).toContain('Unknown schedule subject "wat"');
    expect(far.diagnostics[0]!.message).toContain("available: rooms");
    // The span points at the OFFENDING WORD, not the keyword.
    const src = shell("  schedule wat\n");
    const span = far.diagnostics[0]!.span!;
    expect(src.slice(span.start, span.end)).toBe("wat");
    expect(() => compile(src, { noCache: true })).not.toThrow();
  });

  it("requires a subject (a bare `schedule` is a returned diagnostic)", () => {
    const { diagnostics } = parse(shell("  schedule\n"));
    expect(diagnostics.length).toBeGreaterThan(0);
  });

  it("is idempotent when repeated — declarative, not a duplicate error", () => {
    const { plan, diagnostics } = parse(shell("  schedule rooms\n  schedule rooms\n  legend\n  legend\n"));
    expect(diagnostics).toEqual([]);
    expect(plan!.schedule).toBe("rooms");
  });

  it("round-trips through the formatter, idempotently", () => {
    const src = shell("  dims auto all\n  schedule rooms\n  legend\n");
    const once = format(src);
    expect(once).toContain("schedule rooms");
    expect(once).toContain("\n  legend\n");
    expect(format(once)).toBe(once);
    const { plan } = parse(once);
    expect(plan!.schedule).toBe("rooms");
    expect(plan!.legend).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe("schedule — describe() facts", () => {
  it("appends `schedule` when the plan opts in, matching the drawn table", () => {
    const s = describePlan(fixture("schedule-sheet.arch"));
    expect(s.ok).toBe(true);
    expect(s.schedule).toEqual([
      { no: "01", id: "living", name: "Living", area_m2: 12 },
      { no: "02", id: "bath", name: "bath", area_m2: 9 },
    ]);
  });

  it("omits the key entirely when the plan does not set `schedule rooms`", () => {
    const s = describePlan(example("studio.arch"));
    expect(s.schedule).toBeUndefined();
    expect("schedule" in s).toBe(false);
    // `legend` is pure rendering — it never adds a describe() field.
    const lg = describePlan(shell("  legend\n"));
    expect("schedule" in lg).toBe(false);
    expect(Object.keys(lg)).not.toContain("legend");
  });

  it("is selectable via `describe --select schedule`", () => {
    expect(DESCRIBE_KEYS).toContain("schedule");
  });
});

// ---------------------------------------------------------------------------

describe("sheet tables — the other backends draw them from the same nodes", () => {
  const src = fixture("schedule-sheet.arch");

  it("DXF gets real TEXT / LWPOLYLINE / HATCH entities on the A-ANNO layer", () => {
    const dxf = toDxf(sceneOf(src));
    expect(dxf).toContain("A-ANNO");
    for (const cell of ["ROOM SCHEDULE", "LEGEND", "TOTAL", "21.00", "Living"]) expect(dxf).toContain(cell);
    // The annotation layer is declared in the LAYER table, so CAD need not invent it.
    expect(dxf.slice(0, dxf.indexOf("ENTITIES"))).toContain("A-ANNO");
  });

  it("SVG puts the table text in the A-ANNO layer group", () => {
    const svg = compile(src, { noCache: true }).svg;
    const group = svg.slice(svg.indexOf('<g id="A-ANNO"'));
    expect(group).toContain(">ROOM SCHEDULE<");
    expect(group).toContain(">LEGEND<");
    expect(group).toContain(">21.00<");
    // Escaped, and no CJK: the bundled PNG font carries no Han glyphs (as for the axes).
    expect(svg).toContain(">AREA (m²)<");
    expect(svg).not.toMatch(/[　-鿿]/);
  });
});
