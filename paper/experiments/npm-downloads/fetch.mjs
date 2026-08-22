#!/usr/bin/env node
/**
 * npm download figures for the paper — fetched, dated, and reported WITH the caveats
 * that make them interpretable.
 *
 * Zero dependencies (global `fetch`, Node 18+). Queries the public npm registry
 * download-counts API for both published packages:
 *
 *   - the last-30-day POINT figure   (`/downloads/point/last-month/<pkg>`)
 *   - the daily RANGE for ~90 days   (`/downloads/range/<from>:<to>/<pkg>`)
 *
 * Why the daily range matters: an npm "downloads/month" number for a package with a
 * frequent release cadence is dominated by CI and mirror traffic that follows each
 * publish. The range lets the paper state the total ALONGSIDE its shape — how many
 * days saw nothing at all, and what share of the total lands on the busiest five
 * days. A total whose top-5 days carry most of the mass is not evidence of a user
 * base; saying so is the honest version of citing the number.
 *
 * USAGE
 *   node paper/experiments/npm-downloads/fetch.mjs [--days 90] [--out <path>]
 *
 * OUTPUT
 *   paper/experiments/npm-downloads/downloads-<YYYY-MM-DD>.json  (raw + derived)
 *   plus a summary on stdout.
 */

import { writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const PACKAGES = ["@chanmeng666/archlang", "@chanmeng666/archlang-mcp"];

const argv = process.argv.slice(2);
const flagValue = (f) => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : undefined;
};
const DAYS = Number(flagValue("--days") ?? 90);

const iso = (d) => d.toISOString().slice(0, 10);

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

/** Sum, count of zero days, and the share of the total carried by the top-5 days. */
function shape(downloads) {
  const counts = downloads.map((d) => d.downloads);
  const total = counts.reduce((a, b) => a + b, 0);
  const sorted = [...counts].sort((a, b) => b - a);
  const top5 = sorted.slice(0, 5).reduce((a, b) => a + b, 0);
  const sortedAsc = [...counts].sort((a, b) => a - b);
  const median = sortedAsc.length
    ? sortedAsc.length % 2
      ? sortedAsc[(sortedAsc.length - 1) / 2]
      : (sortedAsc[sortedAsc.length / 2 - 1] + sortedAsc[sortedAsc.length / 2]) / 2
    : 0;
  return {
    days: counts.length,
    total,
    zeroDays: counts.filter((c) => c === 0).length,
    max: sorted[0] ?? 0,
    median,
    mean: counts.length ? total / counts.length : 0,
    top5Total: top5,
    top5Share: total ? top5 / total : null,
    topDays: downloads
      .slice()
      .sort((a, b) => b.downloads - a.downloads)
      .slice(0, 5)
      .map((d) => ({ day: d.day, downloads: d.downloads })),
  };
}

/**
 * The days this repository pushed a `v*` tag — i.e. the days a release (and its CI,
 * mirrors and provenance traffic) happened. Used to turn the release-cadence caveat
 * from an assertion into a measurement.
 */
function releaseDays() {
  const r = spawnSync("git", ["for-each-ref", "--format=%(creatordate:short) %(refname:short)", "refs/tags"], {
    cwd: resolve(HERE, "../../.."),
    encoding: "utf8",
  });
  if (r.status !== 0) return null;
  const byDay = new Map();
  for (const line of (r.stdout || "").trim().split("\n")) {
    const [day, tag] = line.trim().split(/\s+/);
    if (!day) continue;
    byDay.set(day, [...(byDay.get(day) ?? []), tag]);
  }
  return byDay;
}

async function main() {
  const today = new Date();
  const to = new Date(today);
  to.setUTCDate(to.getUTCDate() - 1); // the registry's last complete day
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (DAYS - 1));

  const out = {
    experiment: "npm download counts for the ArchLang packages",
    fetchedAt: new Date().toISOString(),
    source: "https://api.npmjs.org/downloads (public npm registry download-counts API)",
    rangeRequested: { from: iso(from), to: iso(to), days: DAYS },
    caveat:
      "npm download counts include CI installs, mirrors and bots and are NOT unique users. " +
      "For a package that publishes often, a large share of the total follows each release. " +
      "Cite the monthly total only together with the daily shape below (zero-days and top-5 share).",
    packages: {},
  };

  const rel = releaseDays();
  const marks = (days) => (rel ? days.map((d) => ({ ...d, releaseTags: rel.get(d.day) ?? [] })) : days);

  for (const pkg of PACKAGES) {
    const enc = encodeURIComponent(pkg);
    const point = await getJson(`https://api.npmjs.org/downloads/point/last-month/${enc}`);
    const range = await getJson(`https://api.npmjs.org/downloads/range/${iso(from)}:${iso(to)}/${enc}`);
    // Most "zero days" in a 90-day window on a young package are simply days BEFORE
    // it existed on the registry, which would make the zero-day count read as apathy
    // when it is really pre-publication. Report both windows.
    const firstIdx = range.downloads.findIndex((d) => d.downloads > 0);
    const since = firstIdx >= 0 ? range.downloads.slice(firstIdx) : [];
    out.packages[pkg] = {
      lastMonthPoint: { downloads: point.downloads, start: point.start, end: point.end },
      range: { start: range.start, end: range.end, downloads: range.downloads },
      shape: shape(range.downloads),
      sinceFirstDownload: {
        firstDay: since[0]?.day ?? null,
        daysBeforeFirstDownload: firstIdx < 0 ? range.downloads.length : firstIdx,
        shape: shape(since),
      },
    };
    out.packages[pkg].shape.topDays = marks(out.packages[pkg].shape.topDays);
    out.packages[pkg].sinceFirstDownload.shape.topDays = marks(out.packages[pkg].sinceFirstDownload.shape.topDays);
  }

  const file = join(HERE, `downloads-${iso(today)}.json`);
  writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);

  for (const [pkg, d] of Object.entries(out.packages)) {
    const s = d.shape;
    console.log(`\n${pkg}`);
    console.log(
      `  last 30 days (point):   ${d.lastMonthPoint.downloads}  [${d.lastMonthPoint.start} .. ${d.lastMonthPoint.end}]`,
    );
    console.log(`  ${s.days}-day range:        ${s.total} total  [${d.range.start} .. ${d.range.end}]`);
    console.log(`  zero-download days:     ${s.zeroDays}/${s.days}`);
    console.log(`  median / mean per day:  ${s.median} / ${s.mean.toFixed(1)}  (max ${s.max})`);
    console.log(
      `  top-5 days:             ${s.top5Total}/${s.total} = ${(100 * s.top5Share).toFixed(1)}% of the total`,
    );
    console.log(
      `    ${s.topDays
        .map(
          (t) =>
            `${t.day}:${t.downloads}${t.releaseTags?.length ? `(${t.releaseTags.length} tag${t.releaseTags.length > 1 ? "s" : ""})` : ""}`,
        )
        .join("  ")}`,
    );
    const onRelease = s.topDays.filter((t) => t.releaseTags?.length).length;
    console.log(`  of those top-5 days, ${onRelease} were release days (a \`v*\` tag was pushed)`);
    const f = d.sinceFirstDownload;
    console.log(
      `  since first download (${f.firstDay}): ${f.shape.days} days, ${f.shape.total} total, ` +
        `${f.shape.zeroDays} zero-days, top-5 share ${(100 * f.shape.top5Share).toFixed(1)}%`,
    );
  }
  console.log(`\nwrote ${resolve(file)}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
