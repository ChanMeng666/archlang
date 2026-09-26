/**
 * PNG backend — a **deterministic raster** serializer of the {@link Scene}.
 *
 * Rasterizes the SVG produced by {@link renderSvg} with resvg
 * (`@resvg/resvg-js`), a pure-Rust renderer, so geometry is defined exactly once
 * (the SVG path) and PNG can never drift from SVG. `@resvg/resvg-js` is an
 * OPTIONAL dependency, lazy-`import()`ed so the zero-dep core never hard-requires
 * it and the default bundle pulls nothing; a clear error is thrown if absent.
 *
 * Determinism: system fonts are DISABLED and a single bundled font (Roboto) is
 * supplied, so text rasterizes identically on any machine/runner regardless of
 * which fonts happen to be installed — the precondition for the visual-regression
 * goldens (T6.4). Node-only (resvg is a native binding) and async — NOT part of
 * `compile()`. Build a Scene with `toScene(ir)` or `compile().scene`.
 */

import type { CompileOptions } from "../types.js";
import type { Diagnostic } from "../diagnostics.js";
import type { Scene } from "../scene.js";
import { BUNDLED_FONT_FAMILY, bundledFontPath, glyphDiagnostics, planFonts } from "./font.js";
import { renderSvg } from "./svg.js";

/** Options for {@link renderPng}: the SVG options plus an optional pixel scale. */
export interface PngOptions extends CompileOptions {
  /** Uniform raster scale (default 1). 2 ⇒ double-resolution PNG. */
  scale?: number;
  /**
   * Receives the render-time warnings — `W_CJK_FONT_MISSING` when a label needs the
   * optional `@chanmeng666/archlang-font-cjk` package and it is absent, and
   * `W_GLYPH_UNSUPPORTED` for characters no embedded face can draw. Rendering still
   * succeeds either way; those characters come out as empty boxes.
   */
  onDiagnostic?: (d: Diagnostic) => void;
}

/** The four entities {@link import("../text-safe.js").xmlText} writes, plus numeric ones. */
function unescapeXml(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos|#x[0-9a-fA-F]+|#[0-9]+);/g, (_, e: string) => {
    if (e === "amp") return "&";
    if (e === "lt") return "<";
    if (e === "gt") return ">";
    if (e === "quot") return '"';
    if (e === "apos") return "'";
    return String.fromCodePoint(e[1] === "x" ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10));
  });
}

/** Every string an SVG draws: the content of each `<text>` / `<tspan>` element. */
export function svgTexts(svg: string): string[] {
  const out: string[] = [];
  for (const m of svg.matchAll(/<(text|tspan)\b[^>]*>([^<]*)</g)) {
    if (m[2]) out.push(unescapeXml(m[2]));
  }
  return out;
}

/**
 * Rasterize an already-rendered SVG string to a deterministic PNG
 * (`Uint8Array`) — the shared raster core. Requires the optional
 * `@resvg/resvg-js`; throws a clear, actionable error when it is absent. Used
 * both by {@link renderPng} (the Scene path) and to rasterize the opt-in error
 * card for `arch preview`/`md --error-svg`.
 */
export async function renderPngFromSvg(svg: string, opts: PngOptions = {}): Promise<Uint8Array> {
  let Resvg: typeof import("@resvg/resvg-js").Resvg;
  try {
    ({ Resvg } = await import(/* webpackIgnore: true */ /* @vite-ignore */ "@resvg/resvg-js" as string));
  } catch {
    throw new Error(
      "PNG export needs the optional dependency '@resvg/resvg-js'. Install it: npm install @resvg/resvg-js",
    );
  }

  // Roboto has no CJK glyphs. resvg falls back glyph by glyph across the
  // font files it is given, so the optional CJK face is simply appended — but ONLY when
  // some drawn string needs it, so every other PNG is byte-identical and an 11 MB face is
  // never parsed for nothing. Whatever no face can draw is reported, never silently lost.
  const fonts = await planFonts(svgTexts(svg));
  for (const d of glyphDiagnostics(fonts.missing, "PNG")) opts.onDiagnostic?.(d);
  const fontFiles = [await bundledFontPath()];
  if (fonts.cjk) fontFiles.push(fonts.cjk.path);

  const scale = opts.scale && opts.scale > 0 ? opts.scale : 1;
  const resvg = new Resvg(svg, {
    font: {
      fontFiles,
      loadSystemFonts: false,
      defaultFontFamily: BUNDLED_FONT_FAMILY,
    },
    ...(scale !== 1 ? { fitTo: { mode: "zoom" as const, value: scale } } : {}),
  });
  return resvg.render().asPng();
}

/**
 * Rasterize a {@link Scene} to a deterministic PNG (`Uint8Array`). Requires the
 * optional `@resvg/resvg-js`; throws a clear, actionable error when it is absent.
 */
export async function renderPng(scene: Scene, opts: PngOptions = {}): Promise<Uint8Array> {
  return renderPngFromSvg(renderSvg(scene, opts), opts);
}
