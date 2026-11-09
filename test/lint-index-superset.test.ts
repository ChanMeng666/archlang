/**
 * The lint rules' spatial filters drop nothing a full scan would measure (engineering-health EH2.10).
 *
 * `W_LEAF_ACROSS_DOORWAY` measures a leaf only against the doors `leafApproachIndex` returns, and
 * `W_BOUNDARY_NO_WALL` measures a shared run only against the wall segments and connectors
 * `RunCandidates.hits` returns. Each filter is claimed exact: everything the rule's own predicate
 * accepts is a hit. This file checks that pair by pair, against the predicate evaluated with no
 * box test at all: every (leaf, door) with a non-null `leafOverApproach` must be visited, and every
 * straight segment or connector that, measured ALONE against a run (`openStretches` handed only
 * that element), puts an interval on it must be a hit. Over `examples/`, `test/plans/` and the
 * bench plans BALANCED and OPENING_HEAVY, at approach depths 1, 300 (the default) and 3000 mm plus
 * the non-finite `Infinity` and `NaN` (which `GridIndex` keeps in its overflow list), and the
 * default ruleset for the runs. The same evaluation with each pad 2 mm smaller must miss
 * something, so the check can fail. Adapted from the PR #656 review's probe.
 */

import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { BALANCED, genPlan, OPENING_HEAVY } from "../bench/gen.js";
import { resolvePlan } from "../src/analyze.js";
import { doorLeaves } from "../src/geometry.js";
import { buildLintContext, type LintContext } from "../src/lint/context.js";
import { leafApproachIndex, leafOverApproach, ZONE_BOX_PAD_MM } from "../src/lint/rules/doors.js";
import {
  openStretches,
  RUN_BOX_PAD_MM,
  type RunCandidates,
  runCandidates,
  type SharedRun,
  sharedRuns,
} from "../src/lint/rules/enclosure.js";
import { LINT_RULES } from "../src/lint/rules/index.js";
import { DEFAULT_RULESET } from "../src/lint/ruleset.js";
import { lintStoreys } from "../src/lint/storeys.js";
import { corpusFiles } from "./helpers/corpus.js";
import { readFileSync } from "node:fs";
import { worldFor } from "./helpers/world.js";
import type { World } from "../src/world.js";

const DEPTHS = [1, 300, 3000, Number.POSITIVE_INFINITY, Number.NaN];

interface Tally {
  /** Pairs (or run–element pairs) the exhaustive predicate accepts. */
  accepted: number;
  /** Of those, the ones the filter did not return, at the rule's pad and at a pad 2 mm smaller. */
  missed: string[];
  missedTight: number;
}

const tally = (): Tally => ({ accepted: 0, missed: [], missedTight: 0 });

/** Every storey's lint context of every plan, under the default ruleset. */
function contexts(): Array<{ key: string; ctx: LintContext }> {
  const plans: Array<{ key: string; src: string; opts: { world?: World } }> = corpusFiles({
    dirs: ["examples", "test/plans"],
  }).map((f) => ({ key: f, src: readFileSync(f, "utf8"), opts: { world: worldFor(dirname(f)) } }));
  for (const [key, spec] of [
    ["bench:BALANCED", BALANCED],
    ["bench:OPENING_HEAVY", OPENING_HEAVY],
  ] as const)
    plans.push({ key, src: genPlan(spec), opts: {} });
  const out: Array<{ key: string; ctx: LintContext }> = [];
  for (const p of plans) {
    const { ir, levels } = resolvePlan(p.src, p.opts);
    if (!ir) continue;
    for (const st of lintStoreys(ir, levels, DEFAULT_RULESET.tolMm))
      out.push({ key: p.key, ctx: buildLintContext(st.ir, DEFAULT_RULESET, LINT_RULES, st.building) });
  }
  return out;
}

/** An element measured on its own: the run's predicate with no box test. */
const alone = (straight: RunCandidates["straight"], links: RunCandidates["links"]): RunCandidates => ({
  straight,
  links,
  hits: () => ({ segs: straight.map((_, i) => i), links: links.map((_, i) => i) }),
  counters: [],
});

