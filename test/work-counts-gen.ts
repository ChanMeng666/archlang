/**
 * Take the work-count table (`./tables/work-counts.json`) in one command:
 *
 *     npx tsx test/work-counts-gen.ts "<why, and on which commit>"
 *
 * It measures every plan of `workCountPlans()` with the test's own body (`./work-counts.ts`) and
 * writes the table, recording the reason it was given in its `_reason` header. A moved count is an
 * algorithmic change to explain (`docs/testing.md` §3): a PR that legitimately moves one re-takes
 * the whole table with this generator, never by hand, and names the moved rows in its commit message.
 */

import { writeFileSync } from "node:fs";
import { TABLE, type WorkCounts, type WorkCountsTable, workCountPlans, workCounts } from "./work-counts.js";

const why = process.argv[2];
if (!why) {
  process.stderr.write('usage: npx tsx test/work-counts-gen.ts "<why, and on which commit>"\n');
  process.exit(3);
}

const rows: Record<string, WorkCounts> = {};
for (const p of workCountPlans()) rows[p.key] = workCounts(p.src, p.world);
const table: WorkCountsTable = { _reason: why, _tolerance: 0.1, rows };
writeFileSync(TABLE, `${JSON.stringify(table, null, 2)}\n`);
process.stderr.write(`wrote ${Object.keys(rows).length} rows to test/tables/work-counts.json\n`);
