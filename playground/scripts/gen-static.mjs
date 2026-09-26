/**
 * Build the playground's STATIC half: one crawlable HTML page per example plan,
 * an index of them, and the site's sitemap. Runs after `vite build`, writing into
 * the same `playground/dist/` Cloudflare serves.
 *
 * WHY THIS EXISTS. No AI or search crawler executes JavaScript, and the playground
 * is a Vite SPA whose entire state lives in a `#z=` fragment that never reaches the
 * server. So before this script every one of the ~50 permalinks the README, the
 * docs and the spec emit collapsed onto ONE indexable URL with no plan on it, and a
 * machine asking "what does an ArchLang floor plan look like" could be served
 * nothing but an empty editor shell. These pages are that answer in served bytes:
 * the compiled SVG, the source it came from, and the numbers `describe()` measured.
 *
 * THREE CONSTRAINTS THE PAGES OBEY, all of them consequences of how this site is
 * served (see playground/wrangler.jsonc and public/_redirects):
 *
 *  1. `base: "./"` — index.html's own asset URLs are RELATIVE, so a page one
 *     directory down at /examples/x.html that reused them would resolve
 *     `./assets/…` to `/examples/assets/…` and 404. Every page here is therefore
 *     SELF-CONTAINED: its own inline <style>, no <script>, no app bundle. Its only
 *     external references are ROOT-ABSOLUTE and so resolve from any depth: the
 *     brand assets, the font files under /assets/, and the thumbnails under
 *     /examples/thumbs/. `test/playground-examples-rows.test.ts` and
 *     scripts/smoke.mjs both guard the shape; a `./assets/` reference here is a bug.
 *  2. `html_handling: "none"` — the asset lookup is EXACT, so `/examples/x` 404s
 *     and only `/examples/x.html` is a real URL. The canonical link and every
 *     sitemap entry therefore carry the `.html`, and `/examples/` reaches its
 *     index through a status-200 rewrite in public/_redirects, the same mechanism
 *     the site root already uses.
 *  3. Nothing here is hand-listed. The rows come from `playground/src/examples.ts`,
 *     the drawing and the numbers from the BUILT core in `dist/` — so a page can
 *     never claim a plan the compiler does not produce, which is exactly how the
 *     README's committed SVGs rotted for months before `gen:example-svgs` existed.
 *     The same rule now covers the page's own LOOK: the `:root` token block is
 *     sliced out of `playground/src/styles/tokens.css` and the `@font-face` rules
 *     are harvested from the stylesheets vite just emitted, so neither can be a
 *     retyped copy that goes stale (the iron law in docs/agents/iron-laws.md).
 *
 * WHY THE FONTS COME FROM `dist/assets/*.css` AND NOT FROM `node_modules`.
 * These pages load no stylesheet, so a font-family they NAME but never DECLARE
 * falls back to the system UI stack — silently, on every page, with a 200 on every
 * route. That is not hypothetical either: it is what these pages shipped with until
 * `collectFontFaces` existed, and no gate in the repo could see it. This script runs
 * after `vite build` into the same `dist/`, and vite has already inlined the
 * @fontsource CSS, content-hashed every .woff2 into `dist/assets/` and rewritten each
 * `url()`. Harvesting THAT reuses vite's own files — one copy, one cache entry, and
 * the `/assets/*  immutable` rule in public/_headers inherited for free. Reading
 * node_modules instead would mean a second copy of every byte at a second URL.
 *
 *     READ EVERY `dist/assets/*.css`, NOT JUST THE ENTRY CHUNK. The two faces these
 *     pages need most are split across two files: `index-*.css` carries Archivo and
 *     IBM Plex Mono, while `public-sans` — the BODY face — is only in the lazily
 *     loaded `panels-*.css`. A parser that read the entry stylesheet alone would ship
 *     pages with a display font and no body font, and look like it worked.
 *
 * Usage: `node scripts/gen-static.mjs` from `playground/`, after `vite build` and
 * after a repo-root `npm run build`. `playground/package.json`'s `build` script
 * chains the two, so `npm run playground:build` and the deploy workflow both cover
 * it with no extra step.
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { encodePlanHash } from "../../scripts/gen-permalink.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const playground = join(here, "..");
const repo = join(playground, "..");
const outDir = join(playground, "dist");

const ORIGIN = "https://playground.archlang.uk";
const DOCS = "https://archlang.uk";
const OG_IMAGE = `${ORIGIN}/brand/archlang-og.png`;

/** The pixel width every thumbnail is compiled at. See `thumbSvg`. */
const THUMB_W = 480;

// ───────────────────────────────────────────────────────────────────────────────
// Inputs: the row table, and the built core.
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Read `EXAMPLE_ROWS` out of `src/examples.ts` with a plain regex. That file is a
 * TypeScript module full of Vite `?raw` import specifiers, so it cannot be
 * imported from Node — but its table is declared literal and uniformly shaped for
 * exactly this reason, the same convention `docs-site/sync-docs.mjs` uses for its
 * three tables. `test/playground-examples-rows.test.ts` parses it identically and
 * fails if the shape moves, so the two parsers cannot drift apart silently.
 *
 * The optional trailing comma in the pattern is not cosmetic: Biome's 120-column
 * formatter breaks these rows across four lines and adds one, so a pattern that
 * demanded `"]` would match zero rows the moment anyone ran `npm run lint:fix`.
 */
