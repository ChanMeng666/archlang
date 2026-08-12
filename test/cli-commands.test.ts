import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildManifest, compile, describe as describePlan } from "../src/index.js";

/**
 * End-to-end execution of the three shipped commands no test ever invoked:
 * `fmt`, `watch` and `manifest`/`capabilities` (backlog 2.5).
 *
 * The gap is not hypothetical. `format.test.ts` exercises the LIBRARY `format()` and
 * `cli-manifest.test.ts` exercises `buildManifest()`; neither runs the command. `arch fmt`
 * shipped a silent SEMANTIC bug for two releases behind exactly that hole — it dropped a
 * door's kind and its `slide`/`open` clauses, so formatting turned a pocket door into a
 * hinged one (fixed in `a822c70`). The property that would have caught it — *formatting
 * must not change the drawing* — is the centrepiece here, asserted on bytes, not by eye.
 *
 * Spawns the real CLI via the tsx loader, as in `cli.test.ts`.
 */

interface Run {
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

function run(args: string[], input?: string, timeout?: number): Run {
  const r = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
    input,
    encoding: "utf8",
    cwd: process.cwd(),
    ...(timeout !== undefined ? { timeout } : {}),
  });
  return { status: r.status, signal: r.signal, stdout: r.stdout, stderr: r.stderr };
}

const tmpDir = (): string => mkdtempSync(join(tmpdir(), "arch-cmd-"));

const tmp = (name: string, contents: string, dir = tmpDir()): string => {
  const f = join(dir, name);
  writeFileSync(f, contents, "utf8");
  return f;
};

/**
 * Ragged indentation (so `fmt` has real work to do) around the two forms the formatter
 * used to silently drop: a leading door KIND word, and the sliding-family `slide`/`open`
 * clauses that trail the swing.
 */
const MESSY = `plan "F" {
    units mm
  grid 50
      wall id=w1 exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
   room id=r at (0,0) size 6000x4000 label "Hall"
     door id=d1 pocket on w1 at 50% width 900 slide left
  door id=d2 bifold on w1 at 20% width 800 open 0.5
}
`;

