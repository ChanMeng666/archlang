/**
 * The plan gallery's thumbnail, cut down from the drawing `compile()` made (card MP4, ruling MP-D5).
 *
 * A gallery card is about 150 px wide. At that size dimensions, labels, furniture, the title
 * block and the north arrow are sub-pixel grey fuzz, and they were most of the bytes: the full
 * drawings came to about 2 MB for 34 cards, and decoding them cost a phone seconds of main thread.
 * A thumbnail keeps what reads at card size: walls, doors, windows and room fills.
 *
 * NOTHING HERE DRAWS. The input is the SVG `compile()` returned; this parses it and keeps whole
 * CAD layers by the ids the renderer wrote (`<g id="A-WALL" inkscape:groupmode="layer">`), so every
 * shape in a thumbnail is a shape the compiler drew. What changes is only how the kept shapes are
 * written down:
 *
 *  - The drawing's units are millimetres. Every length is divided by `SCALE` and rounded to a
 *    10 mm grid, or 100 mm on a very large drawing (`decimalsFor`), far below a pixel at card
 *    size. Architectural coordinates are mostly whole decimetres, so `26000` becomes `260`.
 *  - Shapes of one paint are drawn as one path where that cannot change the picture
 *    (`mergeRuns`), and a path's straight runs are written as H and V.
 *  - A fill-only path followed by a stroke-only path with the same `d` (how the renderer draws a
 *    wall run: the poché, then its outline) becomes one path with both: paint order is fill, then
 *    stroke, so the picture is the same and the outline is written once.
 *  - An element that paints nothing (`fill="none"` and no stroke: an opening's hit outline) goes.
 *  - Presentation attributes repeated across elements become one class each in a `<style>`.
 *
 * An attribute this does not know how to scale stops the build rather than reach a card in the
 * wrong units: a new renderer attribute must be classified here first.
 *
 * Plain JavaScript, so `gen-static.mjs` (Node, no build step) and the vitest suite
 * (`test/playground-examples-rows.test.ts`) import the same function.
 */

/** Millimetres per thumbnail unit. */
export const SCALE = 100;

/** The most bytes one thumbnail may take (MP-D5); `gen-static.mjs` stops the build past it. */
export const THUMB_MAX_BYTES = 8 * 1024;

/**
 * Decimals a coordinate keeps, in `SCALE` units: one (a 10 mm grid), or none (100 mm) once the
 * drawing is at least a thousand of those wide, which keeps the coarser step under a thousandth of
 * the width. The finest drawings are the smallest: one 7.1 m across puts a 10 mm step at 0.2 px of
 * a 150 px card, so rounding moves no point by more than about a tenth of a pixel.
 *
 * @param {number} widthMm  the drawing's viewBox width
 */
export function decimalsFor(widthMm) {
  return widthMm >= 1000 * SCALE ? 0 : 1;
}

/** The CAD layers a thumbnail keeps: room fills, walls, doors, windows. */
export function keepsLayer(id) {
  return id === "A-FLOR" || id === "A-WALL" || id.startsWith("A-WALL-") || id === "A-DOOR" || id === "A-GLAZ";
}

/** Attributes holding one length or a list of them: scaled, rounded to one decimal. */
const LENGTHS = new Set(["x", "y", "width", "height", "x1", "y1", "x2", "y2", "cx", "cy", "r", "points"]);
/** Pen widths and dash lengths: scaled, rounded to two decimals so a thin pen keeps its weight. */
const PENS = new Set(["stroke-width", "stroke-dasharray"]);
/** Attributes copied as they are (no length in them). */
const PLAIN = new Set([
  "id",
  "fill",
  "stroke",
  "fill-rule",
  "stroke-linejoin",
  "stroke-linecap",
  "stroke-miterlimit",
  "patternUnits",
  "opacity",
  "fill-opacity",
  "stroke-opacity",
]);
/** The ones that become a class when they repeat. */
const STYLE = [
  "fill",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "stroke-linejoin",
  "stroke-linecap",
  "stroke-miterlimit",
  "opacity",
  "fill-opacity",
  "stroke-opacity",
];

// ─── A small XML reader for the renderer's output (elements, attributes, no comments). ───

