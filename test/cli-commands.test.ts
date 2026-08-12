import { spawn, spawnSync } from "node:child_process";
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
 * `watch` shipped the other kind of hole behind the same gap: it did not watch at all
 * for twenty-five releases. It is the one RESIDENT command, so it is driven with an
 * async `spawn` and bounded polls rather than `spawnSync` — see that block's docblock.
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

/**
 * A plan with a room label we can vary, so a recompile is observable in the output
 * bytes. The labels used below differ in LENGTH as well as content, so the source
 * file's size changes on every save and `watchFile`'s stat poll cannot miss an edit
 * on a filesystem with coarse mtime.
 */
const labelled = (label: string): string =>
  `plan "W" {
  units mm
  wall id=w1 exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  room id=r at (0,0) size 6000x4000 label "${label}"
}
`;

/** A live child process running the real CLI, plus the bookkeeping to end it. */
interface Child {
  stderr: () => string;
  exit: () => { code: number | null; signal: NodeJS.Signals | null } | null;
  kill: (signal: NodeJS.Signals) => void;
}

/**
 * Spawn the CLI ASYNCHRONOUSLY (unlike `run` above) — a resident command cannot be
 * observed with `spawnSync`, which by definition only returns once it is over.
 */
function start(args: string[]): Child {
  const child = spawn(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let err = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (d: string) => {
    err += d;
  });
  // Drained so a full pipe can never be mistaken for a hung watcher.
  child.stdout.resume();
  let exit: { code: number | null; signal: NodeJS.Signals | null } | null = null;
  child.on("exit", (code, signal) => {
    exit = { code, signal };
  });
  return {
    stderr: () => err,
    exit: () => exit,
    kill: (signal) => {
      child.kill(signal);
    },
  };
}

/**
 * Poll for a condition with a bounded deadline, never a fixed sleep — a watch test is
 * exactly the shape that flakes when it waits a guessed interval and hopes. The
 * `what` string is the failure message, so a red run says what it was waiting for
 * rather than just "timed out".
 */
async function until(what: string, pred: () => boolean, deadlineMs = 30000): Promise<void> {
  const end = Date.now() + deadlineMs;
  for (;;) {
    if (pred()) return;
    if (Date.now() >= end) throw new Error(`timed out after ${deadlineMs}ms waiting for: ${what}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

/** Read a file that may be mid-write, or not exist yet; absent/partial reads just retry. */
const peek = (f: string): string => {
  try {
    return readFileSync(f, "utf8");
  } catch {
    return "";
  }
};

describe("CLI — watch", () => {
  /**
   * The inverted KNOWN-GAP pin.
   *
   * For twenty-five releases (v1.1.0 → v1.26.0) `arch watch` did not watch: the v1.1.0
   * switch refactor put every command behind `process.exit(await cmdX(args))`, and
   * `cmdWatch` returned `EXIT.OK` the moment `watchFile()` was installed — so its own
   * dispatcher killed it immediately after it announced the watch, and the callback
   * could never fire. This test used to pin that behaviour, discriminating on `signal`
   * (an unkilled self-exit with status 0 vs. a SIGTERM at the timeout).
   *
   * Those two assertions survive INVERTED — `code` must now be null and `signal` must
   * name the signal WE sent, i.e. the process must be ended from outside and never on
   * its own. That is the exact case that failed, so a re-regression is red here again.
   *
   * The liveness claim is not made by waiting and hoping, though: it is made by doing
   * the thing only a living watcher can do — recompiling twice on save — with every
   * wait a bounded poll.
   */
  it("stays alive and recompiles on save, then ends only when signalled", async () => {
    const dir = tmpDir();
    const file = tmp("w.arch", labelled("Alpha"), dir);
    const out = join(dir, "w.svg");
    const w = start(["watch", file, "-o", out]);
    try {
      await until("the first compile to write the output with Alpha", () => peek(out).includes("Alpha"));
      await until("the watching banner on stderr", () => w.stderr().includes("Ctrl+C to stop"));
      expect(w.stderr()).toContain("watching");

      // The whole point of the command: edit, save, and the artifact follows.
      writeFileSync(file, labelled("Bravissimo"), "utf8");
      await until("a recompile carrying Bravissimo", () => peek(out).includes("Bravissimo"));

      // Twice, because a watcher that fires once and dies is a different bug.
      writeFileSync(file, labelled("Cha"), "utf8");
      await until("a second recompile carrying Cha", () => peek(out).includes("Cha"));

      // It got that far without ever exiting on its own.
      expect(w.exit()).toBe(null);

      // …and it terminates promptly when signalled. (On Windows there are no real
      // signals: libuv turns this into a TerminateProcess, so what is proven there is
      // "an external stop ends it promptly", not Node's SIGTERM handler.)
      w.kill("SIGTERM");
      await until("the process to exit after SIGTERM", () => w.exit() !== null, 15000);
      expect(w.exit()?.code).toBe(null);
      expect(w.exit()?.signal).not.toBe(null);
    } finally {
      // Never leave a child behind, on any path — a stray watcher hangs the CI run.
      if (w.exit() === null) w.kill("SIGKILL");
    }
  }, 90000);

  /**
   * A broken plan must leave you WATCHING, not at a shell prompt: being able to fix the
   * file and re-save is the entire reason the command exists. `cmdWatch` therefore
   * discards the first compile's exit code on purpose, and this pins that it does.
   */
  it("keeps watching after a failing first compile, and compiles the fix", async () => {
    const dir = tmpDir();
    const file = tmp("broken.arch", 'plan "B" {\n  units mm\n  garbage nonsense here\n}\n', dir);
    const out = join(dir, "broken.svg");
    const w = start(["watch", file, "-o", out]);
    try {
      // It reported the error AND still announced the watch.
      await until("the watching banner after a failed first compile", () => w.stderr().includes("Ctrl+C to stop"));
      expect(w.exit()).toBe(null);
      expect(existsSync(out)).toBe(false);

      writeFileSync(file, labelled("Repaired"), "utf8");
      await until("the repaired plan to compile", () => peek(out).includes("Repaired"));

      // SIGINT is the interrupt the banner actually advertises ("Ctrl+C to stop").
      w.kill("SIGINT");
      await until("the process to exit after SIGINT", () => w.exit() !== null, 15000);
      expect(w.exit()?.signal).not.toBe(null);
    } finally {
      if (w.exit() === null) w.kill("SIGKILL");
    }
  }, 90000);

  it("refuses a missing path and stdin with exit 3", () => {
    const none = run(["watch"]);
    expect(none.status).toBe(3);
    expect(none.stderr).toContain("watch needs a file path");

    // `-` cannot be re-read on every save, so it is a usage error, not a one-shot compile.
    // This is the path that must STILL exit even though the command is resident on success.
    const stdin = run(["watch", "-"], MESSY);
    expect(stdin.status).toBe(3);
    expect(stdin.stderr).toContain("watch needs a file path");
    expect(stdin.signal).toBe(null);
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
