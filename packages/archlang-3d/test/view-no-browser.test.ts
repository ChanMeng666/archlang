/**
 * `view --replay` with no browser on the machine. The HTML needs none and only `--video` does, which
 * is what the README says; `scripts/prove-pack.ts` proves it on the real tarball at publish. The
 * launch failure is simulated because these tests run on CI's Node 18 leg, where importing
 * playwright-core exits the process.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main } from "../src/cli/run.js";
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
});