function readRows() {
  const src = readFileSync(join(playground, "src", "examples.ts"), "utf8");
  const block = /const EXAMPLE_ROWS = \[([\s\S]*?)\n\] as const;/.exec(src);
  if (!block) {
    fail(
      "playground/src/examples.ts no longer declares `const EXAMPLE_ROWS = [ … ] as const;` as a " +
        "literal table. That table is the single source of the menu, these pages and the sitemap; " +
        "restore the shape, or update this parser and test/playground-examples-rows.test.ts together.",
    );
  }
  const rows = [...block[1].matchAll(/\[\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)",\s*"((?:[^"\\]|\\.)*)"\s*,?\s*\]/g)].map(
    (m) => ({ name: m[1], label: m[2], group: m[3], blurb: m[4] }),
  );
  if (rows.length === 0) fail("playground/src/examples.ts: EXAMPLE_ROWS parsed to zero rows.");
  return rows;
}

/**
 * The BUILT core, not the source — `dist/index.js` is what the playground itself
 * aliases and what npm publishes, so these pages measure the same compiler a
 * reader would get. A missing `dist/` is a hard exit rather than a fallback: the
 * alternative is a deploy of 27 pages with no drawings on them.
 */
async function loadCore() {
  const entry = join(repo, "dist", "index.js");
  try {
    return await import(pathToFileURL(entry).href);
  } catch (err) {
    fail(
      `cannot import the built core at ${entry}\n` +
        `  ${err instanceof Error ? err.message : String(err)}\n` +
        "  Run `npm run build` at the repo root first — the static example pages compile every " +
        "plan with the SAME core the playground aliases, so there is nothing honest to emit without it.",
    );
  }
}

function fail(message) {
  process.stderr.write(`gen-static: ${message}\n`);
  process.exit(1);
}

/**
 * The first line of the shared brand token block's own header comment. The SAME
 * content anchor `test/site-lockstep.test.ts` slices on — deliberately, so the block
 * this script inlines and the block that test holds byte-identical across the two
 * sites are provably the same bytes.
 */
const BLOCK_MARKER = "/* ── The Compile Boundary — shared brand tokens";

/**
 * The shared `:root` token declarations, lifted out of `playground/src/styles/tokens.css`.
 *
 * These pages load no CSS FILE, which is why every colour here used to be a hand-typed
 * hex with the token's name in a trailing comment. That is the retyped-template defect
 * class: nothing diffed the copies, and `--font-mono` had already lost `"Cascadia Code"`
 * against tokens.css by the time anyone looked. A `var()` cannot reach ACROSS to
 * tokens.css, but it resolves perfectly well against a `:root` block declared inside
 * this page's own inline <style> — so inline the real block and reference it.
 */
function readTokenBlock() {
  const file = join(playground, "src", "styles", "tokens.css");
  const text = readFileSync(file, "utf8");
  const start = text.indexOf(BLOCK_MARKER);
  if (start < 0) {
    fail(
      `playground/src/styles/tokens.css no longer contains ${JSON.stringify(BLOCK_MARKER)}.\n` +
        "  That comment is the anchor for the token-lockstep law (.claude/rules/sites.md), and these\n" +
        "  pages inline the block it opens. Restore the marker, or update this slice and\n" +
        "  test/site-lockstep.test.ts together.",
    );
  }
  const end = text.indexOf("\n}", start);
  if (end < 0) fail("playground/src/styles/tokens.css: the shared token block's `:root { … }` rule is unterminated.");
  const decls = text
    .slice(start, end)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (decls.length === 0) fail("playground/src/styles/tokens.css: the shared token block declares nothing.");
  return decls.map((line) => `    ${line}`).join("\n");
}

/** The first family of a `--font-*` stack, unquoted: `"Archivo Variable", …` → `Archivo Variable`. */
function firstFamily(tokenBlock, role) {
  const m = new RegExp(`--font-${role}\\s*:\\s*([^;,]+)`).exec(tokenBlock);
  if (!m) fail(`the shared token block no longer declares \`--font-${role}\`.`);
  return m[1].trim().replace(/^["']|["']$/g, "");
}

/**
 * Every `@font-face` vite emitted, rewritten to root-absolute URLs and deduped.
 *
 * See the file header for why this reads vite's output rather than node_modules, and
 * why it must union EVERY stylesheet instead of the entry chunk alone. Keep all the
 * `unicode-range` subsets: the browser already declines to fetch a face whose range
 * matches nothing on the page, so the vietnamese/cyrillic blocks cost a few KB of text
 * and zero download bytes — while a hand-curated latin-only list is one more thing to
 * go stale the day a blurb gains an `ł`.
 */
function collectFontFaces(tokenBlock) {
  const assetsDir = join(outDir, "assets");
  let files;
  try {
    files = readdirSync(assetsDir).filter((f) => f.endsWith(".css"));
  } catch {
    files = [];
  }
  if (files.length === 0) {
    fail(
      `no stylesheet under ${assetsDir}.\n` +
        "  Run `vite build` first — this script harvests the @font-face rules out of vite's own\n" +
        "  output, so there is nothing to give these pages until vite has written it.",
    );
  }

  const byUrl = new Map();
  for (const name of files) {
    const cssFile = join(assetsDir, name);
    // Vite writes `url(./<hashed>.woff2)`, relative to the stylesheet's own directory.
    // Derive that directory's public path rather than hardcoding one — and note the
    // rewrite never spells the joined literal, which would trip the self-containment
    // guard in test/playground-examples-rows.test.ts.
    const publicDir = `/${relative(outDir, dirname(cssFile)).replace(/\\/g, "/")}`;
    for (const m of readFileSync(cssFile, "utf8").matchAll(/@font-face\s*\{[^}]*\}/g)) {
      const block = m[0].replace(/url\(\.\/([^)]+)\)/g, (_all, file) => `url(${publicDir}/${file})`);
      const key = /url\(([^)]+)\)/.exec(block)?.[1] ?? block;
      if (!byUrl.has(key)) byUrl.set(key, block);
    }
  }

  const declared = new Set(
    [...byUrl.values()].flatMap((block) => {
      const m = /font-family:\s*(?:"([^"]+)"|'([^']+)'|([^;]+))/.exec(block);
      return m ? [(m[1] ?? m[2] ?? m[3]).trim()] : [];
    }),
  );

  // The gate that makes the silent fallback impossible to reintroduce: the families
  // these pages NAME come from tokens.css, so the families they LOAD must cover them.
  const roles = ["display", "body", "mono"];
  const required = roles.map((role) => firstFamily(tokenBlock, role));
  const missing = required.filter((family) => !declared.has(family));
  if (missing.length > 0) {
    fail(
      `no @font-face for ${missing.map((f) => JSON.stringify(f)).join(", ")} in ${assetsDir}/*.css.\n` +
        `  Found: ${[...declared].sort().join(", ") || "(none)"}\n` +
        "  These pages load no stylesheet, so a family that is named but not declared falls back to\n" +
        "  the system UI stack silently — which is exactly the bug this step exists to prevent.\n" +
        "  Either playground/src/main.ts stopped importing the @fontsource CSS, or vite's assetsDir\n" +
        "  moved. Fix the import, or update collectFontFaces().",
    );
  }

  // Preload the one latin face for the display and body roles — both are certain to
  // render on an English page, so neither can earn an "preloaded but unused" warning.
  const preload = [];
  for (const family of required.slice(0, 2)) {
    for (const [url, block] of byUrl) {
      if (block.includes(family) && url.endsWith(".woff2") && /unicode-range:\s*U\+0000-00FF/i.test(block)) {
        preload.push(url);
        break;
      }
    }
  }

  return { css: [...byUrl.values()].join("\n"), preload };
}

