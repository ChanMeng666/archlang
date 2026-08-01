/**
 * The chrome-less embed page's pure decisions, split out of `embed.ts` so they
 * can be unit-tested in Node.
 *
 * `embed.ts` is a page entry point: it queries the DOM and imports CSS at module
 * scope, so it cannot be imported outside a browser. Everything in it that is a
 * *decision* rather than a DOM write lives here instead — the hash-param reader,
 * the compile-options builder, and the last-good-render rule.
 */
import { THEMES, type CompileOptions } from "archlang";

/**
 * Read a param from an embed URL hash.
 *
 * The hash is `#<codec-token>&<k>=<v>&…` — the share codec's `#z=…`/`#src=…`
 * comes first and the params follow, so a param can sit after either `#` or `&`
 * (`#z=AAA&editable=1`, and a bare `#editable=1` on a hash with no source at all).
 */
export function hashParam(hash: string, name: string): string | null {
  const m = hash.match(new RegExp(`[#&]${name}=([^&]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

/** `editable=1` — show the compact editor pane and re-render on input. */
export function isEditable(hash: string): boolean {
  return hashParam(hash, "editable") === "1";
}

/**
 * The compile options an embed uses for `theme=<key>`.
 *
 * `onError: "svg"` is not optional here: an embed is a chrome-less <iframe> with
 * no editor to fall back on, so a plan that is broken on FIRST load must render a
 * self-describing error CARD rather than a blank box. An unknown theme key is
 * ignored (the plan's own `theme` directive then wins) rather than being an error
 * — a stale link should still draw.
 */
export function embedCompileOptions(themeKey: string | null): CompileOptions {
  return themeKey && THEMES[themeKey]
    ? { noCache: true, onError: "svg", theme: THEMES[themeKey] }
    : { noCache: true, onError: "svg" };
}

/** What one embed render should do with the compile result. */
export interface RenderDecision {
  /** Error-strip text, or null to hide the strip. */
  error: string | null;
  /** Inject the compiled SVG into the stage? (false = keep the last good preview.) */
  showSvg: boolean;
  /** The `hasGoodRender` latch after this render. */
  hasGoodRender: boolean;
}

/**
 * The last-good-render rule.
 *
 * Once a plan has rendered cleanly the latch is set, and from then on a transient
 * compile error keeps the last good preview on screen instead of swapping in the
 * error card — which is what makes typing in an `editable=1` embed bearable. Before
 * that first success there is nothing to keep, so the error card IS the render.
 * The latch never clears: a plan that once compiled is never replaced by a card.
 */
export function renderDecision(hasGoodRender: boolean, errors: readonly { message: string }[]): RenderDecision {
  if (errors.length) {
    return {
      error: `${errors.length} error${errors.length > 1 ? "s" : ""}: ${errors[0].message}`,
      showSvg: !hasGoodRender,
      hasGoodRender,
    };
  }
  return { error: null, showSvg: true, hasGoodRender: true };
}
