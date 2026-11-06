/**
 * Post-deploy smoke test for the two public sites — zero dependencies, plain Node
 * (global `fetch`, Node 18+).
 *
 *   node scripts/smoke.mjs --site docs       --base https://archlang.uk
 *   node scripts/smoke.mjs --site playground --base https://playground.archlang.uk
 *   node scripts/smoke.mjs --site mcp        --base https://archlang-mcp.<account>.workers.dev
 *
 * Why more than `curl -o /dev/null`: a deploy can serve a 200 on `/` while the
 * things machines actually consume are gone — the raw `/<page>.md` copies, `/llms-full.txt`,
 * the JSON schemas, the GBNF grammar, the example SVGs, or (on the playground) the hashed
 * JS bundle the shell page loads. Those are the site's real contract, so they are what we
 * check. The docs route list is PARSED out of `docs-site/sync-docs.mjs` rather than retyped,
 * so adding a page or an example there extends this smoke test automatically (a generator
 * retyped by hand is exactly how a template goes stale — AGENTS.md).
 *
 * Retry envelope: a request is retried up to 6 times, 5s apart, on a network error or a
 * non-200 (a `wrangler deploy` takes a few seconds to propagate to every edge). A 200 whose BODY
 * fails its assertion is a real failure and is never retried — waiting can't fix wrong bytes.
 *
 * Exit codes: 0 all checks passed · 1 at least one check failed · 2 bad usage.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/** The canonical line (PS-D1), the playground's served lede (ruling PG-D6): read, never retyped. */
const CANONICAL_LINE = JSON.parse(readFileSync(join(ROOT, "site-shared/doors.json"), "utf8")).canonicalLine;
/** The line as the served bytes spell it: HTML-escaped as playground/vite.config.js (`canonicalLine`) writes it. */
const CANONICAL_LINE_HTML = CANONICAL_LINE.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const ATTEMPTS = 6;
const RETRY_MS = 5000;

// ---------------------------------------------------------------------------
// Route discovery — derived from docs-site/sync-docs.mjs, never retyped.
// ---------------------------------------------------------------------------

/**
 * Pull one of sync-docs.mjs's literal `["src", "dest"],` tuple tables out of the file.
 * The four tables (`PAGES`, `SITE_PAGES`, `ROOT_COPIES`, `EXCLUDED_EXAMPLES`) are the site's single
 * source of truth for what it publishes, and they are declared in that uniform shape
 * precisely so this parser (and test/docs-sync-list.test.ts) can read them instead of
 * retyping the list — a retyped list is exactly how a generator goes stale (AGENTS.md).
 */
function tupleTable(syncSrc, name) {
  const block = new RegExp(`const ${name} = \\[([\\s\\S]*?)\\n\\];`).exec(syncSrc);
  if (!block) {
    throw new Error(`could not find \`const ${name} = [ … ];\` in docs-site/sync-docs.mjs — has its shape changed?`);
  }
  const rows = [...block[1].matchAll(/\["([^"]+)",\s*"([^"]*)"\]/g)].map((m) => [m[1], m[2]]);
  if (rows.length === 0) {
    throw new Error(`\`${name}\` in docs-site/sync-docs.mjs parsed to zero rows — has its shape changed?`);
  }
  return rows;
}

/**
 * The raw-markdown routes the docs site publishes at `/<route>.md`: every `PAGES` row
 * writes both the bannered page and `public/<dest>`, and every `SITE_PAGES` row (the
 * hand-written pages) writes `public/<dest>`. Parsed, so a new doc page is
 * smoke-tested the day it is added.
 */
function docsPageRoutes(syncSrc) {
  return [...tupleTable(syncSrc, "PAGES"), ...tupleTable(syncSrc, "SITE_PAGES")].map(([, dest]) => `/${dest}`);
}

/**
 * The example gallery SVGs at `/examples/<name>.svg`. sync-docs.mjs DERIVES the gallery
 * from `readdirSync("examples")` minus its `EXCLUDED_EXAMPLES` table, so this mirrors
 * that derivation rather than reading a list — the list no longer exists to read.
 */
