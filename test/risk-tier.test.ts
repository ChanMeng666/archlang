import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs script without type declarations
import { classify } from "../scripts/risk-tier.mjs";

const tier = (...files: string[]) => (classify(files) as { tier: string }).tier;

describe("scripts/risk-tier.mjs", () => {
  it("rates prose-only changes low", () => {
    expect(tier("docs/overview.md", "CHANGELOG.md", ".claude/rules/docs-prose.md")).toBe("low");
  });

  it("rates code, tests, examples and dependencies medium", () => {
    expect(tier("src/compile.ts")).toBe("medium");
    expect(tier("test/keep.test.ts")).toBe("medium");
    expect(tier("examples/studio.arch")).toBe("medium");
    expect(tier("packages/mcp/package.json")).toBe("medium");
    expect(tier("README.md")).toBe("medium");
  });

  it("rates CI, agent permissions, owner rules and frozen artifacts high", () => {
    expect(tier(".github/workflows/ci.yml")).toBe("high");
    expect(tier(".claude/settings.json")).toBe("high");
    expect(tier(".claude/hooks/local-gate.mjs")).toBe("high");
    expect(tier("AGENTS.md")).toBe("high");
    expect(tier("REVIEW.md")).toBe("high");
    expect(tier("brand/archlang-logo-master.svg")).toBe("high");
    expect(tier("dataset/canary.ts")).toBe("high");
    expect(tier("packages/mcp/server.json")).toBe("high");
  });

  it("takes the highest tier any path reaches", () => {
    expect(tier("docs/overview.md", "src/compile.ts")).toBe("medium");
    expect(tier("docs/overview.md", "src/compile.ts", ".github/workflows/ci.yml")).toBe("high");
  });

  it("treats an unclassified path as medium, never low", () => {
    expect(tier("some-new-dir/thing.bin")).toBe("medium");
  });
});
