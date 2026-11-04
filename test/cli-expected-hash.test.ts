import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cmdFinish, cmdFix, cmdFmt, cmdRepair, cmdReroll } from "../src/cli/commands-author.js";
import { parseArgs } from "../src/cli/io.js";
import { writeGuardSeam } from "../src/cli/source-hash.js";
import { buildManifest, format } from "../src/index.js";

/**
 * The write-back revision guard, `--expected-hash` (card CR5, `src/cli/source-hash.ts`).
 *
 * Every command that rewrites a `.arch` file reports `source_hash` (the SHA-256 of the bytes it
 * read) and, after a write, `written_hash`; given `--expected-hash`, it refuses with
 * `E_STALE_SOURCE` (exit 4) and writes NOTHING when the file is not that revision, both when it
 * reads and again just before it writes. The commands are driven in-process (fast, and the race
 * needs the seam), and once through the real binary so the exit code is the process's own.
 */

const sha = (b: string | Uint8Array): string => createHash("sha256").update(b).digest("hex");

// A door floating off the wall and a sofa through it: `fix` and `finish` rewrite it, `fmt`
// reformats it (the extra spaces), `repair` moves the sofa, and `repair -o` always writes.
const OFF_WALL = `plan "P" {
  units mm
  grid 50
  wall id=w1 exterior thickness 200 { (0,0) (5000,0) (5000,4000) (0,4000) close }
  room id=r at (0,0)   size 5000x4000 label "Room"
  door id=d at (2500,9000) width 900 wall exterior
  furniture sofa at (-100,1000) size 1800x800
}`;

// Three runs `reroll --write` folds into loops (test/reroll.test.ts's FLAT_ROW).
const FLAT_ROW = format(`plan "Row" {
  units mm
  grid 50
  north up
  wall exterior thickness 200 { (0,0) (4000,0) (4000,5000) (0,5000) close }
  wall exterior thickness 200 { (4000,0) (8000,0) (8000,5000) (4000,5000) close }
  wall exterior thickness 200 { (8000,0) (12000,0) (12000,5000) (8000,5000) close }
  room at (0,0) size 4000x5000 label "Studio"
  room at (4000,0) size 4000x5000 label "Studio"
  room at (8000,0) size 4000x5000 label "Studio"
  door at (2000,5000) width 900 wall exterior hinge left
  door at (6000,5000) width 900 wall exterior hinge left
  door at (10000,5000) width 900 wall exterior hinge left
}`);

/** A wrong but well-formed revision. */
const STALE = "0".repeat(64);

interface Out {
  code: number;
  stdout: string;
  stderr: string;
}

/** Run one command in-process, capturing stdout/stderr and its exit code. */
async function inProcess(run: (argv: string[]) => number | Promise<number>, argv: string[]): Promise<Out> {
  let stdout = "";
  let stderr = "";
  const out = process.stdout.write.bind(process.stdout);
  const err = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((c: string) => {
    stdout += c;
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((c: string) => {
    stderr += c;
    return true;
  }) as typeof process.stderr.write;
  try {
    const code = await run(argv);
    return { code, stdout, stderr };
  } finally {
    process.stdout.write = out;
    process.stderr.write = err;
  }
}

type Runner = (argv: string[]) => number | Promise<number>;
const manifest = buildManifest("0.0.0");
const command = (name: string) => manifest.commands.find((c) => c.name === name)!;
const fix = (argv: string[]) => cmdFix(parseArgs(argv, command("fix")));
const finish = (argv: string[]) => cmdFinish(parseArgs(argv, command("finish")));
const fmt = (argv: string[]) => cmdFmt(parseArgs(argv, command("fmt")));
const repair = (argv: string[]) => cmdRepair(parseArgs(argv, command("repair")));
const reroll = (argv: string[]) => cmdReroll(parseArgs(argv, command("reroll")));

let dir: string;
let file: string;
/** A fixed past mtime, so "nothing was written" is checked on the clock as well as the bytes. */
const PAST = new Date("2020-01-01T00:00:00Z");

function seed(text: string | Uint8Array): void {
  writeFileSync(file, text);
  utimesSync(file, PAST, PAST);
}
const untouched = (bytes: string | Uint8Array): void => {
  expect(readFileSync(file).equals(Buffer.from(bytes))).toBe(true);
  expect(statSync(file).mtimeMs).toBe(PAST.getTime());
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "arch-hash-"));
  file = join(dir, "plan.arch");
  seed(OFF_WALL);
});
afterEach(() => {
  writeGuardSeam.beforeRecheck = undefined;
  rmSync(dir, { recursive: true, force: true });
});

