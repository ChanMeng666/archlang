import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error — a zero-dep .mjs script with no type declarations.
import { findFlaky, main } from "../scripts/playwright-flaky.mjs";

type Attempt = { status: string; error?: { message: string } };
const test = (status: string, results: Attempt[]) => ({ projectName: "chromium", status, results });
const spec = (title: string, line: number, tests: unknown[], file = "boot.spec.ts") => ({ title, file, line, tests });

// What Playwright's `json` reporter writes: suites nest, specs hold tests, tests hold attempts. A case
// that failed and then passed has test status "flaky" and results [failed, passed].
const flakyAttempts: Attempt[] = [
  { status: "failed", error: { message: "\u001b[31mTimeout 5000ms\u001b[0m\n  waiting for locator" } },
  { status: "passed" },
];
const report = (rootDir?: string, flakySpec = spec("copies the link", 10, [test("flaky", flakyAttempts)])) => ({
  ...(rootDir ? { config: { rootDir } } : {}),
  suites: [
    {
      title: "boot.spec.ts",
      file: "boot.spec.ts",
      specs: [spec("passes first time", 3, [test("expected", [{ status: "passed" }])])],
      suites: [
        {
          title: "share",
          file: "boot.spec.ts",
          specs: [
            flakySpec,
            spec("always red", 20, [
              test("unexpected", [
                { status: "failed", error: { message: "boom" } },
                { status: "failed", error: { message: "boom" } },
              ]),
            ]),
          ],
        },
      ],
    },
  ],
});

describe("findFlaky", () => {
  it("lists only the flaky case, with its first error line", () => {
    expect(findFlaky(report())).toEqual([
      {
        title: "share › copies the link",
        file: "boot.spec.ts",
        line: 10,
        project: "chromium",
        error: "Timeout 5000ms",
      },
    ]);
  });

  it("prefixes the file with config.rootDir made relative to the repo root", () => {
    const root = join(tmpdir(), "repo");
    const [c] = findFlaky(report(join(root, "playground", "e2e")), root);
    expect(c.file).toBe("playground/e2e/boot.spec.ts");
  });

  it("finds nothing in an empty report", () => {
    expect(findFlaky({})).toEqual([]);
    expect(findFlaky({ suites: [] })).toEqual([]);
  });
});

describe("main", () => {
  let dir: string;
  let out: string[];
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "pwflaky-"));
    out = [];
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => {
      out.push(a.join(" "));
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });
  const write = (name: string, body: unknown) => {
    const p = join(dir, name);
    writeFileSync(p, typeof body === "string" ? body : JSON.stringify(body));
    return p;
  };
  const clean = report(undefined, spec("copies the link", 10, [test("expected", [{ status: "passed" }])]));

  it("annotates a flaky case and exits 0 by default, 1 under --fail-on-flaky", () => {
    const p = write("flaky.json", report());
    expect(main([p], {})).toBe(0);
    expect(out).toContain("::warning file=boot.spec.ts,line=10::flaky: share › copies the link (Timeout 5000ms)");
    expect(main(["--fail-on-flaky", p], {})).toBe(1);
  });

  it("exits 0 under --fail-on-flaky when no case is flaky", () => {
    const p = write("clean.json", clean);
    expect(main(["--fail-on-flaky", p], {})).toBe(0);
    expect(out.join("\n")).toContain("no case passed only on a retry");
  });

  it("warns on a missing report and, under --fail-on-flaky, fails when none was readable", () => {
    const missing = join(dir, "none.json");
    expect(main([missing], {})).toBe(0);
    expect(out[0]).toMatch(/^::warning::playwright-flaky: no report at /);
    expect(main(["--fail-on-flaky", missing], {})).toBe(1);
    expect(out.join("\n")).toContain("::error::");
    // One readable clean report alongside a missing one still passes, with the warning.
    out.length = 0;
    expect(main(["--fail-on-flaky", missing, write("clean.json", clean)], {})).toBe(0);
    expect(out[0]).toMatch(/^::warning::/);
  });

  it("treats corrupt JSON as unreadable", () => {
    const p = write("bad.json", "{ not json");
    expect(main([p], {})).toBe(0);
    expect(out[0]).toMatch(/^::warning::playwright-flaky: cannot read /);
    expect(main(["--fail-on-flaky", p], {})).toBe(1);
  });

  it("escapes , : and % in the file property and % and newlines in the message", () => {
    const odd = spec(
      "100% sure",
      7,
      [test("flaky", [{ status: "failed", error: { message: "bad 50%: a,b" } }, { status: "passed" }])],
      "we,ird:100%.spec.ts",
    );
    const p = write("odd.json", report(undefined, odd));
    main([p], {});
    expect(out).toContain(
      "::warning file=we%2Cird%3A100%25.spec.ts,line=7::flaky: share › 100%25 sure (bad 50%25: a,b)",
    );
  });

  it("writes the summary table with the repo-relative file", () => {
    const summary = join(dir, "summary.md");
    main([write("flaky.json", report())], { GITHUB_STEP_SUMMARY: summary });
    const md = readFileSync(summary, "utf8");
    expect(md).toContain("| share › copies the link | chromium | `boot.spec.ts:10` | Timeout 5000ms |");
  });
});
