/**
 * `renderReplay` and `renderStill` remove their scratch directory (the replay page, ~600 KB of
 * inlined viewer) however they end: with no browser on the machine (`view --replay`'s documented
 * no-browser path, `test/view-no-browser.test.ts`), with a browser that fails later, and when the
 * removal itself fails, which must never replace the render's own error. playwright-core is mocked:
 * these tests run on CI's Node 18 leg, where importing it exits the process.
 */
import * as fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderReplay, renderStill } from "../src/replay/video.js";

const launch = vi.hoisted(() => vi.fn());
vi.mock("playwright-core", () => ({ chromium: { launch } }));

// Every scratch directory a render makes, and every file it writes, recorded from the real calls.
const made = vi.hoisted(() => [] as string[]);
const written = vi.hoisted(() => [] as string[]);
vi.mock("node:fs", async (actual) => {
  const real = await actual<typeof import("node:fs")>();
  return {
    ...real,
    mkdtempSync: vi.fn((prefix: string) => {
      const dir = real.mkdtempSync(prefix);
      made.push(dir);
      return dir;
    }),
    writeFileSync: vi.fn((file: string, data: string) => {
      written.push(file);
      real.writeFileSync(file, data);
    }),
    rmSync: vi.fn(real.rmSync),
  };
});

const NO_BROWSER = "browserType.launch: Executable doesn't exist at /ms-playwright/chromium/chrome";
const HTML = "<!doctype html><title>replay</title>";

const renders = {
  renderReplay: () => renderReplay({ html: HTML, events: [], width: 64, height: 48 }),
  renderStill: () => renderStill({ html: HTML, width: 64, height: 48 }),
};

/** The one scratch directory the call made: it held the page, and it is gone. */
function expectRemoved(prefix: string): void {
  expect(made).toHaveLength(1);
  const dir = made[0] as string;
  expect(dir).toContain(prefix);
  expect(written.some((f) => f.startsWith(dir))).toBe(true);
  expect(fs.existsSync(dir)).toBe(false);
}

afterEach(() => {
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
  made.length = 0;
  written.length = 0;
  launch.mockReset();
  vi.mocked(fs.rmSync).mockClear();
});

describe.each([
  ["renderReplay", "archlang3d-replay-"],
  ["renderStill", "archlang3d-still-"],
] as const)("%s's scratch directory", (name, prefix) => {
  it("is removed when no browser starts, and the launch error is what the call rejects with", async () => {
    launch.mockRejectedValue(new Error(NO_BROWSER));
    await expect(renders[name]()).rejects.toThrow(NO_BROWSER);
    expect(launch).toHaveBeenCalledTimes(1);
    expectRemoved(prefix);
  });

  it("is removed and the browser closed when the browser fails after it starts", async () => {
    const browser = {
      newPage: vi.fn().mockRejectedValue(new Error("browser.newPage: Target closed")),
      close: vi.fn().mockResolvedValue(undefined),
      version: () => "fake",
    };
    launch.mockResolvedValue(browser);
    await expect(renders[name]()).rejects.toThrow("browser.newPage: Target closed");
    expect(browser.close).toHaveBeenCalledTimes(1);
    expectRemoved(prefix);
  });

  it("a removal that fails never replaces the render's own error", async () => {
    launch.mockRejectedValue(new Error(NO_BROWSER));
    vi.mocked(fs.rmSync).mockImplementationOnce(() => {
      throw Object.assign(new Error("EBUSY: resource busy or locked, rmdir"), { code: "EBUSY" });
    });
    await expect(renders[name]()).rejects.toThrow(NO_BROWSER);
    expect(fs.rmSync).toHaveBeenCalledWith(made[0], expect.objectContaining({ maxRetries: 5, recursive: true }));
  });
});
