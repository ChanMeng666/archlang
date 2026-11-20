/**
 * AF4 (fix round 1 of #987): a parse error's `expected` lists every token the parser accepts at the
 * position it stopped at. The check is the red team's replace-and-reparse oracle
 * (`test/helpers/expected-oracle.ts`): over a sample of mutants of four examples, each one-token
 * site's token is replaced by each candidate and the source parsed again; no candidate the parser
 * accepts there may be missing from `expected`. Sampled (every fifth token, at most 10 sites a file)
 * so it runs in seconds; the full run over every example (11,480 mutants) is in the PR.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { oracleSites, type OracleSite } from "./helpers/expected-oracle.js";

const FILES = ["one-room", "attached", "turning-stair", "knob-flat"];
const STRIDE = 5;
const PER_FILE = 10;

it("expected leaves out nothing the parser accepts at the position (replace and reparse)", { timeout: 120_000 }, () => {
  const seen = new Set<string>();
  const sites: OracleSite[] = [];
  for (const f of FILES) {
    const src = readFileSync(join(__dirname, "..", "examples", `${f}.arch`), "utf8").replace(/\r\n/g, "\n");
    sites.push(...oracleSites(f, src, STRIDE, seen, PER_FILE));
  }
  // Not vacuous: every file gives sites, and the sample is large enough to cross the grammar.
  expect(sites.length).toBeGreaterThanOrEqual(30);
  const gaps = sites
    .filter((s) => s.omitted.length > 0)
    .map(
      (s) => `${s.id}: ${s.message} | expected ${s.expected.join(" ")} | accepted, not listed: ${s.omitted.join(" ")}`,
    );
  expect(gaps).toEqual([]);
});
