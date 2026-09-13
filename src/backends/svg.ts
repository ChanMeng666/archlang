/**
 * SVG backend — a pure serializer of the {@link Scene}.
 *
 * Each `ScenePrim` maps to one SVG element; attributes are emitted in a fixed
 * canonical order so the output is byte-identical to the original string-based
 * renderer (the golden-snapshot regression guard). Page chrome (background,
 * hatch `<pattern>` defs, north arrow, scale bar, title block) lives here — it is
 * SVG-specific framing, not element geometry. Deterministic: all numbers route
 * through {@link fmt}; all interpolated text is escaped via {@link xml}.
 */

import type { NorthDir, Point } from "../ast.js";
import type { CompileOptions } from "../types.js";
import type { LineType, Paint, PathLoop, RenderSizes, Scene, SceneNode } from "../scene.js";
import { RENDER_PASSES, layerOf, weightWidth } from "../scene.js";
import type { Bounds } from "../geometry.js";
import { hatchPattern } from "../hatches.js";
import type { Theme } from "../theme.js";
import { layoutChrome, type ScaleBarBox, type TitleBlockBox } from "../chrome-layout.js";

/** Round to 2 decimals and strip trailing zeros — keeps output stable & compact. */
import { fmt2 as fmt } from "../num-format.js";
const pt = (p: Point): string => `${fmt(p.x)},${fmt(p.y)}`;

/** XML-escape a string for safe interpolation into SVG text/attributes — and drop
 *  the characters XML itself forbids (see `text-safe.ts`). Shared with the
 *  error-card backend and `sanitizeTheme` so every escaping site behaves alike. */
export { xmlText as xml } from "../text-safe.js";
import { xmlText as xml } from "../text-safe.js";

/**
 * The `<title>`/`<desc>` id prefix for this compile: the caller's `idPrefix` reduced to
 * id-safe characters, else `"arch"`. Whitespace is the reason this sanitises rather than
 * rejects — a prefix containing a space would split the `aria-labelledby` token list and
 * silently name the drawing nothing, and a rendering option must never fail a compile.
 */
function accIdPrefix(accessible: CompileOptions["accessible"]): string {
  if (typeof accessible !== "object" || accessible === null) return "arch";
  const cleaned = (accessible.idPrefix ?? "").replace(/[^A-Za-z0-9_-]/g, "");
  return cleaned === "" ? "arch" : cleaned;
}

/**
 * The accessible NAME of one plan element: the KIND first, then what the plan calls it,
 * then — for a fixture — the room it stands in. "Room Kitchen" · "Furniture bed, Kitchen"
 * · "Door".
 *
 * The kind leads because this string is read by someone who cannot see the drawing, where
 * a bare "Bed" among thirty controls says nothing about what sort of thing it is; and the
 * room trails a fixture because a family plan has four beds and the room is the half that
 * tells them apart. An element the language names nothing (every door, window and cased
 * opening) is announced by its kind alone — two doors on one plan legitimately share the
 * name "Door", which is what the drawing itself says about them.
 */
function a11yName(node: SceneNode): string {
  const word = cap(node.elementKind ?? "");
  // An AUTHORED label is repeated exactly as the author cased it — it is their words, and
  // "iMac corner" is not ours to retitle. A CATALOGUE word is the compiler's own, and this
  // string is a sentence someone hears, so it opens like one: "Furniture Bed, Bedroom".
  // `data-arch-label` still carries the raw `bed`, for a consumer that wants the token.
  const label =
    node.elementLabelDerived && node.elementLabel !== undefined ? cap(node.elementLabel) : node.elementLabel;
  // A room the plan never named answers to its position instead of to nothing, so a plan
  // with three unnamed rooms does not present three controls all called "Room".
  const named = label ?? (node.elementOrdinal !== undefined ? String(node.elementOrdinal) : undefined);
  const head = named === undefined ? word : word === "" ? named : `${word} ${named}`;
  return node.elementRoomLabel !== undefined ? `${head}, ${node.elementRoomLabel}` : head;
}

