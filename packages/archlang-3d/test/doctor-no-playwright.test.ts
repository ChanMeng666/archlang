/**
 * Card CG19: `archlang3d doctor` where `playwright-core` (an optional peer) is not installed. Its
 * `chromium` line says exactly how to install it, the probe is not required, so the exit stays 0.
 * The loader is mocked: playwright-core is installed in this repository, and importing it exits the
 * process on CI's Node 18 leg, where doctor's Node < 20 guard answers before any import.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { main } from "../src/cli/run.js";
import { loadChromium, PLAYWRIGHT_MISSING } from "../src/replay/chromium.js";

vi.mock("../src/replay/chromium.js", async (actual) => {
  const real = await actual<typeof import("../src/replay/chromium.js")>();
  return { ...real, loadChromium: vi.fn() };
});

const major = Number(process.versions.node.split(".")[0]);

interface Probe {
  name: string;
  ok: boolean;
  required: boolean;
  detail: string;
}

async function doctor(): Promise<{ code: number; probes: Probe[] }> {
  let out = "";
  const o = vi.spyOn(process.stdout, "write").mockImplementation((s) => {
    out += String(s);
    return true;
  });
  const e = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  try {
    const code = await main(["doctor", "--json"]);
    return { code, probes: (JSON.parse(out) as { probes: Probe[] }).probes };
  } finally {
    o.mockRestore();
    e.mockRestore();
  }
}

describe("archlang3d doctor with no playwright-core", () => {
  afterEach(() => {
    vi.mocked(loadChromium).mockReset();
  });

  it("reports it on the chromium line with the install commands, and exits 0", async () => {
    vi.mocked(loadChromium).mockRejectedValue(new Error(PLAYWRIGHT_MISSING));
    const { code, probes } = await doctor();
    const chromium = probes.find((p) => p.name === "chromium");
    expect(chromium).toMatchObject({ ok: false, required: false });
    if (major >= 20) {
      expect(chromium?.detail).toBe(PLAYWRIGHT_MISSING);
      expect(loadChromium).toHaveBeenCalledTimes(1);
    } else {
      expect(chromium?.detail).toBe("needs Node >= 20");
      expect(loadChromium).not.toHaveBeenCalled();
    }
    // Required probes (node, the core, gltf-validator) decide the exit; this one never does.
    expect(probes.filter((p) => p.required && !p.ok).map((p) => p.name)).toEqual(major >= 20 ? [] : ["node"]);
    expect(code).toBe(major >= 20 ? 0 : 1);
  });

  // Under Node < 20 the guard answers before the loader (the case above checks that), so skipped there.
  it.skipIf(major < 20)("keeps the browser hint for any other failure", async () => {
    vi.mocked(loadChromium).mockRejectedValue(new Error("browserType.launch: Executable doesn't exist\nmore"));
    const { probes } = await doctor();
    expect(probes.find((p) => p.name === "chromium")?.detail).toBe(
      "browserType.launch: Executable doesn't exist (install: npx playwright-core install chromium)",
    );
  });
});
