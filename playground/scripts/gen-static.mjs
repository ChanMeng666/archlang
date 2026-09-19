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
 *     SELF-CONTAINED: its own inline <style>, no <script>, no app bundle. The only
 *     external references are root-absolute brand assets, which resolve from any
 *     depth. `test/playground-examples-rows.test.ts` and scripts/smoke.mjs both
 *     guard the shape; a `./assets/` reference here is a bug.
 *  2. `html_handling: "none"` — the asset lookup is EXACT, so `/examples/x` 404s
 *     and only `/examples/x.html` is a real URL. The canonical link and every
 *     sitemap entry therefore carry the `.html`, and `/examples/` reaches its
 *     index through a status-200 rewrite in public/_redirects, the same mechanism
 *     the site root already uses.
 *  3. Nothing here is hand-listed. The rows come from `playground/src/examples.ts`,
 *     the drawing and the numbers from the BUILT core in `dist/` — so a page can
 *     never claim a plan the compiler does not produce, which is exactly how the
 *     README's committed SVGs rotted for months before `gen:example-svgs` existed.
 *
 * Usage: `node scripts/gen-static.mjs` from `playground/`, after `vite build` and
 * after a repo-root `npm run build`. `playground/package.json`'s `build` script
 * chains the two, so `npm run playground:build` and the deploy workflow both cover
 * it with no extra step.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { encodePlanHash } from "../../scripts/gen-permalink.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const playground = join(here, "..");
const repo = join(playground, "..");
const outDir = join(playground, "dist");

const ORIGIN = "https://playground.archlang.uk";
const DOCS = "https://archlang.uk";
const OG_IMAGE = `${ORIGIN}/brand/archlang-og.png`;

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

// ───────────────────────────────────────────────────────────────────────────────
// The page shell. One inline stylesheet, ~40 declarations, every colour a LITERAL
// copy of the token it is named after in playground/src/styles/tokens.css — these
// pages load no CSS file, so a var() would resolve to nothing. ONE LIGHT WORLD
// (ADR 0014): cool SOURCE grey for the source, warm SHEET paper for the drawing,
// no dark rule anywhere.
// ───────────────────────────────────────────────────────────────────────────────

const STYLE = `
  :root { color-scheme: only light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #eceef2;                 /* --src-bg */
    color: #1a1d23;                      /* --src-fg */
    font-family: "Public Sans Variable", "Public Sans", -apple-system, "Segoe UI", Roboto, Helvetica, sans-serif;
    line-height: 1.55;
  }
  .wrap { max-width: 60rem; margin: 0 auto; padding: 1.5rem 1rem 4rem; }
  header.site { border-bottom: 1px solid #7f858f; padding: .75rem 0; margin-bottom: 1.5rem; }
  header.site a { color: #6b3ae0; font-weight: 600; text-decoration: none; }  /* --plum-deep */
  header.site a:hover, header.site a:focus { text-decoration: underline; }
  nav.crumbs { font-size: .875rem; color: #5a616e; }  /* --src-muted */
  h1 {
    font-family: "Archivo Variable", Archivo, "Arial Narrow", sans-serif;
    font-size: clamp(1.6rem, 1.1rem + 2vw, 2.4rem);
    line-height: 1.15; margin: 0 0 .75rem;
  }
  h2 { font-family: "Archivo Variable", Archivo, "Arial Narrow", sans-serif; font-size: 1.15rem; margin: 2rem 0 .5rem; }
  .lede { font-size: 1.05rem; max-width: 46rem; margin: 0 0 1.5rem; }
  .stats { color: #464d59; }             /* --syn-operator, the darkest muted ink */
  figure.plan {
    margin: 0 0 1.5rem; padding: 1rem;
    background: #f5f2ea;                 /* --paper */
    border: 1px solid #cfc9bb;           /* --hairline */
  }
  figure.plan svg { display: block; width: 100%; height: auto; }
  figcaption { font-size: .875rem; color: #5b6470; margin-top: .5rem; }  /* --ink-muted */
  pre.source {
    background: #fbfbfc;                 /* --src-surface */
    border: 1px solid #cfc9bb;
    padding: 1rem; overflow-x: auto;
    font-family: "IBM Plex Mono", ui-monospace, "SF Mono", Consolas, monospace;
    font-size: .8125rem; line-height: 1.5; margin: 0 0 1.5rem;
  }
  a { color: #6b3ae0; }
  .cta {
    display: inline-block; margin: 0 0 1.5rem; padding: .55rem 1rem;
    background: #6b3ae0; color: #fbfbfc; font-weight: 600; text-decoration: none;
    border: 1px solid #6b3ae0;
  }
  .cta:hover, .cta:focus { background: #8052ff; border-color: #8052ff; }  /* --plum */
  ul.links { padding-left: 1.1rem; }
  ul.storeys { padding-left: 1.1rem; margin: 0 0 1.5rem; color: #464d59; }  /* --syn-operator */
  ul.storeys li { padding: .15rem 0; }
  ul.plans { list-style: none; padding: 0; margin: 0 0 1.5rem; }
  ul.plans li { padding: .4rem 0; border-bottom: 1px solid #cfc9bb; }
  ul.plans .blurb { display: block; color: #5a616e; font-size: .9rem; }
  footer.site { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #7f858f; font-size: .875rem; color: #5a616e; }
`.trim();