/** First letter upper-cased, the rest left exactly as it came. */
const cap = (s: string): string => (s === "" ? "" : s.charAt(0).toUpperCase() + s.slice(1));

/** Named line type → dash pattern in mm (undefined = solid). */
function dashPattern(t: LineType, sizes: RenderSizes): number[] | undefined {
  const u = sizes.thin;
  switch (t) {
    case "continuous":
      return undefined;
    case "dashed":
      return [u * 6, u * 4];
    case "center":
      return [u * 12, u * 3, u * 3, u * 3];
    case "hidden":
      return [u * 3, u * 3];
  }
}

/** Effective stroke width: from the named weight if set, else the raw paint width. */
function effWidth(node: SceneNode, sizes: RenderSizes): number {
  return node.lineWeight ? weightWidth(node.lineWeight, sizes) : (node.paint.width ?? 0);
}

/** Effective dash array: from the named line type if set, else the raw paint dash. */
function effDash(node: SceneNode, sizes: RenderSizes): number[] | undefined {
  if (node.lineType && node.lineType !== "continuous") return dashPattern(node.lineType, sizes);
  return node.paint.dash;
}

const dashAttr = (dash: number[] | undefined): string => (dash ? ` stroke-dasharray="${dash.map(fmt).join(" ")}"` : "");

/** Stroke attributes shared by `polygon`/`line` (omitted entirely when no stroke). */
function strokeAttrs(paint: Paint, width: number, dash: number[] | undefined): string {
  if (!paint.stroke) return "";
  let s = ` stroke="${paint.stroke}" stroke-width="${fmt(width)}"`;
  if (paint.linecap) s += ` stroke-linecap="${paint.linecap}"`;
  s += dashAttr(dash);
  return s;
}

/** Paint attributes for a `<path>` (region/arc), in the canonical attribute order. */
function pathPaint(paint: Paint, width: number, dash: number[] | undefined): string {
  let s = ` fill="${paint.fill ?? "none"}"`;
  if (paint.fillRule) s += ` fill-rule="${paint.fillRule}"`;
  if (paint.stroke) s += ` stroke="${paint.stroke}" stroke-width="${fmt(width)}"`;
  if (paint.linejoin) s += ` stroke-linejoin="${paint.linejoin}"`;
  if (paint.miterLimit !== undefined) s += ` stroke-miterlimit="${fmt(paint.miterLimit)}"`;
  s += dashAttr(dash);
  return s;
}

function regionPath(loops: Point[][]): string {
  return loops.map((loop) => "M " + loop.map(pt).join(" L ") + " Z").join(" ");
}

/**
 * The `d` of a `path` primitive — the curved generalisation of {@link regionPath}. Every
 * arc edge is a MINOR arc by the primitive's contract, so the large-arc flag is `0` here
 * exactly as it is for the `arc` primitive; `sweep` carries the direction.
 */
function loopsPath(loops: PathLoop[]): string {
  return loops
    .map(
      (l) =>
        `M ${pt(l.start)}` +
        l.edges
          .map((e) => (e.t === "line" ? ` L ${pt(e.to)}` : ` A ${fmt(e.r)} ${fmt(e.r)} 0 0 ${e.sweep} ${pt(e.to)}`))
          .join("") +
        " Z",
    )
    .join(" ");
}

