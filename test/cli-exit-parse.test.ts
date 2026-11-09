/** fmt and impact exit 2 on a plan that does not parse (EH1.18). */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EXIT } from "../src/cli/io.js";
import { runArch } from "./helpers/cli.js";

/** EH1.18: `fmt` and `impact` cannot do their job on a plan that does not parse, so they exit 2. */
const BAD = 'plan "B" { units mm room at (0,0) size 4000x3000 label "R" @ }\n';
const GOOD = 'plan "A" { units mm room at (0,0) size 4000x3000 label "R" }\n';
let dir = "";
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "arch-exit-parse-"));
  writeFileSync(join(dir, "bad.arch"), BAD);
  writeFileSync(join(dir, "good.arch"), GOOD);
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("a plan that does not parse", () => {
  it("fmt --write exits 2 and does not touch the file", async () => {
    const r = await runArch(["fmt", join(dir, "bad.arch"), "--write", "--json"]);
    expect(r.status).toBe(EXIT.USER);
    const j = JSON.parse(r.stdout) as { ok: boolean; diagnostics: Array<{ code: string }> };
    expect(j.ok).toBe(false);
    expect(j.diagnostics[0]!.code).toBe("E_PARSE");
    expect(readFileSync(join(dir, "bad.arch"), "utf8")).toBe(BAD);
  });

  it("fmt in human mode exits 2 with the diagnostic", async () => {
    const r = await runArch(["fmt", join(dir, "bad.arch")]);
    expect(r.status).toBe(EXIT.USER);
    expect(r.stderr + r.stdout).toContain("E_PARSE");
  });

  it("impact exits 2 whichever side is broken", async () => {
    for (const [file, against] of [
      ["bad.arch", "good.arch"],
      ["good.arch", "bad.arch"],
    ] as const) {
      const r = await runArch(["impact", join(dir, file), "--against", join(dir, against), "--json"]);
      expect(r.status, `${file} against ${against}`).toBe(EXIT.USER);
      const j = JSON.parse(r.stdout) as { ok: boolean; diagnostics: Array<{ code: string }> };
      expect(j.ok).toBe(false);
      expect(j.diagnostics[0]!.code).toBe("E_PARSE");
    }
  });

  it("impact --set on a plan that does not parse exits 2 with the parse diagnostics", async () => {
    writeFileSync(
      join(dir, "badlet.arch"),
      'plan "B" { units mm let W = 4000 room at (0,0) size Wx3000 label "R" @ }\n',
    );
    const r = await runArch(["impact", join(dir, "badlet.arch"), "--set", "W=5000", "--json"]);
    expect(r.status).toBe(EXIT.USER);
    const j = JSON.parse(r.stdout) as { ok: boolean; diagnostics: Array<{ code: string }> };
    expect(j.ok).toBe(false);
    expect(j.diagnostics[0]!.code).toBe("E_PARSE");
  });

  it("impact --lock with a side that does not parse: { ok: false, diagnostics } and no lock key", async () => {
    const r = await runArch([
      "impact",
      join(dir, "bad.arch"),
      "--against",
      join(dir, "good.arch"),
      "--lock",
      "r1",
      "--json",
    ]);
    expect(r.status).toBe(EXIT.USER);
    const j = JSON.parse(r.stdout) as Record<string, unknown>;
    expect(Object.keys(j).sort()).toEqual(["diagnostics", "ok"]);
    expect(j.ok).toBe(false);
  });

  it("impact in human mode exits 2 with the diagnostic", async () => {
    const r = await runArch(["impact", join(dir, "bad.arch"), "--against", join(dir, "good.arch")]);
    expect(r.status).toBe(EXIT.USER);
    expect(r.stderr + r.stdout).toContain("E_PARSE");
  });

  it("fmt - (stdin) exits 2 with the diagnostics", async () => {
    const r = await runArch(["fmt", "-", "--json"], { input: BAD });
    expect(r.status).toBe(EXIT.USER);
    const j = JSON.parse(r.stdout) as { ok: boolean; diagnostics: Array<{ code: string }> };
    expect(j.ok).toBe(false);
    expect(j.diagnostics[0]!.code).toBe("E_PARSE");
  });
});
