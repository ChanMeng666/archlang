/**
 * The MCP `validate` tool returns `next` (plan-soundness PS5.3a, card RM5.1): the one item to fix
 * first, chosen in `NEXT_TIERS` order, with the `profile` and `taste` arguments the CLI's
 * `validate --profile/--taste` takes.
 *
 * - Fixtures here reach the tiers `error`, `validity`, `intent` (a missed brief, and a graph
 *   mismatch), `profile` and `taste`, and a clean plan gives `null`. The `warning` and `drafting`
 *   tiers have no fixture here: the tool hands `nextDiagnostic` the compile diagnostics and the
 *   default lint run whole, and the core's `test/next.test.ts` covers those two tiers.
 * - `next` is the payload's last key (before `source_hash`, which every result carries), as it is
 *   the last key of `validate --json`.
 * - For every case above it equals the CLI's `next` (deep equality of the parsed JSON): the same
 *   plan and flags through `archlang validate --json` (a child process, as `tools.test.ts` runs the
 *   CLI) give the same item.
 * - ONE KNOWN DIVERGENCE, pinned: a broken `soft` keep is a `next` item on the CLI
 *   (`W_KEEP_VIOLATED`, tier `intent`) and not over MCP, whose tools do not measure keeps yet. The
 *   pin says so; the card that brings keeps to MCP (plan-soundness PS4.10) flips it to equality.
 * - Unknown profile names are refused as data, before any work, and the echoed name is bounded.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LINT_PROFILE_NAMES, NEXT_TIERS, TASTE_PROFILE_NAMES } from "@chanmeng666/archlang";
import { describe, expect, it } from "vitest";
import { ECHO_NAME_MAX } from "../src/tools.js";
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

/** {@link TWO_ROOMS} with a `soft` keep it breaks: bedroom `b` is 3000 mm across, not 3800. */
const SOFT_KEEP_BROKEN = TWO_ROOMS.replace(/\n\}\n$/, "\n  keep min clear b 3800 soft\n}\n");

/** `archlang validate <plan> --json <flags>`'s `next`, run as a child process in a temp directory. */
function cliNext(dir: string, source: string, flags: string[]): unknown {
  const plan = join(dir, "plan.arch");
  writeFileSync(plan, source, "utf8");
  const argv = flags.map((f) => (f in FILES ? join(dir, f) : f));
  const cli = spawnSync(
    process.execPath,
    ["--import", "tsx", join(REPO, "src", "cli.ts"), "validate", plan, "--json", ...argv],
    { cwd: REPO, encoding: "utf8" },
  );
  expect(cli.stdout, cli.stderr).not.toBe("");
  return JSON.parse(cli.stdout).next;
}

/** Run `body` with a fresh temp directory holding {@link FILES}, removed afterwards. */
async function inTempDir(body: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "mcp-validate-next-"));
  try {
    for (const [name, json] of Object.entries(FILES)) writeFileSync(join(dir, name), JSON.stringify(json));
    await body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("validate · next", () => {
  it.each(CASES)("%s: tier as expected, last key, and a tier NEXT_TIERS names", async (_, source, __, args, tier) => {
    const out = await call(await connect(), "validate", { source, ...args });
    const next = out.next as { tier: string } | null;
    expect(next === null ? null : next.tier).toBe(tier);
    if (next !== null) expect(NEXT_TIERS as readonly string[]).toContain(next.tier);
    expect(Object.keys(out).slice(-2)).toEqual(["next", "source_hash"]);
  });

  it("equals the CLI's next for the same plan and flags", async () => {
    const client = await connect();
    await inTempDir(async (dir) => {
      for (const [label, source, flags, args] of CASES) {
        const mcp = await call(client, "validate", { source, ...args });
        expect(mcp.next, label).toEqual(cliNext(dir, source, flags));
      }
    });
  }, 60000);

  it("KNOWN DIVERGENCE (until keeps reach MCP, PS4.10): a broken soft keep is the CLI's next, not the tool's", async () => {
    await inTempDir(async (dir) => {
      const cli = cliNext(dir, SOFT_KEEP_BROKEN, []) as { tier: string; code: string } | null;
      expect(cli).toMatchObject({ tier: "intent", code: "W_KEEP_VIOLATED" });
      const mcp = await call(await connect(), "validate", { source: SOFT_KEEP_BROKEN });
      // Today the tool does not weigh keeps, so nothing else is left and `next` is null. When keeps
      // reach MCP this becomes `expect(mcp.next).toEqual(cli)`.
      expect(mcp.next).toBeNull();
    });
  }, 30000);

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

  it("echoes at most ECHO_NAME_MAX characters of a refused name", async () => {
    const client = await connect();
    const long = "x".repeat(ECHO_NAME_MAX * 5);
    for (const key of ["profile", "taste"]) {
      const out = await call(client, "validate", { source: CLEAN, [key]: long });
      const error = String(out.error);
      expect(error, key).toContain(`"${"x".repeat(ECHO_NAME_MAX)}…"`);
      expect(error, key).not.toContain("x".repeat(ECHO_NAME_MAX + 1));
    }
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
