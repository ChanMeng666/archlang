import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { cmdLint, cmdValidate } from "../src/cli/commands-analyze.js";
import { parseArgs } from "../src/cli/io.js";
import { diagnosticsSummary } from "../src/cli/summary.js";
import { ERROR_CODES } from "../src/error-catalog.js";
import { diagnosticToJson, lint } from "../src/index.js";
import type { Diagnostic } from "../src/index.js";
import { validateJsonFiles, withoutSummary } from "./validate-json-run.js";

/**
 * `lint` and `validate` open with a one-line summary (plan-soundness PS7.6).
 *
 * Three arm-B authors cut `lint --json` with `head -c` and repaired only what they saw. The line
 * is the first key of the JSON and the first line of the text report; it is a function of the
 * diagnostics alone and lives in the CLI layer, so `lint()` and every corpus digest are untouched.
 */

const w = (code: string): Diagnostic => ({ severity: "warning", code, message: "m" });
const e = (code: string): Diagnostic => ({ severity: "error", code, message: "m" });
const rep = (n: number, d: Diagnostic): Diagnostic[] => Array.from({ length: n }, () => d);

describe("diagnosticsSummary", () => {
  it("is `no warnings` when there is nothing to count", () => {
    expect(diagnosticsSummary([])).toBe("no warnings");
  });

  it("counts, singular and plural", () => {
    expect(diagnosticsSummary([w("W_SWING_OBSTRUCTED")])).toBe("1 warning: W_SWING_OBSTRUCTED ×1");
    expect(diagnosticsSummary([e("E_ROOM_SIZE")])).toBe("1 error: E_ROOM_SIZE ×1");
  });

  it("lists codes by descending count", () => {
    const ds = [...rep(3, w("W_ANNOTATION_OVERLAP")), ...rep(4, w("W_SWING_OBSTRUCTED"))];
    expect(diagnosticsSummary(ds)).toBe("7 warnings: W_SWING_OBSTRUCTED ×4, W_ANNOTATION_OVERLAP ×3");
  });

  it("breaks a tie by catalogue order, whatever the input order", () => {
    const [a, b] = ERROR_CODES.filter((c) => c.startsWith("W_")).slice(0, 2) as [string, string];
    expect(ERROR_CODES.indexOf(a)).toBeLessThan(ERROR_CODES.indexOf(b));
    expect(diagnosticsSummary([w(b), w(a)])).toBe(`2 warnings: ${a} ×1, ${b} ×1`);
    expect(diagnosticsSummary([w(a), w(b)])).toBe(`2 warnings: ${a} ×1, ${b} ×1`);
  });

  it("puts errors first, then warnings, each by descending count", () => {
    const ds = [...rep(3, w("W_SWING_OBSTRUCTED")), ...rep(2, e("E_ROOM_SIZE")), e("E_NO_PLAN")];
    const out = diagnosticsSummary(ds);
    expect(out.startsWith("3 errors, 3 warnings: ")).toBe(true);
    const codes = out.slice(out.indexOf(": ") + 2).split(", ");
    expect(codes[0]).toBe("E_ROOM_SIZE ×2");
    expect(codes[2]).toBe("W_SWING_OBSTRUCTED ×3");
    expect(codes).toHaveLength(3);
  });

  it("counts a diagnostic without a code and an uncatalogued code, after the catalogued ones on a tie", () => {
    const ds: Diagnostic[] = [
      { severity: "warning", message: "m" },
      w("W_NOT_IN_THE_CATALOGUE"),
      w("W_SWING_OBSTRUCTED"),
    ];
    expect(diagnosticsSummary(ds)).toBe("3 warnings: W_SWING_OBSTRUCTED ×1, W_NOT_IN_THE_CATALOGUE ×1, uncoded ×1");
  });

  it("is a function of the diagnostics alone: order of arrival does not matter", () => {
    const ds = [w("W_SWING_OBSTRUCTED"), e("E_ROOM_SIZE"), w("W_ANNOTATION_OVERLAP"), w("W_SWING_OBSTRUCTED")];
    expect(diagnosticsSummary([...ds].reverse())).toBe(diagnosticsSummary(ds));
  });
});

