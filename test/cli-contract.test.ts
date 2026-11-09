import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EXIT } from "../src/cli/io.js";
import { buildManifest } from "../src/index.js";
import { CASES, observe, setup } from "./cli-contract-cases.js";
import { runArch } from "./helpers/cli.js";

/**
 * The CLI contract table: for every manifest command, three runs in-process (a plan that works, a
 * plan with a user error, a flag the command does not take) must end with the exit code the
 * contract gives (`EXIT`, `src/cli/io.ts`) and, where the run prints a `--json` envelope, with at
 * least the top-level keys recorded in `test/tables/cli-envelopes.json`.
 *
 * - A key that vanished from an envelope fails: agents read these by name.
 * - A key the table does not know fails too, until the table takes it (additive-only):
 *   `npx tsx test/cli-envelopes-gen.ts "<why>"`; the generator refuses to drop a key.
 * - The commands and runs that cannot be made are in `CASES` with a reason (`watch` is resident).
 *
 * The inputs live in `./cli-contract-cases.ts`, shared with the generator.
 */

const TABLE = JSON.parse(readFileSync("test/tables/cli-envelopes.json", "utf8")) as { rows: Record<string, string[]> };
const COMMANDS = buildManifest("0.0.0").commands.map((c) => c.name);

let dir = "";
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "arch-contract-"));
  setup(dir);
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("the contract table covers the manifest", () => {
  it("has a CASES row for every command and none for a command that is gone", () => {
    expect(Object.keys(CASES).sort()).toEqual([...COMMANDS].sort());
  });

  it("every row either runs both inputs, or says why not", () => {
    for (const [cmd, c] of Object.entries(CASES)) {
      if (c.skip) {
        expect(c.skip.length, `${cmd}: skip needs a reason`).toBeGreaterThan(20);
        continue;
      }
      expect(c.ok, `${cmd} has no ok input`).toBeDefined();
      expect(c.user, `${cmd} has no user-error input or reason`).toBeDefined();
      if (c.user && "none" in c.user) expect(c.user.none.length, `${cmd}: none needs a reason`).toBeGreaterThan(20);
    }
  });
});

describe.each(COMMANDS)("%s", (cmd) => {
  it("ok input: exit 0 and the recorded envelope keys", async () => {
    const o = await observe(runArch, dir, cmd, "ok");
    if (!o) return expect(CASES[cmd]?.skip, `${cmd} has no ok run and no skip reason`).toBeDefined();
    expect(o.status, `${o.argv.join(" ")}\n${o.stderr}`).toBe(EXIT.OK);
    expectEnvelope(o.key, o.keys);
  }, 120_000);

  it("user-error input: the contract's exit code and the recorded envelope keys", async () => {
    const o = await observe(runArch, dir, cmd, "user");
    const c = CASES[cmd]!;
    if (!o) return expect(c.skip !== undefined || (c.user !== undefined && "none" in c.user)).toBe(true);
    const want = c.user && "argv" in c.user ? c.user.exit : EXIT.USER;
    expect(o.status, `${o.argv.join(" ")}\n${o.stderr}`).toBe(want);
    expectEnvelope(o.key, o.keys);
  }, 120_000);

  it("usage error (an unknown flag): exit 3, a message on stderr, nothing on stdout", async () => {
    const o = (await observe(runArch, dir, cmd, "usage"))!;
    expect(o.status).toBe(EXIT.USAGE);
    expect(o.stderr).toContain("unknown flag");
    expect(o.stdout).toBe("");
  });
});

function expectEnvelope(key: string, keys: string[] | null): void {
  const want = TABLE.rows[key];
  expect(keys, `${key}: stdout is not one JSON object`).not.toBeNull();
  expect(want, `${key} has no row: record it with \`npx tsx test/cli-envelopes-gen.ts "<why>"\``).toBeDefined();
  const gone = want!.filter((k) => !keys!.includes(k));
  expect(gone, `${key}: the --json envelope lost key(s) — a breaking change for agents that read them`).toEqual([]);
  const added = keys!.filter((k) => !want!.includes(k));
  expect(
    added,
    `${key}: new envelope key(s); record them (additive) with \`npx tsx test/cli-envelopes-gen.ts "<why>"\``,
  ).toEqual([]);
}