// ───────────────────────────────────────────────────────────────────────────────
// Text helpers. Everything a plan or a row contributes is author text, so it is
// escaped at every insertion point — the v1.36 `annotate` bug was one unescaped
// value splicing markup back into its own attribute.
// ───────────────────────────────────────────────────────────────────────────────

const escapeHtml = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** JSON for a <script> block: `</` must not be able to close the element early. */
const escapeJsonLd = (value) => JSON.stringify(value).replace(/</g, "\\u003c");

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Trim the float noise `describe()` already rounded away, without a locale. */
const num = (n) => String(Number(Number(n).toFixed(2)));

/**
 * Is every room reachable from an entrance? The ONE claimable circulation fact,
 * and it is claimed only when `describe()` says so — a plan with no exterior door
 * (themed, relational) gets the clause omitted, never softened.
 */
const allRoomsReachable = (d) =>
  Boolean(d.access?.hasEntrance) && (d.access?.rooms?.length ?? 0) > 0 && d.access.rooms.every((r) => r.reachable);

/**
 * The statistics sentence — a GEO tactic with measured lift, and here it is also
 * simply true: every number is `describe()`'s, not an editorial estimate.
 */
function statisticsSentence(d) {
  const t = d.totals ?? {};
  const figures =
    `${plural(t.rooms ?? 0, "room")}, ${num(t.floor_area_m2 ?? 0)} m² of floor area ` +
    `and ${plural(t.windows ?? 0, "window")}`;
  // On a MULTI-STOREY plan these numbers are the LOWEST storey's, not the building's:
  // `describe()`'s top-level facts are page 1 and `levels[0]` repeats them verbatim
  // (src/describe.ts). So the sentence names the storey it is actually measuring, and
  // `storeyFigures` below prints the rest. Saying "this plan" here would be a claim the
  // compiler never made.
  const levels = storeys(d);
  const head =
    levels.length > 1
      ? `Level ${levels[0].level}${levels[0].name ? ` (${levels[0].name})` : ""} compiles to ${figures}`
      : `This plan compiles to ${figures}`;
  return allRoomsReachable(d) ? `${head}; every room is reachable from the entrance.` : `${head}.`;
}

/** The plan's storeys, ascending — empty for a single-storey plan, which has no `levels`. */
const storeys = (d) => (Array.isArray(d.levels) ? d.levels : []);

/**
 * The per-storey figures for a multi-storey plan, and nothing at all for a single one.
 *
 * This page used to tell the reader that "the figures below count every storey". They
 * never did, and they were not even below — `describe()`'s top-level totals are the
 * LOWEST storey alone. A `LevelSummary` is the same fact shape as a whole plan
 * (src/describe.ts), so each storey's own numbers are already here in `levels[i]`;
 * printing them is both honest and strictly more than the false sentence promised.
 */
function storeyFigures(d) {
  const levels = storeys(d);
  if (levels.length < 2) return "";
  const rows = levels
    .map((l) => {
      const t = l.totals ?? {};
      const name = l.name ? ` (${escapeHtml(l.name)})` : "";
      return (
        `<li><strong>Level ${l.level}</strong>${name} — ${plural(t.rooms ?? 0, "room")}, ` +
        `${num(t.floor_area_m2 ?? 0)} m² of floor area, ${plural(t.windows ?? 0, "window")}.</li>`
      );
    })
    .join("\n        ");
  return (
    `<p class="stats">This is a ${levels.length}-level plan: a storey is a drawing, so the compiler ` +
    `produces one sheet per level and the drawing above is level ${levels[0].level}. ` +
    `The command line writes one file per level, and the playground's preview has a storey switcher. ` +
    `Each storey measures:</p>\n      <ul class="storeys">\n        ${rows}\n      </ul>`
  );
}

/**
 * Give the inlined drawing a role and a name. `describe().caption` is the core's
 * own accessible one-liner — the same string `--accessible` puts in the SVG
 * `<desc>` — so the page and the compiler cannot describe the plan differently.
 * A function replacement, never a replacement string: a caption containing `$&`
 * would otherwise splice the whole match back into the attribute (v1.36).
 */
function labelSvg(svg, caption) {
  return svg.replace(/^<svg/, () => `<svg role="img" aria-label="${escapeHtml(caption)}"`);
}