/** Serialize one scene node to a single SVG element string. */
function serialize(node: SceneNode, sizes: RenderSizes): string {
  const { prim, paint } = node;
  const width = effWidth(node, sizes);
  const dash = effDash(node, sizes);
  switch (prim.t) {
    case "polygon":
      return `<polygon points="${prim.pts.map(pt).join(" ")}" fill="${paint.fill ?? "none"}"${strokeAttrs(paint, width, dash)}/>`;
    case "line":
      return `<line x1="${fmt(prim.a.x)}" y1="${fmt(prim.a.y)}" x2="${fmt(prim.b.x)}" y2="${fmt(prim.b.y)}" stroke="${paint.stroke ?? "none"}" stroke-width="${fmt(width)}"${paint.linecap ? ` stroke-linecap="${paint.linecap}"` : ""}${dashAttr(dash)}/>`;
    case "region":
      return `<path d="${regionPath(prim.loops)}"${pathPaint(paint, width, dash)}/>`;
    case "path":
      return `<path d="${loopsPath(prim.loops)}"${pathPaint(paint, width, dash)}/>`;
    case "hatch":
      // Filled with the material `<pattern>` (its id encodes scale/angle); `paint`
      // already carries the `url(#…)` fill + nonzero rule, so this matches a region fill.
      return `<path d="${regionPath(prim.region)}"${pathPaint(paint, width, dash)}/>`;
    case "arc":
      return `<path d="M ${pt(prim.start)} A ${fmt(prim.r)} ${fmt(prim.r)} 0 0 ${prim.sweep} ${pt(prim.end)}"${pathPaint(paint, width, dash)}/>`;
    case "circle":
      return `<circle cx="${fmt(prim.center.x)}" cy="${fmt(prim.center.y)}" r="${fmt(prim.r)}"${pathPaint(paint, width, dash)}/>`;
    case "text": {
      const weight = prim.weight !== undefined ? ` font-weight="${prim.weight}"` : "";
      const transform =
        prim.rotate !== undefined ? ` transform="rotate(${fmt(prim.rotate)} ${fmt(prim.at.x)} ${fmt(prim.at.y)})"` : "";
      return `<text x="${fmt(prim.at.x)}" y="${fmt(prim.at.y)}" font-size="${fmt(prim.size)}" fill="${paint.fill ?? "none"}" text-anchor="${prim.anchor}" dominant-baseline="${prim.baseline}"${weight}${transform}>${xml(prim.value)}</text>`;
    }
  }
}

/** Plan mm → sheet mm at a scale denominator (the page's physical size). */
const sheetMm = (planMm: number, denom: number): number => planMm / denom;

