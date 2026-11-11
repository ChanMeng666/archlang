/**
 * The MCP `validate` tool returns `next` (plan-soundness PS5.3a, card RM5.1): the one item to fix
 * first, chosen in `NEXT_TIERS` order, with the `profile` and `taste` arguments the CLI's
 * `validate --profile/--taste` takes.
 *
 * - Each tier the tool can reach is reached by a fixture: an error, a validity warning, the brief,
 *   the graph, a profile-only warning and the taste score; a clean plan gives `null`.
 * - `next` is the payload's last key (before `source_hash`, which every result carries), as it is
 *   the last key of `validate --json`.
 * - It is the CLI's `next`, byte for byte: the same plan and flags through `archlang validate --json`
 *   (a child process, as `tools.test.ts` runs the CLI) give the same item.
 * - Unknown profile names are refused as data, before any work.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LINT_PROFILE_NAMES, NEXT_TIERS, TASTE_PROFILE_NAMES } from "@chanmeng666/archlang";
import { describe, expect, it } from "vitest";
import { call, CLEAN, connect, NARROW_DOOR, TINY, TWO_ROOMS } from "./helpers.js";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/** [case, source, CLI flags (a `*.json` operand is written to a temp file), MCP arguments, expected tier]. */
const CASES: Array<[string, string, string[], Record<string, unknown>, string | null]> = [
  ["a parse error", 'plan "P" {', [], {}, "error"],
  ["a validity warning", TINY, [], {}, "validity"],
  ["a missed brief", CLEAN, ["--intent", "brief.json"], { intent: { rooms: 3 } }, "intent"],
  ["a graph mismatch", TWO_ROOMS, ["--graph", "graph.json"], { graph: { a: [], b: [] } }, "intent"],
  [
    "a profile-only warning",
    NARROW_DOOR,
    ["--profile", "accessibility-advisory"],
    { profile: "accessibility-advisory" },
    "profile",
  ],
  ["a taste score below 1", CLEAN, ["--taste", "generic"], { taste: "generic" }, "taste"],
  ["nothing left", CLEAN, [], {}, null],
];
const FILES: Record<string, unknown> = { "brief.json": { rooms: 3 }, "graph.json": { a: [], b: [] } };

describe("validate · next", () => {
  it.each(CASES)("%s: tier as expected, last key, and a tier NEXT_TIERS names", async (_, source, __, args, tier) => {
    const out = await call(await connect(), "validate", { source, ...args });
    const next = out.next as { tier: string } | null;
    expect(next === null ? null : next.tier).toBe(tier);
    if (next !== null) expect(NEXT_TIERS as readonly string[]).toContain(next.tier);
    expect(Object.keys(out).slice(-2)).toEqual(["next", "source_hash"]);
  });

  it("is the CLI's next for the same plan and flags", async () => {
    const client = await connect();
    const dir = mkdtempSync(join(tmpdir(), "mcp-validate-next-"));
    try {
      for (const [name, json] of Object.entries(FILES)) writeFileSync(join(dir, name), JSON.stringify(json));
      for (const [label, source, flags, args] of CASES) {
        const plan = join(dir, "plan.arch");
        writeFileSync(plan, source, "utf8");
        const argv = flags.map((f) => (f in FILES ? join(dir, f) : f));
        const cli = spawnSync(
          process.execPath,
          ["--import", "tsx", join(REPO, "src", "cli.ts"), "validate", plan, "--json", ...argv],
          { cwd: REPO, encoding: "utf8" },
        );
        expect(cli.stdout, `${label}: ${cli.stderr}`).not.toBe("");
        const mcp = await call(client, "validate", { source, ...args });
        expect(mcp.next, label).toEqual(JSON.parse(cli.stdout).next);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);

  it("refuses an unknown lint or taste profile as data, naming the real ones", async () => {
    const client = await connect();
    const lint = await call(client, "validate", { source: CLEAN, profile: "no-such" });
    expect(lint).toMatchObject({ ok: false });
    expect(lint.error).toContain('unknown lint profile "no-such"');
    for (const p of LINT_PROFILE_NAMES) expect(lint.error).toContain(p);
    const taste = await call(client, "validate", { source: CLEAN, taste: "no-such" });
    expect(taste).toMatchObject({ ok: false });
    expect(taste.error).toContain('unknown taste profile "no-such"');
    for (const p of TASTE_PROFILE_NAMES) expect(taste.error).toContain(p);
  });

  it("reports the profile's warnings under `profile`, and they count toward strict", async () => {
    const client = await connect();
    const plain = await call(client, "validate", { source: NARROW_DOOR, strict: true });
    const profiled = await call(client, "validate", {
      source: NARROW_DOOR,
      strict: true,
      profile: "accessibility-advisory",
    });
    expect(plain.ok).toBe(true);
    expect(profiled.ok).toBe(false);
    const codes = (profiled.diagnostics as Array<{ code?: string }>).map((d) => d.code);
    expect(codes).toContain("W_DOOR_CLEARANCE");
  });
});