/** Does the run, with nothing else on it, read anything covered (a stretch that is not bare, or none)? */
const covers = (ctx: LintContext, run: SharedRun, near: RunCandidates): boolean => {
  const out = openStretches(ctx, run, near);
  return out.length === 0 || out.some((s) => !s.bare);
};

describe("the leaf and boundary filters are supersets of the rules' own predicates", () => {
  const leaf = tally();
  const seg = tally();
  const link = tally();
  let measured = false;
  const measure = (): void => {
    if (measured) return;
    measured = true;
    for (const { key, ctx } of contexts()) {
      // W_LEAF_ACROSS_DOORWAY: every leaf of every door against every other door with an edge.
      const doors = ctx.doors;
      if (doors.length >= 2) {
        const edged = new Set(ctx.access().edges.map((e) => e.doorId));
        for (const depth of DEPTHS) {
          const loose = leafApproachIndex(doors, (id) => edged.has(id), depth);
          const tight = leafApproachIndex(doors, (id) => edged.has(id), depth, ZONE_BOX_PAD_MM - 2);
          for (const a of doors)
            for (const sa of doorLeaves(a)) {
              const hit = new Set(loose(sa));
              const hitTight = new Set(tight(sa));
              doors.forEach((b, bi) => {
                if (b === a || !edged.has(b.id) || leafOverApproach(sa, b, depth) === null) return;
                leaf.accepted++;
                if (!hit.has(bi)) leaf.missed.push(`${key} depth ${depth}: ${a.id} -> ${b.id}`);
                if (!hitTight.has(bi)) leaf.missedTight++;
              });
            }
        }
      }
      // W_BOUNDARY_NO_WALL: every run two rectangular-or-ring rooms share, against every element.
      const rooms = ctx.rooms.filter((r) => !r.circle);
      const near = runCandidates(ctx);
      const nearTight = runCandidates(ctx, RUN_BOX_PAD_MM - 2);
      for (let j = 0; j < rooms.length; j++)
        for (let i = 0; i < j; i++)
          for (const run of sharedRuns(ctx, rooms[i]!, rooms[j]!)) {
            const hits = near.hits(run);
            const hitsTight = nearTight.hits(run);
            near.straight.forEach((s, k) => {
              if (!covers(ctx, run, alone([s], []))) return;
              seg.accepted++;
              if (!hits.segs.includes(k)) seg.missed.push(`${key}: ${rooms[i]!.id}|${rooms[j]!.id} wall ${s.wallId}`);
              if (!hitsTight.segs.includes(k)) seg.missedTight++;
            });
            near.links.forEach((c, k) => {
              if (!covers(ctx, run, alone([], [c]))) return;
              link.accepted++;
              if (!hits.links.includes(k)) link.missed.push(`${key}: ${rooms[i]!.id}|${rooms[j]!.id} ${c.id}`);
              if (!hitsTight.links.includes(k)) link.missedTight++;
            });
          }
    }
  };

  it("every (leaf, door) pair whose leaf stands in the door's approach is visited", () => {
    measure();
    expect(leaf.missed.slice(0, 10)).toEqual([]);
    expect(leaf.accepted).toBeGreaterThan(100); // not vacuous
  }, 60_000);

  it("every wall segment and connector that covers part of a shared run is a hit", () => {
    measure();
    expect(seg.missed.slice(0, 10)).toEqual([]);
    expect(link.missed.slice(0, 10)).toEqual([]);
    expect(seg.accepted).toBeGreaterThan(100);
    expect(link.accepted).toBeGreaterThan(100);
  }, 60_000);

  it("can fail: with each pad 2 mm smaller, a pair the predicate accepts is missed", () => {
    measure();
    expect(leaf.missedTight).toBeGreaterThan(0);
    expect(seg.missedTight + link.missedTight).toBeGreaterThan(0);
  }, 60_000);
});
