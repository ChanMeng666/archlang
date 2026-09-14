/**
 * Post-deploy IndexNow ping for the two public sites — zero dependencies, plain Node
 * (global `fetch`, Node 18+).
 *
 *   node scripts/indexnow.mjs --site docs       --base https://archlang.uk
 *   node scripts/indexnow.mjs --site playground --base https://playground.archlang.uk
 *
 * IndexNow (indexnow.org) is one POST that tells Bing, Yandex, Seznam, Naver and
 * every other participating engine that a list of URLs changed. It replaces the
 * "wait for the crawler to come back" delay with a push, and it is the only part of
 * this programme that a deploy can perform for itself — everything else (Search
 * Console, Bing Webmaster) is a dashboard a human signs into.
 *
 * The URL list is the site's OWN sitemap, fetched from the deploy we just made
 * rather than read off disk: the sitemap is what the engines will crawl, so pinging
 * anything else would announce URLs the site does not claim. Nothing is hardcoded —
 * the docs sitemap carries 34 entries today and the playground's will carry 29 once
 * its static example pages ship; both numbers are read, never asserted.
 *
 * THE ONE RULE: **this script always exits 0.** A search-engine ping is not part of
 * the deploy's contract with its users — the site is already live and already
 * correct when we get here. A key file that has not propagated yet, a sitemap that
 * 404s, api.indexnow.org being down, a 429: none of those are reasons to paint a
 * successful deploy red. Every one of them prints a `::warning::` instead, so it is
 * visible in the Actions log and in the job summary without gating anything. (The
 * check that DOES gate is `scripts/smoke.mjs`, which runs immediately before this.)
 *
 * The key (`INDEXNOW_KEY`, a 32-hex-character string) is a repository VARIABLE, not
 * a secret, and the key file is committed to each site's `public/`. That is not an
 * oversight: the protocol requires the key to be served at
 * `https://<host>/<key>.txt` so the engine can prove whoever POSTed it controls the
 * host. A secret would be masked in the log for no benefit and would make the
 * 403/422 responses unreadable.
 *
 * Exit code: 0, always. Usage errors exit 2 (a malformed workflow step should be
 * fixed, and cannot be mistaken for a ping outcome).
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Where every participating engine's shared endpoint lives (indexnow.org/documentation). */
const ENDPOINT = "https://api.indexnow.org/IndexNow";

/** The protocol's own cap: "You can submit up to 10,000 URLs per post". */
const MAX_URLS = 10000;

/** Same two sites as scripts/smoke.mjs, and the same `--site` vocabulary. */
const SITES = ["docs", "playground"];

// ---------------------------------------------------------------------------
// Pure helpers (exported for test/indexnow-script.test.ts).
// ---------------------------------------------------------------------------

/**
 * The five XML predefined entities, decoded. A sitemap `<loc>` MUST escape at
 * least `&`, and a URL carrying a query string is where that bites — `&amp;` left
 * in place would be POSTed as a literal and the engine would 422 the whole batch
 * for a URL that "doesn't belong to the host".
 */
export function decodeXmlEntities(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Every `<loc>` in a sitemap document, in document order, de-duplicated.
 *
 * Deliberately a regex and not an XML parser: the core of this repo is
 * zero-dependency and this script is run by a deploy job, so the alternative is a
 * dependency for one element name. A sitemap index (`<sitemapindex>` of
 * `<sitemap><loc>`) uses the same element, which is why the caller filters by host
 * afterwards rather than trusting the shape.
 */
export function extractLocs(xml) {
  const seen = new Set();
  for (const m of xml.matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/g)) {
    const raw = decodeXmlEntities(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")).trim();
    if (raw.length > 0) seen.add(raw);
  }
  return [...seen];
}

/**
 * Keep only the URLs that belong to `host`. IndexNow answers 422 — for the WHOLE
 * batch — on "URLs which don't belong to the host", so one stray absolute link in a
 * sitemap would silently cost us every other URL in the ping.
 */
export function sameHostUrls(urls, host) {
  return urls.filter((u) => {
    try {
      return new URL(u).host.toLowerCase() === host.toLowerCase();
    } catch {
      return false;
    }
  });
}

/** The POST body, exactly as indexnow.org/documentation specifies it. */
export function buildPayload({ host, key, keyLocation, urlList }) {
  return { host, key, keyLocation, urlList: urlList.slice(0, MAX_URLS) };
}

/**
 * The CLI shape, character-for-character the one `scripts/smoke.mjs` accepts, so
 * the deploy workflow's two steps read the same and a copied command line works in
 * either. Returns `{ error }` rather than throwing.
 */
export function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--site" || arg === "--base") {
      opts[arg.slice(2)] = argv[++i];
    } else {
      return { error: `unknown argument: ${arg}` };
    }
  }
  if (!opts.site || !SITES.includes(opts.site)) {
    return { error: `--site must be one of: ${SITES.join(", ")}` };
  }
  if (!opts.base || !/^https?:\/\//.test(opts.base)) return { error: "--base must be an http(s) URL" };
  opts.base = opts.base.replace(/\/+$/, "");
  return opts;
}

// ---------------------------------------------------------------------------
// The ping.
// ---------------------------------------------------------------------------

