/**
 * Gate G1 — the CONTROL arm's number: per-assertion accuracy of direct `.arch` generation.
 *
 * G1's gate is "mean per-assertion faithfulness of NL→intent JSON ≥ ~85% AND significantly
 * above the calibrated per-assertion accuracy of direct `.arch` generation from T1's
 * baseline" (roadmap, deep-dive H1). This script reconstructs that second number from the
 * frozen copy of the calibrated baseline scorecard (`baseline-run-29150982395.md`, the
 * "Eval (live)" run of 2026-07-11: gpt-5.5, seed 20260711, judge v2, 26 briefs) — no API
 * call, fully reproducible from the committed artifact.
 *
 * Reconstruction: each brief's judge-v2 predicate counts come from `corpus.json`
 * (`compileExpect`), and its per-dimension pass fractions from the scorecard's subscore
 * cell (`R… L… A… Adj…`). A fraction times its dimension's predicate count recovers the
 * integer pass count exactly (counts ≤ 5, fractions rounded to 2 dp — max reconstruction
 * error 0.025 < 0.5). Two documented choices:
 *   - an INVALID plan (no drawing) counts every predicate as failed — deliverable
 *     semantics: assertions about a plan that never rendered are unmet;
 *   - `room-count` is graded by the PREDICATE's pass (policy B), not the stricter
 *     subscore grade: R < 1 with no `rooms:` failure line in Notes is a policy-B pass.
 * A cross-check asserts the reconstructed gating failures match the scorecard's failure
 * notes brief-by-brief, so a parsing slip fails loudly instead of skewing the number.
 *
 * Run: `npx tsx eval/g1/baseline-accuracy.ts` (prints a Markdown report to stdout).
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileExpect } from "../assertions.js";
import { loadCorpus } from "../run.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCORECARD = resolve(HERE, "baseline-run-29150982395.md");

/** One scorecard row, parsed. */
interface Row {
  id: string;
  valid: boolean;
  /** Subscore fractions, or null when the row is invalid (`—`). */
  sub: { rooms: number; labels: number; area: number | null; adjacency: number | null } | null;
  notes: string;
}

