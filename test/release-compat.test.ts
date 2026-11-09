/**
 * Release compatibility: this checkout against the LAST PUBLISHED `@chanmeng666/archlang` and
 * `@chanmeng666/archlang-mcp`, additive-only, over the four surfaces downstream code is keyed on
 * (public types, MCP tool input schemas, the Plan JSON schema, the error-code set). The logic is
 * `scripts/compat-check.mjs` (also run by hand: `node scripts/compat-check.mjs`); this file runs it
 * in the suite with no build. `public-surface` pins only nameability and `plan-schema-drift` only
 * file == generator; neither sees what the last release promised.
 *
 * A failure is a breaking change: restore the surface, or add a `BREAKING:` line naming it under
 * CHANGELOG's `## [Unreleased]` and plan a MAJOR. It needs the npm registry: offline it skips with
 * the reason locally and fails under `CI`.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../packages/mcp/src/server.js";
// @ts-expect-error — a zero-dep .mjs script with no type declarations.
import * as compatModule from "../scripts/compat-check.mjs";
import { ERROR_CODES } from "../src/error-catalog.js";

interface Finding {
  surface: string;
  kind: string;
  name: string;
  path?: string;
  old?: string;
  new?: string;
}
interface Check {
  findings: Finding[];
  note?: string;
  skipped?: string;
}
interface Release {
  coreVersion: string;
  mcpVersion: string;
  coreDir: string;
}
const compat = compatModule as {
  loadRelease: () => Release;
  checkPublicTypes: (r: Release) => Check;
  checkMcpSchemas: (r: Release, create: typeof createServer) => Promise<Check>;
  checkPlanSchema: (r: Release) => Promise<Check>;
  checkErrorCodes: (r: Release, codes: readonly string[]) => Promise<Check>;
  repoBreakingLines: () => string[];
  breakingLines: (changelog: string) => string[];
  applyOverrides: (f: Finding[], lines: string[]) => { failures: Finding[]; accepted: (Finding & { by: string })[] };
  formatFinding: (f: Finding) => string;
  typeSurface: (entry: string) => Record<string, Record<string, string>>;
  compareTypeSurfaces: (o: unknown, n: unknown) => Finding[];
  compareMcpTools: (o: unknown, n: unknown) => Finding[];
  compareJsonSchemas: (o: unknown, n: unknown, opts: { surface: string; name: string }) => Finding[];
  compareErrorCodes: (o: readonly string[], n: readonly string[]) => Finding[];
};

const TIMEOUT = 180_000;
let release: Release | undefined;
let offline: string | undefined;

beforeAll(() => {
  try {
    release = compat.loadRelease();
  } catch (e) {
    offline = (e as Error).message;
  }
}, TIMEOUT);

/** The release, or a visible skip (locally) / a failure (under CI) when the registry is unreachable. */
function needRelease(ctx: { skip: () => void }): Release {
  if (release) return release;
  const why = `release-compat needs the npm registry to fetch the last published tarballs: ${offline}`;
  if (process.env.CI) expect.fail(why);
  console.warn(`SKIPPED: ${why}`);
  ctx.skip();
  throw new Error("unreachable");
}

/** Assert no unaccepted finding; print what a `BREAKING:` line accepted. */
function expectAdditive(surface: string, check: Check): void {
  if (check.skipped) {
    // A surface the published packages do not carry cannot be compared: say so, loudly.
    console.warn(`release-compat ${surface}: SKIPPED (${check.skipped})`);
    if (process.env.CI) expect.fail(`${surface}: ${check.skipped}`);
    return;
  }
  const { failures, accepted } = compat.applyOverrides(check.findings, compat.repoBreakingLines());
  for (const a of accepted) console.log(`release-compat ${surface}: accepted by "${a.by}": ${compat.formatFinding(a)}`);
  expect(failures.map(compat.formatFinding), `${surface} (${check.note})`).toEqual([]);
}

describe("release compatibility (against the last published release)", () => {
  it(
    "public types: no export, member or required-parameter change narrows the published declarations",
    (ctx) => {
      const r = needRelease(ctx);
      const check = compat.checkPublicTypes(r);
      expect(check.note).toMatch(/^\d{3,} exports/);
      expectAdditive("public-types", check);
    },
    TIMEOUT,
  );

  it(
    "MCP tool schemas: no tool removed, no input property removed or newly required, no enum narrowed",
    async (ctx) => {
      const r = needRelease(ctx);
      const check = await compat.checkMcpSchemas(r, createServer);
      expect(check.note).toMatch(/^[1-9]\d* tools/);
      expectAdditive("mcp-schemas", check);
    },
    TIMEOUT,
  );

  it(
    "Plan JSON schema: no property removed or newly required, no type or enum narrowed, version unchanged",
    async (ctx) => {
      const r = needRelease(ctx);
      expectAdditive("plan-schema", await compat.checkPlanSchema(r));
    },
    TIMEOUT,
  );

  it(
    "error codes: every published E_*/W_* code still exists",
    async (ctx) => {
      const r = needRelease(ctx);
      const check = await compat.checkErrorCodes(r, ERROR_CODES);
      expect(check.note).toMatch(/^[1-9]\d* codes/);
      expectAdditive("error-codes", check);
    },
    TIMEOUT,
  );
});