const out = (line) => process.stdout.write(`${line}\n`);

/**
 * A soft stop: say why we are not pinging, in a form GitHub renders as a warning
 * annotation, and hand back the exit-0 that every path here returns.
 */
function skip(reason) {
  out(`::warning::indexnow: not pinged — ${reason}`);
  return 0;
}

/**
 * One request with a timeout, returning `{ status, body }` or throwing a plain Error.
 *
 * The timer is an explicit `AbortController` + `clearTimeout`, not the one-liner
 * `AbortSignal.timeout(ms)`, and the `clearTimeout` is the point: a MEASURED crash,
 * not caution. `AbortSignal.timeout` leaves a live libuv timer behind after the
 * request settles, and tearing that down inside `process.exit()` aborts Node on
 * Windows — `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), src\\win\\async.c`,
 * exit code 127, printed AFTER the script's own output. Which is the one failure
 * shape this script exists to prevent: a correct, complete, exit-0 ping that ends
 * the workflow step red anyway.
 */
async function request(url, init = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return { status: res.status, body: await res.text() };
  } finally {
    clearTimeout(timer);
  }
}

export async function run(opts, env = process.env) {
  const key = (env.INDEXNOW_KEY ?? "").trim();
  const host = new URL(opts.base).host;
  const keyLocation = `${opts.base}/${key}.txt`;

  // 1. No key → nothing to do, and nothing wrong. A fork, a PR from outside the
  //    repo, or a checkout before WP8 registered the variable all land here.
  if (key === "") {
    out("indexnow: INDEXNOW_KEY is not set — skipping the ping (this is not an error).");
    return 0;
  }
  if (!/^[A-Za-z0-9-]{8,128}$/.test(key)) {
    return skip(`INDEXNOW_KEY is not 8–128 characters of [A-Za-z0-9-] (got ${key.length} characters)`);
  }

  out(`indexnow: ${opts.site} @ ${opts.base} (host ${host})`);

  // 2. The key file must already be served, or the engine's own verification fetch
  //    will fail and the batch is wasted. Checking it here turns a silent 403 into
  //    a readable line — and on the very first deploy of this change the file is
  //    not live yet, which is a skip, not a failure.
  try {
    const { status, body } = await request(keyLocation);
    if (status !== 200) return skip(`${keyLocation} returned HTTP ${status} (the key file is not served yet)`);
    if (body.trim() !== key) {
      return skip(`${keyLocation} does not contain the key (served ${JSON.stringify(body.slice(0, 48))})`);
    }
    out(`  key file  ${keyLocation}  OK`);
  } catch (e) {
    return skip(`could not fetch ${keyLocation}: ${e.message}`);
  }

  // 3. The URL list IS the deployed sitemap. The playground has no sitemap.xml
  //    until its static example pages ship; that is a skip, not a failure.
  const sitemapUrl = `${opts.base}/sitemap.xml`;
  let urlList;
  try {
    const { status, body } = await request(sitemapUrl);
    if (status !== 200) return skip(`${sitemapUrl} returned HTTP ${status} (no sitemap to read)`);
    const locs = extractLocs(body);
    urlList = sameHostUrls(locs, host);
    if (urlList.length === 0) return skip(`${sitemapUrl} yielded no <loc> URLs on ${host}`);
    const dropped = locs.length - urlList.length;
    out(`  sitemap   ${sitemapUrl}  ${urlList.length} URLs${dropped > 0 ? ` (${dropped} off-host, dropped)` : ""}`);
  } catch (e) {
    return skip(`could not fetch ${sitemapUrl}: ${e.message}`);
  }

  if (urlList.length > MAX_URLS) {
    out(`  capping at the protocol's ${MAX_URLS}-URL limit (sitemap had ${urlList.length})`);
  }
  const payload = buildPayload({ host, key, keyLocation, urlList });

  // 4. One POST, one batch. 200 = accepted; 202 = accepted, key validation pending
  //    (the usual answer for a first submission); anything else is a warning.
  try {
    const { status, body } = await request(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
    });
    if (status === 200 || status === 202) {
      const note = status === 202 ? " (accepted; key validation pending)" : " (accepted)";
      out(`  POST ${ENDPOINT} → HTTP ${status}${note} for ${payload.urlList.length} URLs`);
      return 0;
    }
    return skip(
      `POST ${ENDPOINT} → HTTP ${status} for ${payload.urlList.length} URLs${body.trim() ? `: ${body.trim().slice(0, 200)}` : ""}`,
    );
  } catch (e) {
    return skip(`POST ${ENDPOINT} failed: ${e.message}`);
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.error) {
    process.stderr.write(`${opts.error}\nusage: node scripts/indexnow.mjs --site docs|playground --base <url>\n`);
    process.exitCode = 2;
    return;
  }
  // `process.exitCode` rather than `process.exit()`: the latter tears the event
  // loop down under whatever the HTTP client still holds, which is how the libuv
  // assertion above became reachable at all. Every path through run() returns 0 —
  // assigning the value (rather than ignoring it) is what makes that a claim the
  // code states rather than a comment.
  process.exitCode = await run(opts);
}

// Only ping when RUN. The pure helpers above are imported by
// test/indexnow-script.test.ts, and an import must not POST anything.
const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) await main();
