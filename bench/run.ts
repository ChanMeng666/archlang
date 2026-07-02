/**
 * ArchLang benchmark — `npm run bench`.
 *
 * Times compile() on a balanced ~1000-element plan and breaks the cost down by
 * stage (parse / resolve / toScene / renderSvg), plus the analysis entry points
 * (lint / describe). Two skewed plans expose which geometry hotspot dominates.
 * Pure timing — no asserts, no determinism risk.
 *
 * Methodology: the pipeline stages memoize (lex by content hash, parse by
 * source hash, resolve by AST identity), so each timed closure clears the
 * caches it would otherwise hit — a stage row measures real work, not a cache
 * lookup. The small clear-call overhead (~µs) is included and acceptable.
 * `lint`/`describe` are the exception: they run against warm parse/resolve
 * caches on purpose, so their rows isolate the analysis work itself.
 */

import { renderSvg } from "../src/backends/svg.js";
import { describe } from "../src/describe.js";
import { compile } from "../src/index.js";
import { clearResolveCache, resolve } from "../src/ir.js";
import { clearLexCache } from "../src/lexer.js";
import { lint } from "../src/lint.js";
import { clearParseCache, parse } from "../src/parser.js";
import { toScene } from "../src/scene-build.js";
import { BALANCED, count, genPlan, type GenSpec, OPENING_HEAVY, ROOM_HEAVY } from "./gen.js";

interface Stat {
  min: number;
  mean: number;
  median: number;
}

function timeit(fn: () => void, iters: number, warmup = 5): Stat {
  for (let i = 0; i < warmup; i++) fn();
  const samples: number[] = [];
  for (let i = 0; i < iters; i++) {
    const t0 = process.hrtime.bigint();
    fn();
    const t1 = process.hrtime.bigint();
    samples.push(Number(t1 - t0) / 1e6); // ns -> ms
  }
  samples.sort((a, b) => a - b);
  const sum = samples.reduce((a, b) => a + b, 0);
  return { min: samples[0], mean: sum / samples.length, median: samples[Math.floor(samples.length / 2)] };
}

const ms = (n: number) => `${n.toFixed(2)} ms`;
const row = (label: string, s: Stat) =>
  `  ${label.padEnd(22)} min ${ms(s.min).padStart(9)}   mean ${ms(s.mean).padStart(9)}   median ${ms(s.median).padStart(9)}`;

/** `--json` emits machine-readable timings for CI regression comparison. */
const JSON_MODE = process.argv.includes("--json");

function clearStageCaches(): void {
  clearLexCache();
  clearParseCache();
  clearResolveCache();
}

function benchPlan(name: string, spec: GenSpec, iters: number): Record<string, Stat> {
  const src = genPlan(spec);
  const { plan } = parse(src);
  const ir = resolve(plan!).ir;
  const scene = toScene(ir, {});

  const stats = {
    compile: timeit(() => {
      clearStageCaches();
      compile(src, { noCache: true });
    }, iters),
    parse: timeit(() => {
      // Includes lexing — both memoize by content, so both caches are cleared.
      clearLexCache();
      clearParseCache();
      parse(src);
    }, iters),
    resolve: timeit(() => {
      clearResolveCache();
      resolve(plan!);
    }, iters),
    toScene: timeit(() => toScene(ir, {}), iters),
    renderSvg: timeit(() => renderSvg(scene, {}), iters),
    // Warm caches on purpose: these rows isolate the analysis work itself.
    lint: timeit(() => lint(src), iters),
    describe: timeit(() => describe(src), iters),
  };
  if (!JSON_MODE) {
    console.log(
      `\n${name}  (${count(spec)} elements: ${spec.walls}W ${spec.rooms}R ${spec.doors}D ${spec.windows}Wn ${spec.furniture}F)`,
    );
    console.log(row("compile (full)", stats.compile));
    console.log(row("  parse", stats.parse));
    console.log(row("  resolve", stats.resolve));
    console.log(row("  toScene", stats.toScene));
    console.log(row("  renderSvg", stats.renderSvg));
    console.log(row("lint", stats.lint));
    console.log(row("describe", stats.describe));
  }
  return stats;
}

const ITERS = JSON_MODE ? 25 : 40;
if (!JSON_MODE) console.log(`ArchLang benchmark — ${ITERS} timed iterations each (after warmup)`);
const results = {
  BALANCED: benchPlan("BALANCED", BALANCED, ITERS),
  ROOM_HEAVY: benchPlan("ROOM_HEAVY (O(R^2) overlap)", ROOM_HEAVY, ITERS),
  OPENING_HEAVY: benchPlan("OPENING_HEAVY (host-segment scan)", OPENING_HEAVY, ITERS),
};
if (JSON_MODE) {
  // Stable JSON for CI diffing: median-ms per plan/stage, rounded to 3 dp.
  const out: Record<string, Record<string, number>> = {};
  for (const [plan, stages] of Object.entries(results)) {
    out[plan] = {};
    for (const [stage, s] of Object.entries(stages)) out[plan][stage] = Number(s.median.toFixed(3));
  }
  console.log(JSON.stringify(out, null, 2));
} else {
  console.log("");
}
