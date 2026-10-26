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
 * PS4.5 added facts after the baseline was taken, and the generator may run only on the tree
 * before keep code existed, so the baseline is not re-taken: the payload removes exactly those
 * additive facts instead (as `validate`'s `summary` is removed): `describe`'s
 * `depends.elements[].contacts` ({@link withoutContacts}) and `impact`'s contact `held` steps
 * with the rows and summary lines they make ({@link withoutContactHeld}).
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
/** Run a CLI command in-process; its exit code and everything it wrote to stdout (`stripSummary`: minus the `summary` key, for `validate`, whose pins predate it). */
/** Run a CLI command in-process; its exit code and everything it wrote to stdout. */
function runCli(cmd: (a: ReturnType<typeof parseArgs>) => number, argv: string[], stripSummary = false): string {
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
    return `${exit}\n${stripSummary ? withoutSummary(stdout) : stdout}`;
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

/**
 * PS4.5's additive facts, removed so the baseline (taken before any keep code, so never re-taken)
 * still measures everything else: every `depends.elements[].contacts` and `depends.contacts_truncated`
 * (top level and per storey). Both are present only when non-empty or true, so this removes
 * nothing else.
 */
export function withoutContacts<T>(summary: T): T {
  type Deps = { elements?: Array<Record<string, unknown>>; contacts_truncated?: true };
  const strip = (deps: Deps | undefined): void => {
    if (deps) delete deps.contacts_truncated;
    for (const row of deps?.elements ?? []) delete row.contacts;
  };
  const copy = structuredClone(summary) as { depends?: Deps; levels?: Array<{ depends?: Deps }> };
  strip(copy.depends);
  for (const l of copy.levels ?? []) strip(l.depends);
  return copy as T;
}

/** A held row's line with contact clauses (`src/impact.ts`'s `heldPhrase`): the element (an
 *  authored wall or a piece, `<kind> <id>`), the clauses, then the other steps' tail if any. */
const CONTACT_LINE =
  /^( {2}\S+ \S+) stayed at [xy] -?[0-9.]+ while .+? moved to [xy] -?[0-9.]+ \([0-9.]+ mm\)((?:; what it depends on changed: .*)?)$/;
/** The note `impact` prints under Held when the before side's contact search was cut. */
const TRUNCATED_LINE = "  (contacts truncated on the before side: too many room edges; held may be incomplete)";

/**
 * `impact --json` less PS4.5's additive `held` content, as it printed before contacts existed:
 * every `via: "contact"` step, a held row left with none, the contact clauses of the summary
 * (a row's line without them, or no line when nothing else is left), `contacts_truncated` and
 * its note, and the `Held (n)` head recounted. A report that is not JSON (a usage error) or has
 * no contact content comes back byte for byte.
 */
export function withoutContactHeld(stdout: string): string {
  const nl = stdout.indexOf("\n");
  const exit = stdout.slice(0, nl + 1);
  const body = stdout.slice(nl + 1);
  let j: { held?: Array<{ because: Array<{ via: string }> }>; contacts_truncated?: true; summary?: string[] };
  try {
    j = JSON.parse(body);
  } catch {
    return stdout;
  }
  const contact = j.held?.some((h) => h.because.some((s) => s.via === "contact")) === true;
  if (!contact && j.contacts_truncated === undefined) return stdout;
  const held = (j.held ?? [])
    .map((h) => ({ ...h, because: h.because.filter((s) => s.via !== "contact") }))
    .filter((h) => h.because.length > 0);
  j.held = held;
  delete j.contacts_truncated;
  j.summary = (j.summary ?? []).flatMap((l) => {
    if (l === TRUNCATED_LINE) return [];
    if (/^Held \(\d+\):/.test(l)) return [`Held (${held.length})${held.length === 0 ? ": none" : ":"}`];
    const m = CONTACT_LINE.exec(l);
    if (!m) return [l];
    return m[2] ? [`${m[1]} stayed${m[2]}`] : [];
  });
  return `${exit}${JSON.stringify(j, null, 2)}\n`;
}

/** The weak law's payload for one file (see the header). */
export function keepWeakLawPayload(file: string): string {
  const src = readFileSync(file, "utf8");
  const world = worldFor(file);
  const bump = firstLetBump(src);
  return [
    allStoreysDiagnosticsPayload(API, src, { world }),
    JSON.stringify(withoutContacts(describe(src, { world, facts: ["depends"] }))),
    runCli(cmdValidate, [file, "--json"], true),
    withoutContactHeld(runCli(cmdImpact, [file, "--json", "--against", file])),
    bump !== undefined ? withoutContactHeld(runCli(cmdImpact, [file, "--json", "--set", bump])) : "",
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