/** Parse the scorecard's per-brief table rows. */
function parseRows(md: string): Row[] {
  const rows: Row[] = [];
  for (const line of md.split("\n")) {
    const m = line.match(/^\| `([^`]+)` \| (.+?) \| (yes|no|—) \| .+? \| (.+?) \| .+? \| (.*) \|$/);
    if (!m) continue;
    const [, id, , valid, subCell, notes] = m as unknown as [string, string, string, string, string, string];
    let sub: Row["sub"] = null;
    if (subCell !== "—") {
      const sm = subCell.match(/^R([\d.]+) L([\d.]+) A([\d.]+|–) Adj([\d.]+|–)$/);
      if (!sm) throw new Error(`unparseable subscore cell for ${id}: "${subCell}"`);
      sub = {
        rooms: Number(sm[1]),
        labels: Number(sm[2]),
        area: sm[3] === "–" ? null : Number(sm[3]),
        adjacency: sm[4] === "–" ? null : Number(sm[4]),
      };
    }
    rows.push({ id, valid: valid === "yes", sub, notes });
  }
  return rows;
}

/** Reconstruct integer passes from a fraction over `n` predicates. */
const recover = (frac: number, n: number): number => Math.round(frac * n);

interface BriefAccuracy {
  id: string;
  gatingPass: number;
  gatingTotal: number;
  nonGatingPass: number;
  nonGatingTotal: number;
  invalid: boolean;
}

function main(): void {
  const md = readFileSync(SCORECARD, "utf8");
  const rows = new Map(parseRows(md).map((r) => [r.id, r]));
  const corpus = loadCorpus();
  if (rows.size !== corpus.length) {
    throw new Error(`scorecard has ${rows.size} rows, corpus has ${corpus.length} entries`);
  }

  const briefs: BriefAccuracy[] = [];
  for (const entry of corpus) {
    const row = rows.get(entry.id);
    if (!row) throw new Error(`no scorecard row for ${entry.id}`);
    const preds = compileExpect(entry.expect);
    const nRoomCount = preds.filter((p) => p.kind === "room-count").length;
    const nExists = preds.filter((p) => p.kind === "room-exists").length;
    const nArea = preds.filter((p) => p.kind === "room-area" || p.kind === "total-area").length;
    const nAdj = preds.filter((p) => p.kind === "adjacent" || p.kind === "reachable").length;
    const gatingTotal = nRoomCount + nExists + nArea;
    const nonGatingTotal = nAdj;

    if (!row.valid || !row.sub) {
      briefs.push({ id: entry.id, gatingPass: 0, gatingTotal, nonGatingPass: 0, nonGatingTotal, invalid: true });
      continue;
    }

    // Policy-B room count: the predicate passes unless the notes carry a rooms: failure.
    const roomsPass = nRoomCount === 0 ? 0 : row.sub.rooms === 1 || !row.notes.includes("rooms:") ? 1 : 0;
    const labelsPass = recover(row.sub.labels, nExists);
    const areaPass = row.sub.area === null ? 0 : recover(row.sub.area, nArea);
    if (row.sub.area === null && nArea > 0) throw new Error(`${entry.id}: area asserted but subscore unasserted`);
    const adjPass = row.sub.adjacency === null ? 0 : recover(row.sub.adjacency, nAdj);
    if (row.sub.adjacency === null && nAdj > 0)
      throw new Error(`${entry.id}: adjacency asserted but subscore unasserted`);

    // Cross-check: reconstructed gating failures must equal the scorecard's failure notes.
    const gatingFails = gatingTotal - (roomsPass + labelsPass + areaPass);
    const noteFails = (row.notes.match(/(?:^|; )(?:rooms|label|area):/g) ?? []).length;
    if (gatingFails !== noteFails) {
      throw new Error(`${entry.id}: reconstructed ${gatingFails} gating failure(s) but notes list ${noteFails}`);
    }

    briefs.push({
      id: entry.id,
      gatingPass: roomsPass + labelsPass + areaPass,
      gatingTotal,
      nonGatingPass: adjPass,
      nonGatingTotal,
      invalid: false,
    });
  }

  const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
  const pct = (p: number, n: number): string => `${p}/${n} (${((100 * p) / n).toFixed(1)}%)`;
  const total = (bs: BriefAccuracy[]): string[] => {
    const gp = sum(bs.map((b) => b.gatingPass));
    const gt = sum(bs.map((b) => b.gatingTotal));
    const np = sum(bs.map((b) => b.nonGatingPass));
    const nt = sum(bs.map((b) => b.nonGatingTotal));
    return [
      `- gating (room-count / room-exists / room-area / total-area): **${pct(gp, gt)}**`,
      `- non-gating (adjacent / reachable): **${pct(np, nt)}**`,
      `- all assertions: **${pct(gp + np, gt + nt)}**`,
    ];
  };

  const lines = [
    "# G1 control arm — per-assertion accuracy of direct `.arch` generation",
    "",
    "Reconstructed from `baseline-run-29150982395.md` (calibrated L0 baseline: gpt-5.5,",
    "seed 20260711, judge v2, 26 briefs) and the corpus's judge-v2 predicate counts.",
    "",
    "| Brief | Gating | Non-gating |",
    "| --- | --- | --- |",
    ...briefs.map(
      (b) =>
        `| \`${b.id}\`${b.invalid ? " (invalid)" : ""} | ${b.gatingPass}/${b.gatingTotal} | ${b.nonGatingPass}/${b.nonGatingTotal} |`,
    ),
    "",
    "## All 26 briefs (invalid plan = all assertions failed — deliverable semantics)",
    "",
    ...total(briefs),
    "",
    "## Valid plans only (the 25 that rendered)",
    "",
    ...total(briefs.filter((b) => !b.invalid)),
    "",
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
}

main();