/**
 * A card-sized thumbnail of a plan, for the index's gallery.
 *
 * TWO things make this a derivation rather than a resize. First, `compile(src, {width})`
 * makes the COMPILER write the root `width`/`height` from its own viewBox, and that also
 * overrides the millimetre paper size a `paper` plan would otherwise emit — so a sheet
 * plan and a bare plan come back in the same units. Second, the renderer emits one
 * `<g id="…" inkscape:groupmode="layer">` per CAD layer, one element per line, so the
 * layers can be filtered by the id the renderer itself wrote.
 *
 * `A-ANNO*` — the room-schedule tables, the dimension strings and the room labels — is
 * dropped: at card size every one of them renders as sub-pixel grey fuzz, which reads as
 * a dirty card rather than as information. What is left is the poché massing diagram,
 * which is the part that IS legible at that size. It halves the bytes as a side effect.
 *
 * The open/close parity check is the guard on the line-shape assumption: if an element
 * ever starts carrying a line-initial `</g>` of its own, this returns a torn document,
 * and a torn document must stop the build rather than reach 27 cards.
 */
function thumbSvg(compile, source) {
  const result = compile(source, { width: THUMB_W });
  if (result.errors.length > 0 || !result.svg) throw new Error("no drawing at thumbnail width");

  const kept = [];
  let opens = 0;
  let closes = 0;
  let dropping = false;
  for (const line of result.svg.split("\n")) {
    const open = /^<g id="([^"]+)" inkscape:groupmode="layer"/.exec(line);
    if (open) {
      opens++;
      dropping = open[1].startsWith("A-ANNO");
      if (dropping) continue;
    } else if (line === "</g>") {
      closes++;
      if (dropping) {
        dropping = false;
        continue;
      }
    } else if (dropping) {
      continue;
    }
    kept.push(line);
  }
  if (opens !== closes) {
    throw new Error(`layer parity: ${opens} \`<g … groupmode="layer">\` opens vs ${closes} line-initial closes`);
  }

  const svg = kept.join("\n");
  if (!/<(?:path|rect|line|polyline|polygon|circle)\b/.test(svg)) {
    throw new Error("the thumbnail kept no drawing primitive — the layer filter dropped everything");
  }

  // The card's intrinsic size comes off the root tag the compiler JUST wrote, so the
  // aspect ratio can never disagree with the file. HTML's width/height content
  // attributes parse as integers anyway, hence the rounding.
  const box = /^<svg[^>]*\swidth="([\d.]+)"\s+height="([\d.]+)"/.exec(svg);
  if (!box) throw new Error(`no px width/height on the thumbnail root — did compile() stop honouring opts.width?`);
  return { svg, w: Math.round(Number(box[1])), h: Math.round(Number(box[2])) };
}

/** The shared brand tokens, read once and inlined at the top of every page's <style>. */
const TOKEN_BLOCK = readTokenBlock();

// ───────────────────────────────────────────────────────────────────────────────
// The page shell. One inline stylesheet, opening with the REAL shared token block
// lifted out of tokens.css (see readTokenBlock) so that every colour below is a
// var() and nothing here is a copy of a brand value. ONE LIGHT WORLD (ADR 0014):
// cool SOURCE grey for the page and the code, warm SHEET paper for the drawing and
// the title block, no dark rule anywhere.
//
// The layout follows the docs site's house pattern: a full-bleed BAND carries the
// background and the vertical padding, an INNER carries the width and the gutters.
// That is the whole fix for a header and footer that used to sit flush against the
// viewport edge while the content between them was centred.
// ───────────────────────────────────────────────────────────────────────────────