function docsExampleRoutes(syncSrc) {
  const excluded = new Set(tupleTable(syncSrc, "EXCLUDED_EXAMPLES").map(([file]) => file));
  const dir = join(ROOT, "examples");
  const names = readdirSync(dir)
    .filter((f) => f.endsWith(".arch") && statSync(join(dir, f)).isFile() && !excluded.has(f))
    .map((f) => f.replace(/\.arch$/, ""))
    .sort();
  if (names.length === 0) throw new Error("no gallery examples derived from examples/*.arch — is the checkout intact?");
  return names.map((n) => `/examples/${n}.svg`);
}

// ---------------------------------------------------------------------------
// Assertions — each throws with a human reason; a throw is never retried.
// ---------------------------------------------------------------------------

const contentType = (sub) => (_body, res) => {
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().includes(sub)) throw new Error(`content-type is "${ct}", expected it to contain "${sub}"`);
};

const nonEmpty = () => (body) => {
  if (body.trim().length === 0) throw new Error("body is empty");
};

/**
 * A response HEADER carries a substring (case-insensitively). Unlike every other
 * assertion here this one reads nothing from the body — which is the point: an
 * `X-Robots-Tag` is invisible to a body check, is what actually de-indexes a page,
 * and is set by a `_headers` file that no test in this repo compiles or executes.
 * A typo there fails silently in exactly the way nobody notices for a year.
 */
const header = (name, sub) => (_body, res) => {
  const value = res.headers.get(name);
  if (value === null) throw new Error(`response has no ${name} header`);
  if (!value.toLowerCase().includes(sub.toLowerCase())) {
    throw new Error(`${name} is ${JSON.stringify(value)}, expected it to contain ${JSON.stringify(sub)}`);
  }
};

/**
 * A response header is ABSENT. The mirror of `header()`, and the reason it exists is
 * that one of our rules is an asymmetry rather than a value: the playground shell
 * refuses to be framed, `/embed.html` deliberately does not, and a `_headers` file
 * has no way to say "not this path" — it is said by NOT writing a rule. A future
 * edit that widens the shell's rule to `/*` would protect the shell exactly as well
 * and silently break every third-party embed on the internet, with no other check in
 * this repo able to see it. So the absence is asserted, not assumed.
 */
const noHeader = (name) => (_body, res) => {
  const value = res.headers.get(name);
  if (value !== null) {
    throw new Error(`response carries ${name}: ${JSON.stringify(value)}, expected it to be absent`);
  }
};

const contains = (sub) => (body) => {
  if (!body.includes(sub)) throw new Error(`body does not contain ${JSON.stringify(sub)}`);
};

const matches = (re) => (body) => {
  if (!re.test(body)) throw new Error(`body does not match ${re}`);
};

const startsWith = (sub) => (body) => {
  if (!body.trimStart().startsWith(sub)) {
    throw new Error(
      `body does not start with ${JSON.stringify(sub)} (starts with ${JSON.stringify(body.slice(0, 40))})`,
    );
  }
};

/**
 * SVG, allowing the XML prolog. The compiled example SVGs open on `<svg` directly, but the
 * hand-authored brand assets are exported with `<?xml …?>` + a DOCTYPE ahead of the root tag
 * (and brand files are byte-sacred — the asset is right, a bare startsWith("<svg") was wrong).
 */
const isSvg = () => (body) => {
  const head = body.trimStart();
  if (!head.startsWith("<svg") && !head.startsWith("<?xml")) {
    throw new Error(`not an SVG document (starts with ${JSON.stringify(body.slice(0, 40))})`);
  }
  if (!body.includes("<svg")) throw new Error("no <svg> root element in body");
};

/** Parse the body as JSON and hand it to an optional extra assertion. */
const json =
  (assert) =>
  (body, _res, ctx = {}) => {
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch (e) {
      throw new Error(`body is not valid JSON: ${e.message}`);
    }
    if (assert) assert(parsed, ctx);
  };

