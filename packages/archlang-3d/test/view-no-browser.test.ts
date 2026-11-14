/**
 * `view --replay` with no browser on the machine. The HTML needs none and only `--video` does, which
 * is what the README says; `scripts/prove-pack.ts` proves it on the real tarball at publish. The
 * launch failure is simulated because these tests run on CI's Node 18 leg, where importing
 * playwright-core exits the process.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main } from "../src/cli/run.js";
import { adaptPlan } from "../src/index.js";
import { renderReplay } from "../src/replay/video.js";

vi.mock("../src/replay/video.js", async (actual) => {
  const real = await actual<typeof import("../src/replay/video.js")>();
  return { ...real, renderReplay: vi.fn() };
});

const PLAN = fileURLToPath(new URL("../../../examples/laneway-house.arch", import.meta.url));

async function cli(argv: string[]): Promise<{ code: number; out: string; err: string }> {
  let out = "";
  let err = "";
  const o = vi.spyOn(process.stdout, "write").mockImplementation((s) => {
    out += String(s);
    return true;
  });
  const e = vi.spyOn(process.stderr, "write").mockImplementation((s) => {
    err += String(s);
    return true;
  });
  try {
    return { code: await main(argv), out, err };
  } finally {
    o.mockRestore();
    e.mockRestore();
  }
}

describe("archlang3d view with no browser", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "archlang3d-no-browser-"));
    vi.mocked(renderReplay).mockRejectedValue(new Error("browserType.launch: Executable doesn't exist"));
  });
  afterEach(() => {
    vi.mocked(renderReplay).mockReset();
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes the HTML, exits 0 and says the key frames were not measured", async () => {
    const html = join(dir, "plan.html");
    const r = await cli(["view", PLAN, "--replay", "-o", html, "--json"]);
    expect(r.code).toBe(0);
    expect(readFileSync(html, "utf8")).toContain("three.js");
    expect(r.err).toContain("key frames were not measured");
    const report = JSON.parse(r.out);
    expect(report).toMatchObject({ ok: true, html, rendered: false });
    expect(report.keyFrames).toBeUndefined();
  });

  it("still fails `--video`, which does need the browser", async () => {
    const mp4 = join(dir, "plan.mp4");
    const r = await cli(["view", PLAN, "--replay", "-o", join(dir, "plan.html"), "--video", mp4]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("rendering failed");
    expect(existsSync(mp4)).toBe(false);
  });

  it("does not excuse a replay that breaks with a browser present", async () => {
    vi.mocked(renderReplay).mockRejectedValue(new Error("page.evaluate: the replay threw"));
    const r = await cli(["view", PLAN, "--replay", "-o", join(dir, "plan.html")]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("rendering failed");
  });

  // Card RM8.10: the package's own warnings are written in the file `view --replay` writes. "a T of
  // two heights" is the fixture of test/wall-lines.test.ts; the second plan puts it on storey 1 only.
  const T_OF_TWO_HEIGHTS = `plan "TH" {\n  units mm\n  height 3000\n  wall id=s partition thickness 150 height 2000 { (3000,0) (3000,3000) }\n  wall id=t partition thickness 150 { (0,3000) (6000,3000) }\n}\n`;
  const JOINT_ON_STOREY_1 = `plan "TS" {
  units mm
  height 3000
  level 1 "Ground" {
    wall id=s partition thickness 150 height 2000 { (3000,0) (3000,3000) }
    wall id=t partition thickness 150 { (0,3000) (6000,3000) }
  }
  level 2 "First" {
    wall id=u partition thickness 150 { (3000,0) (3000,3000) }
    wall id=v partition thickness 150 { (0,3000) (6000,3000) }
  }
}
`;
  const jointMessage = (src: string): string => {
    const r = adaptPlan(src);
    if (!r.ok) throw new Error(r.refusal.code);
    const w = r.warnings.filter((x) => x.code === "W3D_MIXED_HEIGHT_JOINT");
    expect(w).toHaveLength(1);
    return (w[0] as { message: string }).message;
  };
  const replayOf = async (src: string, ...flags: string[]): Promise<string> => {
    const plan = join(dir, "plan.arch");
    const html = join(dir, `plan-${flags.join("")}.html`);
    writeFileSync(plan, src);
    const r = await cli(["view", plan, "--replay", "-o", html, ...flags]);
    expect(r.code, r.err).toBe(0);
    return readFileSync(html, "utf8");
  };

  it("writes a mixed-height joint's code and the warning's own message into the HTML", async () => {
    const html = await replayOf(T_OF_TWO_HEIGHTS);
    expect(html).toContain(`<p><code>W3D_MIXED_HEIGHT_JOINT</code> ${jointMessage(T_OF_TWO_HEIGHTS)}</p>`);
  }, 60_000);

  it("a plan of several storeys: the combined view names the storey, a storey's view shows only its own", async () => {
    const message = jointMessage(JOINT_ON_STOREY_1);
    const code = "<code>W3D_MIXED_HEIGHT_JOINT</code>";
    expect(await replayOf(JOINT_ON_STOREY_1), "the combined view").toContain(`<p>L1 · ${code} ${message}</p>`);
    expect(await replayOf(JOINT_ON_STOREY_1, "--storey", "1"), "storey 1").toContain(`<p>${code} ${message}</p>`);
    const upper = await replayOf(JOINT_ON_STOREY_1, "--storey", "2");
    expect(upper, "storey 2 has no joint").not.toContain("W3D_MIXED_HEIGHT_JOINT");
    expect(upper).not.toContain("archlang-notices");
  }, 120_000);
});
