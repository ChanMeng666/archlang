#!/usr/bin/env node
/**
 * The playground's static byte-identity sweep (ADR 0034): does the Worker script leave every
 * static path exactly as the asset layer alone serves it?
 *
 * It serves the SAME built `playground/dist` twice under `wrangler dev --local`: once with a base
 * ref's `playground/wrangler.jsonc` (default `origin/main`), once with the working tree's, and
 * compares 34 requests (GET, HEAD and POST over 26 static paths: 200s, 404s and 405s) by status,
 * headers (minus per-request ones such as `date`) and body SHA-256. Exit 0 when all match, 1 when
 * any differs (each one printed), 2 on bad usage.
 *
 * A MANUAL tool, never CI: it runs two local workerd processes, one after the other. Run it after
 * any change to `playground/worker/` or `playground/wrangler.jsonc`. To see that it can fail, break
 * the script's fallback (`return env.ASSETS.fetch(req)` in worker/app.ts) and run it again: every
 * 404 that reaches the script then differs.
 *
 *   npm run playground:build                       # the dist both runs serve
 *   node scripts/playground-static-sweep.mjs [--base <ref>] [--port <n>] [--wrangler <wrangler.js>]
 *
 * Without `--wrangler` (or `WRANGLER_JS`) it runs `npx --yes wrangler@<version>`, the version read
 * from the pin in `.github/workflows/deploy.yml`, so the sweep uses what deploys.
 */
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLAYGROUND = join(ROOT, "playground");
const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const BASE = opt("--base", "origin/main");
const PORT = Number(opt("--port", "8791"));
const WRANGLER_JS = opt("--wrangler", process.env.WRANGLER_JS);

if (!existsSync(join(PLAYGROUND, "dist", "index.html"))) {
  console.error("playground-static-sweep: playground/dist is missing; run `npm run playground:build` first.");
  process.exit(2);
}

/** The wrangler command: a given wrangler.js under this Node, or the version deploy.yml pins via npx. */
function wranglerCommand() {
  if (WRANGLER_JS) return { cmd: process.execPath, pre: [WRANGLER_JS], shell: false };
  const pin = /npm i -g wrangler@(\d+\.\d+\.\d+)/.exec(
    readFileSync(join(ROOT, ".github/workflows/deploy.yml"), "utf8"),
  );
  if (!pin) {
    console.error("playground-static-sweep: no `npm i -g wrangler@<version>` pin found in deploy.yml.");
    process.exit(2);
  }
  return { cmd: "npx", pre: ["--yes", `wrangler@${pin[1]}`], shell: process.platform === "win32" };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VOLATILE = new Set([
  "date",
  "cf-ray",
  "report-to",
  "nel",
  "server",
  "connection",
  "keep-alive",
  "transfer-encoding",
]);

/** Serve playground/dist with `config` (a path relative to playground/, or null for the default) and probe it. */
async function probe(config) {
  const persist = mkdtempSync(join(tmpdir(), "archlang-sweep-"));
  const { cmd, pre, shell } = wranglerCommand();
  const args = [
    ...pre,
    "dev",
    ...(config ? ["-c", config] : []),
    "--local",
    "--port",
    String(PORT),
    "--ip",
    "127.0.0.1",
    "--persist-to",
    persist,
    "--show-interactive-dev-session=false",
  ];
  const child = spawn(cmd, args, {
    cwd: PLAYGROUND,
    shell,
    env: { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "1", NO_COLOR: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  const base = `http://127.0.0.1:${PORT}`;
  try {
    let ready = false;
    for (let i = 0; i < 180 && !ready; i++) {
      await sleep(1000);
      try {
        await (await fetch(`${base}/robots.txt`)).arrayBuffer();
        ready = true;
      } catch {
        /* not up yet */
      }
    }
    if (!ready) throw new Error(`wrangler dev never answered on ${base}\n${log}`);
    const html = readFileSync(join(PLAYGROUND, "dist", "index.html"), "utf8");
    const entry = /<script\b[^>]*\bsrc="([^"]+)"/.exec(html)[1].replace(/^\.\//, "/");
    const gets = [
      "/",
      "/index.html",
      "/embed.html",
      "/robots.txt",
      "/sitemap.xml",
      "/llms.txt",
      "/examples/",
      "/examples/index.html",
      "/examples/one-room.html",
      "/examples/one-room",
      "/examples/thumbs/one-room.svg",
      "/brand/archlang-icon-plum.svg",
      "/brand/archlang-og.png",
      entry,
      "/no-such-page",
      "/embed",
      "/index",
      "/_headers",
      "/_redirects",
      "/s",
      "/api",
      "/sx/abc",
      "/apis/share",
      "/favicon.ico",
      "/examples/nope.html",
      "/0aecad134b55ec669a7ef97b24f9e672.txt",
    ];
    const rows = [];
    for (const method of ["GET", "HEAD", "POST"]) {
      for (const path of method === "GET" ? gets : ["/", "/embed.html", "/no-such-page", "/robots.txt"]) {
        const r = await fetch(base + path, { method, redirect: "manual", ...(method === "POST" ? { body: "x" } : {}) });
        const body = Buffer.from(await r.arrayBuffer());
        const headers = Object.fromEntries([...r.headers].filter(([k]) => !VOLATILE.has(k)).sort());
        rows.push({ method, path, status: r.status, headers, sha256: createHash("sha256").update(body).digest("hex") });
      }
    }
    return rows;
  } finally {
    child.kill();
    await sleep(1500);
    rmSync(persist, { recursive: true, force: true });
  }
}

const baseConfig = ".static-sweep-base.wrangler.jsonc";
const baseConfigPath = join(PLAYGROUND, baseConfig);
let before;
let after;
try {
  writeFileSync(baseConfigPath, execFileSync("git", ["show", `${BASE}:playground/wrangler.jsonc`], { cwd: ROOT }));
  console.log(`sweep: ${BASE}'s playground/wrangler.jsonc over playground/dist …`);
  before = await probe(baseConfig);
} finally {
  rmSync(baseConfigPath, { force: true });
}
console.log("sweep: the working tree's playground/wrangler.jsonc over the same dist …");
after = await probe(null);

let same = 0;
for (let i = 0; i < before.length; i++) {
  const a = before[i];
  const b = after[i];
  if (JSON.stringify(a) === JSON.stringify(b)) {
    same++;
    continue;
  }
  console.log(`DIFF ${a.method} ${a.path}\n  ${BASE}: ${JSON.stringify(a)}\n  tree: ${JSON.stringify(b)}`);
}
console.log(`${same}/${before.length} requests identical (status, headers, body SHA-256)`);
process.exit(same === before.length ? 0 : 1);
