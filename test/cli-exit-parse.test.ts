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
});
