/**
 * Shared helpers of the `keep` suites (ADR 0033; PS4.3 design §7): the keep corpus, every keep
 * statement's span (however deeply it is nested), the span-blanked twin K2 compares against, and
 * the payloads with the keep rows taken out.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import type { KeepNode, Statement } from "../src/ast.js";
import { compile, describe, lint } from "../src/index.js";
import { parse } from "../src/parser.js";
import { runValidate, withoutSummary } from "./validate-json-run.js";

export const KEEP_CORPUS_DIR = "test/keep-corpus";

/** The keep corpus, `[name, source]`, sorted by name. */
export function keepCorpus(): [string, string][] {
  return readdirSync(KEEP_CORPUS_DIR)
    .filter((f) => f.endsWith(".arch"))
    .sort()
    .map((f) => [f.replace(/\.arch$/, ""), readFileSync(`${KEEP_CORPUS_DIR}/${f}`, "utf8")]);
}

/** Every keep statement of a source, in source order, nested ones (`for`, `if`, `zone`,
 *  `level`, a component body) included. */
export function keepNodes(src: string): KeepNode[] {
  const { plan } = parse(src);
  const out: KeepNode[] = [];
  const walk = (body: readonly Statement[]): void => {
    for (const s of body) {
      if (s.kind === "keep") out.push(s);
      else if (s.kind === "for" || s.kind === "while" || s.kind === "zone" || s.kind === "level") walk(s.body);
      else if (s.kind === "if") {
        walk(s.then);
        if (s.else) walk(s.else);
      }
    }
  };
  if (plan) {
    walk(plan.body);
    for (const c of plan.components.values()) walk(c.body);
  }
  return out.sort((a, b) => a.span!.start - b.span!.start);
}

/** `s` as a regular-expression literal: every metacharacter escaped (global), so a text matches
 *  only itself. */
export const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The source with every keep statement's bytes blanked by spaces, newlines kept (R9), so every
 *  later span, line and column is what it was. */
export function blankKeeps(src: string): string {
  let out = src;
  for (const k of keepNodes(src)) {
    const { start, end } = k.span!;
    out = out.slice(0, start) + out.slice(start, end).replace(/[^\n]/g, " ") + out.slice(end);
  }
  return out;
}

/** Drop `W_KEEP_VIOLATED` rows from every `diagnostics` array, and the `keeps` keys. */
function stripKeepRows(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value), (key, v) => {
    if (key === "keeps") return undefined;
    if (key === "diagnostics" && Array.isArray(v)) return v.filter((d) => d?.code !== "W_KEEP_VIOLATED");
    if (key === "depends" && v && typeof v === "object" && "keeps" in v) {
      const { keeps: _k, ...rest } = v as Record<string, unknown>;
      return rest;
    }
    return v;
  });
}

/** The parts K2 compares, for one source (design §7, R9). `strip` takes the keep rows out. */
export function k2Parts(src: string, strip: boolean): Record<string, string> {
  const c = compile(src, { noCache: true });
  const drawings = c.pages ? c.pages.map((p) => p.svg) : [c.svg];
  const diags = strip ? c.diagnostics.filter((d) => d.code !== "W_KEEP_VIOLATED") : c.diagnostics;
  const d = describe(src);
  const dd = describe(src, { facts: ["depends"] });
  return {
    svg: drawings.join("\n"),
    lint: JSON.stringify(lint(src)),
    describe: JSON.stringify(strip ? stripKeepRows(d) : d),
    describeDepends: JSON.stringify(strip ? stripKeepRows(dd) : dd),
    diagnostics: JSON.stringify(diags),
  };
}

/** K3's digest for one corpus plan: SHA-256 of its keep rows in every surface that carries them —
 *  `describe().keeps`, `compile().diagnostics` and `validate --json` with its exit code. */
export function k3DigestOf(name: string, src: string): string {
  const v = runValidate([KEEP_CORPUS_DIR + "/" + name + ".arch", "--json"]);
  const payload = [
    JSON.stringify(describe(src).keeps ?? null),
    JSON.stringify(compile(src, { noCache: true }).diagnostics),
    String(v.exit) + String.fromCharCode(10) + withoutSummary(v.stdout),
  ].join(" ");
  return createHash("sha256").update(payload, "utf8").digest("hex");
}
