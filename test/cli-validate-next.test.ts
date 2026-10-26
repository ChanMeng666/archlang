import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { runValidate, validateJsonFiles } from "./validate-json-run.js";

/**
 * `validate` gains `next` (plan-soundness PS5.3).
 *
 * - **The additivity law.** Over every shipped example and every defect-corpus file, and under
 *   plain `--json`, `--strict`, `--intent` and `--profile`+`--taste`, the output with `next` is the
 *   output of the SAME build with `nextDiagnostic` stubbed out (`vi.mock`, so the key is absent),
 *   plus one `next` key appended last, byte for byte, with the same exit code. It needs no stored
 *   baseline, so a new corpus file or lint code cannot turn it red.
 *
 *   Against `main` itself the law was reproduced once, before this change merged: `validate --json`
 *   and `--json --strict` over the then 348 runs (34 examples, 140 corpus files) on
 *   `main@b1f06577`, SHA-256 and exit code, were 348/348 byte-identical once the key was stripped
 *   (by this PR and again by the red team). The pin was then deleted (PR #246 round 1): a stored
 *   golden goes red whenever the corpus grows.
 * - **The flags.** `--profile` and `--taste` take the names `lint --profile` and
 *   `score --taste` take (an unknown name exits 3), feed `next` its profile and taste tiers, and
 *   never change an exit code; `next` is last with `--intent` too; display filters never move
 *   it; the human `next (<tier>):` line is on stderr, and `--quiet` drops it.
 */

const stub = vi.hoisted(() => ({ off: false }));
vi.mock("../src/next.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/next.js")>();
  return {
    ...real,
    nextDiagnostic: (input: Parameters<typeof real.nextDiagnostic>[0]) =>
      stub.off ? undefined : real.nextDiagnostic(input),
  };
});

/** `stdout` minus the trailing `"next"` key, byte for byte; throws if `next` is not the last key. */
function stripNext(stdout: string): string {
  const at = stdout.lastIndexOf('\n  "next": ');
  if (at < 1 || stdout[at - 1] !== ",") throw new Error(`no trailing next key in:\n${stdout}`);
  const keys = Object.keys(JSON.parse(stdout) as object);
  if (keys[keys.length - 1] !== "next") throw new Error(`next is not the last key: ${keys.join(", ")}`);
  return `${stdout.slice(0, at - 1)}\n}\n`;
}

/** Run with `nextDiagnostic` stubbed out: the command exactly as it was without `next`. */
function withoutNext(argv: string[]): { exit: number; stdout: string } {
  stub.off = true;
  try {
    return runValidate(argv);
  } finally {
    stub.off = false;
  }
}

