/** lintReport is `arch lint --json`, byte for byte. */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { lintReport } from "../src/index.js";
import { loadCases } from "./check-set/run.mjs";
import { runArch } from "./helpers/cli.js";
import { worldFor } from "./helpers/world.js";

/**
 * `lintReport` (`src/lint/report.ts`, card CR10) is the document the hosted `POST /check` returns;
 * this file holds it to what the CLI prints for the same input: `JSON.stringify(report, null, 2)`
 * plus a newline is `arch lint <file> --json` stdout, under the same profile and `--strict`. Read
 * over every plan of the public check set, a few examples (two read imports through a World), and
 * the inputs that take the other branches: a plan that does not parse, one that does not resolve,
 * a furniture word the catalogue does not hold and a theme no built-in has.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const EXAMPLES = join(REPO, "examples");

const asCli = (doc: unknown) => `${JSON.stringify(doc, null, 2)}\n`;

async function cli(file: string, profile?: string, strict = false, input?: string): Promise<string> {
  const args = ["lint", file, "--json", ...(profile ? ["--profile", profile] : []), ...(strict ? ["--strict"] : [])];
  return (await runArch(args, input === undefined ? {} : { input })).stdout;
}

describe("lintReport is the CLI's lint --json", () => {
  it("on every plan and twin of the public check set, under its profile", async () => {
    const cases = loadCases();
    expect(cases.length).toBeGreaterThan(0);
    for (const c of cases) {
      for (const file of [c.planPath, c.twinPath]) {
        const profile = c.profile ?? undefined;
        expect(asCli(lintReport(readFileSync(file, "utf8"), { profile })), file).toBe(await cli(file, profile));
      }
    }
  }, 60_000);

  it("on examples, with imports read through the same World, under a profile and --strict", async () => {
    for (const name of ["studio", "two-bed", "imports", "museum-wings"]) {
      const file = join(EXAMPLES, `${name}.arch`);
      const src = readFileSync(file, "utf8");
      const world = worldFor(EXAMPLES);
      expect(asCli(lintReport(src, { world })), name).toBe(await cli(file));
      for (const strict of [false, true]) {
        const got = asCli(lintReport(src, { world, profile: "uk-residential-advisory", strict }));
        expect(got, `${name} uk ${strict}`).toBe(await cli(file, "uk-residential-advisory", strict));
      }
    }
  }, 60_000);

  it("on a plan that does not parse, one that does not resolve, an unknown furniture word and theme", async () => {
    const sources = [
      'plan "Broken" {\n  room at (0,0 size 4000x3000\n}\n',
      // The catalogue's own example of E_OPENING_NIB: a resolve error, so lint() runs nothing.
      'plan "Unresolved" {\n  room id=a at (0,0) size 4000x3000\n  room id=b at (4000,0) size 3000x3000\n  walls from rooms exterior 200 partition 100\n  door between a and b at 500 from start width 800\n}\n',
      'plan "Words" {\n  theme Rendered\n  room id=r at (0,0) size 4000x3000 label "Room"\n  furniture sofaa at (500,500) size 2000x900\n}\n',
    ];
    for (const src of sources) {
      const report = lintReport(src);
      expect(asCli(report), src).toBe(await cli("-", undefined, false, src));
      expect(report.diagnostics.length, src).toBeGreaterThan(0);
    }
    for (const src of sources.slice(0, 2)) {
      expect(lintReport(src).ok, src).toBe(false);
      expect(lintReport(src).coverage, "no coverage when nothing resolved").toBeUndefined();
    }
    const words = lintReport(sources[2]!);
    expect(words.diagnostics.slice(0, 2).map((d) => d.code)).toEqual(["W_UNKNOWN_FURNITURE", "W_UNKNOWN_THEME"]);
    expect([words.ok, lintReport(sources[2]!, { strict: true }).ok]).toEqual([true, false]);
  });
});
