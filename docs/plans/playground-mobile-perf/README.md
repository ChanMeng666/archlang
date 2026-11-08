# Playground on phones, and page performance

Follows `playground-minimal/` (PG1–PG5, all merged). That programme decided *what* is on the
page. This one makes the page fit a phone screen and stop wasting the visitor's CPU, battery and
bytes. The rulings PG-D1…D7 still hold; nothing here adds a control.

## 1. Evidence (audit of 2026-11-07, live site at main 7a5006b6)

Method: Playwright with touch emulation at 2–3× density, Chrome with CDP 4× CPU throttle,
Lighthouse 13.6 (3 runs, median). Raw data and screenshots are kept outside the repo.

Lighthouse is green (mobile `/` 96, LCP 1.28 s, CLS 0.003, TBT 212 ms). The real phone costs
come after load:

| What a phone visitor hits | Measured |
|---|---|
| Stage toolbar on first paint | below the fold at 320×568, 360×780, 844×390, 768×1024; 30 px cut at 390/430 wide |
| Swipe on the plan, 3D canvas or facts row | scrolls 0 px (all `touch-action: none`); once the header scrolls away it never comes back |
| Phone header | 121 px; 173 px (3 rows) at ≤ 360 wide; landscape leaves a 269 px stage |
| 3D turntable | 60 frames/s with no end, also under the Make your own dialog; 76–81 ms CPU per frame at 4× (a 1.19 MP GPU→CPU copy each frame) |
| Every visit | downloads the 430 KB compiler + 70 KB of examples, then recompiles the plan already on screen: a 1.5–1.6 s task at 4× |
| First gallery open | 1.1 MB of thumbnail SVG (full drawings at 150 px), 21 long tasks, 3.4 s at 4×; thumbnails revalidated every visit |
| One keystroke, Hillside Villa | ~0.7 s main thread on desktop, ~2 s at 4× (compile on the main thread, no worker) |
| Touch affordances | hint says "scroll to zoom · right-drag to pan"; floating controls rest at 62 % opacity (hover-only); scrubber 12 px tall |
| Touch tablet 1024×768 | 13 controls under 44 px (the 44 px rules live only under `max-width: 900px`) |
| Small text, inputs | 9–11.5 px text on phones; two inputs at 12–12.5 px make iOS zoom on focus |
| WebGL context loss | not handled: the last frame freezes with no message |

## 2. Rulings

- **MP-D1 The phone page is one screen.** At ≤ 900 px the body is a `100svh`/`100dvh` column;
  the page itself never scrolls, panels scroll inside. The header is at most two rows (≤ 100 px),
  one row when the screen is under 500 px tall. Still ≤ 5 header controls.
- **MP-D2 Touch is a first-class input.** Every rule that sizes a target for a phone also applies
  under `(pointer: coarse)`; hover-only affordances get a no-hover state; hints use touch words on
  touch screens. Visible text ≥ 12 px, inputs ≥ 16 px on phones.
- **MP-D3 3D draws only when someone can see it.** The turntable stays (PG-D4) but pauses while a
  dialog or menu covers the stage, when the canvas is under half visible, and when the tab is
  hidden; it resumes after. Touch screens cap the drawing buffer at 1.5× density. Lost WebGL
  context shows a message and redraws on restore. Drawing straight to the visible canvas (no
  per-frame copy) is a package change and is deferred to a separate card under the package
  release rules.
- **MP-D4 A visit pays only for what it uses.** The built-in plan is prerendered exactly as the
  live page would draw it (annotations and the facts line included), so boot does not compile.
  The compiler loads on first use or when the browser is idle, never on idle under Save-Data or
  2g. The URL contract is unchanged: `#z=`, `#src=`, drafts and `/s/<id>` still compile at once,
  except a saved draft identical to the built-in plan (no `#z=`/`#src=`, no saved theme), which
  opens like a plain visit.
  The startup set went down with MP5 (447,460 B to 16,383 B gzip, the view path alone); a later
  card may add only a small amount to it, recorded in its row, under MP-D7's 60 KB ceiling. A
  re-taken startup baseline records its reason.