/** Serialize a {@link Scene} to a complete SVG document. */
export function renderSvg(scene: Scene, opts: CompileOptions = {}): string {
  const THEME = scene.theme;
  const sizes = scene.sizes;
  const b = scene.bounds;
  const refDim = sizes.refDim;
  const { thin, margin, hatchGap } = sizes;

  const drawW = b.maxX - b.minX;
  const drawH = b.maxY - b.minY;
  // Page chrome (scale bar + title block) is placed below the dimension band; the
  // per-side margins grow to fit chrome + dims (shared with scene-build + PDF).
  // `toScene` already computed this layout; fall back for hand-built Scenes.
  const chrome =
    scene.chrome ??
    layoutChrome({
      bounds: b,
      refDim,
      baseMargin: margin,
      nodes: scene.nodes,
      title: scene.title,
      scale: scene.scale,
    });
  const m = chrome.margin;
  // The viewBox is always the PAGE in plan mm. Without a sheet that is the drawing plus
  // its grown margins (unchanged); with one it is the sheet's page rectangle, which the
  // drawing is centred on (`src/sheet.ts`).
  const page = scene.sheet?.page;
  const vbX = page ? page.x : b.minX - m.left;
  const vbY = page ? page.y : b.minY - m.top;
  const vbW = page ? page.w : drawW + m.left + m.right;
  const vbH = page ? page.h : drawH + m.top + m.bottom;

  const out: string[] = [];
  // Root size. An explicit `opts.width` always wins (a pixel box for an embedder). Else,
  // on a sheet, the root carries the TRUE paper size in millimetres — so the file prints
  // at its declared scale and a viewer opens it at sheet size. A plan with no `paper`
  // emits no width/height at all, exactly as before (byte-identical).
  const svgAttrs = opts.width
    ? `width="${fmt(opts.width)}" height="${fmt((opts.width * vbH) / vbW)}"`
    : scene.sheet
      ? `width="${fmt(sheetMm(scene.sheet.page.w, scene.sheet.denom))}mm" height="${fmt(sheetMm(scene.sheet.page.h, scene.sheet.denom))}mm"`
      : "";
  // Opt-in accessibility metadata (ADR 0007 pattern): a self-describing drawing for
  // assistive tech AND machine consumers. `role="img"` + `aria-labelledby` wire the
  // <title>/<desc> emitted just below to fixed, deterministic ids. Off by default →
  // no attributes, output byte-identical. (Inlining several accessible SVGs in one
  // HTML page would duplicate these ids; an embedder that does so should rewrite them.)
  //
  // The ids default to the historical `arch-title`/`arch-desc`; `accessible: { idPrefix }`
  // makes them per-drawing so a page showing several plans does not point every
  // `aria-labelledby` at the first one's title.
  const titleId = `${accIdPrefix(opts.accessible)}-title`;
  const descId = `${accIdPrefix(opts.accessible)}-desc`;
  const a11yAttrs = opts.accessible ? ` role="img" aria-labelledby="${titleId} ${descId}"` : "";
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" ${svgAttrs} viewBox="${fmt(vbX)} ${fmt(vbY)} ${fmt(vbW)} ${fmt(vbH)}" font-family="${THEME.font}"${a11yAttrs}>`,
  );
  if (opts.accessible) {
    out.push(`<title id="${titleId}">${xml(scene.name)}</title>`);
    out.push(`<desc id="${descId}">${xml(scene.caption ?? "")}</desc>`);
  }

  // Defs: a hatch <pattern> for each distinct hatch spec in use (material + scale
  // + angle). The default spec (poché, scale 1, angle 0) keeps the bare "poche" id.
  const hatchCtx = { fmt, gap: hatchGap, thin, base: THEME.pocheBase, line: THEME.pocheHatch };
  const patterns = scene.hatches.map((h) => hatchPattern(h, hatchCtx)).join("");
  out.push(`<defs>${patterns}</defs>`);

  // Background
  out.push(`<rect x="${fmt(vbX)}" y="${fmt(vbY)}" width="${fmt(vbW)}" height="${fmt(vbH)}" fill="${THEME.bg}"/>`);

  // Element/wall primitives, grouped into per-CAD-layer <g> (deterministic draw
  // order preserved: passes iterated in order, layers ordered by first appearance,
  // collection order kept within a layer). Each <g> is an Inkscape layer so a
  // viewer can toggle walls/doors/annotations independently.
  const groups = new Map<string, string[]>();
  // An axonometric's node order IS a painter's algorithm, far to near, so it goes into
  // ONE flat bucket instead — see the guard below.
  const flat: string[] = [];
  for (const pass of RENDER_PASSES) {
    for (const node of scene.nodes) {
      if (node.layer !== pass) continue;
      const lyr = layerOf(node);
      let bucket = flat;
      if (!scene.view) {
        const found = groups.get(lyr);
        if (found) bucket = found;
        else {
          bucket = [];
          groups.set(lyr, bucket);
        }
      }
      let el = serialize(node, sizes);
      // Opt-in editor affordance: stamp the source byte-span onto the element so a
      // tool can map a clicked primitive back to its source (ADR 0007). Off by
      // default → shipped SVGs are byte-identical to the un-annotated output.
      if (opts.annotate) {
        const attrs: string[] = [];
        if (node.span) attrs.push(`data-span="${node.span.start}:${node.span.end}"`);
        if (node.elementId !== undefined) {
          attrs.push(`data-arch-id="${xml(node.elementId)}" data-arch-kind="${xml(node.elementKind ?? "")}"`);
          // The element's human name, and the ONE shape that stands for it. Both are
          // plain data an embedder can key off without a second model of the drawing
          // (which is how a consumer's "the polygon, else the first non-text node"
          // guess drifts from what the compiler actually drew).
          if (node.elementLabel !== undefined) attrs.push(`data-arch-label="${xml(node.elementLabel)}"`);
          if (node.elementPrimary) attrs.push(`data-arch-primary=""`);
          // …and, with `accessible` as well, the attributes that make that shape a
          // CONTROL. `tabindex="-1"` is deliberate: the drawing is a roving tabstop
          // group, so the embedder promotes exactly one node to `0` — emitting `0` on
          // every element here would put a hundred tab stops in one page.
          if (opts.accessible) {
            if (node.elementPrimary) {
              attrs.push(`role="button" tabindex="-1" aria-label="${xml(a11yName(node))}"`);
            } else if (node.prim.t === "text") {
              // A drawn label repeats a name its primary node already carries; hidden,
              // it is announced once instead of twice. Never the primary node itself.
              attrs.push(`aria-hidden="true"`);
            }
          }
        }
        // A FUNCTION replacement, never a replacement STRING. `String.replace` reads `$&`,
        // `$'`, `` $` `` and `$1` inside a replacement string as substitution patterns, and
        // these attribute values carry author text: a room labelled `$&` spliced the literal
        // `<polygon` back into its own `data-arch-label`, and `$'` would have spliced in the
        // rest of the element — raw quotes and all — which is an attribute breakout. The
        // hazard was unreachable while the only stamped values were digits and identifiers;
        // `data-arch-label` is the first one that can be any string the author wrote.
        // `test/escape-fuzz.test.ts` found it and now pins it.
        if (attrs.length > 0) el = el.replace(/^<[a-z]+/, (tag) => `${tag} ${attrs.join(" ")}`);
      }
      bucket.push(el);
    }
  }
  if (scene.view) {
    // **The layer grouping RE-ORDERS nodes within a pass**, and an axonometric cannot
    // survive that: its node order IS a painter's algorithm, far to near, and bucketing
    // it into one `<g>` per CAD layer draws every floor plate, then every wall, then all
    // the glazing — so a floor is painted over the near wall standing on it. (That is not
    // hypothetical: it is what this view drew before the guard, and the picture read as
    // an open box.) So a view emits one group, in collection order. The per-node
    // `layerName` still reaches the DXF export, which has no order to lose.
    out.push(`<g id="V-3D" inkscape:groupmode="layer" inkscape:label="V-3D">`);
    out.push(...flat);
    out.push("</g>");
  } else {
    for (const [lyr, els] of groups) {
      out.push(`<g id="${lyr}" inkscape:groupmode="layer" inkscape:label="${lyr}">`);
      out.push(...els);
      out.push("</g>");
    }
  }

  // Plan-level annotations (after element passes): north, scale bar, title block.
  //
  // All three are PLAN chrome, and all three would be false on an axonometric: an arrow
  // points at a compass direction on a drawing whose plan has been turned, a scale bar
  // measures an axis the projection foreshortens, and a title block makes a drawing look
  // issuable — which an illustrative view must never do. `Scene.view` is set only by
  // `toIso`, so every plan drawing takes the branch it always has.
  if (!scene.view) {
    out.push(northArrow(scene.north, b, margin, refDim, THEME));
    out.push(scaleBar(chrome.scaleBar, thin, THEME));
    const tb = titleBlock(chrome.titleBlock, thin, THEME);
    if (tb) out.push(tb);
  }

  out.push("</svg>");
  return out.join("\n");
}