/** @typedef {{ tag: string, attrs: Map<string, string>, kids: Node[] }} El */
/** @typedef {El | { text: string }} Node */

function parse(svg) {
  /** @type {El} */
  const doc = { tag: "#doc", attrs: new Map(), kids: [] };
  const stack = [doc];
  const re = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>|([^<]+)/gy;
  let at = 0;
  for (;;) {
    const m = re.exec(svg);
    if (!m) break;
    at = re.lastIndex;
    const top = stack[stack.length - 1];
    if (m[5] !== undefined) {
      if (m[5].trim()) top.kids.push({ text: m[5] });
      continue;
    }
    if (m[1]) {
      if (top.tag !== m[2]) throw new Error(`thumbnail: </${m[2]}> closes <${top.tag}>`);
      stack.pop();
      continue;
    }
    const attrs = new Map();
    for (const a of m[3].matchAll(/([\w:-]+)="([^"]*)"/g)) attrs.set(a[1], a[2]);
    /** @type {El} */
    const el = { tag: m[2], attrs, kids: [] };
    top.kids.push(el);
    if (!m[4]) stack.push(el);
  }
  if (at !== svg.length) throw new Error(`thumbnail: unreadable SVG at byte ${at}`);
  if (stack.length !== 1) throw new Error(`thumbnail: <${stack[stack.length - 1].tag}> never closes`);
  const root = doc.kids.find((k) => "tag" in k && k.tag === "svg");
  if (!root) throw new Error("thumbnail: no <svg> root");
  return /** @type {El} */ (root);
}

// ─── Numbers. ───

function num(v, places) {
  const p = 10 ** places;
  let s = String(Math.round(v * p) / p);
  if (s === "-0") s = "0";
  return s.replace(/^(-?)0\./, "$1.");
}

/** Every number in a list ("1,2 3,4" or "4 2"), scaled. */
function scaleList(v, places) {
  return v.replace(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi, (n) => num(Number(n) / SCALE, places));
}

/**
 * A path's `d`, scaled and written compactly. Every argument of every SVG path command is a
 * coordinate except an arc's rotation and its two flags, which are copied as they are.
 *
 * The renderer draws walls with absolute M, L, A and Z only. In such a path a line to the point
 * the pen is already at (two corners that rounding put on the same 10 mm grid point) is dropped,
 * and a horizontal or vertical line is written as H or V. Any other path is only rescaled.
 */
function scalePath(d, places) {
  const toks = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
  /** @type {[string, string[]][]} */
  const segs = [];
  for (const t of toks) {
    if (/^[A-Za-z]$/.test(t)) {
      if (!"MLHVCSQTAZmlhvcsqtaz".includes(t)) throw new Error(`thumbnail: path command ${t} has no scaling rule`);
      segs.push([t, []]);
    } else if (segs.length === 0 || "Zz".includes(segs[segs.length - 1][0])) {
      throw new Error("thumbnail: a path number with no command before it");
    } else {
      segs[segs.length - 1][1].push(t);
    }
  }
  /** @type {[string, string[]][]} */
  const scaled = segs.map(([c, args]) => [
    c,
    args.map((t, i) => ("Aa".includes(c) && [2, 3, 4].includes(i % 7) ? t : num(Number(t) / SCALE, places))),
  ]);
  const simple = scaled.every(
    ([c, args]) =>
      ("ML".includes(c) && args.length === 2) || (c === "A" && args.length === 7) || (c === "Z" && args.length === 0),
  );

  let out = "";
  const write = (c, args) => {
    out += c;
    args.forEach((s, i) => {
      // A separator only where two numbers would otherwise run together.
      if (i > 0 && !s.startsWith("-")) out += " ";
      out += s;
    });
  };
  if (!simple) {
    for (const [c, args] of scaled) write(c, args);
    return out;
  }
  let pen = null;
  let start = null;
  for (const [c, args] of scaled) {
    if (c === "Z") {
      write("Z", []);
      pen = start;
      continue;
    }
    const [x, y] = args.slice(-2);
    if (c === "M") {
      write("M", args);
      start = [x, y];
    } else if (c === "L") {
      if (pen && pen[0] === x && pen[1] === y) continue;
      if (pen && pen[0] === x) write("V", [y]);
      else if (pen && pen[1] === y) write("H", [x]);
      else write("L", args);
    } else {
      write("A", args);
    }
    pen = [x, y];
  }
  return out;
}