describe("CLI — fmt", () => {
  it("formatting does not change the drawing (bytes), and keeps every door kind clause", () => {
    const file = tmp("messy.arch", MESSY);
    const r = run(["fmt", file, "--json"]);
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout) as { ok: boolean; changed: boolean; formatted: string };
    expect(j.ok).toBe(true);
    expect(j.changed).toBe(true);

    // Without `--write`, stdout mode must not touch the file.
    expect(readFileSync(file, "utf8")).toBe(MESSY);

    // The exact clauses the formatter used to drop, printed in the grammar's own order.
    expect(j.formatted).toContain("door id=d1 pocket on w1 at 50% width 900 slide left");
    expect(j.formatted).toContain("door id=d2 bifold on w1 at 20% width 800 open 0.5");

    // The property that matters: same drawing, byte for byte. This is what a dropped
    // `pocket` breaks — the leaf gains a swing arc the author never asked for.
    const before = compile(MESSY, { noCache: true });
    const after = compile(j.formatted, { noCache: true });
    expect(before.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(after.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(after.svg).toBe(before.svg);

    // …and the semantic read agrees, so a failure says WHICH clause was lost.
    expect(describePlan(j.formatted).doors.map((d) => d.kind)).toEqual(describePlan(MESSY).doors.map((d) => d.kind));
    expect(describePlan(j.formatted).doors.map((d) => d.kind)).toEqual(["pocket", "bifold"]);

    // Formatting is idempotent as a pure text operation, before any file IO is involved.
    const again = run(["fmt", "-", "--json"], j.formatted);
    expect(again.status).toBe(0);
    const j2 = JSON.parse(again.stdout) as { changed: boolean; formatted: string };
    expect(j2.changed).toBe(false);
    expect(j2.formatted).toBe(j.formatted);
  }, 60000);

  it("`--write` rewrites the file in place and a second run is a no-op", () => {
    const file = tmp("write.arch", MESSY);
    const w = run(["fmt", file, "--write", "--json"]);
    expect(w.status).toBe(0);
    const j = JSON.parse(w.stdout) as { ok: boolean; changed: boolean; output: string };
    expect(j.ok).toBe(true);
    expect(j.changed).toBe(true);
    expect(j.output).toBe(resolve(file));

    const written = readFileSync(file, "utf8");
    expect(written).not.toBe(MESSY);
    expect(compile(written, { noCache: true }).svg).toBe(compile(MESSY, { noCache: true }).svg);

    // Second pass: human mode, so the "(no changes)" branch is exercised too.
    const again = run(["fmt", file, "--write"]);
    expect(again.status).toBe(0);
    expect(again.stdout).toContain("(no changes)");
    expect(readFileSync(file, "utf8")).toBe(written);
  }, 60000);

  it("never destroys source it cannot parse — an unparseable plan comes back verbatim", () => {
    const broken = 'plan "B" {\n  units mm\n  room at (0,0) size 4000x3000 label "R"\n  garbage nonsense here\n}\n';
    const r = run(["fmt", "-"], broken);
    // `fmt` is deliberately non-gating (it reports no diagnostics), so the only
    // protection an author has is that the bytes survive.
    expect(r.status).toBe(0);
    expect(r.stdout).toBe(broken);
  }, 60000);
});

describe("CLI — watch", () => {
  /**
   * KNOWN GAP — `arch watch` does not watch.
   *
   * `src/cli.ts` dispatches it as `process.exit(await cmdWatch(args))`, and `cmdWatch`
   * returns `EXIT.OK` as soon as `watchFile()` is installed — so the process is killed
   * immediately after announcing that it is watching, and the callback can never fire.
   * (It worked before the v1.1.0 switch refactor, which put every command behind
   * `process.exit(...)`.)
   *
   * Pinned as it behaves rather than as it is documented. The discriminating assertion
   * is `signal`: a genuinely watching process would still be alive at the timeout and
   * come back SIGTERM'd with a null status, so this test goes RED the day it is fixed.
   */
  it("KNOWN GAP: compiles once, says it is watching, then exits — the watcher never fires", () => {
    const dir = tmpDir();
    const file = tmp("w.arch", MESSY, dir);
    const out = join(dir, "w.svg");
    const r = run(["watch", file, "-o", out], undefined, 15000);

    // The first compile is real …
    expect(existsSync(out)).toBe(true);
    expect(r.stdout).toContain("w.svg");
    // … and it announces a watch …
    expect(r.stderr).toContain("watching");
    expect(r.stderr).toContain("Ctrl+C to stop");
    // … but the process ended on its own, unkilled, long before any save could happen.
    expect(r.signal).toBe(null);
    expect(r.status).toBe(0);
  }, 40000);

  it("refuses a missing path and stdin with exit 3", () => {
    const none = run(["watch"]);
    expect(none.status).toBe(3);
    expect(none.stderr).toContain("watch needs a file path");

    // `-` cannot be re-read on every save, so it is a usage error, not a one-shot compile.
    const stdin = run(["watch", "-"], MESSY);
    expect(stdin.status).toBe(3);
    expect(stdin.stderr).toContain("watch needs a file path");
  }, 60000);
});

describe("CLI — manifest / capabilities", () => {
  it("`--json` is buildManifest() verbatim, at the package's own version", () => {
    const r = run(["manifest", "--json"]);
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout) as { version: string; commands: Array<{ name: string }> };

    // The version is not taken on trust from the document being checked.
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
    expect(j.version).toBe(pkg.version);

    // The command prints the builder's document and nothing else — no drift, no extra keys.
    expect(j).toEqual(JSON.parse(JSON.stringify(buildManifest(pkg.version))));

    // `capabilities` is an alias, not a second (drift-prone) document.
    const alias = run(["capabilities", "--json"]);
    expect(alias.status).toBe(0);
    expect(alias.stdout).toBe(r.stdout);
  }, 60000);

  it("human mode summarizes every command the manifest declares", () => {
    const r = run(["manifest"]);
    expect(r.status).toBe(0);
    const m = buildManifest("0.0.0");
    expect(r.stdout).toContain(`${m.commands.length} commands`);
    for (const c of m.commands) expect(r.stdout).toContain(`  ${c.name}`);
    expect(r.stdout).toContain(`formats: ${m.formats.map((f) => f.id).join(", ")}`);
  }, 60000);
});