let dir: string;
const brief = (): string => join(dir, "brief.json");
const cleanPlan = (): string => join(dir, "clean.arch");
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "arch-next-"));
  // Nine rooms asked for, fewer in the plan: a gating intent violation.
  writeFileSync(brief(), JSON.stringify({ rooms: 9 }));
  // Lint-clean under the default ruleset; `accessibility-advisory` raises W_DOOR_CLEARANCE (an
  // 800 mm door under its 850 mm minimum); taste scores its daylight below 1.
  writeFileSync(
    cleanPlan(),
    `plan "Studio" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }
  room id=r at (0,0) size 8000x5000 label "Studio" uses living
  door at (4000,5000) width 800 wall shell
  window at (4000,0) width 1500 wall shell
}
`,
  );
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("validate --json · next is purely additive", () => {
  const variants = (): string[][] => [
    ["--json"],
    ["--json", "--strict"],
    ["--json", "--intent", brief()],
    ["--json", "--profile", "accessibility-advisory", "--taste", "generic"],
  ];

  it("the stub really removes the key (the law is not vacuous)", () => {
    expect(withoutNext([cleanPlan(), "--json"]).stdout).not.toMatch(/"next"/);
    expect(withoutNext([cleanPlan(), "--json", "--intent", brief()]).stdout).not.toMatch(/"next"/);
    expect(runValidate([cleanPlan(), "--json"]).stdout).toMatch(/\n {2}"next": null\n\}\n$/);
  });

  it("every file and variant: the output minus next is the output without next, same exit code", () => {
    const files = validateJsonFiles();
    expect(files.length).toBeGreaterThan(150);
    const moved: string[] = [];
    let runs = 0;
    for (const f of files)
      for (const v of variants()) {
        const a = runValidate([f, ...v]);
        const b = withoutNext([f, ...v]);
        runs++;
        if (a.exit !== b.exit || stripNext(a.stdout) !== b.stdout) moved.push(`${f} ${v.join(" ")}`);
      }
    expect(runs).toBe(files.length * 4);
    expect(moved).toEqual([]);
  }, 600_000);
});

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}
function cli(args: string[], input?: string): Run {
  const r = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", "validate", ...args], {
    input,
    encoding: "utf8",
    cwd: process.cwd(),
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

// A validity warning (W_ROOM_VIA_PRIVATE) first in emission order.
const BAD = "test/defect-corpus/circulation-privacy/bedroom-via-bedroom.arch";

describe("validate · next tiers through the CLI", () => {
  it("error: a parse error is next, exit 2", () => {
    const r = cli(["-", "--json"], 'plan "x" { units mm room id=a at (0,0) size 0x }');
    expect(r.status).toBe(2);
    expect(JSON.parse(r.stdout).next).toMatchObject({ tier: "error", code: "E_PARSE" });
  });

  it("warning: a compile-channel warning is next", () => {
    const r = cli(["-", "--json"], 'plan "x" { units mm }');
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).next).toMatchObject({ tier: "warning", code: "W_EMPTY_PLAN" });
  });

  it("validity: the first validity warning, with its span", () => {
    const out = JSON.parse(runValidate([BAD, "--json"]).stdout);
    expect(out.next).toMatchObject({ tier: "validity", code: "W_ROOM_VIA_PRIVATE" });
    expect(out.next.span).toEqual(out.diagnostics.find((d: { code: string }) => d.code === "W_ROOM_VIA_PRIVATE").span);
  });

  it("nothing: null, and no human next line", () => {
    expect(JSON.parse(runValidate([cleanPlan(), "--json"]).stdout).next).toBeNull();
    const h = cli([cleanPlan()]);
    expect(h.status).toBe(0);
    expect(h.stderr).not.toMatch(/next \(/);
  });

  it("--profile: the profile's own warning is next; the diagnostics are the profile's, as lint --profile", () => {
    const r = runValidate([cleanPlan(), "--json", "--profile", "accessibility-advisory"]);
    expect(r.exit).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.next).toMatchObject({ tier: "profile", code: "W_DOOR_CLEARANCE" });
    expect(out.next.message).toMatch(/850 mm/);
    expect(out.diagnostics.map((d: { code: string }) => d.code)).toContain("W_DOOR_CLEARANCE");
    // --strict gates on them, exactly as `lint --profile --strict` does.
    expect(runValidate([cleanPlan(), "--json", "--strict", "--profile", "accessibility-advisory"]).exit).toBe(2);
  });

  it("--profile: a default warning is next in the profile run's words (the text the diagnostics show)", () => {
    const f = "test/defect-corpus/clearances/bench-across-opening.arch";
    const plain = JSON.parse(runValidate([f, "--json"]).stdout).next;
    const out = JSON.parse(runValidate([f, "--json", "--profile", "accessibility-advisory"]).stdout);
    expect(out.next).toMatchObject({ tier: "validity", code: plain.code });
    // The bench in the cased opening is `W_DOORWAY_BLOCKED`'s first since PS2.11e (that rule runs
    // before the path rule): its approach is 450 mm under the profile and 300 mm by default.
    expect(plain.code).toBe("W_DOORWAY_BLOCKED");
    expect(out.next.message).toMatch(/450 mm/);
    expect(plain.message).not.toMatch(/450 mm/);
    const shown = out.diagnostics.find((d: { code: string; span: number[] }) => d.code === out.next.code);
    expect(out.next.message).toBe(shown.message);
    expect(out.next.span).toEqual(shown.span);
  });

  it("--taste: the lowest-scoring criterion is next; never gates", () => {
    const r = runValidate([cleanPlan(), "--json", "--taste", "generic"]);
    expect(r.exit).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(true);
    expect(out.next).toMatchObject({ tier: "taste", code: expect.stringMatching(/^A_/) });
    expect(out.next.hint).toMatch(/ scored 0\.\d+ under generic \(source: /);
    // A higher tier still wins with --taste given.
    expect(JSON.parse(runValidate([BAD, "--json", "--taste", "generic"]).stdout).next.tier).toBe("validity");
  });

  it("--intent: a gating violation is next, and next is still the last key", () => {
    const r = runValidate([cleanPlan(), "--json", "--intent", brief()]);
    expect(r.exit).toBe(2);
    const out = JSON.parse(r.stdout);
    expect(Object.keys(out)).toEqual(["ok", "strict", "diagnostics", "intent", "next"]);
    expect(out.next).toMatchObject({ tier: "intent", code: "E_INTENT_ROOM_COUNT" });
  });

  it("a display filter narrows the diagnostics, never next", () => {
    const all = JSON.parse(runValidate([BAD, "--json"]).stdout).next;
    const filtered = JSON.parse(runValidate([BAD, "--json", "--severity", "error"]).stdout);
    expect(filtered.diagnostics).toEqual([]);
    expect(filtered.next).toEqual(all);
  });

  it("unknown profile names are bad usage (exit 3) with a did-you-mean", () => {
    const p = cli([cleanPlan(), "--profile", "acessibility-advisory"]);
    expect(p.status).toBe(3);
    expect(p.stderr).toMatch(
      /unknown lint profile "acessibility-advisory" \(did you mean "accessibility-advisory"\?\)/,
    );
    const t = cli([cleanPlan(), "--taste", "generik"]);
    expect(t.status).toBe(3);
    expect(t.stderr).toMatch(/unknown taste profile "generik" \(did you mean "generic"\?\)/);
  });

  it("human mode: one next line on stderr (plus its help line); --quiet drops it", () => {
    const h = cli([BAD]);
    expect(h.status).toBe(0);
    const lines = h.stderr.split("\n").filter((l) => l.startsWith("next ("));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^next \(validity\): W_ROOM_VIA_PRIVATE at \d+:\d+: /);
    expect(h.stdout).not.toMatch(/next/);
    expect(cli([BAD, "--quiet"]).stderr).not.toMatch(/next \(/);
  });
});
