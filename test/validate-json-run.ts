/**
 * The runner behind the `validate --json` additivity law (PS5.3, `./cli-validate-next.test.ts`):
 * `cmdValidate` in-process (the real CLI command, not a lookalike) with stdout captured, over every
 * shipped example and every defect-corpus file, read from disk so a new file is covered the day it
 * lands.
 */

import { readdirSync, statSync } from "node:fs";
import { cmdValidate } from "../src/cli/commands-analyze.js";
import { parseArgs } from "../src/cli/io.js";

/** Every `.arch` file the law covers, as forward-slash paths from the repository root, sorted. */
export function validateJsonFiles(): string[] {
  const walk = (dir: string): string[] =>
    readdirSync(dir)
      .sort()
      .flatMap((f) => {
        const p = `${dir}/${f}`;
        return statSync(p).isDirectory() ? walk(p) : f.endsWith(".arch") ? [p] : [];
      });
  const examples = readdirSync("examples")
    .filter((f) => f.endsWith(".arch"))
    .sort()
    .map((f) => `examples/${f}`);
  return [...examples, ...walk("test/defect-corpus")];
}

/**
 * `stdout` without the `summary` key `lint`/`validate --json` open with (PS7.6), byte for byte.
 * The digest laws that hash `validate --json` (`keep-byte-identity`, `keep-digests`) were pinned
 * before the key existed: they measure everything BUT the key, so no pin is re-blessed and the
 * summary is covered where it belongs, by `./lint-summary.test.ts`.
 */
export const withoutSummary = (stdout: string): string => stdout.replace(/^\{\n {2}"summary": "[^"\n]*",\n/, "{\n");

/**
 * `stdout` without the `"stage": "<stage>"` key PS7.1 appends LAST to every `validate --json`
 * diagnostic and intent violation, byte for byte. Only a string-valued `stage` key is removed, and
 * only as the last key of its object, so `--stage`'s `at_stage` block (an object) is never touched.
 */
export const withoutStageKeys = (stdout: string): string =>
  stdout.replace(/,\n +"stage": "(?:brief|rooms|walls|openings|fixtures|drafting)"(?=\n +\})/g, "");

/**
 * What the digest laws that hash `validate --json` (`keep-byte-identity` K1, `keep-digests` K3)
 * measure: the output without the keys added after their pins (PS7.6's `summary`, PS7.1's
 * `stage`), so no pin is re-blessed. Each key is covered where it belongs: `./lint-summary.test.ts`
 * and `./stages.test.ts`.
 */
export const validateDigestView = (stdout: string): string => withoutStageKeys(withoutSummary(stdout));

/** Run `validate <argv…>` in-process; return its exit code and everything it wrote to stdout. */
export function runValidate(argv: string[]): { exit: number; stdout: string } {
  let stdout = "";
  const write = process.stdout.write.bind(process.stdout);
  const writeErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    stdout += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = (() => true) as typeof process.stderr.write;
  try {
    return { exit: cmdValidate(parseArgs(argv)), stdout };
  } finally {
    process.stdout.write = write;
    process.stderr.write = writeErr;
  }
}