// ---------------------------------------------------------------------------
// HTTP with the retry envelope.
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchOk(url, init = {}) {
  let last = "no attempt made";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        redirect: "follow",
        ...init,
        headers: { "user-agent": "archlang-smoke/1", ...(init.headers ?? {}) },
      });
      if (res.status === 200) return { res, body: await res.text() };
      last = `HTTP ${res.status}`;
    } catch (e) {
      last = `network error: ${e.message}`;
    }
    if (attempt < ATTEMPTS) await sleep(RETRY_MS);
  }
  throw new Error(`${last} (after ${ATTEMPTS} attempts, ${RETRY_MS / 1000}s apart)`);
}

/**
 * A check over one route: fetch it (with retries), then run every assertion on the body.
 * An assertion may push a short string onto `ctx.notes` to annotate the PASS line.
 */
function route(path, ...assertions) {
  return {
    name: path,
    run: async (base) => {
      const { res, body } = await fetchOk(base + path);
      const ctx = { base, path, notes: [] };
      for (const assert of assertions) await assert(body, res, ctx);
      return ctx.notes;
    },
  };
}

/**
 * A `.md` path that does not exist must 404 and must NOT be labelled markdown. The `_headers`
 * rules are exact paths precisely so a missing page's HTML 404 is never typed `text/markdown`;
 * this is the post-deploy proof (`vitepress preview` ignores `_headers`, so no local server can
 * show it). A 404 is the expected answer, so it is fetched once, not through the retry envelope
 * (a network error alone is retried).
 */
function missingMarkdownCheck() {
  const path = "/__no-such-page__.md";
  return {
    name: `${path} (404, not markdown)`,
    run: async (base) => {
      let res;
      for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
        try {
          res = await fetch(base + path, { redirect: "follow", headers: { "user-agent": "archlang-smoke/1" } });
          break;
        } catch (e) {
          if (attempt === ATTEMPTS) throw new Error(`network error: ${e.message}`);
          await sleep(RETRY_MS);
        }
      }
      await res.arrayBuffer();
      const ct = res.headers.get("content-type") ?? "";
      if (res.status !== 404) throw new Error(`HTTP ${res.status}, expected 404`);
      if (ct.toLowerCase().includes("markdown")) throw new Error(`the 404 is labelled "${ct}"`);
      return [`404 ${ct}`];
    },
  };
}

/**
 * A path that must answer a permanent redirect (301) to `location`. Fetched with
 * `redirect: "manual"`, because `route()` follows redirects and would see only the 200 after
 * them. The rule comes from `docs-site/public/_redirects`, which nothing else executes.
 */
function redirectCheck(path, location) {
  return {
    name: `${path} (301 → ${location})`,
    run: async (base) => {
      let res;
      for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
        try {
          res = await fetch(base + path, { redirect: "manual", headers: { "user-agent": "archlang-smoke/1" } });
          break;
        } catch (e) {
          if (attempt === ATTEMPTS) throw new Error(`network error: ${e.message}`);
          await sleep(RETRY_MS);
        }
      }
      await res.arrayBuffer();
      if (res.status !== 301) throw new Error(`HTTP ${res.status}, expected 301`);
      const to = res.headers.get("location") ?? "";
      if (to !== location && to !== base + location) throw new Error(`Location is "${to}", expected "${location}"`);
      return [`301 ${to}`];
    },
  };
}

// ---------------------------------------------------------------------------
// Site definitions.
// ---------------------------------------------------------------------------