const STYLE = `
  :root {
${TOKEN_BLOCK}

    /* This sheet's own rhythm — layout, not brand, so it is declared here and not in
       tokens.css. A 4px scale, the house container width, the house gutter, and the
       measure prose is capped at. */
    --s1: 4px;
    --s2: 8px;
    --s3: 12px;
    --s4: 16px;
    --s5: 24px;
    --s6: 32px;
    --s7: 48px;
    --s8: 64px;
    --s9: 96px;
    --shell: 1152px;
    --gutter: clamp(16px, 4vw, 24px);
    --measure: 64ch;
    --rule: 1px solid var(--hairline);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--src-bg);
    color: var(--src-fg);
    font-family: var(--font-body);
    font-size: 1rem;
    line-height: 1.6;
    -webkit-text-size-adjust: 100%;
  }

  /* ── Band + inner ───────────────────────────────────────────────────────────── */
  .band { padding-block: clamp(var(--s6), 6vw, var(--s8)); }
  .band--sheet { background: var(--paper); color: var(--ink); border-top: var(--rule); }
  .inner { max-width: var(--shell); margin: 0 auto; padding-inline: var(--gutter); }
  main.wrap { max-width: var(--shell); margin: 0 auto; padding: var(--s7) var(--gutter) var(--s9); }
  /* Prose is capped at a measure; the drawing, the listing and the gallery are not. */
  .wrap > p, .wrap > ul.links, .wrap > ul.storeys { max-width: var(--measure); }

  /* ── The header bar ─────────────────────────────────────────────────────────── */
  header.site { background: var(--src-bg); border-bottom: 1px solid var(--src-rule); padding-block: var(--s3); }
  .sitebar { display: flex; align-items: center; gap: var(--s4) var(--s5); flex-wrap: wrap; }
  .brand { display: inline-flex; align-items: center; gap: var(--s2); text-decoration: none; }
  .brand img { display: block; flex: none; }
  .wordmark {
    font-family: var(--font-display);
    font-variation-settings: "wdth" 100, "wght" 600;
    font-size: 16px; letter-spacing: .01em; color: var(--src-fg);
  }
  .wordmark b { color: var(--plum-deep); font-weight: 700; }
  /* --src-rule, not the decorative --src-border: here the chip's border is its only edge. */
  .badge {
    font-family: var(--font-display);
    font-variation-settings: "wdth" 85, "wght" 600;
    font-size: 9px; letter-spacing: .11em; text-transform: uppercase;
    color: var(--src-muted); padding: 3px 7px;
    border: 1px solid var(--src-rule); border-radius: 2px;
  }
  nav.crumbs { margin-left: auto; font-size: .8125rem; color: var(--src-muted); }
  /* Underlined, not merely tinted: --plum-deep against --src-muted is 1.01:1, so inside
     a run of text the link would be distinguished by HUE ALONE (WCAG 1.4.1). */
  nav.crumbs a { color: var(--plum-deep); text-decoration: underline; text-underline-offset: 2px; }
  nav.crumbs a:hover, nav.crumbs a:focus-visible { color: var(--redline-ink); }

  /* ── Type ───────────────────────────────────────────────────────────────────── */
  h1 {
    font-family: var(--font-display);
    font-variation-settings: "wdth" 115, "wght" 700;
    font-size: clamp(1.75rem, 1.1rem + 2.4vw, 2.75rem);
    line-height: 1.08; letter-spacing: -.005em;
    margin: 0 0 var(--s4); color: var(--ink);
  }
  /* The h2 rule is a DIMENSION LINE: a hairline with a witness tick at each end. The
     ticks are 11px at top:-5px so they straddle the 1px rule — a rounded value would
     park them beside it and it would read as an ordinary divider. */
  h2 {
    position: relative;
    margin: var(--s8) 0 var(--s4); padding-top: var(--s4);
    border-top: var(--rule);
    font-family: var(--font-display);
    font-variation-settings: "wdth" 100, "wght" 640;
    font-size: 1.1875rem; letter-spacing: -.005em; color: var(--ink);
  }
  h2::before, h2::after { content: ""; position: absolute; top: -5px; width: 1px; height: 11px; background: var(--hairline); }
  h2::before { left: 0; }
  h2::after { right: 0; }
  .lede { font-size: 1.0625rem; line-height: 1.65; max-width: 58ch; margin: 0 0 var(--s5); }
  .stats { color: var(--syn-operator); }
  a { color: var(--plum-deep); }

  /* ── The drawing ────────────────────────────────────────────────────────────── */
  figure.plan {
    margin: 0 0 var(--s6); padding: clamp(var(--s4), 3vw, var(--s6));
    background: var(--paper); border: var(--rule); border-radius: 2px;
  }
  figure.plan svg { display: block; width: 100%; height: auto; }
  figcaption { font-size: .875rem; color: var(--ink-muted); margin-top: var(--s4); }

  /* ── The source listing ─────────────────────────────────────────────────────── */
  /* \`tabindex="0"\` in the markup: the listing scrolls sideways on a narrow screen, and a
     scrollable box with no focusable content cannot be reached by keyboard (WCAG 2.1.1).
     Which means it takes focus, so it needs a visible focus ring. */
  pre.source {
    background: var(--src-surface); border: var(--rule); border-radius: 2px;
    padding: clamp(var(--s4), 2.5vw, var(--s5)); overflow-x: auto;
    font-family: var(--font-mono); font-size: .8125rem; line-height: 1.6;
    margin: 0 0 var(--s6);
  }
  pre.source:focus-visible { outline: 2px solid var(--src-fg); outline-offset: 2px; }

  /* ── The CTA. REDLINE is the one attention accent (docs/adr/0014-one-light-world.md); plum
     stays the colour of an inline prose link. --src-surface on --redline is 5.4:1,
     and the hover DARKENS to --redline-ink, so contrast rises rather than falls. */
  .cta {
    display: inline-block; margin: 0 0 var(--s6); padding: .625rem 1.125rem;
    background: var(--redline); color: var(--src-surface);
    border: 1px solid var(--redline); border-radius: 2px;
    font-family: var(--font-display);
    font-variation-settings: "wdth" 95, "wght" 620;
    text-decoration: none;
  }
  .cta:hover { background: var(--redline-ink); border-color: var(--redline-ink); }
  .cta:focus-visible { outline: 2px solid var(--src-fg); outline-offset: 2px; }

  ul.links { padding-left: 1.1rem; margin: 0 0 var(--s5); }
  ul.links li { padding: var(--s1) 0; }
  ul.storeys { padding-left: 1.1rem; margin: 0 0 var(--s6); color: var(--syn-operator); }
  ul.storeys li { padding: var(--s1) 0; }

  /* ── The index gallery. \`ul.plans\` keeps its class (the e2e counts links through
     it) and becomes a grid; the art box owns the height via aspect-ratio, so the
     geometry is settled before a single lazy thumbnail arrives. */
  ul.plans {
    list-style: none; padding: 0; margin: 0 0 var(--s8);
    display: grid; gap: clamp(var(--s4), 2.4vw, var(--s6));
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  }
  .card {
    display: flex; flex-direction: column; overflow: hidden;
    background: var(--paper-panel); border: var(--rule); border-radius: 2px;
    transition: border-color .2s, box-shadow .2s, transform .2s;
  }
  .card:hover {
    border-color: var(--redline);
    box-shadow: 0 16px 34px -26px color-mix(in oklab, var(--ink) 55%, transparent);
    transform: translateY(-2px);
  }
  .card__link { display: block; text-decoration: none; color: inherit; }
  .card__link:focus-visible { outline: 2px solid var(--src-fg); outline-offset: -2px; }
  /* No padding: a plan with a \`paper\` compiles to a whole SHEET, so letting it run to
     the tile's edges makes the card read as a miniature of that sheet. \`contain\` still
     letterboxes the odd aspect ratio, and the bars land on --paper. */
  .card__art {
    display: block; aspect-ratio: 4 / 3;
    background: var(--paper); border-bottom: var(--rule);
  }
  .card__art img { display: block; width: 100%; height: 100%; object-fit: contain; }
  .card__title {
    margin: 0; padding: var(--s3) var(--s4) 0;
    font-family: var(--font-display);
    font-variation-settings: "wdth" 95, "wght" 620;
    font-size: 1rem; color: var(--ink);
  }
  .card__blurb {
    margin: var(--s1) 0 0; padding: 0 var(--s4) var(--s4);
    font-size: .8125rem; line-height: 1.55; color: var(--ink-muted);
  }

  /* ── The footer IS a drawing's title block ──────────────────────────────────── */
  .tblock__ident { display: flex; align-items: flex-start; gap: 14px; margin-bottom: 28px; }
  .tblock__ident img { display: block; flex: none; }
  .tblock__name {
    margin: 0; font-family: var(--font-display); font-variation-settings: "wdth" 110;
    font-size: 18px; font-weight: 600; color: var(--ink);
  }
  .tblock__name b { color: var(--redline-ink); }
  .tblock__blurb { margin: 6px 0 0; max-width: 34rem; font-size: 13.5px; line-height: 1.6; color: var(--ink-muted); }
  /* The container carries top + left, every cell carries right + bottom — so the block
     stays fully ruled at any wrap, with no double lines.
     FLEX, not grid: \`auto-fit\` sizes its tracks to the widest ROW, so the five-cell row
     stopped short of the full-width Ecosystem row below it and left the top rule hanging
     in mid-air. Flex lines always fill, so every row ends on the same right-hand edge. */
  .tblock__grid { display: flex; flex-wrap: wrap; border-top: var(--rule); border-left: var(--rule); }
  .cell { flex: 1 1 150px; border-right: var(--rule); border-bottom: var(--rule); padding: 12px 14px; min-height: 62px; }
  .cell--eco { flex-basis: 100%; }
  .cell__label {
    display: block; margin-bottom: 7px;
    font-family: var(--font-display); font-variation-settings: "wdth" 84;
    font-weight: 600; font-size: 10px; letter-spacing: .13em; text-transform: uppercase;
    color: var(--ink-muted);
  }
  .cell__value { font-family: var(--font-body); font-size: 14px; font-weight: 550; color: var(--ink); text-decoration: none; }
  a.cell__value:hover, a.cell__value:focus-visible { color: var(--redline-ink); }
  .cell__links { display: flex; flex-wrap: wrap; gap: 8px 22px; }
  .cell__links a { font-family: var(--font-mono); font-size: 13px; color: var(--ink-muted); text-decoration: none; }
  .cell__links a:hover, .cell__links a:focus-visible { color: var(--redline-ink); }

  @media (prefers-reduced-motion: reduce) {
    .card { transition: none; }
    .card:hover { transform: none; }
  }
`.trim();

