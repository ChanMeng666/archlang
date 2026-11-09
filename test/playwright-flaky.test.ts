import { describe, expect, it } from "vitest";
// @ts-expect-error — a zero-dep .mjs script with no type declarations.
import { findFlaky } from "../scripts/playwright-flaky.mjs";

const test = (status: string, results: { status: string; error?: { message: string } }[]) => ({
  projectName: "chromium",
  status,
  results,
});

// The shape Playwright's `json` reporter writes: suites nest, specs hold tests, tests hold attempts.
const report = {
  suites: [
    {
      title: "boot.spec.ts",
      file: "boot.spec.ts",
      specs: [
        {
          title: "passes first time",
          file: "boot.spec.ts",
          line: 3,
          tests: [test("expected", [{ status: "passed" }])],
        },
      ],
      suites: [
        {
          title: "share",
          file: "boot.spec.ts",
          specs: [
            {
              title: "copies the link",
              file: "boot.spec.ts",
              line: 10,
              tests: [
                test("flaky", [
                  { status: "failed", error: { message: "\u001b[31mTimeout 5000ms\u001b[0m\n  waiting for locator" } },
                  { status: "passed" },
                ]),
              ],
            },
            {
              title: "always red",
              file: "boot.spec.ts",
              line: 20,
              tests: [
                test("unexpected", [
                  { status: "failed", error: { message: "boom" } },
                  { status: "failed", error: { message: "boom" } },
                ]),
              ],
            },
          ],
        },
      ],
    },
  ],
};

describe("scripts/playwright-flaky.mjs", () => {
  it("lists only the case that failed and then passed, with its first error line", () => {
    expect(findFlaky(report)).toEqual([
      {
        title: "share › copies the link",
        file: "boot.spec.ts",
        line: 10,
        project: "chromium",
        error: "Timeout 5000ms",
      },
    ]);
  });

  it("also catches a failed attempt followed by a pass when status is not flaky", () => {
    const r = {
      suites: [
        {
          title: "a.spec.ts",
          file: "a.spec.ts",
          specs: [
            {
              title: "x",
              file: "a.spec.ts",
              line: 1,
              tests: [test("expected", [{ status: "failed", error: { message: "e" } }, { status: "passed" }])],
            },
          ],
        },
      ],
    };
    expect(findFlaky(r)).toHaveLength(1);
  });

  it("finds nothing in an empty report", () => {
    expect(findFlaky({})).toEqual([]);
    expect(findFlaky({ suites: [] })).toEqual([]);
  });
});