/** One element's attributes, rescaled. Throws on any attribute with no rule. */
function scaleAttrs(el, places) {
  const out = new Map();
  for (const [k, v] of el.attrs) {
    if (k === "d") out.set(k, scalePath(v, places));
    else if (LENGTHS.has(k)) out.set(k, scaleList(v, places));
    else if (PENS.has(k)) out.set(k, v === "none" ? v : scaleList(v, 2));
    else if (k === "patternTransform") {
      if (!/^rotate\(-?[\d.]+\)$/.test(v)) throw new Error(`thumbnail: patternTransform ${v} has no scaling rule`);
      out.set(k, v);
    } else if (PLAIN.has(k)) out.set(k, v);
    else throw new Error(`thumbnail: <${el.tag} ${k}> has no scaling rule`);
  }
  if (el.tag === "pattern" && out.get("patternUnits") !== "userSpaceOnUse") {
    throw new Error("thumbnail: a pattern not in user space cannot be rescaled");
  }
  return out;
}

/** A polygon or a line as the path that draws the same thing, still in millimetres. */
function outlineOf(tag, a) {
  if (tag === "polygon") {
    const pts = (a.get("points") ?? "").trim().split(/\s+/);
    return `M ${pts.join(" L ")} Z`;
  }
  if (tag === "line") return `M ${a.get("x1")},${a.get("y1")} L ${a.get("x2")},${a.get("y2")}`;
  if (tag === "path") return a.get("d") ?? "";
  return null;
}

/**
 * An element's painted box in millimetres, or null when it cannot be bounded here. Padded for the
 * pen (miter joins reach at most `stroke-miterlimit` half-widths past a corner; 4 is the renderer's
 * and SVG's default) and for an arc's bulge (an arc stays within two radii of either end).
 */
function boxOf(tag, a, d) {
  const sw = Number(a.get("stroke-width") ?? 0) * Math.max(4, Number(a.get("stroke-miterlimit") ?? 4));
  if (tag === "circle") {
    const r = Number(a.get("r")) + sw;
    return [Number(a.get("cx")) - r, Number(a.get("cy")) - r, Number(a.get("cx")) + r, Number(a.get("cy")) + r];
  }
  if (d === null || /[^MLAZ\s\d.,eE+-]/.test(d)) return null;
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const seg of d.match(/[MLAZ][^MLAZ]*/g) ?? []) {
    const n = (seg.slice(1).match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number);
    const pad = seg[0] === "A" ? 2 * Math.max(n[0], n[1]) : 0;
    const xy = seg[0] === "A" ? [n[5], n[6]] : n;
    for (let i = 0; i + 1 < xy.length; i += 2) {
      box[0] = Math.min(box[0], xy[i] - pad);
      box[1] = Math.min(box[1], xy[i + 1] - pad);
      box[2] = Math.max(box[2], xy[i] + pad);
      box[3] = Math.max(box[3], xy[i + 1] + pad);
    }
  }
  if (!box.every(Number.isFinite)) return null;
  // Plus the pen, plus a grid step either way for the rounding.
  const m = sw + 2 * SCALE;
  return [box[0] - m, box[1] - m, box[2] + m, box[3] + m];
}

const overlaps = (p, q) => p[0] <= q[2] && q[0] <= p[2] && p[1] <= q[3] && q[1] <= p[3];

/**
 * A layer's shapes, rescaled, with shapes of one paint drawn as one path where that cannot change
 * the picture. A shape may join an earlier shape's path only when nothing painted between them
 * overlaps it (shapes that do not touch can be painted in either order), and only when it is
 * fill-only or stroke-only: one path fills every part before it strokes any, so two overlapping
 * filled-and-stroked shapes would show an outline the later one covered. Filled shapes also never
 * join a path they overlap, since overlapping subpaths of opposite winding would leave a hole.
 * A shape with any opacity is left alone: overlapping it with itself would darken it.
 *
 * @param {{ tag: string, attrs: Map<string, string> }[]} items  in millimetres, in paint order
 * @returns {{ tag: string, attrs: Map<string, string> }[]}
 */