describe("--expected-hash: a stale read refuses before anything is computed or written", () => {
  // The refusal comes from the READ, not from the re-check before writing (which would catch a
  // stale hash too, but only after computing): the command never reaches the re-check.
  let reached = 0;
  beforeEach(() => {
    reached = 0;
    writeGuardSeam.beforeRecheck = () => {
      reached++;
    };
  });
  afterEach(() => {
    expect(reached, "the refusal came from the re-check, not the read").toBe(0);
  });

  it("fix: exit 4, E_STALE_SOURCE naming both hashes, file bytes and mtime unchanged, no contents printed", async () => {
    const r = await inProcess(fix, [file, "--expected-hash", STALE, "--backup"]);
    expect(r.code).toBe(4);
    expect(r.stderr).toContain("error[E_STALE_SOURCE]");
    expect(r.stderr).toContain("is not the revision --expected-hash names");
    expect(r.stderr).toContain("nothing was computed or written");
    expect(r.stderr).toContain(STALE.slice(0, 12));
    expect(r.stderr).toContain(sha(OFF_WALL).slice(0, 12));
    expect(r.stderr).toContain("= fix: Re-read the file");
    expect(r.stdout + r.stderr).not.toContain("door id=d");
    untouched(OFF_WALL);
    expect(existsSync(`${file}.bak`)).toBe(false);
  });

  it("the --json envelope carries the code and both full hashes", async () => {
    const r = await inProcess(fix, [file, "--expected-hash", STALE, "--json"]);
    expect(r.code).toBe(4);
    const j = JSON.parse(r.stdout);
    expect(j).toMatchObject({
      ok: false,
      code: "E_STALE_SOURCE",
      expected_hash: STALE,
      actual_hash: sha(OFF_WALL),
      source_hash: sha(OFF_WALL),
    });
    expect(j.diagnostics).toHaveLength(1);
    expect(j.diagnostics[0]).toMatchObject({ code: "E_STALE_SOURCE", severity: "error" });
    expect(j.diagnostics[0].fix).toMatch(/pass the new hash/);
    expect(r.stdout).not.toContain("door id=d");
    untouched(OFF_WALL);
  });

  it("--dry-run is checked too: a stale read is stale wherever the result goes", async () => {
    const r = await inProcess(fix, [file, "--dry-run", "--json", "--expected-hash", STALE]);
    expect(r.code).toBe(4);
    expect(JSON.parse(r.stdout).code).toBe("E_STALE_SOURCE");
    const f = await inProcess(finish, [file, "--dry-run", "--expected-hash", STALE]);
    expect(f.code).toBe(4);
    untouched(OFF_WALL);
  });

  it("-o <other file> is checked too, and the other file is never created", async () => {
    const other = join(dir, "other.arch");
    for (const run of [fix, finish, repair]) {
      const r = await inProcess(run, [file, "-o", other, "--expected-hash", STALE]);
      expect(r.code).toBe(4);
      expect(existsSync(other)).toBe(false);
    }
    untouched(OFF_WALL);
  });

  it("every in-place writer refuses: finish, repair -o <input>, fmt --write, reroll --write", async () => {
    for (const [run, argv] of [
      [finish, [file]],
      [repair, [file, "-o", file]],
      [fmt, [file, "--write"]],
    ] as const) {
      const r = await inProcess(run, [...argv, "--expected-hash", STALE]);
      expect(r.code).toBe(4);
      expect(r.stderr).toContain("E_STALE_SOURCE");
      untouched(OFF_WALL);
    }
    seed(FLAT_ROW);
    const r = await inProcess(reroll, [file, "--write", "--json", "--expected-hash", STALE]);
    expect(r.code).toBe(4);
    expect(JSON.parse(r.stdout).code).toBe("E_STALE_SOURCE");
    untouched(FLAT_ROW);
  });

  it("a malformed or missing hash is bad usage (exit 3), never a guard that silently does not run", async () => {
    for (const bad of [["--expected-hash", "abc123"], ["--expected-hash", `${sha(OFF_WALL)}0`], ["--expected-hash"]]) {
      const r = await inProcess(fix, [file, ...bad]);
      expect(r.code, bad.join(" ")).toBe(3);
      expect(r.stderr).toContain("--expected-hash takes the SHA-256");
    }
    untouched(OFF_WALL);
  });

  it("stdin input is bad usage (exit 3): a hash of stdin guards nothing about the -o file it overwrites", async () => {
    // The refusal comes before anything is read: an in-process read of fd 0 would block the test.
    const target = join(dir, "target.arch");
    writeFileSync(target, "precious");
    for (const [run, extra] of [
      [fix, ["-o", target]],
      [finish, ["-o", target]],
      [repair, ["-o", target]],
      [fmt, ["--write"]],
      [reroll, ["--write"]],
    ] as const) {
      const r = await inProcess(run, ["-", ...extra, "--expected-hash", sha(OFF_WALL)]);
      expect(r.code).toBe(3);
      expect(r.stderr).toContain("--expected-hash guards a file read and rewritten by path");
    }
    expect(readFileSync(target, "utf8")).toBe("precious");
  });
});

