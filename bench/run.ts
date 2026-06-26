/**
 * ArchLang benchmark — `npm run bench`.
 *
 * Times compile() on a balanced ~1000-element plan, breaks the cost down by
 * stage (parse / resolve / render), and runs two skewed plans to expose which
 * resolve hotspot (room-overlap O(R^2) vs. per-opening host-segment scan)
 * dominates. Pure timing — no asserts, no determinism risk.
 */

import { compile } from "../src/index.js";
import { parse } from "../src/parser.js";
import { resolve } from "../src/ir.js";
import { render } from "../src/render.js";
import { genPlan, count, BALANCED, ROOM_HEAVY, OPENING_HEAVY, type GenSpec } from "./gen.js";

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

function benchPlan(name: string, spec: GenSpec, iters: number): Record<string, Stat> {
  const src = genPlan(spec);
  const { plan } = parse(src);
  const ir = resolve(plan!).ir;

  const stats = {
    compile: timeit(() => compile(src, { noCache: true }), iters),
    parse: timeit(() => parse(src), iters),
    resolve: timeit(() => resolve(plan!), iters),
    render: timeit(() => render(ir, {}), iters),
  };
  if (!JSON_MODE) {
    console.log(`\n${name}  (${count(spec)} elements: ${spec.walls}W ${spec.rooms}R ${spec.doors}D ${spec.windows}Wn ${spec.furniture}F)`);
    console.log(row("compile (full)", stats.compile));
    console.log(row("  parse", stats.parse));
    console.log(row("  resolve", stats.resolve));
    console.log(row("  render", stats.render));
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
