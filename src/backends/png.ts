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
import type { Scene } from "../scene.js";
import { BUNDLED_FONT_FAMILY, bundledFontPath } from "./font.js";
import { renderSvg } from "./svg.js";

/** Options for {@link renderPng}: the SVG options plus an optional pixel scale. */
export interface PngOptions extends CompileOptions {
  /** Uniform raster scale (default 1). 2 ⇒ double-resolution PNG. */
  scale?: number;
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

  const scale = opts.scale && opts.scale > 0 ? opts.scale : 1;
  const resvg = new Resvg(svg, {
    font: {
      fontFiles: [await bundledFontPath()],
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