function mergeRuns(items, places) {
  /** @type {{ key: string | null, kind: string | null, box: number[] | null, items: { tag: string, attrs: Map<string, string>, d: string | null }[] }[]} */
  const groups = [];
  for (const it of items) {
    const a = it.attrs;
    const d = outlineOf(it.tag, a);
    const box = boxOf(it.tag, a, d);
    const stroked = (a.get("stroke") ?? "none") !== "none";
    const filled = it.tag !== "line" && (a.get("fill") ?? "#000") !== "none";
    const plain = d !== null && box !== null && !/opacity/.test([...a.keys()].join(" "));
    const kind = !plain ? null : stroked && !filled ? "stroke" : filled && !stroked ? "fill" : null;
    const key =
      kind &&
      `${kind}|${STYLE.filter((k) => a.has(k) && !(kind === "stroke" && k === "fill"))
        .map((k) => `${k}:${a.get(k)}`)
        .join(";")}`;
    let home = null;
    if (key && box) {
      for (let g = groups.length - 1; g >= 0; g--) {
        const grp = groups[g];
        if (grp.key === key) {
          if (!(kind === "fill" && grp.box && overlaps(grp.box, box))) home = grp;
          break;
        }
        if (!grp.box || overlaps(grp.box, box)) break;
      }
    }
    if (home) {
      home.items.push({ ...it, d });
      const hb = /** @type {number[]} */ (home.box);
      home.box = [Math.min(hb[0], box[0]), Math.min(hb[1], box[1]), Math.max(hb[2], box[2]), Math.max(hb[3], box[3])];
    } else {
      groups.push({ key, kind, box, items: [{ ...it, d }] });
    }
  }
  return groups.map((g) => {
    const first = g.items[0];
    if (g.items.length === 1 && first.d === null) {
      return { tag: first.tag, attrs: scaleAttrs({ ...first, kids: [] }, places) };
    }
    // One path: the outlines one after another, the paint once.
    const attrs = new Map();
    attrs.set("d", g.items.map((i) => scalePath(/** @type {string} */ (i.d), places)).join(""));
    const paint = new Map([...first.attrs].filter(([k]) => !["points", "x1", "y1", "x2", "y2", "d"].includes(k)));
    if (g.kind === "stroke" || first.tag === "line") paint.set("fill", "none");
    for (const [k, v] of scaleAttrs({ tag: "path", attrs: paint, kids: [] }, places)) attrs.set(k, v);
    return { tag: "path", attrs };
  });
}

const paintsNothing = (a) => (a.get("fill") ?? "") === "none" && (a.get("stroke") ?? "none") === "none";

/**
 * The lean thumbnail of a drawing `compile(source, { width })` returned. The root keeps the
 * compiler's pixel `width`/`height` and its viewBox (rescaled), so the card's intrinsic size and
 * aspect are exactly the full drawing's.
 *
 * @param {string} svg
 * @returns {string}
 */
