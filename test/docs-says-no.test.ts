/**
 * `docs/says-no.md` shows the compiler's real answers to small wrong plans. This keeps it true.
 *
 * `scripts/says-no.ts` runs every `archlang …` command the page shows, in-process, on the plan above
 * it (or on the repository file it names), and renders the reduced output into the page. The page
 * must equal that rendering: a threshold, a message or an example plan that changes turns this red
 * until `npx tsx scripts/says-no.ts --write` is run and the diff read. The profile table is read
 * from `LINT_PROFILES` and `DEFAULT_RULESET`, never typed.
 *
 * Also held here: the page shows six to eight demonstrations, each plan it runs compiles without an
 * error (a warning is the point), and its prose keeps clear of the words the card bans.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";
import { PAGE, renderSaysNo } from "../scripts/says-no.js";

const page = readFileSync(PAGE, "utf8").replace(/\r\n/g, "\n");

describe("docs/says-no.md", () => {
  it("equals what the CLI says about the plans it shows", async () => {
    const { text } = await renderSaysNo(page);
    expect(text).toBe(page);
  }, 120_000);

  it("shows six to eight demonstrations, each on a plan that compiles without an error", async () => {
    const { demos } = await renderSaysNo(page);
    const plans = new Set(demos.filter((d) => d.plan !== undefined).map((d) => d.plan));
    expect(plans.size).toBeGreaterThanOrEqual(6);
    expect(plans.size).toBeLessThanOrEqual(8);
    for (const plan of plans) {
      const errors = compile(plan!).diagnostics.filter((d) => d.severity === "error");
      expect(errors, plan).toEqual([]);
    }
  }, 120_000);

  it("keeps the words the page may not use out of its prose", () => {
    const prose = page
      .split("```")
      .filter((_, i) => i % 2 === 0)
      .join("\n");
    for (const re of [
      /\bfirst\b/i,
      /\bonly\b/i,
      /唯一/,
      /compliance/i,
      /compliant/i,
      /\bpasses\b/i,
      /\bpermit/i,
      /benchmark/i,
      /\bIFC\b/,
    ]) {
      expect(prose, String(re)).not.toMatch(re);
    }
  });
});
