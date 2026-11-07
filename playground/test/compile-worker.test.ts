/**
 * The compile job the playground runs in a Web Worker (card MP6, ruling MP-D6), and its page-side
 * client. The job must be what the page computed before, call for call; what it returns must cross
 * the worker boundary unchanged (structured clone); and the client must let the newest request win
 * and fall back to the page when the worker fails. The page itself is `playground/e2e/editing.spec.ts`
 * (the worker and the page draw byte-identical plans; typing into a big plan is never a long task).
 */
import { readFileSync } from "node:fs";
import { compile, describe, lint, THEMES } from "archlang";
import { afterEach, describe as suite, expect, it } from "vitest";
import {
  type CompileRequest,
  type CompileResult,
  compileOptionsFor,
  createCompileClient,
  runCompileJob,
  sceneFor,
} from "../src/compile-worker.js";
import { extractKnobs } from "../src/knobs.js";

const example = (name: string) =>
  readFileSync(new URL(`../../examples/${name}.arch`, import.meta.url), "utf8").replace(/\r\n?/g, "\n");
/** A one-storey plan, a parametric one (knobs), two multi-storey ones and the big one. */
const NAMES = ["laneway-house", "parametric", "townhouse", "garden-house", "hillside-villa"];
const THEME = Object.keys(THEMES).find((k) => k !== "default")!;
const BROKEN = `plan "B" {\n  units mm\n  romo at (0,0) size 4000x3000\n}`;

const req = (source: string, over: Partial<CompileRequest> = {}): CompileRequest => ({
  seq: 1,
  source,
  theme: "",
  accessible: false,
  paths: false,
  lintProfile: null,
  ...over,
});

suite("runCompileJob", () => {
  for (const name of NAMES) {
    it(`${name}: is the page's compile, describe and lint, call for call`, () => {
      const source = example(name);
      for (const r of [
        req(source),
        req(source, { theme: THEME, accessible: true, paths: true, lintProfile: "" }),
        req(source, { lintProfile: "accessibility-advisory", paths: true }),
      ]) {
        const got = runCompileJob(r);
        const c = compile(source, compileOptionsFor(r));
        expect(got.svg).toBe(c.svg);
        expect(got.errors).toEqual(c.errors);
        expect(got.diagnostics).toEqual(c.diagnostics);
        expect(got.pages?.map((p) => [p.level, p.name, p.svg])).toEqual(c.pages?.map((p) => [p.level, p.name, p.svg]));
        expect(got.whole).toEqual(describe(source, { noCache: true } as never));
        expect(got.lint).toEqual(
          r.lintProfile === null ? null : lint(source, { profile: r.lintProfile, noCache: true } as never),
        );
        if (r.paths) {
          const o = compile(source, { ...compileOptionsFor(r), overlays: ["circulation"] });
          expect(got.paths?.svg).toBe(o.svg);
          expect(got.paths?.pages?.map((p) => p.svg)).toEqual(o.pages?.map((p) => p.svg));
        } else expect(got.paths).toBeUndefined();
        // The knobs read the same from the pruned plan as from the whole parse.
        expect(extractKnobs(source, got.knobPlan)).toEqual(extractKnobs(source, c.ast));
        // The gutter is what the editor's linter compiled on the page (arch-language.js).
        expect(got.gutter).toEqual(r.lintProfile === null ? undefined : compile(source, { noCache: true }).diagnostics);
        // A DXF/TXT download's Scene, compiled on demand, is the render's.
        const level = c.pages?.[c.pages.length - 1]?.level ?? null;
        expect(sceneFor(r, level)).toEqual(level === null ? c.scene : c.pages!.find((p) => p.level === level)!.scene);
      }
    }, 120_000);
  }

  it("crosses the worker boundary unchanged, and is the same every run", () => {
    for (const name of NAMES) {
      const r = req(example(name), { theme: THEME, paths: true, lintProfile: "" });
      const once = runCompileJob(r);
      // structuredClone is the algorithm postMessage uses: it throws on anything it cannot clone.
      const cloned = structuredClone(once);
      expect(cloned).toEqual(once);
      expect(JSON.stringify(cloned)).toBe(JSON.stringify(once));
      expect(JSON.stringify(runCompileJob(r))).toBe(JSON.stringify(once));
    }
  }, 120_000);

  it("reports a plan that does not compile: errors, no drawing, no lint, no knobs, the gutter", () => {
    const got = runCompileJob(req(BROKEN, { paths: true, lintProfile: "" }));
    expect(got.errors.length).toBeGreaterThan(0);
    expect(got.svg).toBe("");
    expect(got.lint).toBeNull();
    expect(got.paths).toBeUndefined();
    expect(got.knobPlan).toBeUndefined();
    expect(got.gutter).toEqual(compile(BROKEN, { noCache: true }).diagnostics);
    expect(got.gutter!.length).toBeGreaterThan(0);
  });
});