function northArrow(north: NorthDir, b: Bounds, margin: number, refDim: number, THEME: Theme): string {
  const r = refDim * 0.045;
  const cx = b.maxX - r;
  const cy = b.minY - margin * 0.55;
  let deg: number;
  switch (north) {
    case "up":
      deg = 0;
      break;
    case "down":
      deg = 180;
      break;
    case "left":
      deg = 270;
      break;
    case "right":
      deg = 90;
      break;
    default:
      deg = typeof north === "object" ? north.deg : 0;
  }
  const fs = refDim * 0.026;
  // Triangle points "up" before rotation; only the arrow rotates — the "N"
  // label stays upright at the pointing end so it always reads correctly.
  const tri = `${fmt(cx)},${fmt(cy - r)} ${fmt(cx - r * 0.5)},${fmt(cy + r * 0.6)} ${fmt(cx)},${fmt(cy + r * 0.25)} ${fmt(cx + r * 0.5)},${fmt(cy + r * 0.6)}`;
  const rad = (deg * Math.PI) / 180;
  // North screen vector (rotate the "up" vector (0,-1) clockwise by deg).
  const nx = Math.sin(rad);
  const ny = -Math.cos(rad);
  const lx = cx + nx * (r + fs * 0.8);
  const ly = cy + ny * (r + fs * 0.8);
  return (
    `<g>` +
    `<polygon points="${tri}" fill="${THEME.annotation}" transform="rotate(${fmt(deg)} ${fmt(cx)} ${fmt(cy)})"/>` +
    `<text x="${fmt(lx)}" y="${fmt(ly)}" font-size="${fmt(fs)}" fill="${THEME.annotation}" text-anchor="middle" dominant-baseline="central">N</text>` +
    `</g>`
  );
}

