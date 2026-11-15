/** scripts/risk-tier.mjs. */

import { describe, expect, it } from "vitest";
// @ts-expect-error — a zero-dep .mjs script with no type declarations.
import { classify } from "../scripts/risk-tier.mjs";

const tier = (...files: string[]) => (classify(files) as { tier: string }).tier;

describe("scripts/risk-tier.mjs", () => {
  it("rates internal prose low", () => {
    expect(tier("docs/plans/README.md", ".claude/rules/docs-prose.md")).toBe("low");
    expect(tier("CONTRIBUTING.md", ".github/ISSUE_TEMPLATE/bug.md")).toBe("low");
  });

  it("rates code, tests, examples, published and public text medium", () => {
    expect(tier("src/compile.ts")).toBe("medium");
    expect(tier("test/keep.test.ts")).toBe("medium");
    expect(tier("examples/studio.arch")).toBe("medium");
    expect(tier("packages/mcp/package.json")).toBe("medium");
    expect(tier("README.md")).toBe("medium");
    expect(tier("docs-site/index.md")).toBe("medium");
    expect(tier("docs/overview.md")).toBe("medium");
    expect(tier("docs/adr/0030-3d-as-downstream-package.md")).toBe("medium");
    expect(tier("packages/mcp/README.md")).toBe("medium");
    expect(tier("CHANGELOG.md")).toBe("medium");
  });

  it("rates the review policy itself high", () => {
    expect(tier("docs/agents/commands.md")).toBe("high");
    expect(tier("scripts/risk-tier.mjs")).toBe("high");
    expect(tier("REVIEW.md")).toBe("high");
  });

  it("rates what CI runs and checks high", () => {
    expect(tier(".github/workflows/ci.yml")).toBe("high");
    expect(tier(".github/dependabot.yml")).toBe("high");
    expect(tier("package.json")).toBe("high");
    expect(tier("vitest.config.ts")).toBe("high");
    expect(tier("scripts/check-test-wiring.mjs")).toBe("high");
    expect(tier("scripts/check-drift.ts")).toBe("high");
    expect(tier("bench/baseline.json")).toBe("high");
    expect(tier("playground/e2e/startup-chunks.baseline.json")).toBe("high");
    expect(tier(".gitleaksignore")).toBe("high");
  });

  it("rates the merge machinery high, but not its tests or the shard-balance table", () => {
    expect(tier("scripts/ci-proven.mjs")).toBe("high");
    expect(tier("scripts/merge-train.mjs")).toBe("high");
    expect(tier("scripts/sync-main.mjs")).toBe("high");
    expect(tier("scripts/gate-select.mjs")).toBe("high");
    expect(tier("scripts/nearest-tests.mjs")).toBe("high");
    expect(tier("scripts/workspaces.mjs")).toBe("high");
    expect(tier("test/sequencer.ts")).toBe("high");
    // Anchored: a neighbour of a machinery script is not machinery.
    expect(tier("scripts/gate-select-x.mjs")).toBe("medium");
    expect(tier("scripts/merge-train.test.mjs")).toBe("medium");
    // Tests of a high script stay medium, as test/risk-tier.test.ts does; durations move balance only.
    expect(tier("test/sequencer.test.ts")).toBe("medium");
    expect(tier("test/ci-proven.test.ts")).toBe("medium");
    expect(tier("test/merge-train.test.ts")).toBe("medium");
    expect(tier("test/sync-main.test.ts")).toBe("medium");
    expect(tier("test/gate-select.test.ts")).toBe("medium");
    expect(tier("test/e2e-shards.test.ts")).toBe("medium");
    expect(tier("test/.durations.json")).toBe("medium");
  });

  it("rates permissions, owner rules, frozen artifacts and deploy config high", () => {
    expect(tier(".claude/settings.json")).toBe("high");
    expect(tier(".claude/hooks/local-gate.mjs")).toBe("high");
    expect(tier("AGENTS.md")).toBe("high");
    expect(tier("brand/archlang-logo-master.svg")).toBe("high");
    expect(tier("dataset/canary.ts")).toBe("high");
    expect(tier("packages/mcp/server.json")).toBe("high");
    expect(tier("playground/wrangler.jsonc")).toBe("high");
    expect(tier("playground/public/_headers")).toBe("high");
  });

  it("does not let a path form lower a tier", () => {
    expect(tier("docs\\agents\\iron-laws.md")).toBe("high");
    expect(tier("./AGENTS.md")).toBe("high");
    expect(tier(".github\\workflows\\ci.yml")).toBe("high");
  });

  it("takes the highest tier any path reaches; an unnamed path is medium", () => {
    expect(tier("docs/plans/README.md", "src/compile.ts")).toBe("medium");
    expect(tier("docs/plans/README.md", ".github/workflows/ci.yml")).toBe("high");
    expect(tier("some-new-dir/thing.bin")).toBe("medium");
  });
});