- **MP-D5 Thumbnails are thumbnails.** Gallery images are lean SVGs (walls, openings, room fills,
  stairs and lifts; no text, dimensions or furniture), generated from `compile()`, at the same URLs, cached a day
  with stale-while-revalidate. PG-D2 holds.
- **MP-D6 Typing never freezes the page.** Compile, describe and lint run in a lazily loaded Web
  Worker; stale results are dropped by sequence number. `compile()` stays pure; the worker is a
  playground file, not core. It is a chunk of the page's own build, so it shares the compiler
  chunk the page already loaded; where a worker cannot run, the page compiles as before.
- **MP-D7 Laws unchanged.** Light-only, the 60 KB startup ceiling, no three.js or CodeMirror at
  startup, crawler-visible static bytes, the 3D wording bans. Tests are rewritten, never loosened.

## 3. Cards

| Card | Scope | Main files | Proof | Tier |
|---|---|---|---|---|
| **MP1** phone stage fits the screen (#559) | MP-D1, MP-D2 sizes/text/inputs, viewport meta `interactive-widget=resizes-content` | `styles/chrome.css`, `styles/panels.css`, `index.html` | `layout.spec.ts` at 320×568, 360×780, 390×844, 844×390 (view and `&edit`): toolbar and facts row inside the window, page does not scroll, header ≤ 100 px; 1024×768 touch: every control ≥ 44 px; text ≥ 12 px, inputs ≥ 16 px | medium |
| **MP2** touch on the 3D stage (#560) | MP-D2 hint/opacity/scrubber, MP-D3 context loss | `src/preview3d.ts`, `styles/panels.css` | `preview3d.spec.ts`: touch wording, opacity 1 without hover, scrubber hit area ≥ 44 px, forced context loss → message → restore redraws | medium |
| **MP3** 3D draws only when visible (#561) | MP-D3 pause/resume, buffer cap | `src/preview3d.ts` | `preview3d.spec.ts`: no frames for 1 s under the dialog or off-screen; resumes on close; buffer ≤ cap at 390×844 | medium |
| **MP4a** lean thumbnails (#563) | MP-D5 | `scripts/gen-static.mjs`, `scripts/lean-thumb.mjs` | each thumbnail ≤ 10 KB (`THUMB_MAX_BYTES`) and cut from `compile()`; keeps every keepable layer the compiler drew | medium |
| **MP4b** thumbnail cache rule (#564) | MP-D5 | `public/_headers`, `scripts/smoke.mjs` | cache header checked by smoke | high (`_headers`) |
| **MP5** no compile at boot (#565) | MP-D4 | `src/main.ts`, `scripts/gen-static.mjs`, `vite.config.js`, `e2e/startup-chunks.baseline.json` | no compiler request before interaction under Save-Data; facts line in served HTML; `init-precedence`, `examples-static`, `front-door` specs unchanged and green | high (baseline) |
| **MP6** compile in a worker (#569) | MP-D6 | `src/main.ts`, new `src/compile-worker.ts`, panels reading results | typing 20 characters into Hillside gives no main-thread task over 100 ms; last result wins; panel specs unchanged. Startup set 17,184 B gzip (index 13,613 + panels 2,773 + preload-helper 798): +801 B over MP5 for the worker client's wiring, the baseline not re-taken | medium/high |
| MP7 (deferred, § 5) | draw 3D straight to the visible canvas | `packages/archlang-3d/src/replay/mount.ts` | frame hashes and single-file replay HTML bytes unchanged | high, package release |
| **MP8** a dragged knob compiles in the worker (#574) | MP-D6 for the knobs panel: a moving slider's compile leaves the page, and a value that does not compile still snaps back | `src/main.ts` (`tryRender`), `src/knobs-panel.ts` | dragging a knob on Hillside at 4× CPU gives no main-thread task over 100 ms; the last value wins; `knobs` specs unchanged and green. Startup set 17,366 B gzip (index 13,795): +182 B over MP6, the baseline not re-taken | medium |
| **MP9** a plan switch compiles once (#574) | `render` asked for the drawing already on screen, with nothing in flight, compiles nothing (today the switch's own render and its debounced one both compile when the first lands within 250 ms) | `src/main.ts` | a gallery switch makes exactly one compile request; an edit after it still compiles | medium |
| **MP10** a failed compiler load retries in every engine (#575) | MP5 forgets a failed `import()` so the next use asks again; that is proven in Chromium only, and an engine that keeps a failed module fetch would never retry | `src/main.ts` (`up`), `e2e/panels.spec.ts` `@engines`, `playwright.config.ts`, CI | per engine, as it is: Chromium and Firefox ask again in place; WebKit keeps the failure for the document (HTML module map, no request), and another URL cannot help (every chunk imports the compiler by its own), so a page's second failed boot reloads it once, only when the page itself answers; the reloaded page boots at once and never reloads itself, and says plainly when it still failed. WebKit's recovery after that reload is not asserted (decided under the owner's delegation, 2026-11-08): Playwright's WebKit kept the refused chunk in its memory cache across reloads for a time that varied (up to 38 s), and its next import of a refused chunk rejects only after 20–30 s (the WebKit runs are marked slow for it). The owner's real-iPhone check (2026-11-08) found the playground smooth. Startup set 17,520 B gzip (index 13,949): +128 B over main, the baseline not re-taken | medium/high (CI) |

Order: MP1 → MP2 → MP3 → MP4a/MP4b → MP5 → MP6, then MP8 → MP9 → MP10 (follow-ups found in
MP5/MP6 review). High-tier cards wait for the owner's words before merge.
MP1–MP6 and MP8–MP10 are done (MP6: #569, its main-red parity test fixed by #571; MP8, MP9: #574);
MP10 (#575): Chromium and Firefox ask again in place; WebKit keeps the failed
fetch for the document (no request), so a page's second failed boot reloads it once, when the
page answers, and the reloaded page never reloads itself (WebKit's recovery after it is not
asserted, see the row); MP7 stays deferred (§ 5).

Open follow-ups from the reviews, too small for a card each:
- No test covers a knob release that is overtaken twice in a row (a Checks toggle, then a theme
  change). By the code it asks again each time and then decides (#574 review).
- The touch tests of the brand's two links (#573) probe their 44 px hit areas by 1–2 px.
- A gallery switch's "exactly one compile" test passes on a slow runner even without MP9's change,
  because there the old in-flight dedupe catches the second render (#574 review).

## 4. Open for the owner

- Decided 2026-11-07: Cloudflare Web Analytics (injected at the edge on both sites, about 10 KB
  of JS per page) is free, so the owner kept it; the privacy page and `docs/seo.md` now say so.
- Real iOS Safari, the virtual keyboard and phone GPU cost were not measurable in emulation. Checked
  2026-11-08: the owner used playground.archlang.uk on a real iPhone (iOS Safari) after MP1–MP10
  and found it smooth throughout, with nothing to fix.

## 5. Deferred: MP7

**What.** The 3D preview draws each frame into a hidden WebGL canvas
(`preserveDrawingBuffer: true`), then copies it into the visible 2D canvas
(`ctx.drawImage(gl, 0, 0)` in `packages/archlang-3d/src/replay/mount.ts`). That 2D context is made
with `willReadFrequently`, so it lives in CPU memory and every frame is read back from the GPU. On a
phone that copy is a large share of a frame's cost. MP7 would draw straight to the visible canvas.

**Why it waits.**
- The change is in `packages/archlang-3d`, not the playground. The same mount is used by the
  single-file replay HTML, the video export and the frame-hash tests.
- The 2D canvas is there for a reason. It cross-fades the core's SVG drawing over the replay's top
  view (`ctx.globalAlpha = s.svg`), and the frame hashes read its pixels (`getImageData`). Drawing
  straight to the canvas needs another way to do both, with frame hashes and replay HTML bytes
  unchanged.
- It ships only through an `archlang-3d` release, which is owner-only, and then a playground bump.
- MP3 already bounds the cost: nothing is drawn while the 3D view is covered, off-screen or in a
  hidden tab, and the drawing buffer is capped at 1.5× on touch screens.

**When to take it up.** With the next `archlang-3d` release, or if a phone is later found slow in
3D. The owner's real-phone check (2026-11-08) found the 3D view smooth, so nothing forces it now.
Start from this section and the MP7 row.
