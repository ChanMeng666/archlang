/**
 * Card CG19: `playwright-core` is an optional peer, so the loader that every browser path goes
 * through turns Node's module-not-found for it into one message that says how to install it, and
 * lets every other failure through unchanged. The import is a parameter: the package is installed
 * in this repository, and importing it exits the process on CI's Node 18 leg.
 */
import { describe, expect, it } from "vitest";
import { loadChromium, PLAYWRIGHT_MISSING } from "../src/replay/chromium.js";

const failing = (message: string, code?: string) => async (): Promise<never> => {
  throw Object.assign(new Error(message), code === undefined ? {} : { code });
};

describe("loadChromium", () => {
  it("names the install commands", () => {
    expect(PLAYWRIGHT_MISSING).toBe(
      "playwright-core is not installed: npm i -D playwright-core && npx playwright-core install chromium",
    );
  });

  it("returns the module's chromium", async () => {
    const chromium = { name: () => "chromium" };
    expect(await loadChromium(async () => ({ chromium }) as never)).toBe(chromium);
  });

  it("reports a missing playwright-core, ESM or CommonJS, with the original as its cause", async () => {
    for (const [message, code] of [
      ["Cannot find package 'playwright-core' imported from /app/node_modules/x/dist/cli.js", "ERR_MODULE_NOT_FOUND"],
      ["Cannot find module 'playwright-core'\nRequire stack:\n- /app/x.cjs", "MODULE_NOT_FOUND"],
    ] as const) {
      const err = await loadChromium(failing(message, code)).then(
        () => new Error("loadChromium resolved"),
        (e: unknown) => e as Error,
      );
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe(PLAYWRIGHT_MISSING);
      expect((err.cause as Error).message).toBe(message);
    }
  });

  it("lets any other failure through unchanged", async () => {
    for (const thrown of [
      failing(
        "Cannot find package 'some-other' imported from /app/node_modules/playwright-core/index.mjs",
        "ERR_MODULE_NOT_FOUND",
      ),
      failing("Cannot find package 'playwright-core' (no code)"),
      failing("playwright-core: Node.js 18 is not supported"),
    ]) {
      const original = await thrown().catch((e: unknown) => (e as Error).message);
      await expect(loadChromium(thrown)).rejects.toThrow(original);
      await expect(loadChromium(thrown)).rejects.not.toThrow(PLAYWRIGHT_MISSING);
    }
  });
});
