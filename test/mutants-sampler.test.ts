/**
 * The nightly mutant sampler (`scripts/mutants.mjs`, nightly.yml `mutants`, report-only): each
 * operator rewrites a synthetic source the way its header says, the PRNG and the sample are fixed
 * by the seed, the allow-list matches a site exactly, and `--dry-run` lists sampled sites without
 * running vitest. The safety paths run against a throwaway git repository in a temp directory,
 * never the real `src/`: the dirty-tree refusal, the byte-for-byte restore (CRLF included), each
 * verdict with a stubbed runner, the budget, the report written before a failure midway, and the
 * real runner against a fake vitest (timeout, kill, a process that cannot start). The sampler's
 * nightly verdicts themselves are read from the job summary.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error — a zero-dep .mjs script with no type declarations.
import * as sampler from "../scripts/mutants.mjs";

const {
  allowRow,
  applySite,
  classify,
  dateSeed,
  enumerateSites,
  main,
  markdown,
  mulberry32,
  OPERATORS,
  parseAllow,
  runVitest,
  sampleSites,
  tally,
} = sampler;

type Site = {
  file: string;
  line: number;
  column: number;
  operator: string;
  start: number;
  end: number;
  replacement: string;
  before: string;
  after: string;
};

const SRC = [
  "export function f(a: number, b: number): number {",
  "  if (a < b && b >= 2) return a * b;",
  '  const s = "x" + a;',
  "  if (!(a === b)) return a - b / 2;",
  "  return a + b;",
  "}",
  "export function g(): void {",
  "  console.log(1 > 0);",
  "}",
  "export class C {",
  "  constructor() {",
  "    return;",
  "  }",
  "}",
  "",
].join("\n");

const sites = (): Site[] => enumerateSites("synthetic.ts", SRC);
const pick = (operator: string, before: string, after: string): Site => {
  const found = sites().filter((s) => s.operator === operator && s.after === after);
  expect(found, `${operator}: ${after}`).toHaveLength(1);
  const s = found[0] as Site;
  expect(s.before).toBe(before);
  return s;
};

describe("operators", () => {
  it("every operator finds a site in the synthetic source", () => {
    expect(new Set(sites().map((s) => s.operator))).toEqual(new Set(OPERATORS));
  });

  it("boundary: < ↔ <=, > ↔ >=", () => {
    pick("boundary", "if (a < b && b >= 2) return a * b;", "if (a <= b && b >= 2) return a * b;");
    pick("boundary", "if (a < b && b >= 2) return a * b;", "if (a < b && b > 2) return a * b;");
    pick("boundary", "console.log(1 > 0);", "console.log(1 >= 0);");
  });

  it("sign: + ↔ -, * ↔ /, never on a string operand", () => {
    pick("sign", "if (a < b && b >= 2) return a * b;", "if (a < b && b >= 2) return a / b;");
    pick("sign", "if (!(a === b)) return a - b / 2;", "if (!(a === b)) return a + b / 2;");
    pick("sign", "if (!(a === b)) return a - b / 2;", "if (!(a === b)) return a - b * 2;");
    pick("sign", "return a + b;", "return a - b;");
    expect(sites().filter((s) => s.line === 3)).toEqual([]);
  });

  it("negation and equality: !x → x, === ↔ !==", () => {
    pick("negation", "if (!(a === b)) return a - b / 2;", "if ((a === b)) return a - b / 2;");
    pick("equality", "if (!(a === b)) return a - b / 2;", "if (!(a !== b)) return a - b / 2;");
  });

  it("early-return: only a value-returning function body, never a constructor or a void function", () => {
    const er = sites().filter((s) => s.operator === "early-return");
    expect(er.map((s) => s.line)).toEqual([2]);
    pick("early-return", "if (a < b && b >= 2) return a * b;", "return; if (a < b && b >= 2) return a * b;");
  });

  it("constant: a numeric operand of a comparison, n → n+1", () => {
    pick("constant", "if (a < b && b >= 2) return a * b;", "if (a < b && b >= 3) return a * b;");
    pick("constant", "console.log(1 > 0);", "console.log(2 > 0);");
    pick("constant", "console.log(1 > 0);", "console.log(1 > 1);");
    // `b / 2` is arithmetic, not a comparison: its literal is no site.
    expect(sites().filter((s) => s.operator === "constant" && s.line === 4)).toEqual([]);
  });

  it("applySite rewrites exactly the edited span and keeps every other byte", () => {
    for (const s of sites()) {
      const out = applySite(SRC, s);
      expect(out.slice(0, s.start)).toBe(SRC.slice(0, s.start));
      expect(out.slice(s.start + s.replacement.length)).toBe(SRC.slice(s.end));
      expect(out.split("\n")[s.line - 1]?.trim()).toBe(s.after);
    }
  });

  it("a CRLF source prints its lines without the CR", () => {
    const crlf = enumerateSites("crlf.ts", SRC.replace(/\n/g, "\r\n")) as Site[];
    expect(crlf.map((s) => [s.operator, s.before, s.after])).toEqual(
      sites().map((s) => [s.operator, s.before, s.after]),
    );
  });
});

describe("sampling", () => {
  it("mulberry32 is deterministic for a seed and differs across seeds", () => {
    const draw = (seed: number) => {
      const r = mulberry32(seed);
      return Array.from({ length: 5 }, () => r());
    };
    expect(draw(42)).toEqual(draw(42));
    expect(draw(42)).not.toEqual(draw(43));
    for (const x of draw(7)) expect(x >= 0 && x < 1).toBe(true);
  });

  it("the sample is fixed by the seed, without replacement, in source order, capped at the site count", () => {
    const all = sites();
    const a = sampleSites(all, 4, 20261110) as Site[];
    expect(sampleSites(all, 4, 20261110)).toEqual(a);
    expect(new Set(a).size).toBe(4);
    expect([...a].sort((x, y) => x.start - y.start)).toEqual(a);
    expect(sampleSites(all, 1000, 1)).toHaveLength(all.length);
  });

  it("the default seed is the UTC date as YYYYMMDD", () => {
    expect(dateSeed(new Date(Date.UTC(2026, 10, 9, 23, 59)))).toBe(20261109);
  });
});

describe("allow-list", () => {
  it("a row matches only its exact site", () => {
    const s = pick("boundary", "console.log(1 > 0);", "console.log(1 >= 0);");
    const row = { file: s.file, line: s.line, operator: s.operator, before: s.before, after: s.after, reason: "r" };
    expect(allowRow(s, [row])).toBe(row);
    for (const k of ["file", "line", "operator", "before", "after"] as const) {
      expect(allowRow(s, [{ ...row, [k]: k === "line" ? s.line + 1 : `${row[k]}x` }])).toBeUndefined();
    }
  });

  it("a row with no reason is refused; the shipped list parses", () => {
    expect(() => parseAllow('[{"file":"f","line":1,"operator":"sign","before":"a","after":"b","reason":" "}]')).toThrow(
      /no reason/,
    );
    expect(() => parseAllow('[{"file":"f"}]')).toThrow(/no `line`/);
    expect(Array.isArray(parseAllow(readFileSync("test/mutants.allow.json", "utf8")))).toBe(true);
  });
});

describe("the summary table", () => {
  it("escapes every cell character by character: pipe, backslash, backtick, line breaks", () => {
    const results = [
      {
        file: "src/a.ts",
        line: 3,
        operator: "equality",
        before: 'if (s === "a|b\\c`") x();',
        after: 'if (s !== "a|b\\c`") x();',
        verdict: "error",
        reason: "does not compile: x | y\r\nz \\ w",
        killer: "test/a.test.ts › p|q",
        seconds: 1,
      },
    ];
    const md: string = markdown({
      seed: 1,
      sitesTotal: 1,
      dryRun: false,
      final: true,
      budgetMinutes: 85,
      tests: { "src/a.ts": { list: ["test/a.test.ts"], related: 1 } },
      staleAllow: [],
      results,
      ...tally(results),
    });
    const row = md.split("\n").find((l) => l.startsWith("| 1 |")) ?? "";
    expect(row).toContain('`if (s === "a\\|b\\\\c\'") x();`');
    expect(row).toContain("error (does not compile: x \\| y  z \\\\ w)");
    expect(row).toContain("test/a.test.ts › p\\|q");
    // No unescaped pipe inside a cell: splitting on the unescaped ones gives exactly the 7 columns.
    expect(row.split(/(?<!\\)\|/).length).toBe(9);
  });

  it("a glob in --files matches tracked paths, its regex metacharacters taken literally", async () => {
    const out: string[] = [];
    expect(
      await main(["--files", "src/num-form?t.ts", "--mutants", "1", "--dry-run"], { log: (s: string) => out.push(s) }),
    ).toBe(0);
    expect(out.join("\n")).toContain("`src/num-format.ts:");
    const none: string[] = [];
    expect(await main(["--files", "src/num.format*.ts", "--dry-run"], { log: (s: string) => none.push(s) })).toBe(2);
    expect(none.join("\n")).toContain("--files matched nothing");
  });
});

describe("--dry-run", () => {
  it("lists a sampled site of the default files and never runs vitest", async () => {
    const out: string[] = [];
    const code = await main(["--mutants", "1", "--dry-run", "--seed", "1"], {
      log: (s: string) => out.push(s),
      run: () => {
        throw new Error("--dry-run ran vitest");
      },
    });
    expect(code).toBe(0);
    const text = out.join("\n");
    expect(text).toMatch(/1 of \d+ sites sampled; nothing run\./);
    expect(text).toMatch(/\| 1 \| `src\/(num-format|expr)\.ts:\d+` \| [a-z-]+ \| .+ \| not run \|/);
  });

  it("refuses a bad argument with exit 2", async () => {
    const out: string[] = [];
    expect(await main(["--mutants", "0", "--dry-run"], { log: (s: string) => out.push(s) })).toBe(2);
    expect(await main(["--files", "src/no-such-file.ts", "--dry-run"], { log: (s: string) => out.push(s) })).toBe(2);
  });
});

describe("classify (what one vitest run says about a mutant)", () => {
  const root = "/r";
  const file = (status: string, extra: object) => ({ name: "/r/test/x.test.ts", status, ...extra });
  it("a failed test is a kill; a file that failed to load is a kill unless the mutant does not compile", () => {
    expect(classify(0, undefined, root)).toEqual({ status: "pass" });
    expect(classify(1, undefined, root).status).toBe("error");
    expect(
      classify(
        1,
        { testResults: [file("failed", { assertionResults: [{ status: "failed", fullName: "x fails" }] })] },
        root,
      ),
    ).toEqual({ status: "fail", killer: "test/x.test.ts › x fails" });
    expect(
      classify(1, { testResults: [file("failed", { message: "TypeError: lt is not a function" })] }, root),
    ).toEqual({
      status: "fail",
      killer: "test/x.test.ts (failed to load)",
    });
    const noCompile = classify(
      1,
      {
        testResults: [
          file("failed", { message: 'Transform failed with 1 error:\n/r/src/a.ts:2:9: ERROR: Expected ";"' }),
        ],
      },
      root,
    );
    expect(noCompile.status).toBe("error");
    expect(noCompile.reason).toMatch(/^does not compile: Transform failed/);
    expect(classify(1, { testResults: [file("passed", { assertionResults: [] })] }, root)).toEqual({
      status: "error",
      reason: "unhandled error outside any test",
    });
  });
});

describe("safety paths, in a throwaway git repository", () => {
  const SRC = "src/a.ts";
  // CRLF on purpose: the restore must give back these bytes, not a normalised copy.
  const A = [
    "export function lt(a: number, b: number): boolean {",
    "  return a < b;",
    "}",
    "export const big = (n: number): boolean => n > 10;",
    "",
  ].join("\r\n");
  let repo = "";
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" });
  const bytes = () => readFileSync(join(repo, SRC));
  const report = () => JSON.parse(readFileSync(join(repo, "report.json"), "utf8"));
  const verdicts = () => report().results.map((r: { verdict: string }) => r.verdict);
  const argv = (...extra: string[]) => [
    "--files",
    SRC,
    "--mutants",
    "4",
    "--seed",
    "7",
    "--report",
    "report.json",
    ...extra,
  ];

  type Res = { status: string; killer?: string; reason?: string };
  /** A runner that records the source it saw and answers from `plan` (an Error is thrown). */
  const stub = (plan: (Res | Error)[], tick?: () => void) => {
    const seen: string[] = [];
    const run = async (tests: string[]) => {
      expect(tests).toEqual(["test/a.test.ts"]);
      seen.push(readFileSync(join(repo, SRC), "utf8"));
      tick?.();
      const next = plan[seen.length - 1];
      if (next === undefined) throw new Error(`unplanned run ${seen.length}`);
      if (next instanceof Error) throw next;
      return { seconds: 1, ...next };
    };
    return { run, seen };
  };
  const quiet = { log: () => {} };

  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), "archlang-mutants-test-"));
    mkdirSync(join(repo, "src"));
    mkdirSync(join(repo, "test"));
    writeFileSync(join(repo, SRC), A);
    writeFileSync(join(repo, "test/a.test.ts"), 'import { lt } from "../src/a.js";\nlt(1, 2);\n');
    git("init", "-q");
    for (const [k, v] of [
      ["core.autocrlf", "false"],
      ["user.email", "mutants@example.invalid"],
      ["user.name", "mutants"],
      ["commit.gpgsign", "false"],
    ] as const) {
      git("config", k, v);
    }
    git("add", ".");
    git("commit", "-q", "-m", "init");
  });
  afterAll(() => rmSync(repo, { recursive: true, force: true }));

  const sites = (): Site[] => enumerateSites(SRC, A);

  it("the fixture has the four sites the cases below count on", () => {
    expect(sites().map((s) => s.operator)).toEqual(["early-return", "boundary", "boundary", "constant"]);
  });

  it("refuses a target with uncommitted changes (exit 2) and never runs", async () => {
    writeFileSync(join(repo, SRC), `${A}// edit\r\n`);
    try {
      const { run, seen } = stub([]);
      expect(await main(argv(), { root: repo, run, ...quiet })).toBe(2);
      expect(seen).toEqual([]);
    } finally {
      writeFileSync(join(repo, SRC), A);
    }
    expect(git("status", "--porcelain", "--", SRC)).toBe("");
  });

  it("killed, equivalent (allow-listed), survived and timeout; each mutant seen in place; bytes restored", async () => {
    const s = sites();
    const sb = s[1] as Site;
    const row = {
      file: sb.file,
      line: sb.line,
      operator: sb.operator,
      before: sb.before,
      after: sb.after,
      reason: "test",
    };
    writeFileSync(join(repo, "allow.json"), JSON.stringify([row]));
    const summary = join(repo, "summary.md");
    const { run, seen } = stub([
      { status: "pass" },
      { status: "fail", killer: "test/a.test.ts › lt" },
      { status: "pass" },
      { status: "pass" },
      { status: "timeout" },
    ]);
    const code = await main(argv("--allow", "allow.json"), {
      root: repo,
      run,
      env: { GITHUB_STEP_SUMMARY: summary },
      ...quiet,
    });
    expect(code).toBe(0);
    expect(verdicts()).toEqual(["killed", "equivalent (allow-listed)", "survived", "timeout"]);
    expect(seen[0]).toBe(A);
    for (let i = 0; i < 4; i++) {
      expect(seen[i + 1]).toBe(applySite(A, s[i]));
      expect(seen[i + 1]?.split("\r\n")).toHaveLength(A.split("\r\n").length);
    }
    expect(bytes().equals(Buffer.from(A, "utf8"))).toBe(true);
    expect(git("status", "--porcelain", "--", SRC)).toBe("");
    const r = report();
    expect(r.final).toBe(true);
    expect(r.counts).toMatchObject({ killed: 1, equivalent: 1, survived: 1, timeout: 1, pending: 0 });
    const md = readFileSync(summary, "utf8");
    expect(md).toContain("all 1 related test files");
    expect(md).toContain("| killed | test/a.test.ts › lt |");
    expect(md).not.toContain("IN PROGRESS");
    // --fail-on-survivor turns the one survivor that is not allow-listed into exit 1.
    const again = stub([
      { status: "pass" },
      { status: "fail" },
      { status: "pass" },
      { status: "pass" },
      { status: "pass" },
    ]);
    expect(
      await main(argv("--allow", "allow.json", "--fail-on-survivor"), { root: repo, run: again.run, ...quiet }),
    ).toBe(1);
    rmSync(join(repo, "allow.json"));
  });

  it("a red baseline skips the file's mutants instead of calling them killed", async () => {
    const { run, seen } = stub([{ status: "fail", killer: "test/a.test.ts › lt" }]);
    expect(await main(argv(), { root: repo, run, ...quiet })).toBe(0);
    expect(seen).toEqual([A]);
    expect(verdicts()).toEqual(["skipped", "skipped", "skipped", "skipped"]);
    expect(report().results[0].reason).toBe("baseline fail");
  });

  it("starts no run once the budget is spent; the rest are `not run (budget)`", async () => {
    let clock = 0;
    const { run, seen } = stub([{ status: "pass" }, { status: "fail" }], () => {
      clock += 40_000;
    });
    expect(await main(argv("--budget-minutes", "1"), { root: repo, run, now: () => clock, ...quiet })).toBe(0);
    expect(seen).toHaveLength(2);
    expect(verdicts()).toEqual(["killed", "not run (budget)", "not run (budget)", "not run (budget)"]);
  });

  it("a runner failure midway leaves the report so far and the original bytes", async () => {
    rmSync(join(repo, "report.json"), { force: true });
    const { run } = stub([{ status: "pass" }, { status: "fail" }, new Error("boom")]);
    await expect(main(argv(), { root: repo, run, ...quiet })).rejects.toThrow("boom");
    expect(verdicts()).toEqual(["killed", "interrupted", "not run", "not run"]);
    expect(report().results[1].reason).toMatch(/boom/);
    expect(bytes().equals(Buffer.from(A, "utf8"))).toBe(true);
  });

  describe("the real runner, against a fake vitest", () => {
    let fake = "";
    const bin = (body: string) => {
      mkdirSync(join(fake, "node_modules", "vitest"), { recursive: true });
      writeFileSync(join(fake, "node_modules", "vitest", "vitest.mjs"), body);
    };
    beforeAll(() => {
      fake = mkdtempSync(join(tmpdir(), "archlang-mutants-fake-"));
    });
    afterAll(() => rmSync(fake, { recursive: true, force: true }));

    it("reads the kill from the JSON report", async () => {
      bin(
        [
          'import { writeFileSync } from "node:fs";',
          'const out = process.argv.find((a) => a.startsWith("--outputFile.json=")).slice(18);',
          'const name = process.cwd() + "/test/x.test.ts";',
          'const failed = { status: "failed", fullName: "x fails" };',
          'writeFileSync(out, JSON.stringify({ testResults: [{ name, status: "failed", assertionResults: [failed] }] }));',
          "process.exit(1);",
        ].join("\n"),
      );
      expect(await runVitest(["test/x.test.ts"], 30, fake)).toMatchObject({
        status: "fail",
        killer: "test/x.test.ts › x fails",
      });
    });

    it("kills a run past its timeout", async () => {
      bin("setTimeout(() => {}, 60_000);\n");
      const r = await runVitest([], 1, fake);
      expect(r.status).toBe("timeout");
      expect(r.seconds).toBeLessThan(5);
    });

    it("a process that cannot start is `error`, not a crash", async () => {
      const missing = join(fake, "no-such-node-binary");
      expect(existsSync(missing)).toBe(false);
      const r = await runVitest([], 5, fake, missing);
      expect(r.status).toBe("error");
      expect(r.reason).toMatch(/cannot run vitest/);
    });
  });
});