/** The head every page here shares: charset, canonical, OG/Twitter, brand icons. */
function head({ title, description, url, extraHead = "" }) {
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
${extraHead}    <style>
${STYLE}
    </style>`;
}

const siteHeader = (crumbs) => `    <header class="site">
      <a href="/">ArchLang Playground</a>
      <nav class="crumbs" aria-label="Breadcrumb">${crumbs}</nav>
    </header>`;

const siteFooter = `    <footer class="site">
      ArchLang is open source under the MIT licence.
      <a href="https://github.com/ChanMeng666/archlang">GitHub</a> ·
      <a href="https://www.npmjs.com/package/@chanmeng666/archlang">npm</a> ·
      <a href="${DOCS}">Documentation</a>
    </footer>`;

// ───────────────────────────────────────────────────────────────────────────────
// The per-example page.
// ───────────────────────────────────────────────────────────────────────────────

function examplePage(row, source, result, d) {
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
      <pre class="source"><code>${escapeHtml(source)}</code></pre>
      <h2>Read more</h2>
      <ul class="links">
        <li><a href="/examples/">All ArchLang example plans</a></li>
        <li><a href="${DOCS}/reference">The ArchLang language reference</a></li>
        <li><a href="${DOCS}/spec">The one-page specification</a></li>
      </ul>
    </main>
${siteFooter}
  </body>
</html>
`;
}

// ───────────────────────────────────────────────────────────────────────────────
// The index page.
// ───────────────────────────────────────────────────────────────────────────────

function indexPage(rows) {
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

  const sections = groups
    .map(
      (g) => `      <h2>${escapeHtml(g.group)}</h2>
      <ul class="plans">
${g.items
  .map(
    (r) =>
      `        <li><a href="/examples/${r.name}.html">${escapeHtml(r.label)}</a>` +
      `<span class="blurb">${escapeHtml(r.blurb)}</span></li>`,
  )
  .join("\n")}
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
${siteFooter}
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

mkdirSync(join(outDir, "examples"), { recursive: true });

// Collect every failure before exiting: told one at a time, 27 broken plans take
// 27 builds to discover.
const failures = [];
let written = 0;

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
  writeFileSync(join(outDir, "examples", `${row.name}.html`), examplePage(row, source, result, d), "utf8");
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

writeFileSync(join(outDir, "examples", "index.html"), indexPage(rows), "utf8");
writeFileSync(join(outDir, "sitemap.xml"), sitemap(rows), "utf8");

process.stdout.write(
  `gen-static: ${written} example pages + /examples/index.html + sitemap.xml (${written + 2} urls) → playground/dist/\n`,
);
