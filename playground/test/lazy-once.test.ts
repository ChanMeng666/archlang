import { describe, expect, it } from "vitest";
import { lazyOnce } from "../src/lazy-once.js";

describe("lazyOnce (the header actions' press-only core loader, card 3.18)", () => {
  it("loads once, and every call shares the load", async () => {
    let calls = 0;
    const load = lazyOnce(async () => {
      calls++;
      return { format: (s: string) => s.trim() };
    });
    const [a, b] = await Promise.all([load(), load()]);
    expect(a).toBe(b);
    expect(await load()).toBe(a);
    expect(calls).toBe(1);
  });

  it("forgets a failed load, so the next press loads again", async () => {
    let calls = 0;
    const load = lazyOnce(async () => {
      calls++;
      if (calls === 1) throw new Error("Failed to fetch dynamically imported module");
      return "core";
    });
    // Two presses during the failing load see the same failure, not two fetches.
    const first = Promise.allSettled([load(), load()]);
    expect((await first).map((r) => r.status)).toEqual(["rejected", "rejected"]);
    expect(calls).toBe(1);
    // The next press retries, and that load is the one kept.
    await expect(load()).resolves.toBe("core");
    await expect(load()).resolves.toBe("core");
    expect(calls).toBe(2);
  });

  it("a load that fails again is retried again, never cached as a failure", async () => {
    let calls = 0;
    const load = lazyOnce(async () => {
      calls++;
      throw new Error(`offline ${calls}`);
    });
    await expect(load()).rejects.toThrow("offline 1");
    await expect(load()).rejects.toThrow("offline 2");
    expect(calls).toBe(2);
  });
});
