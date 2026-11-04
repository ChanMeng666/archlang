/**
 * The write-back revision guard, `--expected-hash <sha256>` (card CR5).
 *
 * `fix`, `finish`, `repair -o`, `fmt --write` and `reroll --write` rewrite a `.arch` file, by
 * default the input itself. Two agents editing one file in parallel can then overwrite each other:
 * the second rewrite is computed from bytes the first has already replaced. The guard is the
 * optimistic-concurrency check an edit API makes with a revision id:
 *
 *  - every one of these commands reports `source_hash`, the SHA-256 (lowercase hex) of the exact
 *    bytes it read, and after a file write `written_hash`, the SHA-256 of the bytes it wrote, in
 *    its `--json` result, so a caller can chain calls without hashing anything itself. A result
 *    that carries the rewritten text (`source` of `finish`/`repair`, `formatted` of `fmt`, and the
 *    text `fix`'s `diff` produces) also reports `output_hash`, the SHA-256 of that text's UTF-8:
 *    the revision the file has once the caller writes it there (equal to `written_hash` when the
 *    command wrote it itself);
 *  - `--expected-hash` names a revision of a FILE, so it needs a path: with stdin (`-`) there is
 *    nothing to re-read before a write, and it is refused as bad usage (exit 3);
 *  - with `--expected-hash <hex>` the command refuses, with `E_STALE_SOURCE` and exit 4, when the
 *    bytes it read do not hash to that value, before it computes or writes anything (`--dry-run`
 *    and `-o <other file>` included: a stale read is stale wherever the result goes);
 *  - and just before it writes a file it reads the input again and refuses the same way if the
 *    bytes changed while it computed, so that edit is not clobbered.
 *
 * The re-read narrows the race window to the moment between that read and the write; it is not a
 * lock, and two writers can still interleave inside that moment.
 *
 * What is hashed is the file's bytes as they are on disk: a UTF-8 BOM and CRLF line ends are part
 * of them. For a file that is valid UTF-8, that equals the SHA-256 of the decoded text encoded
 * back to UTF-8, which is what the MCP tools report as `source_hash` for the `source` they receive.
 *
 * Node's `crypto` is used here, in `src/cli/`, and never in core `src/`.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { diagnosticToJson } from "../index.js";
import type { Diagnostic } from "../index.js";
import { type Args, EXIT, emitDiagnosticsHuman, emitJson, ioError, usageError, usageErrorFor } from "./io.js";

/** SHA-256 of `data` as lowercase hex. A string is hashed as its UTF-8 encoding. */
export function sha256Hex(data: Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * The one test seam: called with the input's absolute path after the command has computed its
 * result and immediately before the re-read. Nothing in the CLI sets it; a test sets it to change
 * the file at exactly that moment, which no timing in a second process can do reliably.
 */
export const writeGuardSeam: { beforeRecheck?: (path: string) => void } = {};

/** What a guarded read hands the command. */
export interface GuardedSource {
  /** The input decoded as UTF-8, exactly as `readInput` decodes it. */
  source: string;
  /** SHA-256 of the bytes read: the `source_hash` field. */
  hash: string;
  /**
   * Call immediately before writing a file. With `--expected-hash` and a file input, re-reads the
   * input and returns the exit code to stop with when its bytes changed (or cannot be read);
   * otherwise `undefined`, and the write goes ahead.
   */
  recheck: () => number | undefined;
}

const HEX64 = /^[0-9a-f]{64}$/i;

/** The first 12 hex digits, for a message; the JSON carries the whole hash. */
const short = (hash: string): string => `${hash.slice(0, 12)}…`;

/**
 * The `E_STALE_SOURCE` refusal: one diagnostic, on stderr or in the `--json` envelope, and exit 4.
 * It names both hashes and never prints the file's contents.
 */
function staleSource(
  args: Args,
  input: string,
  expected: string,
  actual: string,
  read: string,
  when: "read" | "write",
): number {
  const name = input === "-" ? "stdin" : input;
  const message =
    when === "read"
      ? `${name} is not the revision --expected-hash names: expected sha256 ${short(expected)}, the bytes read hash to ${short(actual)}; nothing was computed or written`
      : `${name} changed while the command ran: expected sha256 ${short(expected)}, the file now hashes to ${short(actual)}; nothing was written`;
  const d: Diagnostic = { severity: "error", code: "E_STALE_SOURCE", message };
  if (args.json)
    emitJson({
      ok: false,
      code: "E_STALE_SOURCE",
      error: message,
      expected_hash: expected,
      actual_hash: actual,
      source_hash: read,
      diagnostics: [diagnosticToJson("", d)],
    });
  else emitDiagnosticsHuman("", [d], args.quiet);
  return EXIT.STALE;
}

/**
 * Read `input` (a path, or `-` for stdin) for an in-place writer, hash its bytes, and apply
 * `--expected-hash` when it was given. Returns the source, or `{ code }` to exit with: a malformed
 * hash, or one given with stdin input, is bad usage (exit 3, before anything is read), an
 * unreadable input is an IO error (exit 1, the message `withSource` gives), and a mismatch is
 * `E_STALE_SOURCE` (exit 4).
 */
export function readGuarded(args: Args, command: string, input: string): GuardedSource | { code: number } {
  let expected: string | undefined;
  // `--expected-hash` with no value after it parses to an own `undefined`; refusing it keeps a
  // guard the caller asked for from silently not running.
  if (args.expectedHash !== undefined || Object.hasOwn(args, "expectedHash")) {
    // A hash of stdin's bytes says nothing about the file `-o` then overwrites, and stdin cannot be
    // read again before the write: the guard would look like it ran and guard nothing.
    if (input === "-")
      return {
        code: usageErrorFor(
          command,
          "--expected-hash guards a file read and rewritten by path, and stdin (`-`) is not one — pass the file's path instead",
        ),
      };
    const raw = args.expectedHash ?? "";
    if (!HEX64.test(raw))
      return {
        code: usageErrorFor(
          command,
          `--expected-hash takes the SHA-256 of the input file's bytes as 64 hex digits (the \`source_hash\` a --json run reports), got "${raw}"`,
        ),
      };
    expected = raw.toLowerCase();
  }
  let bytes: Buffer;
  try {
    bytes = input === "-" ? readFileSync(0) : readFileSync(resolvePath(input));
  } catch {
    return { code: ioError(`cannot read ${input}`, args.json) };
  }
  const hash = sha256Hex(bytes);
  if (expected !== undefined && expected !== hash)
    return { code: staleSource(args, input, expected, hash, hash, "read") };
  const recheck = (): number | undefined => {
    if (expected === undefined || input === "-") return undefined;
    const path = resolvePath(input);
    writeGuardSeam.beforeRecheck?.(path);
    let now: string;
    try {
      now = sha256Hex(readFileSync(path));
    } catch {
      return ioError(`cannot re-read ${input} before writing; nothing was written`, args.json);
    }
    return now === expected ? undefined : staleSource(args, input, expected, now, hash, "write");
  };
  return { source: bytes.toString("utf8"), hash, recheck };
}

/** `withSource` (`src/cli/io.ts`) for an in-place writer: the same entry ladder, through {@link readGuarded}. */
export function withGuardedSource(
  args: Args,
  command: string,
  run: (read: GuardedSource, input: string) => number,
): number {
  const input = args._[0];
  if (!input) return usageError("missing input file (use a path or `-` for stdin)");
  const read = readGuarded(args, command, input);
  return "code" in read ? read.code : run(read, input);
}
