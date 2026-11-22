/**
 * The page's event sender (telemetry.ts, ruling RM-D86): the privacy guard, the compile debounce,
 * and where the module may be loaded from (never the view path, never `embed.html`).
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  asksNotToTrack,
  COMPILE_IDLE_MS,
  COMPILE_REPEAT_MS,
  createPageEvents,
  type EventNavigator,
  mayCount,
} from "../src/telemetry.js";
import { EVENT_PATH } from "../worker/event-core.js";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src");

/** A navigator that records what it was asked to send, and a clock the test moves by hand. */
function harness(nav: Partial<EventNavigator> = {}) {
  const sent: Array<{ url: string; body: unknown }> = [];
  const navigator: EventNavigator = {
    sendBeacon: (url: string, data?: string) => {
      sent.push({ url, body: JSON.parse(data ?? "null") });
      return true;
    },
    ...nav,
  };
  let t = 0;
  const timers = new Map<number, { at: number; run: () => void }>();
  let next = 1;
  const events = createPageEvents({
    nav: navigator,
    now: () => t,
    setTimer: (run, ms) => {
      const h = next++;
      timers.set(h, { at: t + ms, run });
      return h;
    },
    clearTimer: (h) => void timers.delete(h as number),
  });
  /** Move the clock on by `ms`, running each timer that falls due. */
  const advance = (ms: number) => {
    const end = t + ms;
    for (;;) {
      const due = [...timers].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      t = due[1].at;
      due[1].run();
    }
    t = end;
  };
  return { events, sent, advance, pending: () => timers.size };
}

describe("the guard: nothing is sent when the browser asks, or cannot beacon", () => {
  const beacon = () => true;
  it("sends only with sendBeacon, and never under GPC, DNT or an automated browser", () => {
    expect(mayCount({ sendBeacon: beacon })).toBe(true);
    expect(mayCount(undefined)).toBe(false);
    expect(mayCount({})).toBe(false); // no sendBeacon: no fallback
    expect(mayCount({ sendBeacon: beacon, globalPrivacyControl: true })).toBe(false);
    expect(mayCount({ sendBeacon: beacon, doNotTrack: "1" })).toBe(false);
    expect(mayCount({ sendBeacon: beacon, webdriver: true })).toBe(false);
    expect(mayCount({ sendBeacon: beacon, globalPrivacyControl: false, doNotTrack: "0" })).toBe(true);
    expect(mayCount({ sendBeacon: beacon, doNotTrack: "unspecified" })).toBe(true);
    expect(asksNotToTrack({ globalPrivacyControl: true })).toBe(true);
    expect(asksNotToTrack({ doNotTrack: "1" })).toBe(true);
    expect(asksNotToTrack({ webdriver: true })).toBe(false);
  });

  it("under GPC or DNT neither a count nor a compile is sent, and no timer is even set", () => {
    for (const nav of [{ globalPrivacyControl: true }, { doNotTrack: "1" }, { webdriver: true }]) {
      const h = harness(nav);
      h.events.count({ e: "view_3d" });
      h.events.compiled("error", ["E_PARSE"]);
      expect(h.pending()).toBe(0);
      h.advance(60_000);
      expect(h.sent).toEqual([]);
    }
  });

  it("a beacon that throws is dropped, and the page goes on", () => {
    const h = harness({
      sendBeacon: () => {
        throw new TypeError("refused");
      },
    });
    expect(() => h.events.count({ e: "view_3d" })).not.toThrow();
  });

  it("sends the event as JSON to the Worker's path", () => {
    const h = harness();
    h.events.count({ e: "export", fmt: "png" });
    expect(h.sent).toEqual([{ url: EVENT_PATH, body: { e: "export", fmt: "png" } }]);
  });
});

