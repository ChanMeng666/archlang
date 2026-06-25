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

function benchPlan(name: string, spec: GenSpec, iters: number): void {
  const src = genPlan(spec);
  const { plan } = parse(src);
  const ir = resolve(plan!).ir;

  console.log(`\n${name}  (${count(spec)} elements: ${spec.walls}W ${spec.rooms}R ${spec.doors}D ${spec.windows}Wn ${spec.furniture}F)`);
  console.log(row("compile (full)", timeit(() => compile(src, { noCache: true }), iters)));
  console.log(row("  parse", timeit(() => parse(src), iters)));
  console.log(row("  resolve", timeit(() => resolve(plan!), iters)));
  console.log(row("  render", timeit(() => render(ir, {}), iters)));
}

const ITERS = 40;
console.log(`ArchLang benchmark — ${ITERS} timed iterations each (after warmup)`);
benchPlan("BALANCED", BALANCED, ITERS);
benchPlan("ROOM_HEAVY (O(R^2) overlap)", ROOM_HEAVY, ITERS);
benchPlan("OPENING_HEAVY (host-segment scan)", OPENING_HEAVY, ITERS);
console.log("");