/**
 * The head every page here shares: charset, canonical, OG/Twitter, brand icons, the
 * harvested @font-face rules and the stylesheet.
 *
 * `crossorigin` on a font preload is required even same-origin; public/_headers already
 * sends `Access-Control-Allow-Origin: *`, so the preloaded file and the @font-face fetch
 * resolve to one request rather than two.
 */
function head({ title, description, url, fonts, extraHead = "" }) {
  const preloads = fonts.preload
    .map((href) => `    <link rel="preload" as="font" type="font/woff2" crossorigin href="${escapeHtml(href)}" />\n`)
    .join("");
  return `    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${escapeHtml(url)}" />
    <link rel="icon" type="image/svg+xml" href="/brand/archlang-icon-plum.svg" />
    <link rel="apple-touch-icon" href="/brand/archlang-apple-touch.png" />
    <meta name="theme-color" content="#eceef2" />
    <meta name="color-scheme" content="light" />
    <meta property="og:type" content="article" />
    <meta property="og:url" content="${escapeHtml(url)}" />
    <meta property="og:site_name" content="ArchLang" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${OG_IMAGE}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="The ArchLang playground: declarative .arch source on the left, the compiled SVG floor plan on the right." />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${OG_IMAGE}" />
${preloads}${extraHead}    <style>
${fonts.css}
${STYLE}
    </style>`;
}

/**
 * The product bar. The wordmark and the chip echo the editor's own title-block toolbar
 * (playground/index.html's `.tb-brand`), so arriving here from the app does not feel
 * like arriving at a different site. The wordmark is a <span> and never a heading:
 * these pages promise exactly one <h1>, and the e2e counts it.
 */
const siteHeader = (crumbs) => `    <header class="site">
      <div class="inner sitebar">
        <a class="brand" href="/">
          <img src="/brand/archlang-icon-plum.svg" alt="" width="20" height="20" />
          <span class="wordmark"><b>Arch</b>Lang</span>
          <span class="badge">Playground</span>
        </a>
        <nav class="crumbs" aria-label="Breadcrumb">${crumbs}</nav>
      </div>
    </header>`;

/**
 * The footer IS a drawing's title block — the same device as the docs site's
 * `TitleBlockFooter.vue`, which is the house style these pages had never adopted.
 *
 * `sheet` is a real per-page value rather than boilerplate: the sheet number on an
 * example page, "index" on the index.
 */
