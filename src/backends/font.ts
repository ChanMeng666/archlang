/**
 * The bundled font every Node-only backend embeds, resolved once.
 *
 * Both the PNG rasteriser (resvg) and the PDF exporter (pdfkit) must draw text
 * with the SAME font so the two outputs agree and so neither depends on which
 * fonts happen to be installed on the host. A standard-14 PDF face (Helvetica)
 * cannot represent anything outside Windows-1252 — Polish, Czech, Turkish, Greek
 * and Cyrillic labels all lose glyphs — so the PDF embeds this TrueType face too.
 *
 * `node:fs` / `node:url` are imported LAZILY inside {@link bundledFontPath} (not
 * at module top) so this module stays browser-safe and honours the §0 invariant
 * "no Node-only APIs in src/ except cli.ts". The Node path only runs when a
 * Node-only backend actually renders.
 */

/** The bundled font's family name — pinned as resvg's default and used as the
 *  pdfkit registration alias. */
export const BUNDLED_FONT_FAMILY = "Roboto";

let fontPathCache: string | null = null;

/**
 * Resolve the bundled font's path once. The same module runs both bundled
 * (`dist/…`) and straight from source (vitest / `tsx`), so try both layouts:
 * `dist/assets/` next to the emitted chunk, and `assets/fonts/` at the repo root
 * relative to `src/backends/`.
 */
export async function bundledFontPath(): Promise<string> {
  if (fontPathCache) return fontPathCache;
  // Namespace access (not destructuring) so browser bundlers that stub `node:*`
  // don't fail their static named-export check — this code never runs in a browser.
  // The ignore comments keep webpack/Vite from trying to resolve `node:fs`/`node:url`
  // for a browser bundle at all (same rule as the optional-dep imports; without them
  // a webpack consumer importing the core client-side fails its build on this
  // Node-only, never-reached-in-browser path).
  const fs = await import(/* webpackIgnore: true */ /* @vite-ignore */ "node:fs");
  const url = await import(/* webpackIgnore: true */ /* @vite-ignore */ "node:url");
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
  throw new Error(`bundled font '${file}' could not be located`);
}