function scaleBar(s: ScaleBarBox, thin: number, THEME: Theme): string {
  const { x0, y0, barLen, hgt, fs } = s;
  const parts: string[] = [];
  const half = barLen / 2;
  // two-segment alternating bar
  parts.push(
    `<rect x="${fmt(x0)}" y="${fmt(y0)}" width="${fmt(half)}" height="${fmt(hgt)}" fill="${THEME.annotation}"/>`,
  );
  parts.push(
    `<rect x="${fmt(x0 + half)}" y="${fmt(y0)}" width="${fmt(half)}" height="${fmt(hgt)}" fill="none" stroke="${THEME.annotation}" stroke-width="${fmt(thin)}"/>`,
  );
  parts.push(
    `<text x="${fmt(x0)}" y="${fmt(y0 + hgt + fs)}" font-size="${fmt(fs)}" fill="${THEME.annotation}" text-anchor="start" dominant-baseline="central">0</text>`,
  );
  parts.push(
    `<text x="${fmt(x0 + barLen)}" y="${fmt(y0 + hgt + fs)}" font-size="${fmt(fs)}" fill="${THEME.annotation}" text-anchor="middle" dominant-baseline="central">${barLen / 1000} m</text>`,
  );
  return `<g>${parts.join("")}</g>`;
}

function titleBlock(tb: TitleBlockBox | null, thin: number, THEME: Theme): string | null {
  if (!tb) return null;
  const { x0, y0, w: boxW, h: boxH, rowH, fs, pad, rows } = tb;
  const parts: string[] = [];
  parts.push(
    `<rect x="${fmt(x0)}" y="${fmt(y0)}" width="${fmt(boxW)}" height="${fmt(boxH)}" fill="none" stroke="${THEME.annotation}" stroke-width="${fmt(thin)}"/>`,
  );
  rows.forEach((ln, i) => {
    const ly = y0 + rowH * (i + 0.5);
    parts.push(
      `<text x="${fmt(x0 + pad)}" y="${fmt(ly)}" font-size="${fmt(fs * 0.8)}" fill="${THEME.annotationMuted}" dominant-baseline="central">${xml(ln.k)}</text>`,
    );
    parts.push(
      `<text x="${fmt(x0 + boxW - pad)}" y="${fmt(ly)}" font-size="${fmt(fs)}" fill="${THEME.annotation}" text-anchor="end" dominant-baseline="central">${xml(ln.v)}</text>`,
    );
    if (i > 0)
      parts.push(
        `<line x1="${fmt(x0)}" y1="${fmt(y0 + rowH * i)}" x2="${fmt(x0 + boxW)}" y2="${fmt(y0 + rowH * i)}" stroke="${THEME.annotation}" stroke-width="${fmt(thin * 0.5)}"/>`,
      );
  });
  return `<g>${parts.join("")}</g>`;
}
