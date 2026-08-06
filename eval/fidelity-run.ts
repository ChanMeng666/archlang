/**
 * The fidelity slice's runner — a SEPARATE gate and a SEPARATE scorecard.
 *
 * `eval/run.ts` and `eval/results.md` are deliberately untouched by this item: the 26-brief
 * rates must stay comparable to `live-baseline.json`, and a new number folded into that
 * scorecard would make them a measurement of the ruler. So this writes its own file,
 * `eval/fidelity-results.md`, and shares nothing with the judge but the concept vocabulary.
 *
 * ## What it actually measures — and what it CANNOT
 *
 * There is no model here, and that is not an omission. The offline eval scores committed
 * artifacts (`readGolden`), so "does a model launder constraints?" is not an offline
 * question at all. What IS offline-answerable is whether **the detector discriminates**, and
 * that is what this runner reports: for each brief it scores the committed *correct* reply
 * and the committed *laundered* counter-example, and fails when the two are not told apart.
 * That mirrors `eval/faults/` — seeded defects with expected outcomes — one level up.
 *
 * The live path a model would drive is deliberately NOT built. {@link fidelitySystemPrompt}
 * and {@link parseFidelityReply} are the two pieces a driver needs, and they are exported and
 * tested; wiring an API caller is an owner decision, and every paid path in this directory is
 * guarded or declined. Nothing here spends a token.
 *
 * Run: `npm run eval:fidelity`. Exit `0` when every reference is classified correctly,
 * `1` when the detector failed to discriminate (a regression), `3` on bad usage.
 */

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FIDELITY_VERSION,
  type FidelityEntry,
  type FidelityScore,
  checkContract,
  contractDrift,
  derivedConflicts,
  loadFidelityCorpus,
  readReply,
  scoreReply,
} from "./fidelity.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const RESULTS = "eval/fidelity-results.md";

/** One brief's row: both references scored, plus the derived infeasibility proof. */
export interface FidelityRow {
  entry: FidelityEntry;
  correct: FidelityScore;
  laundered: FidelityScore;
  /** Conflict ids {@link derivedConflicts} proves from the requirements alone. */
  derived: string[];
  /** Ids the laundered CONTRACT moved or dropped (empty when the constraint was never
   *  representable — see the `intent-blind` column). */
  contractMoved: string[];
  /** The detector told the two references apart. */
  discriminates: boolean;
}

/** Score every brief's two committed references. Pure apart from the file reads. */
export function runFidelity(entries: readonly FidelityEntry[]): FidelityRow[] {
  return entries.map((entry) => {
    const correct = scoreReply(entry, readReply(entry.references.correct));
    const laundered = scoreReply(entry, readReply(entry.references.laundered));
    return {
      entry,
      correct,
      laundered,
      derived: derivedConflicts(entry.requirements),
      contractMoved: contractDrift(checkContract(entry.requirements, entry.references.launderedContract)),
      discriminates: correct.score === 1 && laundered.score === 0,
    };
  });
}

/** `\|`-escape a cell so a requirement id list can never split a GFM table row. */
const cell = (s: string): string => (s.length === 0 ? "—" : s.replace(/\|/g, "\\|"));

/** Render the scorecard as Markdown. Deterministic: same corpus ⇒ same bytes. */
export function renderFidelityResults(rows: readonly FidelityRow[]): string {
  const infeasible = rows.filter((r) => r.entry.infeasible !== undefined);
  const blind = rows.filter((r) => r.entry.intentBlind === true);
  const ok = rows.filter((r) => r.discriminates).length;
  return [
    "# ArchLang intent-fidelity scorecard",
    "",
    `Mode: **offline (committed references)** · ${rows.length} briefs · fidelity v${FIDELITY_VERSION}.`,
    "",
    "This is the constraint-laundering slice. It is **reported on its own and multiplied into",
    "nothing** — the 26-brief authorability scorecard (`eval/results.md`) and its baseline are",
    "untouched, because a fidelity number folded into them would move the ruler and make every",
    "recorded rate non-comparable.",
    "",
    "There is no model in this run. It scores the committed reference replies to prove the",
    "**detector discriminates**: the scored-correct reply must score 1 and the laundered",
    "counter-example must score 0, with the moved requirement named.",
    "",
    `- **Detector discriminates:** ${ok}/${rows.length}`,
    `- **Deliberately infeasible briefs:** ${infeasible.length}/${rows.length} (correct behaviour = declaring infeasibility)`,
    `- **Invisible to the intent channel:** ${blind.length}/${rows.length} — the laundered requirement is one \`Intent\` cannot express, so \`validateIntent\` passes the counter-example and only this check catches it`,
    "",
    "| Brief | Feasible | Correct reply | Laundered reply | Detector named | Declared conflict | Derived conflict | Contract moved | Intent-blind |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map((r) => {
      const cells = [
        `\`${r.entry.id}\``,
        r.entry.infeasible === undefined ? "yes" : "**no**",
        `${r.correct.score} (${r.correct.replyKind})`,
        `${r.laundered.score} (${r.laundered.replyKind})`,
        cell(r.laundered.drifted.join(", ")),
        cell(r.entry.infeasible?.conflicts.join(", ") ?? ""),
        cell(r.derived.join(", ")),
        cell(r.contractMoved.join(", ")),
        r.entry.intentBlind === true ? "**yes**" : "no",
      ];
      return `| ${cells.join(" | ")} |`;
    }),
    "",
    "## Verdicts",
    "",
    ...rows.flatMap((r) => [
      `- \`${r.entry.id}\` — correct: ${r.correct.verdict}`,
      `  - laundered: ${r.laundered.verdict}`,
    ]),
    "",
  ].join("\n");
}

function main(): void {
  const argv = process.argv.slice(2);
  if (argv.length > 0) {
    process.stderr.write(`✗ eval:fidelity takes no arguments (got ${argv.join(" ")})\n`);
    process.exit(3);
  }
  const rows = runFidelity(loadFidelityCorpus());
  const md = renderFidelityResults(rows);
  writeFileSync(resolve(ROOT, RESULTS), md);
  process.stdout.write(md + "\n");
  process.stdout.write(`✓ wrote ${RESULTS}\n`);

  const failed = rows.filter((r) => !r.discriminates);
  if (failed.length > 0) {
    for (const r of failed) {
      process.stderr.write(
        `✗ ${r.entry.id}: correct scored ${r.correct.score}, laundered scored ${r.laundered.score}\n`,
      );
    }
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