/** A stand-in for a module Worker that runs the job itself, a turn later, as a worker would. */
class FakeWorker extends EventTarget {
  static made = 0;
  static fail: "throw" | "error" | null = null;
  posted: number[] = [];
  constructor() {
    super();
    FakeWorker.made++;
    if (FakeWorker.fail === "throw") throw new Error("Workers are blocked here");
    if (FakeWorker.fail === "error") setTimeout(() => this.dispatchEvent(new Event("error")), 0);
  }
  postMessage(r: CompileRequest) {
    this.posted.push(r.seq);
    if (FakeWorker.fail === "error") return;
    setTimeout(() => {
      const ev = new Event("message") as Event & { data: unknown };
      ev.data = { seq: r.seq, ok: true, result: structuredClone(runCompileJob(r)) };
      this.dispatchEvent(ev);
    }, 0);
  }
  terminate() {}
}

suite("createCompileClient", () => {
  const original = (globalThis as { Worker?: unknown }).Worker;
  afterEach(() => {
    (globalThis as { Worker?: unknown }).Worker = original;
    FakeWorker.made = 0;
    FakeWorker.fail = null;
  });
  const install = () => {
    (globalThis as { Worker?: unknown }).Worker = FakeWorker;
  };
  const src = example("laneway-house");
  const plain = (r: CompileResult | null) => (r === null ? null : JSON.stringify(r));

  it("lets the newest request win: one in the worker, the waiting one replaced", async () => {
    install();
    const client = createCompileClient();
    const a = client.run(req(src, { seq: 1 }));
    const b = client.run(req(`${src}\n# b`, { seq: 2 }));
    const c = client.run(req(`${src}\n# c`, { seq: 3 }));
    // 1 was sent at once and is older than 3 by the time it lands; 2 never left the page.
    expect(await a).toBeNull();
    expect(await b).toBeNull();
    expect(plain(await c)).toBe(plain(runCompileJob(req(`${src}\n# c`, { seq: 3 }))));
    expect(client.where()).toBe("worker");
    expect(FakeWorker.made).toBe(1);
  });

  it("drops a worker reply once the page has run a newer request itself (a knob)", async () => {
    install();
    const client = createCompileClient();
    const a = client.run(req(src, { seq: 1 }));
    const now = client.runNow(req(src, { seq: 2 }));
    expect(now.errors).toEqual([]);
    expect(await a).toBeNull();
  });

  for (const fail of ["throw", "error"] as const) {
    it(`falls back to the page, once, when the worker ${fail === "throw" ? "cannot be made" : "fails to load"}`, async () => {
      install();
      FakeWorker.fail = fail;
      const told: unknown[] = [];
      const client = createCompileClient((why) => told.push(why));
      const first = await client.run(req(src, { seq: 1 }));
      expect(plain(first)).toBe(plain(runCompileJob(req(src, { seq: 1 }))));
      expect(client.where()).toBe("page");
      const second = await client.run(req(`${src}\n# 2`, { seq: 2 }));
      expect(second?.errors).toEqual([]);
      expect(told).toHaveLength(1);
      expect(FakeWorker.made).toBe(1);
    });
  }

  it("compiles on the page where there is no Worker at all", async () => {
    (globalThis as { Worker?: unknown }).Worker = undefined;
    const client = createCompileClient();
    expect(client.where()).toBe("page");
    expect(plain(await client.run(req(src)))).toBe(plain(runCompileJob(req(src))));
  });
});
