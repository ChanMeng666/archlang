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

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { CompileOptions } from "../types.js";
import type { Scene } from "../scene.js";
import { renderSvg } from "./svg.js";

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
function fontPath(): string {
  if (fontPathCache) return fontPathCache;
  const candidates = [
    new URL("./assets/Roboto-Regular.ttf", import.meta.url), // bundled: dist/assets
    new URL("../../assets/fonts/Roboto-Regular.ttf", import.meta.url), // source: repo/assets/fonts
  ];
  for (const u of candidates) {
    const p = fileURLToPath(u);
    if (existsSync(p)) {
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
 * Rasterize a {@link Scene} to a deterministic PNG (`Uint8Array`). Requires the
 * optional `@resvg/resvg-js`; throws a clear, actionable error when it is absent.
 */
export async function renderPng(scene: Scene, opts: PngOptions = {}): Promise<Uint8Array> {
  let Resvg: typeof import("@resvg/resvg-js").Resvg;
  try {
    ({ Resvg } = await import("@resvg/resvg-js" as string));
  } catch {
    throw new Error(
      "PNG export needs the optional dependency '@resvg/resvg-js'. Install it: npm install @resvg/resvg-js",
    );
  }

  const svg = renderSvg(scene, opts);
  const scale = opts.scale && opts.scale > 0 ? opts.scale : 1;
  const resvg = new Resvg(svg, {
    font: {
      fontFiles: [fontPath()],
      loadSystemFonts: false,
      defaultFontFamily: BUNDLED_FONT_FAMILY,
    },
    ...(scale !== 1 ? { fitTo: { mode: "zoom" as const, value: scale } } : {}),
  });
  return resvg.render().asPng();
}