function docsChecks() {
  const syncSrc = readFileSync(join(ROOT, "docs-site", "sync-docs.mjs"), "utf8");
  return [
    // Homepage marker: the hand-written "built for agents" band in docs-site/index.md.
    // It is prose in the page source (not a component), so it survives a theme refactor.
    route("/", contentType("text/html"), contains("An interface, not just an image.")),
    // The crawler policy and the sitemap that carries it. Both are static files, so
    // the only way they break is a deploy that dropped public/ — which is exactly the
    // class of failure this script runs after a deploy to catch.
    route(
      "/robots.txt",
      contains("Sitemap: https://archlang.uk/sitemap.xml"),
      // One named answer-engine crawler proves we got the current policy file rather
      // than the two-line placeholder it replaced.
      contains("OAI-SearchBot"),
    ),
    route("/sitemap.xml", contains("<urlset"), contains("<loc>https://archlang.uk/reference</loc>")),
    // Inbound links from older copies of the docs: the repo's file names, redirected by
    // docs-site/public/_redirects. The sitemap lists `/adr`, never the 307-ing `/adr/`.
    redirectCheck("/error-codes", "/errors"),
    redirectCheck("/language-reference", "/reference"),
    // No noindex on the agent files: GS-D7 de-indexes the raw page copies only (below).
    route("/llms.txt", contentType("text"), nonEmpty(), noHeader("x-robots-tag")),
    // Heading emitted by scripts/gen-llms-full.ts — its presence proves we got the bundle,
    // not an SPA fallback page.
    route("/llms-full.txt", nonEmpty(), contains("# ArchLang — full agent context"), noHeader("x-robots-tag")),
    route(
      "/plan.schema.json",
      json((s) => {
        // Parse rather than substring-match: `new URL().hostname` is exact, so a
        // schema $id pointing anywhere else (or carrying the domain in a path
        // segment) fails loudly. (Also keeps CodeQL's URL-sanitization check quiet.)
        const host = new URL(String(s.$id)).hostname;
        if (host !== "archlang.uk") throw new Error(`$id is ${JSON.stringify(s.$id)} (host ${host})`);
      }),
    ),
    route("/intent.schema.json", json()),
    // Served as application/octet-stream, so assert on the grammar's own root rule.
    route("/archlang.gbnf", contains("root ::=")),
    // The raw-markdown copies must serve VERBATIM, not get swallowed by the page router —
    // so assert the media type as well as the bytes (a VitePress 404 would be text/html).
    // `charset=utf-8` is asserted too: Cloudflare already sends a bare `text/markdown` for any
    // existing .md, so the type alone passes with or without the generated `_headers` rule.
    ...docsPageRoutes(syncSrc).map((p) =>
      route(p, contentType("text/markdown"), contentType("charset=utf-8"), nonEmpty()),
    ),
    missingMarkdownCheck(),
    // GS-D7 (docs/seo.md § 5): a raw copy says noindex so its HTML twin is the search result,
    // and the HTML twin must not inherit it. `_headers` binds to the request path, so
    // only a served response shows either half.
    route("/showcase.md", header("x-robots-tag", "noindex")),
    route("/showcase", contentType("text/html"), noHeader("x-robots-tag")),
    ...docsExampleRoutes(syncSrc).map((p) => route(p, startsWith("<svg"))),
    // The `<arch-plan>` element (/embed): a module script, so a browser needs a JavaScript type
    // AND CORS to load it from another origin, and the sources it fetches by URL.
    route(
      "/arch-plan.js",
      contentType("javascript"),
      header("access-control-allow-origin", "*"),
      contains('customElements.define("arch-plan"'),
    ),
    // The standalone build (core inlined), written by the docs build rather than committed.
    route("/arch-plan.standalone.js", contentType("javascript"), contains('customElements.define("arch-plan"')),
    ...docsExampleRoutes(syncSrc).map((p) =>
      route(
        p.replace(/\.svg$/, ".arch"),
        contentType("text/plain"),
        contentType("charset=utf-8"),
        header("access-control-allow-origin", "*"),
        contains("plan "),
      ),
    ),
  ];
}

/**
 * The playground is a Vite SPA: index.html is a shell that loads ONE hashed module script.
 * A 200 on `/` therefore proves nothing about the build — so pull the entry `<script src>`
 * out of the shell and fetch it too. That is what catches "index 200, asset pipeline broken".
 */
const entryScript = () => async (body, _res, ctx) => {
  const tags = [...body.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)].map((m) => m[1]);
  const entry = tags.find((src) => /assets\/.*\.js$/.test(src)) ?? tags.find((src) => src.endsWith(".js"));
  if (!entry) throw new Error(`no <script src="…js"> entry found in ${ctx.path}`);
  const url = new URL(entry, ctx.base + ctx.path).href;
  const { res, body: js } = await fetchOk(url);
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().includes("javascript")) throw new Error(`${url} served as "${ct}", expected JavaScript`);
  if (js.trim().length === 0) throw new Error(`${url} is empty`);
  ctx.notes.push(`entry ${entry} (${js.length} bytes)`);
};