export function leanThumb(svg) {
  const root = parse(svg);
  const vb = root.attrs.get("viewBox");
  const w = root.attrs.get("width");
  const h = root.attrs.get("height");
  if (!vb || !w || !h) throw new Error("thumbnail: the root has no viewBox/width/height");
  const vbW = Number(vb.trim().split(/\s+/)[2]);
  if (!(vbW > 0)) throw new Error(`thumbnail: unreadable viewBox ${vb}`);
  const places = decimalsFor(vbW);

  /** @type {El[]} */ const defs = [];
  /** @type {Map<string, string> | null} */ let background = null;
  /** @type {{ id: string, els: { tag: string, attrs: Map<string, string> }[] }[]} */ const layers = [];
  for (const k of root.kids) {
    if (!("tag" in k)) throw new Error("thumbnail: text directly under the root");
    if (k.tag === "defs") defs.push(...k.kids.filter((c) => "tag" in c));
    else if (k.tag === "rect" && !background) background = scaleAttrs(k, places);
    else if (k.tag === "g" && k.attrs.get("inkscape:groupmode") === "layer" && keepsLayer(k.attrs.get("id") ?? "")) {
      const id = /** @type {string} */ (k.attrs.get("id"));
      /** @type {{ tag: string, attrs: Map<string, string> }[]} */
      const items = [];
      for (const c of k.kids) {
        if (!("tag" in c)) throw new Error(`thumbnail: text inside layer ${id}`);
        if (c.kids.length > 0) throw new Error(`thumbnail: <${c.tag}> with children inside layer ${id}`);
        if (c.tag === "text") continue;
        if (paintsNothing(c.attrs)) continue;
        // The poché-then-outline pair: one path with both paints.
        const prev = items[items.length - 1];
        if (
          c.tag === "path" &&
          prev?.tag === "path" &&
          prev.attrs.get("d") === c.attrs.get("d") &&
          !prev.attrs.has("stroke") &&
          c.attrs.get("fill") === "none" &&
          c.attrs.has("stroke")
        ) {
          for (const [k2, v2] of c.attrs) if (k2 !== "fill") prev.attrs.set(k2, v2);
          continue;
        }
        items.push({ tag: c.tag, attrs: new Map(c.attrs) });
      }
      const els = mergeRuns(items, places);
      if (els.length > 0) layers.push({ id, els });
    }
    // Everything else under the root is sheet chrome (north arrow, scale bar, title block,
    // accessible title/desc) or a layer not kept, and is not carried over.
  }
  if (!layers.some((l) => l.id === "A-WALL" || l.id.startsWith("A-WALL-"))) {
    throw new Error("thumbnail: no wall layer in the drawing");
  }

  // Repeated presentation attributes → one class each, most used first.
  const count = new Map();
  const styleOf = (a) =>
    STYLE.filter((k) => a.has(k))
      .map((k) => `${k}:${a.get(k)}`)
      .join(";");
  for (const l of layers)
    for (const { attrs: a } of l.els) {
      const s = styleOf(a);
      if (s) count.set(s, (count.get(s) ?? 0) + 1);
    }
  const classes = new Map(
    [...count]
      .filter(([, n]) => n > 1)
      .sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))
      .map(([s], i) => [s, classId(i)]),
  );

  const attr = (a) => [...a].map(([k, v]) => ` ${k}="${v}"`).join("");
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${scaleList(vb, places)}">`);
  const css = [...classes].map(([s, c]) => `.${c}{${s}}`).join("");
  // Only the patterns a kept shape paints with (the furniture's and the site's hatches go).
  const used = new Set();
  for (const l of layers)
    for (const { attrs: a } of l.els)
      for (const v of a.values()) for (const u of v.matchAll(/url\(#([^)]+)\)/g)) used.add(u[1]);
  const defsText = defs
    .filter((d) => used.has(d.attrs.get("id") ?? ""))
    .map(function ser(d) {
      // A hatch tile keeps three decimals (0.1 mm): it repeats across the whole drawing, so an
      // error in its period would add up into a visible drift of the hatch.
      const a = scaleAttrs(d, 3);
      const kids = d.kids.filter((c) => "tag" in c);
      return kids.length ? `<${d.tag}${attr(a)}>${kids.map(ser).join("")}</${d.tag}>` : `<${d.tag}${attr(a)}/>`;
    })
    .join("");
  if (css || defsText) out.push(`<defs>${css ? `<style>${css}</style>` : ""}${defsText}</defs>`);
  if (background) out.push(`<rect${attr(background)}/>`);
  for (const l of layers) {
    out.push(`<g id="${l.id}">`);
    for (const { tag, attrs: a } of l.els) {
      const cls = classes.get(styleOf(a));
      const geo = new Map([...a].filter(([k]) => !cls || !STYLE.includes(k)));
      out.push(`<${tag}${cls ? ` class="${cls}"` : ""}${attr(geo)}/>`);
    }
    out.push("</g>");
  }
  out.push("</svg>");
  return out.join("\n");
}

function classId(i) {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  return i < 26 ? letters[i] : letters[Math.floor(i / 26) - 1] + letters[i % 26];
}
