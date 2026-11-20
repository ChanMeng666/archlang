/**
 * AF4 (fix rounds 1 and 2 of #987): a parse error's `expected` lists exactly the tokens the parser
 * accepts at the position it stopped at. The check is the red team's replace-and-reparse oracle
 * (`test/helpers/expected-oracle.ts`): over a sample of mutants of four examples, each one-token
 * site's token is replaced by each candidate and the source parsed again; no candidate the parser
 * accepts there may be missing from `expected`, no entry it rejects there may be listed (the
 * oracle's named blind spots aside), and a did-you-mean word left out is one it rejects. Sampled
 * (every fifth token, at most 10 sites a file) so it runs in seconds; the full run over every
 * example is in the PR.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, expect, it } from "vitest";
import { NEEDS_WHAT_FOLLOWS, oracleSites, type OracleSite } from "./helpers/expected-oracle.js";

const FILES = ["one-room", "attached", "turning-stair", "knob-flat"];
const STRIDE = 5;
const PER_FILE = 10;

const sites: OracleSite[] = [];
beforeAll(() => {
  const seen = new Set<string>();
  for (const f of FILES) {
    const src = readFileSync(join(__dirname, "..", "examples", `${f}.arch`), "utf8").replace(/\r\n/g, "\n");
    sites.push(...oracleSites(f, src, STRIDE, seen, PER_FILE));
  }
}, 120_000);
const line = (s: OracleSite, what: string): string =>
  `${s.id}: ${s.message} | expected ${s.expected.join(" ")} | ${what}`;

it("the sample is large enough to cross the grammar", () => {
  expect(sites.length).toBeGreaterThanOrEqual(30);
});

it("expected leaves out nothing the parser accepts at the position (replace and reparse)", () => {
  const gaps = sites
    .filter((s) => s.omitted.length > 0)
    .map((s) => line(s, `accepted, not listed: ${s.omitted.join(" ")}`));
  expect(gaps).toEqual([]);
});

it("expected lists nothing the parser rejects at the position, but for the named blind spots", () => {
  expect([...NEEDS_WHAT_FOLLOWS.keys()]).toEqual(["section", "floor"]);
  const wrong = sites
    .filter((s) => s.rejected.length > 0)
    .map((s) => line(s, `listed, rejected: ${s.rejected.join(" ")}`));
  expect(wrong).toEqual([]);
});

it("a did-you-mean word is listed where the position reads it, and left out only where it does not", () => {
  const bad = sites.filter((s) => s.hintBad !== undefined).map((s) => line(s, s.hintBad!));
  expect(bad).toEqual([]);
});
