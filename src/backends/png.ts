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
import { renderSvg } from "./svg.js";

// NB: node:fs / node:url are imported LAZILY inside fontPath() (not at module
// top) so this module stays browser-safe and honours the §0 invariant "no
// Node-only APIs in src/ except cli.ts". The Node path only runs when renderPng
// is actually called (it is Node-only — resvg is a native binding).

/** The bundled font's family name — pinned as resvg's default so it is used for
 *  every `<text>` regardless of the SVG's `font-family` (Helvetica/Arial/…). */
const BUNDLED_FONT_FAMILY = "Roboto";

let fontPathCache: string | null = null;

/**
 * Resolve the bundled font's path once. The same module runs both bundled
 * (`dist/…`) and straight from source (vitest / `tsx`), so try both layouts:
 * `dist/assets/` next to the emitted chunk, and `assets/fonts/` at the repo root
 * relative to `src/backends/`.
 */
async function fontPath(): Promise<string> {
  if (fontPathCache) return fontPathCache;
  // Namespace access (not destructuring) so browser bundlers that stub `node:*`
  // don't fail their static named-export check — this code never runs in a browser.
  const fs = await import("node:fs");
  const url = await import("node:url");
  // String-CONCAT paths (not literals or template literals) so browser bundlers'
  // `new URL(..., import.meta.url)` asset plugins don't statically pick the font
  // up — it ships only in the npm tarball (dist/assets) and is read here at
  // runtime under Node. (Vite/Rollup match literal/template forms, not `+`.)
  const file = "Roboto-Regular.ttf";
  const candidates = [
    new URL("./assets/" + file, import.meta.url), // bundled: dist/assets
    new URL("../.." + "/assets/fonts/" + file, import.meta.url), // source: repo/assets/fonts
  ];
  for (const u of candidates) {
    const p = url.fileURLToPath(u);
    if (fs.existsSync(p)) {
      fontPathCache = p;
      return p;
    }
  }
  throw new Error("PNG export: bundled font 'Roboto-Regular.ttf' could not be located");
}

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
      fontFiles: [await fontPath()],
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