const siteFooter = ({ sheet, plans }) => `    <footer class="site band band--sheet">
      <div class="inner">
        <div class="tblock__ident">
          <img src="/brand/archlang-icon-plum.svg" alt="" width="26" height="26" />
          <div>
            <p class="tblock__name"><b>Arch</b>Lang</p>
            <p class="tblock__blurb">A small declarative language that compiles to professional SVG floor plans. Every drawing on this site was produced by the compiler from the source printed beside it.</p>
          </div>
        </div>
        <div class="tblock__grid">
          <div class="cell"><span class="cell__label">Project</span><span class="cell__value">ArchLang</span></div>
          <div class="cell"><span class="cell__label">Drawn by</span><a class="cell__value" href="https://github.com/ChanMeng666">Chan Meng</a></div>
          <div class="cell"><span class="cell__label">Licence</span><span class="cell__value">MIT</span></div>
          <div class="cell"><span class="cell__label">Plans</span><span class="cell__value">${plans}</span></div>
          <div class="cell"><span class="cell__label">Sheet</span><span class="cell__value">${escapeHtml(sheet)}</span></div>
          <div class="cell cell--eco">
            <span class="cell__label">Ecosystem</span>
            <nav class="cell__links">
              <a href="/">Playground ↗</a>
              <a href="${DOCS}">Documentation ↗</a>
              <a href="https://www.npmjs.com/package/@chanmeng666/archlang">npm ↗</a>
              <a href="https://github.com/ChanMeng666/archlang">GitHub ↗</a>
            </nav>
          </div>
        </div>
      </div>
    </footer>`;

// ───────────────────────────────────────────────────────────────────────────────
// The per-example page.
// ───────────────────────────────────────────────────────────────────────────────

function examplePage(row, source, result, d, ctx) {
  const url = `${ORIGIN}/examples/${row.name}.html`;
  const title = `${row.label} — an ArchLang floor plan example`;
  const description = row.blurb;
  const pages = Array.isArray(result.pages) ? result.pages.length : 1;
  const permalink = `${ORIGIN}/#z=${encodePlanHash(source)}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareSourceCode",
        "@id": `${url}#code`,
        name: row.label,
        headline: title,
        description,
        url,
        programmingLanguage: { "@type": "ComputerLanguage", name: "ArchLang", url: `${DOCS}/` },
        codeSampleType: "full",
        text: source,
        encodingFormat: "text/plain",
        license: "https://opensource.org/licenses/MIT",
        codeRepository: "https://github.com/ChanMeng666/archlang",
        inLanguage: "en",
        author: {
          "@type": "Person",
          "@id": `${DOCS}/#chan-meng`,
          name: "Chan Meng",
          url: "https://github.com/ChanMeng666",
        },
        isPartOf: {
          "@type": "WebSite",
          "@id": `${ORIGIN}/#website`,
          url: `${ORIGIN}/`,
          name: "ArchLang Playground",
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "ArchLang Playground", item: `${ORIGIN}/` },
          { "@type": "ListItem", position: 2, name: "Example plans", item: `${ORIGIN}/examples/` },
          { "@type": "ListItem", position: 3, name: row.label, item: url },
        ],
      },
    ],
  };

  // A multi-storey plan draws one page per level and `compile().svg` is level 1. The
  // figures come from `describe()` storey by storey — see `storeyFigures`, which
  // replaced a sentence claiming the numbers above counted the whole building.
  const storeyNote = pages > 1 ? storeyFigures(d) : "";

  return `<!doctype html>
<html lang="en">
  <head>
${head({
  title,
  description,
  url,
  fonts: ctx.fonts,
  extraHead: `    <script type="application/ld+json">\n${escapeJsonLd(jsonLd)}\n    </script>\n`,
})}
  </head>
  <body>
${siteHeader(`<a href="/">Playground</a> › <a href="/examples/">Example plans</a> › ${escapeHtml(row.label)}`)}
    <main class="wrap">
      <h1>${escapeHtml(title)}</h1>
      <p class="lede">${escapeHtml(row.blurb)}</p>
      <p class="lede stats">${escapeHtml(statisticsSentence(d))}</p>
      <figure class="plan">
        ${labelSvg(result.svg, d.caption ?? title)}
        <figcaption>${escapeHtml(d.caption ?? title)}</figcaption>
      </figure>
      ${storeyNote}
      <a class="cta" href="${escapeHtml(permalink)}">Open in the editor</a>
      <h2>The source</h2>
      <p>This is the whole plan. The drawing above is what the compiler produced from it — nothing was drawn by hand.</p>
      <pre class="source" tabindex="0"><code>${escapeHtml(source)}</code></pre>
      <h2>Read more</h2>
      <ul class="links">
        <li><a href="/examples/">All ArchLang example plans</a></li>
        <li><a href="${DOCS}/reference">The ArchLang language reference</a></li>
        <li><a href="${DOCS}/spec">The one-page specification</a></li>
      </ul>
    </main>
${siteFooter({ sheet: ctx.sheet, plans: ctx.plans })}
  </body>
</html>
`;
}

// ───────────────────────────────────────────────────────────────────────────────
// The index page.
// ───────────────────────────────────────────────────────────────────────────────