/**
 * Pull the first `url(/assets/*.woff2)` out of a page's inline @font-face rules and
 * fetch it. The static example pages load no stylesheet, so a family they NAME but never
 * DECLARE — or declare against a path that 404s — renders in the system UI stack with a
 * 200 on every HTML route and nothing else here the wiser. Same shape as `entryScript`:
 * the page is fine, the pipeline behind it is not.
 */
const inlineFont = () => async (body, _res, ctx) => {
  const m = /url\((\/assets\/[^)"']+\.woff2)\)/.exec(body);
  if (!m) throw new Error(`no inline @font-face url(/assets/*.woff2) in ${ctx.path}`);
  const url = new URL(m[1], ctx.base).href;
  const { res } = await fetchOk(url);
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().includes("font") && !ct.toLowerCase().includes("woff")) {
    throw new Error(`${url} served as "${ct}", expected a font`);
  }
  ctx.notes.push(`font ${m[1]}`);
};

async function playgroundChecks() {
  return [
    // Markers are the app's mount points in playground/index.html + embed.html.
    // The `<h1` and lede assertions cover the crawlable prose (ruling PG-D6): the heading is the
    // header's brand, the lede the canonical line at the foot of the stage. A crawler runs no
    // JavaScript, so if those bytes are not in the SERVED html the page has no prose at
    // all — and a bundler config change or a stray `display: none` is exactly how that
    // would happen without any other check noticing. The same holds for the drawing: the
    // page opens in view mode on the default example's drawing, which
    // playground/scripts/gen-static.mjs writes into the HTML, so a build that skipped that
    // step serves a page whose first paint (and every crawler's view) has no plan on it.
    route(
      "/",
      contentType("text/html"),
      contains('id="editor"'),
      contains('id="sourceToggle"'),
      // The one heading is the header's brand, as real text.
      contains('<h1 class="tb-brand">'),
      contains('<span class="badge">Playground</span>'),
      contains(`<p class="lede" id="lede">${CANONICAL_LINE_HTML}</p>`),
      contains("<svg data-prerendered"),
      // …and the plan gallery in the header, its card links and thumbnails written by the same step.
      contains('<a class="gal-card" href="/examples/'),
      // The compiler chunk is preloaded with the page (playground/vite.config.js), as Vite
      // writes the tag: `<link rel="modulepreload" crossorigin href="./assets/compiler-….js">`.
      matches(/<link rel="modulepreload"[^>]*\bhref="\.\/assets\/compiler-[\w-]+\.js"/),
      // The shell may be framed only by us. It comes from public/_headers, which
      // nothing else here executes — and it must be asserted on `/` specifically,
      // because `_headers` matches the REQUEST path and `/` is served through the
      // `/  /index.html  200` rewrite, which does NOT carry /index.html's headers.
      header("x-frame-options", "SAMEORIGIN"),
      header("content-security-policy", "frame-ancestors 'self'"),
      entryScript(),
    ),
    // The same file by its own path: a real, reachable asset under
    // `html_handling: "none"`, and a framing bypass if only `/` were covered.
    route("/index.html", header("x-frame-options", "SAMEORIGIN")),
    route("/robots.txt", contains("Sitemap:")),
    // The static half: one crawlable page per example plan, written by
    // playground/scripts/gen-static.mjs after `vite build`. These three routes are the
    // whole contract in miniature. The `.html` is REQUIRED — `html_handling: "none"`
    // is an exact-path lookup, so `/examples/one-room` does not exist — and the page
    // must carry both a heading and an inlined `<svg>`, because a page that reached
    // production with the prose but no drawing (a missing repo-root `dist/`, a
    // generator that silently wrote a shell) is exactly the failure nothing else sees.
    route(
      "/examples/one-room.html",
      contentType("text/html"),
      contains("<h1"),
      contains("<svg"),
      // The page declares its own faces and serves them from /assets/ — see inlineFont.
      contains("@font-face"),
      inlineFont(),
    ),
    // A directory URL, served through the status-200 rewrite in public/_redirects —
    // the same mechanism the site root uses, and the one the sitemap and every
    // breadcrumb point at.
    route("/examples/", contentType("text/html"), contains("<h1"), contains("/examples/thumbs/")),
    // A gallery thumbnail: the one asset these pages reference from a second path, so a
    // generator that stopped writing them leaves an index of broken tiles behind a
    // perfectly healthy 200.
    route("/examples/thumbs/one-room.svg", contentType("image/svg+xml"), isSvg()),
    route("/sitemap.xml", contains("<urlset"), contains("/examples/one-room.html")),
    // Written by gen-static.mjs: a pointer at the docs site's llms.txt / llms-full.txt.
    route("/llms.txt", nonEmpty(), contains("https://archlang.uk/llms-full.txt")),
    // The header, not the meta tag: it is what a crawler that never parses the markup
    // acts on, and it comes from public/_headers, which nothing else here executes.
    route(
      "/embed.html",
      contentType("text/html"),
      contains('id="embedSrc"'),
      header("x-robots-tag", "noindex"),
      // THE CONTRACT, stated as an absence: the embed viewer is the one surface
      // meant to be framed by other people's sites, so it must carry NEITHER
      // framing restriction. If this ever fails, every <iframe> embed on the
      // internet is already broken.
      noHeader("x-frame-options"),
      noHeader("content-security-policy"),
      entryScript(),
    ),
    route("/brand/archlang-icon-plum.svg", isSvg()),
    ...(await shortLinkChecks()),
  ];
}

// ---------------------------------------------------------------------------
// The playground's ONE script (ADR 0034): short links. Every check above is a static path and
// must pass byte for byte as it did before the script existed; these four are the script's own.
// ---------------------------------------------------------------------------

/** An id no plan has (a 62^-8 chance otherwise), for the 404. Fetched once: a 404 is the answer. */
const UNKNOWN_SHARE_ID = "00000000";

async function shortLinkChecks() {
  const { encodePlanHash } = await import("../src/cli/share-codec.mjs");
  // The smallest complete plan. Its KV key stays behind (one plan, one key, forever: a re-run
  // finds the same id and writes nothing).
  const plan = readFileSync(join(ROOT, "examples", "one-room.arch"), "utf8");
  const payload = encodePlanHash(plan);
  let created;
  return [
    {
      name: `/s/${UNKNOWN_SHARE_ID} (404, html)`,
      run: async (base) => {
        let res;
        for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
          try {
            res = await fetch(`${base}/s/${UNKNOWN_SHARE_ID}`, { headers: { "user-agent": "archlang-smoke/1" } });
            break;
          } catch (e) {
            if (attempt === ATTEMPTS) throw new Error(`network error: ${e.message}`);
            await sleep(RETRY_MS);
          }
        }
        const body = await res.text();
        const ct = res.headers.get("content-type") ?? "";
        if (res.status !== 404) throw new Error(`HTTP ${res.status}, expected 404`);
        if (!ct.includes("text/html")) throw new Error(`the 404 is "${ct}", expected text/html`);
        if (!body.includes('href="/"')) throw new Error("the 404 page has no link to the playground");
        return [`404 ${ct}`];
      },
    },
    {
      name: "POST /api/share (examples/one-room.arch)",
      run: async (base) => {
        const { res, body } = await fetchOk(`${base}/api/share`, {
          method: "POST",
          headers: { "content-type": "text/plain;charset=utf-8" },
          body: payload,
        });
        contentType("application/json")(body, res);
        const out = JSON.parse(body);
        if (!/^[0-9A-Za-z]{8,43}$/.test(String(out.id))) throw new Error(`id is ${JSON.stringify(out.id)}`);
        // The origin is the request's: the deployed host. A local `wrangler dev` reports the route's
        // custom domain over http (`http://playground.archlang.uk`), not --base, so only the path is held.
        if (new URL(out.url).pathname !== `/s/${out.id}`) throw new Error(`url is ${JSON.stringify(out.url)}`);
        created = out.id;
        return [`id ${out.id}`];
      },
    },
    {
      // What a link preview reads: a crawler's user agent, no script run.
      name: "GET /s/<that id> as Twitterbot (card metadata, then /#z=)",
      run: async (base) => {
        if (!created) throw new Error("no id: the create check failed");
        const { res, body } = await fetchOk(`${base}/s/${created}`, { headers: { "user-agent": "Twitterbot/1.0" } });
        contentType("text/html")(body, res);
        for (const need of [
          // The plan's own name, read from the file rather than retyped.
          `<meta property="og:title" content="${/^plan "([^"]+)"/m.exec(plan)[1]}">`,
          '<meta name="twitter:card" content="summary_large_image">',
          '<link rel="canonical" href="',
          `/s/${created}">`,
          '<meta property="og:image" content="',
          `location.replace("/#z=`,
        ]) {
          if (!body.includes(need)) throw new Error(`the page lacks ${JSON.stringify(need)}`);
        }
        const { body: api } = await fetchOk(`${base}/api/share/${created}`);
        const { z } = JSON.parse(api);
        const { decodePlanHash } = await import("../src/cli/share-codec.mjs");
        if (decodePlanHash(z) !== plan) throw new Error("/api/share/<id> does not decode to the plan that was sent");
        return ["card metadata present; the stored payload decodes to the plan"];
      },
    },
    {
      // The card a link preview shows: a real PNG of the card's size, cacheable forever.
      name: "GET /s/<that id>.png (1200x630 PNG, immutable)",
      run: async (base) => {
        if (!created) throw new Error("no id: the create check failed");
        let res;
        let bytes;
        for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
          try {
            res = await fetch(`${base}/s/${created}.png`, { headers: { "user-agent": "archlang-smoke/1" } });
            bytes = Buffer.from(await res.arrayBuffer());
            if (res.status === 200) break;
          } catch (e) {
            if (attempt === ATTEMPTS) throw new Error(`network error: ${e.message}`);
          }
          if (attempt < ATTEMPTS) await sleep(RETRY_MS);
        }
        if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
        contentType("image/png")("", res);
        header("cache-control", "immutable")("", res);
        if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("not a PNG (bad signature)");
        const [w, h] = [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
        if (w !== 1200 || h !== 630) throw new Error(`the PNG is ${w}x${h}, expected 1200x630`);
        // The static card is also a 1200x630 PNG: only its bytes tell the plan's card from the
        // stand-in the Worker serves when it cannot draw one.
        // (Read as bytes: fetchOk reads a body as text, which would mangle a PNG.)
        const og = await fetch(`${base}/brand/archlang-og.png`, { headers: { "user-agent": "archlang-smoke/1" } });
        if (og.status !== 200) throw new Error(`/brand/archlang-og.png: HTTP ${og.status}`);
        const fallback = Buffer.from(await og.arrayBuffer());
        if (bytes.equals(fallback))
          throw new Error("the card is the static /brand/archlang-og.png, not the plan's drawing");
        return [`${bytes.length} B, ${w}x${h}, not the static card`];
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// The hosted MCP Worker (packages/mcp-worker). Its contract is the protocol and one image URL:
// `initialize` must carry the server's instructions, `tools/list` the tool set, and an /svg/ URL
// minted by the SHARED encoder (the one `archlang link` uses) must answer exactly the bytes
// `compile()` produces for that plan — so this site reads the built core (`npm run build` first).
// ---------------------------------------------------------------------------

/** A JSON-RPC POST to /mcp, with the Accept header Streamable HTTP requires. */
function mcpCall(name, method, params, ...assertions) {
  return {
    name,
    run: async (base) => {
      const { res, body } = await fetchOk(`${base}/mcp`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const ctx = { base, path: "/mcp", notes: [] };
      for (const assert of assertions) await assert(body, res, ctx);
      return ctx.notes;
    },
  };
}

/** The JSON-RPC `result`, or a throw carrying the `error`. */
const rpcResult = (body) => {
  const msg = JSON.parse(body);
  if (msg.error) throw new Error(`JSON-RPC error ${msg.error.code}: ${msg.error.message}`);
  return msg.result;
};

async function mcpChecks() {
  const { encodePlanHash } = await import("../src/cli/share-codec.mjs");
  const { compile } = await import("../dist/index.js");
  const studio = readFileSync(join(ROOT, "examples", "studio.arch"), "utf8");
  const svgPath = `/svg/${encodePlanHash(studio)}`;
  return [
    mcpCall(
      "/mcp initialize",
      "initialize",
      { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "archlang-smoke", version: "1" } },
      contentType("application/json"),
      (body, _res, ctx) => {
        const r = rpcResult(body);
        if (r.serverInfo?.name !== "archlang") throw new Error(`serverInfo is ${JSON.stringify(r.serverInfo)}`);
        if (typeof r.instructions !== "string" || !r.instructions.includes("archlang://spec")) {
          throw new Error("initialize carries no ArchLang instructions");
        }
        ctx.notes.push(`server ${r.serverInfo.version}, protocol ${r.protocolVersion}`);
      },
    ),
    mcpCall("/mcp tools/list", "tools/list", {}, (body, _res, ctx) => {
      const names = (rpcResult(body).tools ?? []).map((t) => t.name);
      for (const need of ["compile", "describe", "lint", "validate", "link", "read_me"]) {
        if (!names.includes(need)) throw new Error(`tools/list lacks ${need} (has ${names.join(", ")})`);
      }
      ctx.notes.push(`${names.length} tools`);
    }),
    {
      // Named, not the path: the path is a whole plan.
      ...route(
        svgPath,
        contentType("image/svg+xml"),
        // Unpinned: the compiler is not in the URL, so it must stay revalidatable, never immutable.
        header("cache-control", "max-age=300"),
        header("etag", '"'),
        isSvg(),
        async (body, res, ctx) => {
          const want = compile(studio, { noCache: true }).svg;
          if (body !== want)
            throw new Error(`body (${body.length} chars) is not compile()'s SVG (${want.length} chars)`);
          // The pinned copy it names is the immutable one, with the same bytes.
          const pinned = res.headers.get("content-location");
          if (!pinned?.startsWith("/v/"))
            throw new Error(`content-location is ${JSON.stringify(pinned)}, expected /v/…`);
          const { res: pres, body: pbody } = await fetchOk(new URL(pinned, ctx.base).href);
          if (!(pres.headers.get("cache-control") ?? "").includes("immutable"))
            throw new Error(`the pinned copy is not immutable: ${pres.headers.get("cache-control")}`);
          if (pbody !== want) throw new Error("the pinned copy's bytes are not compile()'s SVG");
          ctx.notes.push(`studio.arch, ${body.length} chars = compile(); pinned ${pinned.split("/")[2]} immutable`);
        },
      ),
      name: "/svg/<studio.arch payload>",
    },
  ];
}

const SITES = { docs: docsChecks, playground: playgroundChecks, mcp: mcpChecks };

// ---------------------------------------------------------------------------
// CLI.
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--site" || arg === "--base") {
      opts[arg.slice(2)] = argv[++i];
    } else {
      return { error: `unknown argument: ${arg}` };
    }
  }
  if (!opts.site || !SITES[opts.site]) {
    return { error: `--site must be one of: ${Object.keys(SITES).join(", ")}` };
  }
  if (!opts.base || !/^https?:\/\//.test(opts.base)) return { error: "--base must be an http(s) URL" };
  opts.base = opts.base.replace(/\/+$/, "");
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.error) {
    process.stderr.write(`${opts.error}\nusage: node scripts/smoke.mjs --site docs|playground|mcp --base <url>\n`);
    process.exit(2);
  }

  const checks = await SITES[opts.site]();
  process.stdout.write(`smoke: ${opts.site} @ ${opts.base} — ${checks.length} checks\n`);

  const failures = [];
  for (const check of checks) {
    const started = Date.now();
    try {
      const notes = (await check.run(opts.base)) ?? [];
      const detail = notes.length > 0 ? `  ${notes.join("; ")}` : "";
      process.stdout.write(`  PASS  ${check.name}  (${Date.now() - started}ms)${detail}\n`);
    } catch (e) {
      failures.push({ name: check.name, reason: e.message });
      process.stdout.write(`  FAIL  ${check.name}  — ${e.message}\n`);
    }
  }

  const passed = checks.length - failures.length;
  process.stdout.write(`\n${passed}/${checks.length} checks passed for ${opts.site} @ ${opts.base}\n`);
  if (failures.length > 0) {
    for (const f of failures) process.stderr.write(`::error::smoke ${opts.site} ${f.name}: ${f.reason}\n`);
    process.exit(1);
  }
}

await main();
