/**
 * The 1200×630 card image `/s/<id>.png` answers (ADR 0034): the plan's own drawing, as `compile()`
 * draws it, fitted inside a margin on white, over one caption line with the plan's title. X and
 * LinkedIn show no SVG `og:image`, so it is a PNG, rasterised in the Worker by resvg (the same
 * renderer the core's PNG backend uses) with the core's bundled face, Roboto, and no system fonts:
 * the same plan gives the same bytes.
 *
 * Pure apart from the rasteriser, which is passed in: the Worker hands it resvg-wasm over the
 * bundled `.wasm` module; a test hands it the same package over the file on disk.
 */

/** The card's size: the Open Graph "large image" shape. */
export const PREVIEW_WIDTH = 1200;
export const PREVIEW_HEIGHT = 630;
/** White space around the drawing, and the band under it that holds the caption. */
const MARGIN = 40;
const CAPTION_BAND = 70;
const CAPTION_SIZE = 26;
/** A caption longer than this is cut: one line, never wrapping off the card. */
const CAPTION_MAX = 64;

/** The face every card draws text in: the core's bundled font (`assets/fonts/Roboto-Regular.ttf`). */
export const PREVIEW_FONT_FAMILY = "Roboto";

/** Turns an SVG document into PNG bytes. */
export type Rasterize = (svg: string) => Promise<Uint8Array>;

const XML_ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const xml = (s: string) => s.replace(/[&<>"]/g, (c) => XML_ENTITIES[c] ?? c);

/**
 * The card as one SVG document: the plan's drawing nested as an inner `<svg>` (its own `viewBox`
 * kept, fitted with `xMidYMid meet`, so it is centred and never distorted), then the caption.
 * Returns null when `planSvg` is not an `<svg …>` document this can nest.
 */
export function previewSvg(planSvg: string, title: string): string | null {
  const at = planSvg.indexOf("<svg");
  if (at < 0 || !/^<svg\s[^>]*\bviewBox="/.test(planSvg.slice(at))) return null;
  const w = PREVIEW_WIDTH - 2 * MARGIN;
  const h = PREVIEW_HEIGHT - MARGIN - CAPTION_BAND;
  const doc = planSvg.slice(at);
  const close = doc.indexOf(">");
  // The root's own size and placement give way to the card's; its viewBox and everything else stay.
  const root = doc
    .slice(0, close)
    .replace(/\s(?:width|height|x|y|preserveAspectRatio)="[^"]*"/g, "")
    .replace(
      /^<svg\s/,
      `<svg x="${MARGIN}" y="${MARGIN}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet" `,
    );
  const inner = root + doc.slice(close);
  const chars = [...title];
  const caption = chars.length > CAPTION_MAX ? `${chars.slice(0, CAPTION_MAX - 1).join("")}…` : title;
  const baseline = PREVIEW_HEIGHT - Math.round((CAPTION_BAND - CAPTION_SIZE) / 2) - 6;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PREVIEW_WIDTH}" height="${PREVIEW_HEIGHT}" viewBox="0 0 ${PREVIEW_WIDTH} ${PREVIEW_HEIGHT}">`,
    `<rect width="${PREVIEW_WIDTH}" height="${PREVIEW_HEIGHT}" fill="#ffffff"/>`,
    inner,
    `<line x1="${MARGIN}" y1="${PREVIEW_HEIGHT - CAPTION_BAND + 8}" x2="${PREVIEW_WIDTH - MARGIN}" y2="${PREVIEW_HEIGHT - CAPTION_BAND + 8}" stroke="#d8d2c6" stroke-width="1"/>`,
    `<text x="${MARGIN}" y="${baseline}" font-family="${PREVIEW_FONT_FAMILY}" font-size="${CAPTION_SIZE}" fill="#1c2430">${xml(caption)}</text>`,
    `<text x="${PREVIEW_WIDTH - MARGIN}" y="${baseline}" text-anchor="end" font-family="${PREVIEW_FONT_FAMILY}" font-size="20" fill="#6b7280">playground.archlang.uk</text>`,
    "</svg>",
  ].join("\n");
}

/** The subset of `@resvg/resvg-wasm` a rasteriser needs. */
export interface ResvgWasm {
  initWasm(module: WebAssembly.Module | BufferSource): Promise<void>;
  Resvg: new (
    svg: string,
    options: {
      fitTo: { mode: "original" };
      font: { fontBuffers: Uint8Array[]; defaultFontFamily: string; sansSerifFamily: string };
      background: string;
    },
  ) => { render(): { asPng(): Uint8Array; free(): void }; free(): void };
}

/**
 * A rasteriser over resvg-wasm: the module is initialised once per isolate (a second `initWasm`
 * throws), the font is the only face, and every call frees what it allocated in the wasm heap. A
 * FAILED initialisation is forgotten, so the next call tries again: remembered, it would fail every
 * card for the isolate's life.
 */
export function resvgRasterizer(
  resvg: ResvgWasm,
  wasm: WebAssembly.Module | BufferSource,
  font: Uint8Array,
): Rasterize {
  let ready: Promise<void> | undefined;
  return async (svg) => {
    ready ??= resvg.initWasm(wasm).catch((e: unknown) => {
      ready = undefined;
      throw e;
    });
    await ready;
    const r = new resvg.Resvg(svg, {
      fitTo: { mode: "original" },
      font: { fontBuffers: [font], defaultFontFamily: PREVIEW_FONT_FAMILY, sansSerifFamily: PREVIEW_FONT_FAMILY },
      background: "#ffffff",
    });
    try {
      const img = r.render();
      try {
        return img.asPng();
      } finally {
        img.free();
      }
    } finally {
      r.free();
    }
  };
}
