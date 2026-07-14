/**
 * `arch --help` / `arch <cmd> --help`, rendered from the capability manifest.
 *
 * The old top-level help was a hand-maintained template literal in `src/cli.ts`: it
 * listed flags the CLI no longer had and missed flags it did, and there was no
 * per-command help at all (`arch compile --help` treated `--help` as a filename). These
 * renderers derive everything — usage lines, flag tables, examples, exit codes, formats
 * — from `buildManifest()`, so help cannot drift from the CLI it documents.
 *
 * Pure (a `Manifest` in, strings out), like `renderCliReference` — unit-testable in
 * memory, no fs and no clock.
 */

import type { Manifest, ManifestCommand, ManifestFlag } from "../manifest.js";

/** Resolve a verb (or one of its aliases) to its manifest entry. */
export function findCommand(m: Manifest, name: string): ManifestCommand | null {
  return m.commands.find((c) => c.name === name || (c.aliases?.includes(name) ?? false)) ?? null;
}

/** `--flag, -a <arg>` — the flag's signature as it appears in the aligned table. */
function flagSignature(f: ManifestFlag): string {
  const name = f.alias ? `${f.flag}, ${f.alias}` : f.flag;
  return `${name}${f.arg ? ` ${f.arg}` : ""}`;
}

/** Greedy word-wrap; long flag descriptions get a hanging indent rather than a wall. */
function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [""];
}

/** An aligned `  --flag, -a <arg>   description` block. */
function flagTable(flags: readonly ManifestFlag[], indent = "  "): string[] {
  const rows = flags.map((f) => [flagSignature(f), f.description] as const);
  const gutter = Math.max(...rows.map(([sig]) => sig.length));
  const out: string[] = [];
  for (const [sig, description] of rows) {
    const pad = " ".repeat(gutter - sig.length);
    const hang = " ".repeat(indent.length + gutter + 2);
    const [first = "", ...rest] = wrap(description, Math.max(40, 96 - hang.length));
    out.push(`${indent}${sig}${pad}  ${first}`);
    for (const l of rest) out.push(`${hang}${l}`);
  }
  return out;
}

/** The input placeholder without its parenthetical aside (`none` → no operand). */
function inputOperand(c: ManifestCommand): string {
  if (c.input === "none") return "";
  return c.input.replace(/\s*\(.*\)\s*$/, "").trim();
}

/** e.g. `arch compile <file.arch|-> [flags]` — synthesized from the manifest entry. */
export function usageLine(c: ManifestCommand): string {
  return ["arch", c.name, inputOperand(c), c.flags.length > 0 ? "[flags]" : ""].filter(Boolean).join(" ");
}

/** `0 ok · 2 user-source error … · 3 bad usage` — from the manifest's exit-code table. */
const exitCodeLine = (m: Manifest): string =>
  `Exit codes: ${Object.entries(m.exitCodes)
    .map(([code, meaning]) => `${code} ${meaning}`)
    .join(" · ")}`;

/** `svg (default, zero-dep) · pdf (optional pdfkit) · …` — from the manifest's formats. */
const formatLine = (m: Manifest): string =>
  `Formats (-f): ${m.formats
    .map((f, i) => {
      const dep = f.zeroDep ? "zero-dep" : `optional ${f.optionalDep}`;
      return `${f.id} (${i === 0 ? `default, ${dep}` : dep})`;
    })
    .join(" · ")}`;

/** Help for one command: usage, summary, IO, flags, worked examples, exit codes. */
export function renderCommandHelp(m: Manifest, c: ManifestCommand): string {
  const aliases = c.aliases?.length ? ` (alias: ${c.aliases.join(", ")})` : "";
  const out: string[] = [
    `Usage:`,
    `  ${usageLine(c)}${aliases}`,
    "",
    ...wrap(c.summary, 96).map((l) => `  ${l}`),
    "",
    `Input:  ${c.input}`,
    `Output: ${c.output}`,
    "",
  ];

  if (c.flags.length > 0) {
    out.push("Flags:", ...flagTable([...c.flags, { flag: "--help", alias: "-h", description: "print this help" }]), "");
  }

  out.push("Examples:");
  for (const e of c.examples) out.push(`  # ${e.note}`, `  $ ${e.cmd}`, "");

  out.push(exitCodeLine(m));
  return out.join("\n") + "\n";
}

/** The top-level help: one line per command, plus the CLI-wide contract footer. */
export function renderTopHelp(m: Manifest): string {
  const rows = m.commands.map((c) => [[c.name, ...(c.aliases ?? [])].join(", "), c.summary] as const);
  const gutter = Math.max(...rows.map(([verb]) => verb.length));

  const out: string[] = [
    `arch v${m.version}`,
    m.description,
    "",
    "Usage:",
    "  arch <command> [input] [flags]",
    "  arch <command> --help      flags and worked examples for one command",
    "  arch --version             print the version",
    "",
    "Commands:",
  ];

  for (const [verb, summary] of rows) {
    const hang = " ".repeat(2 + gutter + 2);
    const [first = "", ...rest] = wrap(summary, Math.max(40, 96 - hang.length));
    out.push(`  ${verb}${" ".repeat(gutter - verb.length)}  ${first}`);
    for (const l of rest) out.push(`${hang}${l}`);
  }

  out.push(
    "",
    "Global flags:",
    ...flagTable(m.globalFlags),
    "",
    "Input '-' reads source from stdin.   Output '-' writes the artifact to stdout.",
    "Every command takes --json: the result on stdout, human messages on stderr — so an agent",
    "pipes stdout straight into a parser. Every JSON diagnostic carries its catalog `fix`.",
    exitCodeLine(m),
    formatLine(m),
  );
  return out.join("\n") + "\n";
}
