/**
 * Product roadmap RM1.2a item 1, as ruled on 2026-11-12: under `validate --stage drafting` only, a
 * plan that writes no `north` statement gets one `info` item in `next` saying the sheet's arrow
 * assumes page-up is north. A plan with no `north` still draws an arrow (the default `up`), so
 * nothing is missing from the drawing; the hint says what it assumes. It is no diagnostic: not in
 * `compile()`, `lint()` or plain `validate`, and it moves neither `ok`, the exit code nor the
 * summary. A plan that writes any `north` (`north … hidden` too) gets nothing. It ranks after every
 * tier that gates (error to profile) and above `taste` and `info` (ruled 2026-11-13), so `next`
 * carries it for as long as it is outstanding, and the stage is not clean until it is answered.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { compile, lint } from "../src/index.js";
import { runValidate } from "./helpers/validate-json-run.js";
import { runArch } from "./helpers/cli.js";

const MESSAGE = "The plan writes no `north`, so the sheet's north arrow assumes the top of the page is north.";

/** A lint-clean studio, with `north` written as given (or not at all). */
const studio = (north: string | null): string => `plan "Studio" {
  units mm
${north === null ? "" : `  ${north}\n`}  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }
  room id=r at (0,0) size 8000x5000 label "Studio" uses living
  door at (4000,5000) width 900 wall shell
  window at (4000,0) width 1500 wall shell
}
`;

let dir: string;
const file = (name: string, text: string): string => {
  const p = join(dir, name);
  writeFileSync(p, text);
  return p;
};
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "arch-north-"));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

type Out = {
  ok: boolean;
  summary: string;
  next: { tier: string; code: string | null; message: string; hint?: string } | null;
  at_stage?: { clean: boolean };
};
const run = (argv: string[]): { exit: number; out: Out } => {
  const r = runValidate([...argv, "--json"]);
  return { exit: r.exit, out: JSON.parse(r.stdout) as Out };
};

describe("validate --stage drafting: the north hint", () => {
  it("a plan that writes no north: one info item, no code, at drafting only", () => {
    const f = file("none.arch", studio(null));
    const { exit, out } = run([f, "--stage", "drafting"]);
    expect(exit).toBe(0);
    expect(out.ok).toBe(true);
    expect(out.next).toEqual({
      tier: "info",
      code: null,
      message: MESSAGE,
      hint: "Write `north up` (or `down`, `left`, `right`, or a bearing in degrees) to say which way north is, or `north hidden` to draw no arrow.",
    });
    // Like any `next` item, it leaves the stage not clean; the summary is the plan's.
    expect(out.at_stage?.clean).toBe(false);
    expect(out.summary).toBe("stage drafting: no warnings");
    for (const s of ["brief", "rooms", "walls", "openings", "fixtures"]) {
      const at = run([f, "--stage", s]).out;
      expect(at.next, s).toBeNull();
      expect(at.at_stage?.clean, s).toBe(true);
    }
    expect(run([f]).out.next).toBeNull();
  });

  it("a plan that writes any north gets nothing, `north hidden` and a bearing included", () => {
    for (const north of ["north up", "north left", "north 30", "north hidden", "north up hidden"]) {
      const out = run([file("n.arch", studio(north)), "--stage", "drafting"]).out;
      expect(out.next, north).toBeNull();
      expect(out.at_stage?.clean, north).toBe(true);
    }
  });

  it("pasting the hint answers it", () => {
    const out = run([file("pasted.arch", studio("north up")), "--stage", "drafting"]).out;
    expect(out.next).toBeNull();
  });

  it("ranks below the tiers that gate: a profile warning comes first", () => {
    // An 800 mm door under accessibility-advisory's 850 mm is a profile item, which ranks above.
    const f = file("narrow.arch", studio(null).replace("width 900", "width 800"));
    const out = run([f, "--stage", "drafting", "--profile", "accessibility-advisory"]).out;
    expect(out.next?.tier).toBe("profile");
  });

  it("ranks above taste: --taste names the same item, and the stage is not clean either way", () => {
    const f = file("taste.arch", studio(null));
    const plain = run([f, "--stage", "drafting"]).out;
    const taste = run([f, "--stage", "drafting", "--taste", "generic"]).out;
    expect(taste.next).toEqual(plain.next);
    expect(taste.next?.message).toBe(MESSAGE);
    expect(plain.at_stage?.clean).toBe(false);
    expect(taste.at_stage?.clean).toBe(false);
    // The premise: this studio has a taste item (its one window faces north), so the hint outranks it.
    const told = run([file("taste-told.arch", studio("north up")), "--stage", "drafting", "--taste", "generic"]).out;
    expect(told.next?.tier).toBe("taste");
    expect(told.at_stage?.clean).toBe(true);
  });

  it("a --graph mismatch (intent tier, it gates) ranks above it; a matching graph leaves the hint", () => {
    const f = file("graph.arch", studio(null));
    const bad = run([f, "--stage", "drafting", "--graph", file("bad.json", JSON.stringify({ living: ["bed"] }))]);
    expect(bad.exit).toBe(2);
    expect(bad.out.next?.tier).toBe("intent");
    expect(bad.out.at_stage?.clean).toBe(false);
    const good = run([f, "--stage", "drafting", "--graph", file("good.json", JSON.stringify({ r: [] }))]);
    expect(good.exit).toBe(0);
    expect(good.out.next?.message).toBe(MESSAGE);
    expect(good.out.at_stage?.clean).toBe(false);
  });

  it("with --intent too (the checks path), the same item", () => {
    const brief = file("brief.json", JSON.stringify({ rooms: 1 }));
    const out = run([file("none2.arch", studio(null)), "--stage", "drafting", "--intent", brief]).out;
    expect(out.next?.message).toBe(MESSAGE);
    expect(out.at_stage?.clean).toBe(false);
  });

  it("is no diagnostic: compile() and lint() are the same with and without north", () => {
    const codes = (src: string) => [...compile(src).diagnostics, ...lint(src)].map((d) => d.code);
    expect(codes(studio(null))).toEqual(codes(studio("north up")));
    expect(compile(studio(null)).svg).toBe(compile(studio("north up")).svg);
  });

  it("human output: the next line on stderr, and still ok", async () => {
    const r = await runArch(["validate", file("none3.arch", studio(null)), "--stage", "drafting"]);
    expect(r.status).toBe(0);
    expect(r.stderr).toContain(`next (info): ${MESSAGE}`);
    // The last stage: nothing to advance to, so the stage line never says "before advancing".
    expect(r.stderr).toContain("(stage drafting is the last: the north hint is informational;");
    expect(r.stderr).not.toContain("before advancing");
    expect(r.stdout).toContain("✓ ok");
  });
});
