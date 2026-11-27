/**
 * Chrome-less embed page. Renders an ArchLang plan from the URL hash — the same
 * `#z=` share codec the main playground writes — so a floor plan can be dropped
 * into any blog / Confluence / GitHub-Pages via a single <iframe>. Client-side
 * only; the zero-dep core compiles in the browser exactly as it does in Node.
 *
 * The plan comes from `#z=…` (or legacy `#src=…`) in place, or from `#s=<id>`, a short link's id,
 * fetched from this site's server (ADR 0034).
 *
 * Hash params (after the `#z=…`/`#src=…`/`#s=…` token, `&`-joined):
 *   editable=1    show a compact editor pane + live re-render on input
 *   theme=<key>   force a named render theme (blueprint | dark | mono | presentation | rendered)
 */
import { compile } from "./compiler.js";
import { embedCompileOptions, embedRenders, hashParam, isEditable, renderDecision } from "./embed-params.js";
import { createPanZoom } from "./pan-zoom.js";
import { LINK_TOO_LARGE_NOTICE, readShared, shareIdFromHash } from "./share.js";
import { createSharedNotice, SHARED_PLAN_NOTICE_SHORT, shouldShowSharedNotice } from "./shared-notice.js";
// The fallback plan for a hash-less embed: the canonical smallest complete plan,
// imported verbatim (`?raw`) so it can never drift from examples/one-room.arch.
import fallbackPlan from "../../examples/one-room.arch?raw";
import { showSvgInStage } from "./viewer.js";
import "@fontsource-variable/public-sans/wght.css";
import "@fontsource/ibm-plex-mono/400.css";
import "./styles/tokens.css";
import "./styles/panels.css";
import "./styles/embed.css";

const stage = document.querySelector<HTMLElement>(".pz-stage")!;
const viewport = document.querySelector<HTMLElement>(".pz-viewport")!;
const previewWrap = document.querySelector<HTMLElement>(".embed-preview")!;
const toolbar = document.querySelector<HTMLElement>(".pz-toolbar");
const editorWrap = document.querySelector<HTMLElement>(".embed-editor")!;
const textarea = document.getElementById("embedSrc") as HTMLTextAreaElement;
const errEl = document.getElementById("embedErr")!;

const pz = createPanZoom(viewport, stage);

// The hash reader, the options builder and the last-good-render rule are pure and
// live in embed-params.ts (unit-tested); this module only does the DOM writes.
const opts = embedCompileOptions(hashParam(location.hash, "theme"));

/** True once a good plan has rendered — after that, a transient error keeps the last
 *  good preview (nicer while typing in an `editable=1` embed) rather than swapping in
 *  the error card. */
let hasGoodRender = false;

/**
 * The renders' bookkeeping (embed-params.ts `embedRenders`): the newest render, whether anything is
 * on the stage yet, and the error card's renderer (error-card.ts, card 3.19), loaded by the first
 * broken plan this page shows. The compiler chunk's `compile` draws no card (compiler.ts), so the
 * card `opts` asks for is drawn here, the same card `compile(source, opts)` draws
 * (playground/test/embed-params.test.ts).
 */
const renders = embedRenders(() => import("./error-card.js"));

function render(source: string, refit: boolean): void {
  const at = renders.begin();
  const { svg, errors, diagnostics } = compile(source, opts);
  const decision = renderDecision(hasGoodRender, errors);
  hasGoodRender = decision.hasGoodRender;
  if (decision.error !== null) {
    errEl.hidden = false;
    errEl.textContent = decision.error;
  } else {
    errEl.hidden = true;
  }
  if (!decision.showSvg) return;
  if (errors.length === 0) {
    showSvgInStage(stage, pz, svg, renders.shown(refit));
    return;
  }
  // A chunk that fails to load leaves the error strip above as the whole report; the next broken
  // render tries the load again. A card that arrives after a newer render has run is not shown.
  renders.card().then(
    ({ renderErrorSvg }) => {
      if (renders.current(at)) showSvgInStage(stage, pz, renderErrorSvg(source, diagnostics), renders.shown(refit));
    },
    () => {},
  );
}

toolbar?.addEventListener("click", (e) => {
  const action = (e.target as Element | null)?.closest<HTMLElement>("button")?.dataset.pz;
  if (action === "in") pz.glideIn();
  else if (action === "out") pz.glideOut();
  else if (action === "fit") pz.glideFit();
});

async function init() {
  const read = await readShared();
  if (read && "refused" in read) {
    errEl.hidden = false;
    errEl.textContent = LINK_TOO_LARGE_NOTICE;
    return;
  }
  const shared = read ? read.src : null;
  // A short link that names no stored plan says so, rather than drawing the fallback as if it were the plan.
  if (shared === null && shareIdFromHash(location.hash) !== null) {
    errEl.hidden = false;
    errEl.textContent = "This short link names no stored plan.";
    return;
  }
  const source = shared ?? fallbackPlan;

  // This page IS the third-party surface: it exists to be framed by someone else's
  // site, showing a plan that arrived in the fragment. So it carries the same
  // attribution notice the playground does, as one compact line above the drawing.
  // The "bundled" set here is the single plan this entry actually bundles — the
  // one-room fallback — rather than the playground's presets: importing those
  // would ship a quarter of a megabyte of example text into every iframe on the
  // internet to silence a notice that, on this page, is almost always correct.
  if (shouldShowSharedNotice(shared, [fallbackPlan])) {
    previewWrap.prepend(createSharedNotice(SHARED_PLAN_NOTICE_SHORT));
  }

  const editable = isEditable(location.hash);
  if (editable) {
    editorWrap.hidden = false;
    textarea.value = source;
    let debounce: ReturnType<typeof setTimeout>;
    textarea.addEventListener("input", () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => render(textarea.value, false), 200);
    });
  }
  render(source, true);
  requestAnimationFrame(() => pz.fit());
}

void init();
