/** impact and fmt exit 2 on a plan that does not parse; fmt returns it verbatim and says it refused (EH1.18, AF6). */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EXIT } from "../src/cli/io.js";
import { runArch } from "./helpers/cli.js";

/** EH1.18: `impact` cannot compare a broken side, so it exits 2. AF6: `fmt` refuses one, still verbatim, and exits 2 too. */
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
  it("fmt --write exits 2, reports parsed: false with the diagnostics and does not touch the file", async () => {
    const r = await runArch(["fmt", join(dir, "bad.arch"), "--write", "--json"]);
    expect(r.status).toBe(EXIT.USER);
    const j = JSON.parse(r.stdout) as {
      ok: boolean;
      parsed: boolean;
      changed: boolean;
      source_hash: string;
      diagnostics: Array<{ code: string; span: [number, number] }>;
    };
    expect(j.ok).toBe(false);
    expect(j.parsed).toBe(false);
    expect(j.changed).toBe(false);
    expect("written_hash" in j).toBe(false);
    // The revision is still reported, so an agent reading `source_hash` off `fmt --json` keeps it.
    expect(j.source_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(j.diagnostics[0]!.code).toBe("E_PARSE");
    expect(BAD.slice(...j.diagnostics[0]!.span)).toBe("@");
    expect(readFileSync(join(dir, "bad.arch"), "utf8")).toBe(BAD);
  });

  it("fmt in human mode exits 2, prints the source verbatim on stdout and one line on stderr", async () => {
    for (const argv of [
      ["fmt", join(dir, "bad.arch")],
      ["fmt", join(dir, "bad.arch"), "--write"],
    ]) {
      const r = await runArch(argv);
      expect(r.status, argv.join(" ")).toBe(EXIT.USER);
      expect(r.stdout, argv.join(" ")).toBe(argv.includes("--write") ? "" : BAD);
      expect(r.stderr.trim().split("\n"), argv.join(" ")).toHaveLength(1);
      expect(r.stderr, argv.join(" ")).toContain("not formatted: 1 parse error");
    }
    expect(readFileSync(join(dir, "bad.arch"), "utf8")).toBe(BAD);
  });

  it("fmt --quiet suppresses the refusal line, as it suppresses diagnostics, and still exits 2", async () => {
    for (const argv of [
      ["fmt", join(dir, "bad.arch"), "--quiet"],
      ["fmt", join(dir, "bad.arch"), "--write", "-q"],
    ]) {
      const r = await runArch(argv);
      expect(r.status, argv.join(" ")).toBe(EXIT.USER);
      expect(r.stdout, argv.join(" ")).toBe(argv.includes("--write") ? "" : BAD);
      expect(r.stderr, argv.join(" ")).toBe("");
    }
    expect(readFileSync(join(dir, "bad.arch"), "utf8")).toBe(BAD);
  });

  it("fmt on a plan that parses says parsed: true and exits 0", async () => {
    const r = await runArch(["fmt", join(dir, "good.arch"), "--json"]);
    expect(r.status).toBe(EXIT.OK);
    const j = JSON.parse(r.stdout) as Record<string, unknown>;
    expect(j.ok).toBe(true);
    expect(j.parsed).toBe(true);
    expect("diagnostics" in j).toBe(false);
    expect(r.stderr).toBe("");
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

  it("fmt - (stdin) exits 2 and returns the source verbatim", async () => {
    const r = await runArch(["fmt", "-", "--json"], { input: BAD });
    expect(r.status).toBe(EXIT.USER);
    const j = JSON.parse(r.stdout) as { ok: boolean; parsed: boolean; formatted: string; changed: boolean };
    expect(j.ok).toBe(false);
    expect(j.parsed).toBe(false);
    expect(j.formatted).toBe(BAD);
    expect(j.changed).toBe(false);
  });
});
