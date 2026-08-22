import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const UA =
  "archlang-research/1.0 (+https://github.com/ChanMeng666/archlang; academic study of self-description drift in LLM-facing packages)";

/** Filesystem-safe key for an npm package name (scoped names contain `/`). */
export function safeKey(name) {
  return name.replace(/[^A-Za-z0-9._-]/g, "_");
}

export function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export async function ensureDir(p) {
  await mkdir(dirname(p), { recursive: true });
}

export async function readJson(p) {
  try {
    return JSON.parse(await readFile(p, "utf8"));
  } catch {
    return null;
  }
}

export async function writeJson(p, v) {
  await ensureDir(p);
  await writeFile(p, JSON.stringify(v, null, 1));
}

/** Fetch with retry + backoff. Returns null on permanent failure. */
export async function fetchWithRetry(url, opts = {}, tries = 3) {
  let lastErr = null;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, {
        ...opts,
        headers: { "user-agent": UA, ...(opts.headers || {}) },
      });
      if (r.status === 404 || r.status === 403 || r.status === 401) {
        return { ok: false, status: r.status, body: null };
      }
      if (!r.ok) {
        lastErr = "HTTP " + r.status;
        await sleep(400 * (i + 1) * (i + 1));
        continue;
      }
      return { ok: true, status: r.status, res: r };
    } catch (e) {
      lastErr = String(e && e.message ? e.message : e);
      await sleep(400 * (i + 1) * (i + 1));
    }
  }
  return { ok: false, status: 0, error: lastErr };
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Run `worker` over `items` with bounded concurrency, never aborting on error. */
export async function pool(items, concurrency, worker, onProgress) {
  const results = new Array(items.length);
  let next = 0;
  let done = 0;
  async function run() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = await worker(items[i], i);
      } catch (e) {
        results[i] = { error: String(e && e.message ? e.message : e) };
      }
      done++;
      if (onProgress && done % 50 === 0) onProgress(done, items.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  if (onProgress) onProgress(done, items.length);
  return results;
}

const SEMVER_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/;

export function parseSemver(v) {
  if (typeof v !== "string") return null;
  const m = SEMVER_RE.exec(v.trim());
  if (!m) return null;
  return {
    major: +m[1],
    minor: +m[2],
    patch: +m[3],
    pre: m[4] || null,
    build: m[5] || null,
  };
}

/** -1 / 0 / 1, or null if either side is not semver. */
export function cmpSemver(a, b) {
  const x = parseSemver(a);
  const y = parseSemver(b);
  if (!x || !y) return null;
  for (const k of ["major", "minor", "patch"]) {
    if (x[k] !== y[k]) return x[k] < y[k] ? -1 : 1;
  }
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  return x.pre < y.pre ? -1 : 1;
}

export function fileExists(p) {
  return existsSync(p);
}
