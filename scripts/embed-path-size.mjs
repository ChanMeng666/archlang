#!/usr/bin/env node
// `npm run size:embed`: the playground's embed path in gzip bytes against `embedPathBudget`
// (card EB.1). It builds as CI's `e2e-playground-chromium` job does (`npm run build`, then
// `npm run playground:build:only`), walks the build from `embed.html` and prints each chunk's gzip
// size, the total, the budget and the headroom. The walk and the sizes are
// `playground/scripts/chunk-walk.mjs`, the very functions the startup-chunks gate in
// `playground/e2e/preview3d.spec.ts` calls, so the total here is the gate's total on the same build.
// A compiler-path PR states the embed path's before and after bytes (RM-D57,
// `docs/agents/iron-laws.md`): run this on `main` and on the branch.
//
//   node scripts/embed-path-size.mjs [--no-build] [--json]
//     --no-build  measure the existing playground/dist (built from the current dist/) as it is
//     --json      print one JSON object on stdout ({ files, total, budget, headroom, within })
// Build output goes to stderr, so stdout holds only the report. Exit 0 within the budget, 1 over
// it, 2 when the build fails or there is no build to measure.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chunkWalkOf } from "../playground/scripts/chunk-walk.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "playground", "dist");
const BASELINE = join(ROOT, "playground", "e2e", "startup-chunks.baseline.json");

const args = process.argv.slice(2);
const unknown = args.filter((a) => a !== "--no-build" && a !== "--json");
if (unknown.length) {
  console.error(`embed-path-size: unknown argument ${unknown.join(" ")} (use --no-build, --json)`);
  process.exit(2);
}
const JSON_OUT = args.includes("--json");

if (!args.includes("--no-build")) {
  for (const script of ["build", "playground:build:only"]) {
    console.error(`embed-path-size: npm run ${script}`);
    const r = spawnSync("npm", ["run", script], {
      cwd: ROOT,
      stdio: ["ignore", 2, 2],
      shell: process.platform === "win32",
    });
    if (r.status !== 0) {
      console.error(`embed-path-size: npm run ${script} failed (exit ${r.status ?? r.signal})`);
      process.exit(2);
    }
  }
}
if (!existsSync(join(DIST, "embed.html"))) {
  console.error("embed-path-size: no playground/dist/embed.html; build first (drop --no-build)");
  process.exit(2);
}

const { embedPathBudget: budget } = JSON.parse(readFileSync(BASELINE, "utf8"));
const walk = chunkWalkOf(DIST);
const path = walk.embedPath();
const files = path.map((file) => ({ file, gzip: walk.gz(file) }));
const total = walk.size(path);
const headroom = budget - total;
const within = total <= budget;

if (JSON_OUT) {
  console.log(JSON.stringify({ files, total, budget, headroom, within }, null, 2));
} else {
  const width = String(Math.max(total, budget)).length;
  const row = (n, what) => `  ${String(n).padStart(width)}  ${what}`;
  console.log("embed path (embed.html's module script and preloads, walked statically), gzip bytes:");
  for (const { file, gzip } of files) console.log(row(gzip, file));
  console.log(row(total, "total"));
  console.log(row(budget, "embedPathBudget (playground/e2e/startup-chunks.baseline.json)"));
  console.log(row(headroom, within ? "headroom" : "OVER the budget"));
}
process.exit(within ? 0 : 1);