describe("the compile debounce: once the editor is still, once per outcome and codes per window", () => {
  it("sends nothing during a burst, then the last compile once the editor is still", () => {
    const h = harness();
    for (let i = 0; i < 20; i++) {
      h.events.compiled(i % 2 ? "ok" : "error", i % 2 ? [] : ["E_PARSE"]);
      h.advance(COMPILE_IDLE_MS / 4); // typing: never still for long enough
    }
    expect(h.sent).toEqual([]);
    h.events.compiled("error", ["W_ROOM_OVERLAP", "E_PARSE", "E_PARSE", undefined, "not a code"]);
    h.advance(COMPILE_IDLE_MS - 1);
    expect(h.sent).toEqual([]);
    h.advance(1);
    expect(h.sent.map((s) => s.body)).toEqual([
      { e: "compile", outcome: "error", codes: ["E_PARSE", "W_ROOM_OVERLAP"] },
    ]);
  });

  it("the same outcome and codes again within the window: not sent; a different one is", () => {
    const h = harness();
    const still = () => h.advance(COMPILE_IDLE_MS);
    h.events.compiled("ok", ["W_ROOM_OVERLAP"]);
    still();
    h.events.compiled("ok", ["W_ROOM_OVERLAP"]);
    still();
    h.events.compiled("error", ["E_PARSE"]);
    still();
    expect(h.sent.map((s) => (s.body as { outcome: string }).outcome)).toEqual(["ok", "error"]);
    // Past the window, from the first send: the same pair counts again.
    h.advance(COMPILE_REPEAT_MS);
    h.events.compiled("ok", ["W_ROOM_OVERLAP"]);
    still();
    expect(h.sent).toHaveLength(3);
  });

  it("caps the codes at twenty, sorted", () => {
    const h = harness();
    const codes = Array.from({ length: 30 }, (_, i) => `W_CODE_${String(i).padStart(2, "0")}`).reverse();
    h.events.compiled("ok", codes);
    h.advance(COMPILE_IDLE_MS);
    const sent = (h.sent[0]!.body as { codes: string[] }).codes;
    expect(sent).toHaveLength(20);
    expect(sent).toEqual([...sent].sort());
    expect(sent[0]).toBe("W_CODE_00");
  });
});

describe("where the sender loads: never the view path, never the embed", () => {
  /** The static import closure of a source module (relative imports, `import … from` and `export … from`). */
  function staticClosure(entry: string): Set<string> {
    const seen = new Set<string>();
    const stack = [resolve(SRC, entry)];
    while (stack.length > 0) {
      const file = stack.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/\bfrom\s+"(\.{1,2}\/[^"]+)"/g)) {
        // The statement this `from` ends: a type-only one is erased at build and loads nothing.
        const at = Math.max(text.lastIndexOf("import ", m.index), text.lastIndexOf("export ", m.index));
        if (at < 0 || /^(?:import|export) type /.test(text.slice(at, at + 12))) continue;
        const spec = m[1]!.replace(/\.js$/, "");
        for (const ext of [".ts", ".js"]) {
          const p = join(dirname(file), spec + ext);
          try {
            readFileSync(p);
            stack.push(p);
            break;
          } catch {
            /* try the next extension */
          }
        }
      }
      for (const m of text.matchAll(/^\s*import\s+"(\.{1,2}\/[^"]+\.(?:ts|js))"/gm))
        stack.push(join(dirname(file), m[1]!));
    }
    return seen;
  }
  const isSender = (f: string) => /[\\/]telemetry\.ts$/.test(f) || /[\\/]contribute\.ts$/.test(f);

  it("main.ts (the view path) reaches it only through import()", () => {
    const closure = [...staticClosure("main.ts")];
    expect(closure.length).toBeGreaterThan(5);
    expect(closure.filter(isSender)).toEqual([]);
    expect(readFileSync(join(SRC, "main.ts"), "utf8")).toContain('import("./telemetry.js")');
  });

  it("embed.ts (other people's pages) never reaches it, statically or lazily", () => {
    const closure = [...staticClosure("embed.ts")];
    expect(closure.length).toBeGreaterThan(1);
    expect(closure.filter(isSender)).toEqual([]);
    for (const f of closure) expect(readFileSync(f, "utf8"), f).not.toMatch(/sendBeacon|\/api\/event/);
  });

  it("only telemetry.ts sends", () => {
    for (const f of ["main.ts", "actions.ts", "edit-mode.ts", "contribute.ts", "embed.ts", "share.ts"])
      expect(readFileSync(join(SRC, f), "utf8"), f).not.toContain("sendBeacon(");
  });
});
