import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { EXIT } from "../src/cli/io.js";
import { buildManifest, compile } from "../src/index.js";
import { runArch } from "./helpers/cli.js";
import { EXERCISED } from "./tables/cli-flags-exercised.js";

/**
 * The CLI flag matrix: every (command, flag) of the manifest is named by a test that exercises it.
 *
 * `cli-help.test.ts` proves the parse table equals the manifest, so a flag is PARSED; nothing in
 * that proof shows the flag DOES anything. The pairs are derived from `buildManifest()` and never
 * retyped; `test/tables/cli-flags-exercised.ts` maps each to the test file that passes the flag
 * to the command, or to a `TODO: <reason>` row. The second half of this file closes the gaps the
 * 2026-11 test audit found (rows that name this file).
 */

const isAscii = (s: string): boolean => [...s].every((ch) => ch.charCodeAt(0) < 128);
const SELF = "test/cli-flag-matrix.test.ts";
const manifest = buildManifest("0.0.0");
const PAIRS = manifest.commands.flatMap((c) =>
  c.flags.map((f) => ({ key: `${c.name} ${f.flag}`, cmd: c.name, flag: f.flag })),
);

describe("the flag matrix — every (command, flag) has an exercising test", () => {
  it("each manifest pair has a row (a new flag adds its row, or a TODO row with the reason)", () => {
    const missing = PAIRS.filter((p) => !(p.key in EXERCISED)).map((p) => p.key);
    expect(
      missing,
      `add a row naming the test that exercises \`${missing[0]}\`, or a TODO row with the reason (test/tables/cli-flags-exercised.ts); missing: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("each row is a manifest pair (a removed flag drops its row)", () => {
    const known = new Set(PAIRS.map((p) => p.key));
    expect(Object.keys(EXERCISED).filter((k) => !known.has(k))).toEqual([]);
  });

  it("each row names an existing test file that mentions the command and the flag, or is a TODO with a reason", () => {
    const bad: string[] = [];
    for (const p of PAIRS) {
      const v = EXERCISED[p.key];
      if (v === undefined) continue;
      if (v.startsWith("TODO")) {
        if (!/^TODO: \S.{9,}/.test(v)) bad.push(`${p.key}: a TODO row needs "TODO: <reason>"`);
        continue;
      }
      if (!/^test\/[\w.-]+\.test\.ts$/.test(v) || !existsSync(v)) {
        bad.push(`${p.key}: "${v}" is not an existing test file`);
        continue;
      }
      const text = readFileSync(v, "utf8");
      if (!text.includes(`"${p.flag}"`) && !text.includes(`${p.flag} `) && !text.includes(`${p.flag}=`))
        bad.push(`${p.key}: ${v} never mentions ${p.flag}`);
      if (!text.includes(`"${p.cmd}"`) && !text.includes(`${p.cmd} `))
        bad.push(`${p.key}: ${v} never mentions ${p.cmd}`);
    }
    expect(bad).toEqual([]);
  });

  it("the rows that name this file are the ones the tests below close", () => {
    const closed = Object.entries(EXERCISED)
      .filter(([, v]) => v === SELF)
      .map(([k]) => k);
    expect(closed.length).toBeGreaterThan(0);
    const src = readFileSync(SELF, "utf8");
    const claimed = new Set(
      [...src.matchAll(/closes: ([^"—]*)/g)].flatMap((m) => m[1]!.split(", ").map((s) => s.trim())),
    );
    for (const k of closed) expect(claimed.has(k), `${k} has no test in ${SELF}`).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The gaps the audit found, closed in-process. Each `it` title lists the pairs it closes as
// `closes: <cmd> <flag>`; the test above checks every SELF row has one.
// ---------------------------------------------------------------------------

const dirs: string[] = [];
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "arch-flags-"));
  dirs.push(d);
  return d;
};
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const OP3D = "test/fixtures/openplan3d";
const plan = (body: string): string => `plan "K" {\n  units mm\n${body}\n}\n`;
const SHELL = "  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }\n";

describe("import", () => {
  it("closes: import --from, import --out, import --json — a web project becomes a compiling .arch at --out", async () => {
    const out = join(tmp(), "two-room.arch");
    const r = await runArch([
      "import",
      "--from",
      "openplan3d",
      `${OP3D}/two-room-web-project.json`,
      "--out",
      out,
      "--json",
    ]);
    expect(r.status).toBe(EXIT.OK);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(true);
    expect(j.output).toBe(out);
    expect(existsSync(out)).toBe(true);
    const c = compile(readFileSync(out, "utf8"));
    expect(c.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("closes: import --format — the format is forced to web or handoff, anything else is a usage error", async () => {
    const out = join(tmp(), "h.arch");
    const ok = await runArch([
      "import",
      "--from",
      "openplan3d",
      "--format",
      "handoff",
      `${OP3D}/handoff-roomplan.json`,
      "-o",
      out,
      "--json",
    ]);
    expect(ok.status).toBe(EXIT.OK);
    expect(JSON.parse(ok.stdout).format).toBe("handoff");
    const bad = await runArch(["import", "--from", "openplan3d", "--format", "nope", `${OP3D}/handoff-roomplan.json`]);
    expect(bad.status).toBe(EXIT.USAGE);
    expect(bad.stderr).toContain('unknown --format "nope"');
  });

  it("a bad input is exit 2 with a --json envelope carrying a catalogued diagnostic; a usage error is exit 3", async () => {
    const r = await runArch(["import", "--from", "openplan3d", "-", "--json"], { input: "{ not json" });
    expect(r.status).toBe(EXIT.USER);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(false);
    expect(j.diagnostics[0].code).toBe("E_IMPORT_FORMAT");
    expect((await runArch(["import", `${OP3D}/handoff-roomplan.json`])).status).toBe(EXIT.USAGE);
    expect((await runArch(["import", "--from", "nope", `${OP3D}/handoff-roomplan.json`])).status).toBe(EXIT.USAGE);
  });

  it("closes: import --quiet — the stderr summary is gone, the file is still written", async () => {
    const dir = tmp();
    const loud = await runArch([
      "import",
      "--from",
      "openplan3d",
      `${OP3D}/two-room-web-project.json`,
      "-o",
      join(dir, "a.arch"),
    ]);
    expect(loud.stderr).toContain("✓");
    const quiet = await runArch([
      "import",
      "--from",
      "openplan3d",
      `${OP3D}/two-room-web-project.json`,
      "-o",
      join(dir, "b.arch"),
      "--quiet",
    ]);
    expect(quiet.status).toBe(EXIT.OK);
    expect(quiet.stderr).toBe("");
    expect(readFileSync(join(dir, "b.arch"), "utf8")).toBe(readFileSync(join(dir, "a.arch"), "utf8"));
  });
});

describe("batch", () => {
  const INPUTS = ["examples/studio.arch", "examples/two-bed.arch", "examples/bungalow.arch"];
  const bytes = (dir: string): Record<string, string> =>
    Object.fromEntries(readdirSync(dir).map((f) => [f, readFileSync(join(dir, f)).toString("base64")]));

  it("closes: batch --jobs, batch --out — one worker and four write byte-identical files", async () => {
    const root = tmp();
    const one = await runArch(["batch", ...INPUTS, "--out", join(root, "j1"), "--jobs", "1"]);
    const four = await runArch(["batch", ...INPUTS, "--out", join(root, "j4"), "--jobs", "4"]);
    expect(one.status).toBe(EXIT.OK);
    expect(four.status).toBe(EXIT.OK);
    const a = bytes(join(root, "j1"));
    expect(Object.keys(a).sort()).toEqual(["bungalow.svg", "studio.svg", "two-bed.svg"]);
    expect(bytes(join(root, "j4"))).toEqual(a);
  });

  it("closes: batch --format, batch --cols, batch --charset — txt output is ASCII at the asked width", async () => {
    const dir = tmp();
    const r = await runArch([
      "batch",
      INPUTS[0]!,
      "--format",
      "txt",
      "--cols",
      "40",
      "--charset",
      "ascii",
      "--out",
      dir,
    ]);
    expect(r.status).toBe(EXIT.OK);
    const txt = readFileSync(join(dir, "studio.txt"), "utf8");
    expect(isAscii(txt)).toBe(true);
    expect(Math.max(...txt.split("\n").map((l) => l.length))).toBeLessThanOrEqual(40);
  });

  it("closes: batch --quiet — the per-file summary on stdout is gone", async () => {
    const dir = tmp();
    const loud = await runArch(["batch", INPUTS[0]!, "-o", join(dir, "l")]);
    expect(loud.stdout).toContain("✓");
    const quiet = await runArch(["batch", INPUTS[0]!, "-o", join(dir, "q"), "--quiet"]);
    expect(quiet.status).toBe(EXIT.OK);
    expect(quiet.stdout).toBe("");
    expect(existsSync(join(dir, "q", "studio.svg"))).toBe(true);
  });
});

describe("compile", () => {
  it("closes: compile --format, compile --cols, compile --charset — the txt shape follows both knobs", async () => {
    const run = (extra: string[]) =>
      runArch(["compile", "examples/studio.arch", "--format", "txt", "-o", "-", ...extra]);
    const ascii = await run(["--charset", "ascii", "--cols", "50"]);
    expect(ascii.status).toBe(EXIT.OK);
    expect(isAscii(ascii.stdout)).toBe(true);
    const lines = (s: string) => s.split("\n").map((l) => l.length);
    expect(Math.max(...lines(ascii.stdout))).toBeLessThanOrEqual(50);
    const wide = await run(["--charset", "ascii", "--cols", "100"]);
    expect(Math.max(...lines(wide.stdout))).toBeGreaterThan(50);
    expect(isAscii((await run(["--charset", "unicode"])).stdout)).toBe(false);
  });
});

describe("md", () => {
  it("closes: md --out, md --format — the block is rendered to the named format beside the output", async () => {
    const dir = tmp();
    const md = join(dir, "in.md");
    writeFileSync(md, '# T\n\n```arch\nplan "A" { units mm room at (0,0) size 4000x3000 label "R" }\n```\n');
    const out = join(dir, "out.md");
    const r = await runArch(["md", md, "--out", out, "--format", "svg"]);
    expect(r.status).toBe(EXIT.OK);
    expect(readdirSync(dir).filter((f) => f.endsWith(".svg"))).toHaveLength(1);
    expect(readFileSync(out, "utf8")).not.toContain("```arch");
  });
});

describe("preview", () => {
  it("closes: preview --out, preview --width, preview --scale — the PNG width follows them", async () => {
    const dir = tmp();
    const width = async (extra: string[]): Promise<number> => {
      const r = await runArch(["preview", "examples/studio.arch", "--out", join(dir, "p.png"), "--json", ...extra]);
      expect(r.status).toBe(EXIT.OK);
      return readFileSync(join(dir, "p.png")).readUInt32BE(16); // the PNG IHDR width
    };
    expect(await width(["--width", "800"])).toBe(800);
    const s1 = await width(["--scale", "1"]);
    const s2 = await width(["--scale", "2"]);
    expect(Math.abs(s2 - s1 * 2)).toBeLessThanOrEqual(1);
    expect(existsSync(join(dir, "p.png"))).toBe(true);
  }, 120000);
});

describe("new", () => {
  it("closes: new --out, new --force, new --quiet, new --json", async () => {
    const dir = tmp();
    const starter = (await runArch(["new"])).stdout;
    expect(starter).toContain("plan");
    expect(JSON.parse((await runArch(["new", "--json"])).stdout).template).toBe(starter);
    const out = join(dir, "s.arch");
    const first = await runArch(["new", "--out", out]);
    expect(first.status).toBe(EXIT.OK);
    expect(first.stdout).toContain("wrote starter plan");
    expect(readFileSync(out, "utf8")).toBe(starter);
    writeFileSync(out, "changed\n");
    const refused = await runArch(["new", "--out", out]);
    expect(refused.status).toBe(EXIT.INTERNAL);
    expect(readFileSync(out, "utf8")).toBe("changed\n");
    const forced = await runArch(["new", "--out", out, "--force", "--quiet"]);
    expect(forced.status).toBe(EXIT.OK);
    expect(forced.stdout).toBe("");
    expect(readFileSync(out, "utf8")).toBe(starter);
  });
});

describe("spec", () => {
  it("closes: spec --json — the envelope carries the spec text", async () => {
    const r = await runArch(["spec", "--json"]);
    expect(r.status).toBe(EXIT.OK);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(true);
    expect(j.spec.trim()).toBe((await runArch(["spec"])).stdout.trim());
  });
});

describe("fix and repair", () => {
  it("closes: fix --force — a pass that would break a hard keep is rolled back unless forced", async () => {
    const file = join(tmp(), "k.arch");
    writeFileSync(
      file,
      plan(
        `${SHELL}  room id=a at (0,0) size 6000x4000\n  door id=d at (3000,600) width 900 wall shell\n  keep offset d from a.top 600`,
      ),
    );
    const applied = async (extra: string[]) =>
      (JSON.parse((await runArch(["fix", file, "--dry-run", "--json", ...extra])).stdout) as { applied: unknown[] })
        .applied.length;
    expect(await applied([])).toBe(0);
    expect(await applied(["--force"])).toBe(1);
  });

  it("closes: repair --out, repair --quiet — the repaired source goes to --out, the summary to stderr unless quiet", async () => {
    const dir = tmp();
    const file = join(dir, "r.arch");
    const src = plan(
      `${SHELL}  room id=a at (0,0) size 6000x4000 label "Studio" uses living\n  furniture id=sofa sofa at (1000,-100) size 2000x900 in a`,
    );
    writeFileSync(file, src);
    const loud = await runArch(["repair", file, "--out", join(dir, "o1.arch")]);
    expect(loud.status).toBe(EXIT.OK);
    expect(loud.stdout).toBe("");
    expect(loud.stderr).toContain("✓");
    expect(readFileSync(join(dir, "o1.arch"), "utf8")).not.toBe(src);
    const quiet = await runArch(["repair", file, "-o", join(dir, "o2.arch"), "--quiet"]);
    expect(quiet.stderr).toBe("");
    expect(readFileSync(join(dir, "o2.arch"), "utf8")).toBe(readFileSync(join(dir, "o1.arch"), "utf8"));
    expect(readFileSync(file, "utf8")).toBe(src);
  });
});
