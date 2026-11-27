/**
 * The docs site states a plan's area by the playground's rule (audit U24): net, labelled, when
 * describe() has it, else centreline, labelled; and its counts agree with their nouns. The two
 * build systems share no module, so `docs-site/.vitepress/theme/facts-text.ts` repeats the
 * playground's `areaText` (playground/src/facts-line.js); this holds the copies to the same output,
 * and the live example's line to the words the playground would print for the same plan.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { areaText as docsArea, count, factsText } from "../docs-site/.vitepress/theme/facts-text.js";
import { describe as describePlan } from "../src/index.js";

const example = (name: string) => readFileSync(`examples/${name}.arch`, "utf8").replace(/\r\n?/g, "\n");

describe("the docs' facts words", () => {
  it("say an area exactly as the playground does, net or centreline", async () => {
    // A plain .js module, typed by JSDoc there, as test/playground-examples-rows.test.ts reads plan-label.js.
    // @ts-expect-error — the root typecheck has no allowJs, so it has no declarations for it.
    const { areaText: playgroundArea } = (await import("../playground/src/facts-line.js")) as {
      areaText(net: number | undefined, centreline: number): string;
    };
    for (const [net, centre] of [
      [18.24, 20],
      [undefined, 20],
      [0, 0],
    ] as const)
      expect(docsArea(net, centre)).toBe(playgroundArea(net, centre));
  });

  it("agree a count with its noun", () => {
    expect(count(1, "room")).toBe("1 room");
    expect(count(0, "door")).toBe("0 doors");
    expect(count(3, "window")).toBe("3 windows");
  });

  it("print the one-room example as the playground would open it: net, labelled, singular", () => {
    const t = describePlan(example("one-room")).totals;
    expect(t.net_floor_area_m2).toBeDefined();
    expect(factsText(t)).toBe(`1 room · 1 door · 1 window · ${t.net_floor_area_m2} m² (net)`);
  });
});
