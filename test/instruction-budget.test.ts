/** the instruction files stay inside their byte budget (EH3.9). */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Agent instruction files are loaded into every session, so their size is a cost on every task.
 *
 * - `AGENTS.md` + `CLAUDE.md` together stay within the figure `AGENTS.md` states about itself
 *   ("Together ≤ 5,000 bytes (`wc -c`)"). The figure is PARSED from that sentence so the doc and the
 *   test cannot drift; a reworded sentence fails `statedBudget` loudly.
 * - `CLAUDE.md` is exactly `@AGENTS.md` and a newline (owner ruling 2026-11-04: AGENTS.md is the
 *   only root instruction file).
 * - Each `.claude/rules/*.md` is at most 5,000 bytes: the largest file when this was written was
 *   4,876 bytes (`archlang-3d.md`), rounded up. A rule file that outgrows this wants splitting by
 *   path, or its detail moved to `docs/agents/`.
 * - All rules together are at most 50,000 bytes: they totalled 41,003 bytes, plus 20 % (49,204),
 *   rounded up. They load by path, so the total is a ceiling on growth, not a per-session cost.
 *
 * Bytes, as `wc -c` counts them (UTF-8), not characters.
 */

const ROOT = join(__dirname, "..");
const bytes = (path: string): number => readFileSync(path).length;

const RULE_FILE_CAP = 5_000;
const RULES_TOTAL_CAP = 50_000;

function statedBudget(agents: string): number {
  const m = /Together ≤ ([\d,]+) bytes \(`wc -c`\)/.exec(agents);
  expect(m, "AGENTS.md no longer states 'Together ≤ N bytes (`wc -c`)'").not.toBeNull();
  return Number((m as RegExpExecArray)[1]?.replace(/,/g, ""));
}

describe("instruction-file budget", () => {
  it("AGENTS.md + CLAUDE.md fit the figure AGENTS.md states", () => {
    const budget = statedBudget(readFileSync(join(ROOT, "AGENTS.md"), "utf8"));
    const total = bytes(join(ROOT, "AGENTS.md")) + bytes(join(ROOT, "CLAUDE.md"));
    expect(total, `AGENTS.md + CLAUDE.md are ${total} bytes; the stated budget is ${budget}`).toBeLessThanOrEqual(
      budget,
    );
  });

  it("CLAUDE.md is exactly @AGENTS.md", () => {
    const text = readFileSync(join(ROOT, "CLAUDE.md"), "utf8").replace(/\r\n/g, "\n");
    expect(text).toBe("@AGENTS.md\n");
  });

  const dir = join(ROOT, ".claude", "rules");
  const files = readdirSync(dir).filter((n) => n.endsWith(".md"));

  it("each .claude/rules file is within its cap", () => {
    expect(files.length).toBeGreaterThan(0);
    for (const name of files) {
      const n = bytes(join(dir, name));
      expect(n, `${name} is ${n} bytes; cap ${RULE_FILE_CAP}`).toBeLessThanOrEqual(RULE_FILE_CAP);
    }
  });

  it("the rules together are within their cap", () => {
    const total = files.reduce((s, name) => s + bytes(join(dir, name)), 0);
    expect(total, `.claude/rules total ${total} bytes; cap ${RULES_TOTAL_CAP}`).toBeLessThanOrEqual(RULES_TOTAL_CAP);
  });
});