describe("--expected-hash: a matching read writes, and reports the revisions", () => {
  it("fix writes; source_hash is the bytes read and written_hash the bytes now on disk", async () => {
    const r = await inProcess(fix, [file, "--expected-hash", sha(OFF_WALL), "--json"]);
    expect(r.code).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.wrote).toBe(true);
    const now = readFileSync(file);
    expect(now.toString("utf8")).toContain("door id=d on w1 at");
    expect(j.source_hash).toBe(sha(OFF_WALL));
    expect(j.written_hash).toBe(sha(now));
    // The handle chains: the written hash is the next call's expected hash.
    const again = await inProcess(fix, [file, "--expected-hash", j.written_hash, "--json"]);
    expect(again.code).toBe(0);
    expect(JSON.parse(again.stdout).source_hash).toBe(j.written_hash);
  });

  it("an upper-case hash is the same hash", async () => {
    const r = await inProcess(fmt, [file, "--write", "--expected-hash", sha(OFF_WALL).toUpperCase(), "--json"]);
    expect(r.code).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.changed).toBe(true);
    expect(j.written_hash).toBe(sha(readFileSync(file)));
  });

  it("every command reports source_hash without the flag, and written_hash only after a write", async () => {
    const h = sha(OFF_WALL);
    const runs: Array<[Runner, string[], boolean]> = [
      [fix, [file, "--dry-run", "--json"], false],
      [finish, [file, "--dry-run", "--json"], false],
      [repair, [file, "--json"], false],
      [fmt, [file, "--json"], false],
      [reroll, [file, "--json"], false],
    ];
    for (const [run, argv, wrote] of runs) {
      const j = JSON.parse((await inProcess(run, argv)).stdout);
      expect(j.source_hash, argv.join(" ")).toBe(h);
      expect("written_hash" in j, argv.join(" ")).toBe(wrote);
    }
    untouched(OFF_WALL);
    const f = JSON.parse((await inProcess(finish, [file, "--json"])).stdout);
    expect(f.wrote).toBe(true);
    expect(f.source_hash).toBe(h);
    expect(f.written_hash).toBe(sha(readFileSync(file)));
  });

  it("output_hash is the hash of the rewritten text a result carries; written_hash equals it when the command wrote it", async () => {
    // A result that hands back text: `output_hash` is that text's hash, NOT the input's, and is the
    // file's revision once the caller writes the text there.
    const texts: Array<[Runner, string[], (j: Record<string, string>) => string]> = [
      [finish, [file, "--dry-run", "--json"], (j) => j.source!],
      [repair, [file, "--json"], (j) => j.source!],
      [fmt, [file, "--json"], (j) => j.formatted!],
    ];
    for (const [run, argv, text] of texts) {
      const j = JSON.parse((await inProcess(run, argv)).stdout) as Record<string, string>;
      expect(j.source_hash, argv.join(" ")).toBe(sha(OFF_WALL));
      expect(j.output_hash, argv.join(" ")).toBe(sha(text(j)));
      expect(j.output_hash, argv.join(" ")).not.toBe(j.source_hash);
      // Write the returned text as an agent would, and the CLI reads that revision back.
      writeFileSync(join(dir, "mine.arch"), text(j));
      const back = JSON.parse((await inProcess(fmt, [join(dir, "mine.arch"), "--json"])).stdout);
      expect(back.source_hash, argv.join(" ")).toBe(j.output_hash);
    }
    untouched(OFF_WALL);
    // `fix --dry-run` carries its result as a diff; `output_hash` is the text that diff produces,
    // so a real run writes exactly that revision.
    const dry = JSON.parse((await inProcess(fix, [file, "--dry-run", "--json"])).stdout);
    expect(dry.output_hash).not.toBe(dry.source_hash);
    for (const run of [fix, finish]) {
      seed(OFF_WALL);
      const j = JSON.parse((await inProcess(run, [file, "--json"])).stdout);
      expect(j.wrote).toBe(true);
      expect(j.written_hash).toBe(sha(readFileSync(file)));
      expect(j.output_hash).toBe(j.written_hash);
      if (run === fix) expect(j.output_hash).toBe(dry.output_hash);
    }
  });

  it("the hash is of the file's exact bytes: a BOM and CRLF line ends are part of it", async () => {
    for (const bytes of [
      Buffer.from(OFF_WALL.replaceAll("\n", "\r\n"), "utf8"),
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(OFF_WALL, "utf8")]),
    ]) {
      seed(bytes);
      const j = JSON.parse((await inProcess(fmt, [file, "--json"])).stdout);
      expect(j.source_hash).toBe(sha(bytes));
      expect(j.source_hash).not.toBe(sha(OFF_WALL));
    }
  });
});

