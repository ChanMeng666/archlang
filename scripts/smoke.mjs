/**
 * Post-deploy smoke test for the two public sites — zero dependencies, plain Node
 * (global `fetch`, Node 18+).
 *
 *   node scripts/smoke.mjs --site docs       --base https://archlang.uk
 *   node scripts/smoke.mjs --site playground --base https://playground.archlang.uk
 *
 * Why more than `curl -o /dev/null`: a Vercel deploy can serve a 200 on `/` while the
 * things machines actually consume are gone — the raw `/<page>.md` copies, `/llms-full.txt`,
 * the JSON schemas, the GBNF grammar, the example SVGs, or (on the playground) the hashed
 * JS bundle the shell page loads. Those are the site's real contract, so they are what we
 * check. The docs route list is PARSED out of `docs-site/sync-docs.mjs` rather than retyped,
 * so adding a page or an example there extends this smoke test automatically (a generator
 * retyped by hand is exactly how a template goes stale — AGENTS.md).
 *
 * Retry envelope: a request is retried up to 6 times, 5s apart, on a network error or a
 * non-200 (alias propagation after `vercel deploy` takes a few seconds). A 200 whose BODY
 * fails its assertion is a real failure and is never retried — waiting can't fix wrong bytes.
 *
 * Exit codes: 0 all checks passed · 1 at least one check failed · 2 bad usage.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const ATTEMPTS = 6;
const RETRY_MS = 5000;

// ---------------------------------------------------------------------------
// Route discovery — derived from docs-site/sync-docs.mjs, never retyped.
// ---------------------------------------------------------------------------

/**
 * Pull one of sync-docs.mjs's literal `["src", "dest"],` tuple tables out of the file.
 * The three tables (`PAGES`, `ROOT_COPIES`, `EXCLUDED_EXAMPLES`) are the site's single
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
 * writes both the bannered page and `public/<dest>`. Parsed, so a new doc page is
 * smoke-tested the day it is added.
 */
function docsPageRoutes(syncSrc) {
  return tupleTable(syncSrc, "PAGES").map(([, dest]) => `/${dest}`);
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

const contains = (sub) => (body) => {
  if (!body.includes(sub)) throw new Error(`body does not contain ${JSON.stringify(sub)}`);
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

async function fetchOk(url) {
  let last = "no attempt made";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { redirect: "follow", headers: { "user-agent": "archlang-smoke/1" } });
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

// ---------------------------------------------------------------------------
// Site definitions.
// ---------------------------------------------------------------------------

function docsChecks() {
  const syncSrc = readFileSync(join(ROOT, "docs-site", "sync-docs.mjs"), "utf8");
  return [
    // Homepage marker: the hand-written "built for agents" band in docs-site/index.md.
    // It is prose in the page source (not a component), so it survives a theme refactor.
    route("/", contentType("text/html"), contains("An interface, not just an image.")),
    route("/llms.txt", contentType("text"), nonEmpty()),
    // Heading emitted by scripts/gen-llms-full.ts — its presence proves we got the bundle,
    // not an SPA fallback page.
    route("/llms-full.txt", nonEmpty(), contains("# ArchLang — full agent context")),
    route(
      "/plan.schema.json",
      json((s) => {
        if (!String(s.$id).includes("archlang.uk")) throw new Error(`$id is ${JSON.stringify(s.$id)}`);
      }),
    ),
    route("/intent.schema.json", json()),
    // Served as application/octet-stream, so assert on the grammar's own root rule.
    route("/archlang.gbnf", contains("root ::=")),
    // The raw-markdown copies must serve VERBATIM, not get swallowed by the page router —
    // so assert the media type as well as the bytes (a VitePress 404 would be text/html).
    ...docsPageRoutes(syncSrc).map((p) => route(p, contentType("text/markdown"), nonEmpty())),
    ...docsExampleRoutes(syncSrc).map((p) => route(p, startsWith("<svg"))),
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

function playgroundChecks() {
  return [
    // Markers are the app's mount points in playground/index.html + embed.html.
    route("/", contentType("text/html"), contains('id="editor"'), entryScript()),
    route("/embed.html", contentType("text/html"), contains('id="embedSrc"'), entryScript()),
    route("/brand/archlang-icon-plum.svg", isSvg()),
  ];
}

const SITES = { docs: docsChecks, playground: playgroundChecks };

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
    process.stderr.write(`${opts.error}\nusage: node scripts/smoke.mjs --site docs|playground --base <url>\n`);
    process.exit(2);
  }

  const checks = SITES[opts.site]();
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