/** Run a command in-process; return exit code, stdout and stderr. */
function runIn(cmd: (a: ReturnType<typeof parseArgs>) => number, argv: string[]) {
  let stdout = "";
  let stderr = "";
  const out = process.stdout.write.bind(process.stdout);
  const err = process.stderr.write.bind(process.stderr);
  const text = (c: string | Uint8Array): string => (typeof c === "string" ? c : Buffer.from(c).toString("utf8"));
  process.stdout.write = ((c: string | Uint8Array): boolean => {
    stdout += text(c);
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((c: string | Uint8Array): boolean => {
    stderr += text(c);
    return true;
  }) as typeof process.stderr.write;
  try {
    return { exit: cmd(parseArgs(argv)), stdout, stderr };
  } finally {
    process.stdout.write = out;
    process.stderr.write = err;
  }
}

interface Json {
  summary: string;
  diagnostics: { severity: "error" | "warning"; code: string }[];
}
const FIRST_KEY = '{\n  "summary": "';
const widest = { file: "", bytes: 0, codes: 0 };
let withWarnings = 0;
let fitsInCut = 0;
let total = 0;

describe.each([
  ["lint", cmdLint],
  ["validate", cmdValidate],
] as const)("%s --json · the summary key over the corpus", (name, cmd) => {
  it("is the first key, a function of the diagnostics, and survives a 200-byte cut", () => {
    const files = validateJsonFiles();
    expect(files.length).toBeGreaterThan(150);
    for (const f of files) {
      const { stdout } = runIn(cmd, [f, "--json"]);
      const j = JSON.parse(stdout) as Json;
      expect(Object.keys(j)[0], f).toBe("summary");
      expect(j.summary, f).toBe(diagnosticsSummary(j.diagnostics.map((d) => ({ ...d, message: "" }))));
      expect(stdout.startsWith(FIRST_KEY), f).toBe(true);
      // The cut: the first 200 bytes (what `head -c 200` shows) name the count and the first code.
      const cut = Buffer.from(stdout, "utf8").subarray(0, 200).toString("utf8");
      const count = j.diagnostics.length;
      if (count === 0) {
        expect(cut, f).toContain('"summary": "no warnings"');
        continue;
      }
      const head = j.summary.slice(0, j.summary.indexOf(": "));
      const firstCode = j.summary.slice(head.length + 2).split(" ×")[0]!;
      expect(cut.startsWith(`${FIRST_KEY}${head}: ${firstCode} ×`), f).toBe(true);
      if (name === "lint") {
        withWarnings++;
        if (cut.includes(`${j.summary}"`)) fitsInCut++;
        const codes = new Set(j.diagnostics.map((d) => d.code)).size;
        if (codes > widest.codes) Object.assign(widest, { file: f, bytes: Buffer.byteLength(j.summary), codes });
      }
    }
    if (name === "lint") total = files.length;
  }, 600_000);
});

afterAll(() => {
  console.log(
    `lint-summary: ${total} files, ${withWarnings} with diagnostics, whole summary within the 200-byte cut for ${fitsInCut}; widest ${widest.codes} codes (${widest.bytes} bytes) at ${widest.file}`,
  );
});

describe("the diagnostics are what lint() returns", () => {
  it("lint --json: every diagnostic equals lint()'s, byte for byte, over the corpus", () => {
    let checked = 0;
    for (const f of validateJsonFiles()) {
      const j = JSON.parse(runIn(cmdLint, [f, "--json"]).stdout) as { diagnostics: Diagnostic[] };
      // A plan that does not compile reports its errors instead; the library's lint() is silent.
      if (j.diagnostics.some((d) => d.severity === "error")) continue;
      const src = readFileSync(f, "utf8");
      expect(JSON.stringify(j.diagnostics), f).toBe(JSON.stringify(lint(src).map((d) => diagnosticToJson(src, d))));
      checked++;
    }
    expect(checked).toBeGreaterThan(150);
  }, 600_000);
});

describe("the text report opens with the line", () => {
  const WARN =
    'plan "W" { units mm wall exterior thickness 200 { (0,0) (2000,0) (2000,2000) (0,2000) close } room id=r at (0,0) size 2000x2000 label "R" }';
  const cli = (args: string[], input?: string) => {
    const r = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
      input,
      encoding: "utf8",
      cwd: process.cwd(),
    });
    return { status: r.status, stdout: r.stdout, stderr: r.stderr };
  };

  it("lint: the first line of the report is the summary, before the first diagnostic", () => {
    const r = cli(["lint", "-"], WARN);
    const lines = r.stderr.split("\n");
    expect(lines[0]).toMatch(/^\d+ warnings?: W_[A-Z_]+ ×\d+/);
    expect(lines[1]).toBe("");
    expect(lines[2]).toMatch(/^warning/);
  }, 60_000);

  it("--quiet drops it, and a clean plan prints no summary line (the ok line says it)", () => {
    expect(cli(["lint", "-", "--quiet"], WARN).stderr).toBe("");
    const clean = cli(["lint", "examples/two-bed.arch"]);
    expect(clean.stderr).not.toMatch(/warning/);
    expect(clean.stdout).toBe("✓ ok\n");
  }, 60_000);
});

describe("withoutSummary (the digest suites' view of validate --json)", () => {
  it("removes exactly the first key and nothing else", () => {
    const out = runIn(cmdValidate, ["test/defect-corpus/space-not-enclosed/bath-open-side.arch", "--json"]).stdout;
    const { summary: _summary, ...rest } = JSON.parse(out) as Record<string, unknown>;
    expect(withoutSummary(out)).toBe(`${JSON.stringify(rest, null, 2)}\n`);
    const plain = '{\n  "ok": true\n}\n';
    expect(withoutSummary(plain)).toBe(plain);
  });
});