describe("--expected-hash: a change made while the command computed is caught, not clobbered", () => {
  const THEIRS = `${OFF_WALL}\n# another agent's edit\n`;

  it("fix, finish, fmt --write, repair -o and reroll --write re-read the input just before writing", async () => {
    const cases: Array<[Runner, string[], string]> = [
      [fix, [file, "--backup", "--json"], OFF_WALL],
      [finish, [file, "--json"], OFF_WALL],
      [fmt, [file, "--write", "--json"], OFF_WALL],
      // `repair --json` never writes (it returns `source`), so its write is the human-mode one.
      [repair, [file, "-o", file], OFF_WALL],
      [reroll, [file, "--write", "--json"], FLAT_ROW],
    ];
    for (const [run, argv, start] of cases) {
      seed(start);
      // The other writer lands at the last moment the guard can see it: after the result is
      // computed, before the re-read.
      let fired = 0;
      writeGuardSeam.beforeRecheck = (path) => {
        fired++;
        expect(path).toBe(file);
        writeFileSync(path, THEIRS);
      };
      const json = argv.includes("--json");
      const r = await inProcess(run, [...argv, "--expected-hash", sha(start)]);
      writeGuardSeam.beforeRecheck = undefined;
      expect(fired, argv.join(" ")).toBe(1);
      expect(r.code, argv.join(" ")).toBe(4);
      if (json) {
        const j = JSON.parse(r.stdout);
        expect(j).toMatchObject({
          code: "E_STALE_SOURCE",
          expected_hash: sha(start),
          actual_hash: sha(THEIRS),
          source_hash: sha(start),
        });
        expect(j.error).toContain("changed while the command ran");
      } else {
        expect(r.stderr).toContain("error[E_STALE_SOURCE]");
        expect(r.stderr).toContain("changed while the command ran");
        expect(r.stderr).toContain(sha(THEIRS).slice(0, 12));
      }
      // Their edit survives, byte for byte, and no backup of it was taken.
      expect(readFileSync(file, "utf8")).toBe(THEIRS);
      expect(existsSync(`${file}.bak`)).toBe(false);
    }
  });

  it("control: the same runs with the file left alone write their result (the seam itself changes nothing)", async () => {
    let calls = 0;
    writeGuardSeam.beforeRecheck = () => {
      calls++;
    };
    const r = await inProcess(fix, [file, "--expected-hash", sha(OFF_WALL), "--json"]);
    expect(r.code).toBe(0);
    expect(calls).toBe(1);
    expect(readFileSync(file, "utf8")).toContain("door id=d on w1 at");
  });

  it("without the flag there is no re-read at all", async () => {
    let calls = 0;
    writeGuardSeam.beforeRecheck = () => {
      calls++;
    };
    expect((await inProcess(fix, [file])).code).toBe(0);
    expect(calls).toBe(0);
  });
});

describe("--expected-hash through the real binary", () => {
  it("exits 4 and leaves the file untouched", () => {
    const r = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", "fix", file, "--expected-hash", STALE], {
      encoding: "utf8",
      cwd: process.cwd(),
    });
    expect(r.status).toBe(4);
    expect(r.stderr).toContain("E_STALE_SOURCE");
    untouched(OFF_WALL);
  }, 30000);
});