function indexPage(rows, ctx) {
  const url = `${ORIGIN}/examples/`;
  const title = `ArchLang example floor plans — ${rows.length} plans, with their source`;
  const description =
    `${rows.length} worked ArchLang floor plans, from a single room to a 100 m museum. Each page shows the ` +
    "compiled SVG plan, the .arch source it came from, and the rooms, areas and windows it measures.";

  const groups = [];
  const byName = new Map();
  for (const row of rows) {
    let bucket = byName.get(row.group);
    if (!bucket) {
      bucket = { group: row.group, items: [] };
      byName.set(row.group, bucket);
      groups.push(bucket);
    }
    bucket.items.push(row);
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${url}#page`,
        name: title,
        description,
        url,
        inLanguage: "en",
        isPartOf: { "@type": "WebSite", "@id": `${ORIGIN}/#website`, url: `${ORIGIN}/`, name: "ArchLang Playground" },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "ArchLang Playground", item: `${ORIGIN}/` },
          { "@type": "ListItem", position: 2, name: "Example plans", item: url },
        ],
      },
    ],
  };

  // ONE <a> per card, wrapping the drawing and the title. The blurb stays OUTSIDE it:
  // an accessible name is the link's visible text, and folding a second sentence into
  // it would make 27 cards read as 27 long duplicated names. The thumbnail is
  // decorative for the same reason — the link already says which plan this is, and the
  // compiler's own caption is served twice on the page the card opens.
  const card = (r) => {
    const t = ctx.thumbs.get(r.name);
    return (
      `        <li class="card"><a class="card__link" href="/examples/${r.name}.html">` +
      `<span class="card__art"><img src="/examples/thumbs/${r.name}.svg" alt="" loading="lazy" ` +
      `decoding="async" width="${t.w}" height="${t.h}" /></span>` +
      `<h3 class="card__title">${escapeHtml(r.label)}</h3></a>` +
      `<p class="card__blurb">${escapeHtml(r.blurb)}</p></li>`
    );
  };

  const sections = groups
    .map(
      (g) => `      <h2>${escapeHtml(g.group)}</h2>
      <ul class="plans">
${g.items.map(card).join("\n")}
      </ul>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
${head({
  title,
  description,
  url,
  fonts: ctx.fonts,
  extraHead: `    <script type="application/ld+json">\n${escapeJsonLd(jsonLd)}\n    </script>\n`,
})}
  </head>
  <body>
${siteHeader(`<a href="/">Playground</a> › Example plans`)}
    <main class="wrap">
      <h1>ArchLang example floor plans</h1>
      <p class="lede">
        ArchLang is an open-source (MIT) declarative language for floor plans: you write a plan as text and
        compile it to a dimensioned SVG drawing. These are the ${rows.length} worked examples that ship with
        the compiler — each page shows the drawing, the source it came from, and the rooms, floor area and
        windows the compiler measured. Every one of them opens in the editor with one click.
      </p>
${sections}
      <h2>Read more</h2>
      <ul class="links">
        <li><a href="/">The ArchLang playground — write a plan of your own</a></li>
        <li><a href="${DOCS}/reference">The ArchLang language reference</a></li>
        <li><a href="${DOCS}/spec">The one-page specification</a></li>
      </ul>
    </main>
${siteFooter({ sheet: "index", plans: rows.length })}
  </body>
</html>
`;
}

// ───────────────────────────────────────────────────────────────────────────────
// The sitemap. No <lastmod>: a build-time date on unchanged content is noise, and
// every crawler discounts a file that stamps today on all of it.
// ───────────────────────────────────────────────────────────────────────────────

function sitemap(rows) {
  const locs = [`${ORIGIN}/`, `${ORIGIN}/examples/`, ...rows.map((r) => `${ORIGIN}/examples/${r.name}.html`)];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${locs.map((l) => `  <url><loc>${escapeHtml(l)}</loc></url>`).join("\n")}
</urlset>
`;
}

// ───────────────────────────────────────────────────────────────────────────────
// Main.
// ───────────────────────────────────────────────────────────────────────────────

const rows = readRows();
const { compile, describe } = await loadCore();
const fonts = collectFontFaces(TOKEN_BLOCK);

mkdirSync(join(outDir, "examples", "thumbs"), { recursive: true });

// Collect every failure before exiting: told one at a time, 27 broken plans take
// 27 builds to discover.
const failures = [];
const thumbs = new Map();
let written = 0;
let thumbBytes = 0;

for (const row of rows) {
  const file = join(repo, "examples", `${row.name}.arch`);
  let source;
  try {
    source = readFileSync(file, "utf8");
  } catch {
    failures.push(`${row.name}: no such file ${file} (EXAMPLE_ROWS names an example that does not exist)`);
    continue;
  }
  let result;
  let d;
  try {
    result = compile(source);
    d = describe(source);
  } catch (err) {
    failures.push(`${row.name}: threw — ${err instanceof Error ? err.message : String(err)}`);
    continue;
  }
  if (result.errors.length > 0) {
    failures.push(`${row.name}: ${result.errors.length} compile error(s) — ${result.errors[0]?.message ?? "?"}`);
    continue;
  }
  if (!result.svg) {
    failures.push(`${row.name}: compiled with no errors but produced no SVG`);
    continue;
  }
  // The gallery card cannot fall back to "no picture": an index of 27 plans with a
  // blank tile among them is worse than a build that stops and says which one.
  let thumb;
  try {
    thumb = thumbSvg(compile, source);
  } catch (err) {
    failures.push(`${row.name}: no thumbnail — ${err instanceof Error ? err.message : String(err)}`);
    continue;
  }
  writeFileSync(join(outDir, "examples", "thumbs", `${row.name}.svg`), thumb.svg, "utf8");
  thumbs.set(row.name, { w: thumb.w, h: thumb.h });
  thumbBytes += Buffer.byteLength(thumb.svg);

  const ctx = { fonts, sheet: `${written + 1} of ${rows.length}`, plans: rows.length };
  writeFileSync(join(outDir, "examples", `${row.name}.html`), examplePage(row, source, result, d, ctx), "utf8");
  written++;
}

if (failures.length > 0) {
  process.stderr.write(`gen-static: ${failures.length} example(s) could not be published:\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.stderr.write(
    "  These pages are the only indexable form of a plan on this host, so a plan that cannot be\n" +
      "  compiled cannot be published. Fix the example (or remove its EXAMPLE_ROWS row) and rebuild.\n",
  );
  process.exit(1);
}

writeFileSync(join(outDir, "examples", "index.html"), indexPage(rows, { fonts, thumbs }), "utf8");
writeFileSync(join(outDir, "sitemap.xml"), sitemap(rows), "utf8");

process.stdout.write(
  `gen-static: ${written} example pages + /examples/index.html + sitemap.xml (${written + 2} urls) → playground/dist/\n` +
    `gen-static: ${thumbs.size} thumbnails (${Math.round(thumbBytes / 1024)} KB) → playground/dist/examples/thumbs/\n` +
    `gen-static: ${fonts.css.split("@font-face").length - 1} @font-face rules harvested from dist/assets/*.css\n`,
);
