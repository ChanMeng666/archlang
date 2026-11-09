/**
 * Take the work-count table (`./tables/work-counts.json`) in one command:
 *
 *     npx tsx test/work-counts-gen.ts "<why, and on which commit>"
 *
 * It measures every plan of `workCountPlans()` with the test's own body (`test/helpers/work-counts.ts`) and
 * writes the table, recording the reason it was given in its `_reason` header. A moved count is an
 * algorithmic change to explain (`docs/testing.md` §3): a PR that legitimately moves one re-takes
 * the whole table with this generator, never by hand, and names the moved rows in its commit message.
 */

import { writeFileSync } from "node:fs";
import {
  rowProblems,
  TABLE,
  type WorkCounts,
  type WorkCountsTable,
  workCountPlans,
  workCounts,
} from "./helpers/work-counts.js";

const why = process.argv[2];
if (!why) {
  process.stderr.write('usage: npx tsx test/work-counts-gen.ts "<why, and on which commit>"\n');
  process.exit(3);
}

const rows: Record<string, WorkCounts> = {};
const refused: string[] = [];
for (const p of workCountPlans()) {
  const m = workCounts(p.src, p.world);
  const problems = rowProblems(m);
  if (problems.length > 0) refused.push(`${p.key}: ${problems.join("; ")}`);
  rows[p.key] = m.counts;
}
if (refused.length > 0) {
  process.stderr.write(`refusing to write the table; these plans cannot be rows:\n  ${refused.join("\n  ")}\n`);
  process.exit(1);
}
const table: WorkCountsTable = { _reason: why, _tolerance: 0.1, _totalTolerance: 0.03, _floor: 8, rows };
writeFileSync(TABLE, `${JSON.stringify(table, null, 2)}\n`);
process.stderr.write(`wrote ${Object.keys(rows).length} rows to test/tables/work-counts.json\n`);
