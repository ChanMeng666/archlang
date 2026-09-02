import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * CLI integration — the agent-native contract.
 *
 * Spawns the real CLI (via the tsx loader, no build step) and asserts the things an
 * AI agent depends on: `--json` produces parseable stdout, exit codes are
 * deterministic (0 ok · 2 user-source error · 3 bad usage), diagnostics carry the
 * catalog `fix`, and stdin (`-`) / stdout (`-o -`) work for pipe-driven use.
 */

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}

function run(args: string[], input?: string): Run {
  const r = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
    input,
    encoding: "utf8",
    cwd: process.cwd(),
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

const VALID = 'plan "S" { units mm room at (0,0) size 4000x3000 label "R" door at (0,1500) width 900 }';
const BAD = 'plan "B" { units mm room at (0,0) size 0x3000 }';
// Compiles clean (no errors) but lints with warnings: a room with no door/entrance.
const WARN =
  'plan "W" { units mm wall exterior thickness 200 { (0,0) (2000,0) (2000,2000) (0,2000) close } room id=r at (0,0) size 2000x2000 label "R" }';

describe("CLI — agent contract", () => {
  it("`spec` prints the one-prompt spec, exit 0", () => {
    const r = run(["spec"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("ArchLang in one prompt");
  }, 30000);

  it("`context --json` emits the full bundled agent context, exit 0", () => {
    const r = run(["context", "--json"]);
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(true);
    // The bundle stitches together every major section: language spec …
    expect(j.context).toContain("ArchLang in one prompt");
    // … the CLI loop …
    expect(j.context).toContain("CLI loop");
    // … and the error catalog.
    expect(j.context).toContain("E_ROOM_SIZE");
  }, 30000);

  it("`describe - --json` emits parseable facts on a valid plan, exit 0", () => {
    const r = run(["describe", "-", "--json"], VALID);
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(true);
    expect(j.totals.rooms).toBe(1);
  }, 30000);

  it("`compile - --json` on a bad plan: ok:false, fix-carrying diagnostic, exit 2", () => {
    const r = run(["compile", "-", "--json"], BAD);
    expect(r.status).toBe(2);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(false);
    expect(j.diagnostics[0].code).toBe("E_ROOM_SIZE");
    expect(typeof j.diagnostics[0].fix).toBe("string");
  }, 30000);

  it("`validate --strict` fails on warnings (exit 2) but default validate passes (exit 0)", () => {
    const lax = run(["validate", "-", "--json"], WARN);
    expect(lax.status).toBe(0);
    expect(JSON.parse(lax.stdout).ok).toBe(true);
    const strict = run(["validate", "-", "--strict", "--json"], WARN);
    expect(strict.status).toBe(2);
    const j = JSON.parse(strict.stdout);
    expect(j.ok).toBe(false);
    expect(j.strict).toBe(true);
    expect(j.diagnostics.length).toBeGreaterThan(0);
  }, 30000);

  it("`repair - --json` emits corrected source + a change log, exit 0", () => {
    const THROUGH_WALL = `plan "P" {
      units mm grid 50
      wall exterior  thickness 200 { (0,0) (8000,0) (8000,4000) (0,4000) close }
      wall partition thickness 100 { (4000,0) (4000,4000) }
      room id=a at (0,0)    size 4000x4000 label "A"
      room id=b at (4000,0) size 4000x4000 label "B"
      furniture sofa at (3200,1000) size 1000x900
    }`;
    const r = run(["repair", "-", "--json"], THROUGH_WALL);
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(true);
    expect(j.changed).toBe(true);
    expect(j.changes[0].kind).toBe("moved");
    expect(typeof j.source).toBe("string");
  }, 30000);

  it("`compile - -o -` streams SVG to stdout, exit 0", () => {
    const r = run(["compile", "-", "-o", "-"], VALID);
    expect(r.status).toBe(0);
    expect(r.stdout.trimStart().startsWith("<svg")).toBe(true);
  }, 30000);

  it("`explain` on an unknown code is a usage error (exit 3)", () => {
    const r = run(["explain", "E_NOPE", "--json"]);
    expect(r.status).toBe(3);
    expect(JSON.parse(r.stdout).ok).toBe(false);
  }, 30000);

  it("`new` scaffolds a plan that itself validates clean", () => {
    const created = run(["new"]);
    expect(created.status).toBe(0);
    const validated = run(["validate", "-", "--json"], created.stdout);
    expect(validated.status).toBe(0);
    expect(JSON.parse(validated.stdout).ok).toBe(true);
  }, 30000);
});

// ---------------------------------------------------------------------------
// compile's file-writing side effects
// ---------------------------------------------------------------------------

/** The CLI entry, resolved once against the repo root so a case can spawn it in any cwd. */
const CLI = resolve("src/cli.ts");
/**
 * The tsx loader as an absolute file URL. `--import tsx` resolves the bare specifier
 * against the child's CWD, so it cannot be used by a case that runs outside the repo —
 * resolving it here (through tsx's own `exports["."]`, not a hardcoded dist path) is
 * what lets `runIn` spawn the CLI in a scratch directory.
 */
const TSX = pathToFileURL(createRequire(resolve("package.json")).resolve("tsx")).href;

/** Like `run`, but in a chosen working directory — so a stray `out.svg` lands where we can see it. */
function runIn(cwd: string, args: string[], input?: string): Run {
  const r = spawnSync(process.execPath, ["--import", TSX, CLI, ...args], { input, encoding: "utf8", cwd });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** A scratch directory holding one copy of `src`, named `name`. */
function scratch(name: string, src: string): { dir: string; plan: string } {
  const dir = mkdtempSync(join(tmpdir(), "archlang-cli-write-"));
  const plan = join(dir, name);
  copyFileSync(resolve(src), plan);
  return { dir, plan };
}

/**
 * What `compile` puts on disk — pinned in BOTH directions, which nothing did before.
 *
 * `--json` asks for the structured result on stdout; with no `-o` it names no output
 * file, so `compile` writes NOTHING. Until this contract existed it quietly wrote
 * `<stem>.svg` — and one `<stem>.L<n>.svg` per storey — beside the input, which is
 * exactly what a scripted "just check it compiles" loop does to a source tree (it
 * littered this repo's own `examples/` with stray per-level SVGs). The absence of a
 * file is announced positively as `written: false` rather than by a missing key.
 *
 * The other direction matters just as much: every invocation that DOES name a target,
 * and the plain no-flags default, must keep writing exactly what they always wrote —
 * including the multi-storey `.L<n>` fan-out.
 */
describe("CLI — compile file-writing side effects", () => {
  it("`compile <file> --json` (no -o) writes NOTHING and says so", () => {
    const { dir, plan } = scratch("studio.arch", "examples/studio.arch");
    const r = runIn(dir, ["compile", plan, "--json"]);
    expect(r.status).toBe(0);

    // The directory listing is the proof: only the source we put there.
    expect(readdirSync(dir).sort()).toEqual(["studio.arch"]);

    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(true);
    expect(j.written).toBe(false);
    expect(j.output).toBeUndefined();
    // The render still happened, so its size is reported and the facts ride along.
    expect(j.bytes).toBeGreaterThan(0);
    expect(j.summary.totals.rooms).toBeGreaterThan(0);
  }, 30000);

  it("a MULTI-STOREY `compile <file> --json` (no -o) writes no .L<n> files either", () => {
    const { dir, plan } = scratch("house.arch", "examples/two-storey.arch");
    const r = runIn(dir, ["compile", plan, "--json"]);
    expect(r.status).toBe(0);
    expect(readdirSync(dir).sort()).toEqual(["house.arch"]);

    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(true);
    expect(j.written).toBe(false);
    expect(j.outputs).toBeUndefined();
    // Every storey is still rendered and reported — just not to disk.
    expect(j.pages).toHaveLength(2);
    expect(j.pages.map((p: { level: number }) => p.level)).toEqual([1, 2]);
    for (const p of j.pages as Array<{ output?: string; bytes: number }>) {
      expect(p.output).toBeUndefined();
      expect(p.bytes).toBeGreaterThan(0);
    }
  }, 30000);

  it("stdin + `--json` (no -o) no longer drops an `out.svg` in the working directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "archlang-cli-write-"));
    const r = runIn(dir, ["compile", "-", "--json"], VALID);
    expect(r.status).toBe(0);
    expect(readdirSync(dir)).toEqual([]);
    expect(JSON.parse(r.stdout).written).toBe(false);
  }, 30000);

  it("the rule is format-independent: `-f dxf --json` (no -o) writes nothing", () => {
    const { dir, plan } = scratch("studio.arch", "examples/studio.arch");
    const r = runIn(dir, ["compile", plan, "-f", "dxf", "--json"]);
    expect(r.status).toBe(0);
    expect(readdirSync(dir).sort()).toEqual(["studio.arch"]);
    expect(JSON.parse(r.stdout).written).toBe(false);
  }, 30000);

  /**
   * `--error-svg` is the one flag whose whole purpose is to produce an image, so its
   * behaviour under the new rule is a DECISION, pinned here rather than inherited.
   *
   * The card follows the same one rule as every other output: it is written when
   * something names a file. The alternative — putting the card's bytes in the payload
   * when nothing is written — was rejected, because the `--json` envelope reports facts
   * about a render and has never carried content; an unbounded, error-only content key
   * in a deliberately bounded envelope is a worse surprise than a flag that needs `-o`.
   * The pair below is the pin: no file AND no content in the one case, and the flag
   * working exactly as it always did the moment `-o` names a target.
   */
  it("`--error-svg` with `--json` and no -o: no file, no card in the payload, still exit 2", () => {
    const dir = mkdtempSync(join(tmpdir(), "archlang-cli-write-"));
    const plan = join(dir, "bad.arch");
    writeFileSync(plan, BAD, "utf8");
    const r = runIn(dir, ["compile", plan, "--error-svg", "--json"]);
    // The exit code is a contract and does not move: a broken plan is exit 2.
    expect(r.status).toBe(2);
    expect(readdirSync(dir).sort()).toEqual(["bad.arch"]);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(false);
    expect(j.written).toBe(false);
    expect(j.output).toBeUndefined();
    expect(j.diagnostics[0].code).toBe("E_ROOM_SIZE");
    // The card was rendered — `bytes` is its real size — but its content is NOT in the
    // envelope. No key anywhere in the payload carries SVG markup.
    expect(j.bytes).toBeGreaterThan(0);
    expect(r.stdout).not.toContain("<svg");
  }, 30000);

  it("`--error-svg -o <file>` still writes the card for a broken plan, exit 2", () => {
    const dir = mkdtempSync(join(tmpdir(), "archlang-cli-write-"));
    const plan = join(dir, "bad.arch");
    writeFileSync(plan, BAD, "utf8");
    const target = join(dir, "card.svg");
    const r = runIn(dir, ["compile", plan, "--error-svg", "-o", target, "--json"]);
    expect(r.status).toBe(2);
    expect(readdirSync(dir).sort()).toEqual(["bad.arch", "card.svg"]);
    const card = readFileSync(target, "utf8");
    expect(card.startsWith("<svg ")).toBe(true);
    expect(card).toContain("E_ROOM_SIZE");
    const j = JSON.parse(r.stdout);
    expect(j.output).toBe(resolve(target));
    expect(j.written).toBeUndefined();
  }, 30000);

  // --- the other direction: naming a target still writes exactly what it always did ---

  it("`compile <file>` with no flags still writes <stem>.svg beside the input", () => {
    const { dir, plan } = scratch("studio.arch", "examples/studio.arch");
    const r = runIn(dir, ["compile", plan]);
    expect(r.status).toBe(0);
    expect(readdirSync(dir).sort()).toEqual(["studio.arch", "studio.svg"]);
    expect(readFileSync(join(dir, "studio.svg"), "utf8").startsWith("<svg ")).toBe(true);
  }, 30000);

  it("`compile <file> -o <target> --json` writes the target and reports its path", () => {
    const { dir, plan } = scratch("studio.arch", "examples/studio.arch");
    const target = join(dir, "sheet.svg");
    const r = runIn(dir, ["compile", plan, "-o", target, "--json"]);
    expect(r.status).toBe(0);
    expect(readdirSync(dir).sort()).toEqual(["sheet.svg", "studio.arch"]);
    const j = JSON.parse(r.stdout);
    expect(j.output).toBe(resolve(target));
    expect(j.written).toBeUndefined();
    expect(j.bytes).toBe(Buffer.byteLength(readFileSync(target)));
  }, 30000);

  it("`-o` on a multi-storey plan still fans out to <stem>.L<n>.svg, with or without --json", () => {
    const a = scratch("house.arch", "examples/two-storey.arch");
    const withJson = runIn(a.dir, ["compile", a.plan, "-o", join(a.dir, "house.svg"), "--json"]);
    expect(withJson.status).toBe(0);
    expect(readdirSync(a.dir).sort()).toEqual(["house.L1.svg", "house.L2.svg", "house.arch"]);
    const j = JSON.parse(withJson.stdout);
    expect(j.outputs).toEqual([resolve(a.dir, "house.L1.svg"), resolve(a.dir, "house.L2.svg")]);
    expect(j.written).toBeUndefined();

    // …and the human path, which never had an `-o`-less ambiguity to resolve.
    const b = scratch("house.arch", "examples/two-storey.arch");
    const human = runIn(b.dir, ["compile", b.plan]);
    expect(human.status).toBe(0);
    expect(readdirSync(b.dir).sort()).toEqual(["house.L1.svg", "house.L2.svg", "house.arch"]);
  }, 30000);
});
