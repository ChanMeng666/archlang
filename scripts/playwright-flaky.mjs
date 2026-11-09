#!/usr/bin/env node
// Lists the Playwright cases that passed only on a retry (`status: "flaky"`), from one or more JSON
// reports (the `json` reporter in playground/ and docs-site/ playwright.config.ts). A retry keeps a
// job green, so without this nothing ever reads a flake. Zero dependencies; no Playwright import.
//   node scripts/playwright-flaky.mjs [--fail-on-flaky] <report.json>...
// Prints a `::warning file=…::flaky: <title>` annotation per case and, when $GITHUB_STEP_SUMMARY is
// set, a Markdown table there. Exit 0 unless --fail-on-flaky and something was flaky. A missing or
// unreadable report is skipped with a notice (the Playwright step may have died before writing it).
import { appendFileSync, existsSync, readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

/**
 * @param {unknown} report a parsed Playwright JSON report
 * @returns {{ title: string, file: string, line: number, project: string, error: string }[]}
 */
export function findFlaky(report) {
  const out = [];
  const walk = (suite, trail) => {
    // A file-level suite is titled with its file name; keep only describe() titles in the trail.
    const here = suite.title && suite.title !== suite.file ? [...trail, suite.title] : trail;
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const results = t.results ?? [];
        const firstFail = results.findIndex((r) => r.status === "failed" || r.status === "timedOut");
        const passedAfter = firstFail >= 0 && results.slice(firstFail + 1).some((r) => r.status === "passed");
        if (t.status !== "flaky" && !passedAfter) continue;
        const first = results[firstFail >= 0 ? firstFail : 0] ?? {};
        const msg = first.error?.message ?? first.errors?.[0]?.message ?? "";
        out.push({
          title: [...here, spec.title].filter(Boolean).join(" › "),
          file: spec.file ?? suite.file ?? "",
          line: spec.line ?? 0,
          project: t.projectName ?? "",
          error:
            msg
              .replace(ANSI, "")
              .split("\n")
              .find((l) => l.trim() !== "")
              ?.trim() ?? "",
        });
      }
    }
    for (const s of suite.suites ?? []) walk(s, here);
  };
  for (const s of /** @type {any} */ (report)?.suites ?? []) walk(s, []);
  return out;
}

const esc = (s) => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
const cell = (s) => s.replace(/\|/g, "\\|");

export function main(argv, env = process.env) {
  const failOn = argv.includes("--fail-on-flaky");
  const files = argv.filter((a) => !a.startsWith("--"));
  const flaky = [];
  for (const f of files) {
    if (!existsSync(f)) {
      console.log(`playwright-flaky: no report at ${f}; skipped`);
      continue;
    }
    try {
      for (const c of findFlaky(JSON.parse(readFileSync(f, "utf8")))) flaky.push(c);
    } catch (e) {
      console.log(`playwright-flaky: cannot read ${f}: ${e.message}; skipped`);
    }
  }
  for (const c of flaky) {
    console.log(
      `::warning file=${esc(c.file)},line=${c.line}::flaky: ${esc(c.title)}${c.error ? ` (${esc(c.error)})` : ""}`,
    );
  }
  if (flaky.length === 0) console.log("playwright-flaky: no case passed only on a retry");
  if (env.GITHUB_STEP_SUMMARY && flaky.length > 0) {
    const rows = flaky.map(
      (c) => `| ${cell(c.title)} | ${cell(c.project)} | \`${c.file}:${c.line}\` | ${cell(c.error)} |`,
    );
    appendFileSync(
      env.GITHUB_STEP_SUMMARY,
      `### Flaky Playwright tests (passed only on retry)\n\n| Test | Project | Where | First attempt |\n| --- | --- | --- | --- |\n${rows.join("\n")}\n\n`,
    );
  }
  return failOn && flaky.length > 0 ? 1 : 0;
}

const isMain = process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (isMain) process.exit(main(process.argv.slice(2)));
