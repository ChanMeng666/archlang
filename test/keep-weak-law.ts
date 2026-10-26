/**
 * The weak `keep` law's measurement (ADR 0033 decision 7, PS4.3 design §7 K1), importable without
 * vitest: one digest body, run by the test (`./keep-byte-identity.test.ts`) and by the baseline
 * generator that measured `./keep-byte-identity-baseline.ts` on the tree BEFORE the `keep`
 * statement existed. Two callers, one body, no lookalike (`./byte-identity-digest.ts`).
 *
 * The payload is every surface a keep could leak into, per file, joined by a single space:
 *
 *  1. {@link allStoreysDiagnosticsPayload}: every storey's SVG, `describe()`, `lint()` and
 *     `compile().diagnostics` with its order;
 *  2. `describe(…, { facts: ["depends"] })`;
 *  3. `validate --json`, the real CLI command in-process, with its exit code;
 *  4. `impact --json --against <the file itself>`, and, when the file binds a top-level numeric
 *     `let`, `impact --json --set <name>=<value + 100>`, each with its exit code.
 *
 * Beside the digest, the resolver's evaluation-step count of the whole resolution (every storey),
 * which a keep-free plan must not move either.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { cmdImpact, cmdValidate } from "../src/cli/commands-analyze.js";
import { parseArgs } from "../src/cli/io.js";
import { link } from "../src/import.js";
import { compile, describe, lint } from "../src/index.js";
import { evaluationSteps, resolveAll } from "../src/ir.js";
import { parse } from "../src/parser.js";
import { BUILTIN_REGISTRY } from "../src/registry.js";
import type { World } from "../src/world.js";
import { withoutSummary } from "./validate-json-run.js";
import { allStoreysDiagnosticsPayload, type CompilerApi } from "./byte-identity-payload.js";

const API: CompilerApi = { compile, describe, lint };

/** The directories the law covers: the examples, the eval goldens and the plan corpora. */
export const KEEP_WEAK_LAW_ROOTS = [
  "examples",
  "eval/goldens",
  "test/defect-corpus",
  "test/taste-corpus",
  "docs/plans/plan-soundness/audits/first-contact-plans",
  "docs/plans/plan-soundness/repro",
] as const;

/** Every `.arch` file under {@link KEEP_WEAK_LAW_ROOTS} (`examples/` top level only: `examples/lib`
 *  holds modules the examples import), forward-slash paths from the repository root, sorted. */
export function keepWeakLawFiles(): string[] {
  const walk = (dir: string, deep: boolean): string[] =>
    readdirSync(dir)
      .sort()
      .flatMap((f) => {
        const p = `${dir}/${f}`;
        if (statSync(p).isDirectory()) return deep ? walk(p, deep) : [];
        return f.endsWith(".arch") ? [p] : [];
      });
  return KEEP_WEAK_LAW_ROOTS.flatMap((r) => walk(r, r !== "examples"));
}

function worldFor(file: string): World {
  const dir = dirname(resolvePath(file));
  return {
    read: (p) => {
      try {
        return readFileSync(resolvePath(dir, p), "utf8");
      } catch {
        return null;
      }
    },
    now: () => new Date(0),
  };
}

/** Run a CLI command in-process; its exit code and everything it wrote to stdout. */
function runCli(cmd: (a: ReturnType<typeof parseArgs>) => number, argv: string[]): string {
  let stdout = "";
  const write = process.stdout.write.bind(process.stdout);
  const writeErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    stdout += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = (() => true) as typeof process.stderr.write;
  try {
    const exit = cmd(parseArgs(argv));
    return `${exit}\n${withoutSummary(stdout)}`;
  } finally {
    process.stdout.write = write;
    process.stderr.write = writeErr;
  }
}

/** The first top-level numeric `let` of a source, as `name=value+100`, or undefined. */
export function firstLetBump(src: string): string | undefined {
  const m = /^ {2}let ([A-Za-z_][A-Za-z0-9_]*) = (\d+)\s*$/m.exec(src);
  return m ? `${m[1]}=${Number(m[2]) + 100}` : undefined;
}

/** The weak law's payload for one file (see the header). */
export function keepWeakLawPayload(file: string): string {
  const src = readFileSync(file, "utf8");
  const world = worldFor(file);
  const bump = firstLetBump(src);
  return [
    allStoreysDiagnosticsPayload(API, src, { world }),
    JSON.stringify(describe(src, { world, facts: ["depends"] })),
    runCli(cmdValidate, [file, "--json"]),
    runCli(cmdImpact, [file, "--json", "--against", file]),
    bump !== undefined ? runCli(cmdImpact, [file, "--json", "--set", bump]) : "",
  ].join(" ");
}

/** SHA-256 of {@link keepWeakLawPayload}. */
export function keepWeakLawDigest(file: string): string {
  return createHash("sha256").update(keepWeakLawPayload(file), "utf8").digest("hex");
}

/** The evaluation steps one file's whole resolution spends (every storey). */
export function keepWeakLawSteps(file: string): number {
  const src = readFileSync(file, "utf8");
  const world = worldFor(file);
  const { plan: ast } = parse(src, BUILTIN_REGISTRY);
  if (!ast) return 0;
  const linked = link(ast, world, BUILTIN_REGISTRY);
  return evaluationSteps(resolveAll(linked.plan, BUILTIN_REGISTRY, world));
}
