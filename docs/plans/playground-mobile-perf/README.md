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
  2g. The URL contract is unchanged: `#z=`, `#src=`, drafts and `/s/<id>` still compile at once.
  Startup bytes only go down; the startup baseline is re-taken with the reason recorded.
- **MP-D5 Thumbnails are thumbnails.** Gallery images are lean SVGs (walls, openings, room fills;
  no text, dimensions or furniture), generated from `compile()`, at the same URLs, cached a day
  with stale-while-revalidate. PG-D2 holds.
- **MP-D6 Typing never freezes the page.** Compile, describe and lint run in a lazily loaded Web
  Worker; stale results are dropped by sequence number. `compile()` stays pure; the worker is a
  playground file, not core.
- **MP-D7 Laws unchanged.** Light-only, the 60 KB startup ceiling, no three.js or CodeMirror at
  startup, crawler-visible static bytes, the 3D wording bans. Tests are rewritten, never loosened.

## 3. Cards

| Card | Scope | Main files | Proof | Tier |
|---|---|---|---|---|
| **MP1** phone stage fits the screen | MP-D1, MP-D2 sizes/text/inputs, viewport meta `interactive-widget=resizes-content` | `styles/chrome.css`, `styles/panels.css`, `index.html` | `layout.spec.ts` at 320×568, 360×780, 390×844, 844×390 (view and `&edit`): toolbar and facts row inside the window, page does not scroll, header ≤ 100 px; 1024×768 touch: every control ≥ 44 px; text ≥ 12 px, inputs ≥ 16 px | medium |
| **MP2** touch on the 3D stage | MP-D2 hint/opacity/scrubber, MP-D3 context loss | `src/preview3d.ts`, `styles/panels.css` | `preview3d.spec.ts`: touch wording, opacity 1 without hover, scrubber hit area ≥ 44 px, forced context loss → message → restore redraws | medium |
| **MP3** 3D draws only when visible | MP-D3 pause/resume, buffer cap | `src/preview3d.ts` | `preview3d.spec.ts`: no frames for 1 s under the dialog or off-screen; resumes on close; buffer ≤ cap at 390×844 | medium |
| **MP4** lean thumbnails | MP-D5 | `scripts/gen-static.mjs`, `public/_headers` | each thumbnail ≤ 8 KB and from `compile()`; cache header checked by smoke | high (`_headers`) |
| **MP5** no compile at boot | MP-D4 | `src/main.ts`, `scripts/gen-static.mjs`, `vite.config.js`, `e2e/startup-chunks.baseline.json` | no compiler request before interaction under Save-Data; facts line in served HTML; `init-precedence`, `examples-static`, `front-door` specs unchanged and green | high (baseline) |
| **MP6** compile in a worker | MP-D6 | `src/main.ts`, new `src/compile-worker.ts`, panels reading results | typing 20 characters into Hillside gives no main-thread task over 100 ms; last result wins; panel specs unchanged | medium/high |
| MP7 (deferred) | draw 3D straight to the visible canvas | `packages/archlang-3d/src/replay/mount.ts` | frame hashes and single-file replay HTML bytes unchanged | high, package release |

Order: MP1 → MP2 → MP3 → MP4 → MP5 → MP6. High-tier cards wait for the owner's words before merge.

## 4. Open for the owner

- Cloudflare Web Analytics is injected at the edge on both sites (about 10 KB of JS per page),
  which contradicts `docs/seo.md` ("Neither ArchLang site has analytics") and the playground-minimal
  plan ("不加分析埋点"). Turning it off is a dashboard setting.
- Real iOS Safari, the virtual keyboard and phone GPU cost were not measurable in emulation; check
  on a real phone after MP1–MP3.