describe("release compatibility: the comparisons are not vacuous", () => {
  const dir = mkdtempSync(join(tmpdir(), "archlang-compat-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it(
    "reports a removed export, a new required parameter, a narrowed enum and a removed code by name",
    () => {
      const oldDts = join(dir, "old.d.ts");
      const newDts = join(dir, "new.d.ts");
      writeFileSync(
        oldDts,
        [
          "export declare function compileThing(src: string): string;",
          "export declare function keptFn(a: number, opts?: { strict?: boolean }): void;",
          'export type Mode = "fast" | "slow";',
          "export interface Opts { width: number; label?: string }",
          'export declare const KEYWORDS: readonly ["room", "wall"];',
          "export declare function goneExport(): void;",
        ].join("\n"),
      );
      writeFileSync(
        newDts,
        [
          // Added: a REQUIRED second parameter (breaking).
          "export declare function compileThing(src: string, world: object): string;",
          // Widened: a union parameter, an optional option and an optional third parameter are fine.
          "export declare function keptFn(a: number | string, opts?: { strict?: boolean; extra?: number }, more?: number): void;",
          'export type Mode = "fast";',
          "export interface Opts { width: number; label?: string; added?: boolean }",
          'export declare const KEYWORDS: readonly ["room", "door", "wall"];',
          "export declare function brandNew(): void;",
        ].join("\n"),
      );
      const types = compat.compareTypeSurfaces(compat.typeSurface(oldDts), compat.typeSurface(newDts));
      const said = types.map(compat.formatFinding).join("\n");
      expect(types.find((f) => f.kind === "removed export")?.name).toBe("goneExport");
      expect(types.find((f) => f.kind === "new required parameter")?.name).toBe("compileThing");
      expect(types.find((f) => f.name === "Mode")?.kind).toBe("changed type");
      // Exactly those three: the widened, optional and inserted additions pass.
      expect(types.length, said).toBe(3);

      const tool = (mode: string[], required: string[]) => ({
        type: "object",
        properties: { source: { type: "string" }, mode: { type: "string", enum: mode } },
        required,
      });
      const mcp = compat.compareMcpTools(
        { compile: tool(["svg", "png"], ["source"]), lint: tool(["svg"], []) },
        { compile: tool(["svg"], ["source", "mode"]) },
      );
      expect(mcp.map((f) => `${f.kind} ${f.name}${f.path ?? ""}`).sort()).toEqual([
        "narrowed enum compile/mode",
        "new required property compile/mode",
        "removed tool lint",
      ]);

      const plan = compat.compareJsonSchemas(
        { properties: { version: { const: 1 }, rooms: { type: "array" } } },
        { properties: { version: { const: 2 } } },
        { surface: "plan-schema", name: "plan.schema.json" },
      );
      expect(plan.map((f) => `${f.kind} ${f.path}`).sort()).toEqual([
        "changed const /version",
        "removed property /rooms",
      ]);

      expect(compat.compareErrorCodes(["E_A", "W_B", "E_C"], ["E_A", "E_C", "E_D"])).toEqual([
        { surface: "error-codes", kind: "removed code", name: "W_B" },
      ]);
    },
    TIMEOUT,
  );

  it("a BREAKING: line under [Unreleased] accepts only what it names", () => {
    const changelog = [
      "# Changelog",
      "## [Unreleased]",
      "### Removed",
      "- BREAKING: `goneExport` is removed; use `brandNew`.",
      "- BREAKING: error-codes: `W_B` is retired.",
      "## [1.0.0] - 2026-01-01",
      "BREAKING: Mode narrowed (an old release's line never counts).",
    ].join("\n");
    const lines = compat.breakingLines(changelog);
    expect(lines).toHaveLength(2);
    const findings: Finding[] = [
      { surface: "public-types", kind: "removed export", name: "goneExport" },
      { surface: "public-types", kind: "changed type", name: "Mode" },
      { surface: "error-codes", kind: "removed code", name: "W_B" },
      { surface: "error-codes", kind: "removed code", name: "W_C" },
    ];
    const { failures, accepted } = compat.applyOverrides(findings, lines);
    // `W_C` is accepted through the surface id `error-codes`; `Mode` is named nowhere current.
    expect(accepted.map((a) => a.name)).toEqual(["goneExport", "W_B", "W_C"]);
    expect(failures.map((f) => f.name)).toEqual(["Mode"]);
  });
});
