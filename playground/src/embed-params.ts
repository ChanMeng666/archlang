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
 *
 * The embed shows what `compile(source, options)` draws. Its compiler chunk's `compile`
 * draws no card (compiler.ts, card 3.19), so embed.ts draws the card these options ask
 * for itself, with `renderErrorSvg` loaded by the broken plan (error-card.ts): the same
 * card, byte for byte (playground/test/embed-params.test.ts).
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

/** The embed's renders over time: which one is newest, whether anything is on the stage, the card. */
export interface EmbedRenders<T> {
  /** A render starts: its number. A later render makes every earlier one stale. */
  begin(): number;
  /** Whether render `at` is still the newest, so what it draws may be shown. */
  current(at: number): boolean;
  /**
   * The refit to show a drawing with, and a note that one is now shown: the caller's `refit`, or
   * `true` while nothing has been shown yet, so the first thing on the stage is always fitted (a
   * broken first load draws its card later than the render that asked for the fit).
   */
  shown(refit: boolean): boolean;
  /** The error card's module (card 3.19): one shared load; a rejected one is forgotten, so the next call tries again. */
  card(): Promise<T>;
}

/**
 * The bookkeeping embed.ts does around its renders (card 3.19), pure over `load` so it can be
 * unit-tested: the compiler chunk's `compile` draws no error card, so a broken plan's card arrives
 * after `load` (the dynamic import of error-card.ts) settles, and by then a newer render may have
 * run, or the render that asked for the fit may have drawn nothing. The load is lazy-once.ts's rule
 * written out (imported, `lazyOnce` became a chunk of its own on both the embed and the first use's
 * paths).
 */
export function embedRenders<T>(load: () => Promise<T>): EmbedRenders<T> {
  let newest = 0;
  let anything = false;
  let pending: Promise<T> | undefined;
  return {
    begin: () => ++newest,
    current: (at) => at === newest,
    shown(refit) {
      const fit = refit || !anything;
      anything = true;
      return fit;
    },
    card: () =>
      (pending ??= load().catch((err: unknown) => {
        pending = undefined;
        throw err;
      })),
  };
}
