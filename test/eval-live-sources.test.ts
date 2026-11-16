/** Live-run plan sources (EV.2, product-roadmap RM-D53), offline: fetch mocked, no network. */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LIVE_SOURCES_DIR,
  LiveLedger,
  NOT_EXTRACTED,
  evaluate,
  extractArch,
  firstArchFence,
  liveSourceFile,
  loadCorpus,
  makeAuthor,
  readGolden,
  writeLiveSources,
} from "../eval/run.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLAN = "plan {\n  room a: rect(0, 0, 3000, 3000)\n}";
const F = "```";

describe("liveSourceFile: the stored text is the first arch/untyped fence's body, else a marker", () => {
  const cases: [string, string, string | undefined][] = [
    ["a lone arch block", `${F}arch\n${PLAN}\n${F}`, PLAN],
    ["an untyped block", `${F}\n${PLAN}\n${F}\n`, PLAN],
    ["CRLF line ends", `${F}arch\r\n${PLAN}\r\n${F}\r\n`, undefined], // body keeps \r; see below
    ["prose around one arch block", `Here you go:\n\n${F}arch\n${PLAN}\n${F}\n\nEnjoy.`, PLAN],
    // extractArch's regex skips "```json" and opens at the json block's CLOSING fence, so it scores
    // the prose between the blocks: never stored.
    [
      "a typed block, prose, then an arch block",
      `${F}json\n{"a":1}\n${F}\nThe plan:\n${F}arch\n${PLAN}\n${F}`,
      undefined,
    ],
    // The first untyped block is the one scored, prose or not: stored, since it is that block.
    [
      "an untyped first block of prose",
      `${F}\nI will draw one room.\n${F}\n${F}arch\n${PLAN}\n${F}`,
      "I will draw one room.",
    ],
    // An inline ``` opens nothing; extractArch's regex agrees here only by luck of the newline.
    ["an inline triple backtick", `Use ${F}arch${F} fences.\n${F}arch\n${PLAN}\n${F}`, PLAN],
    // A four-backtick fence holding a ``` line: the block runs to ````, the regex stops at ```.
    ["a four-backtick fence", `${F}\`arch\n${PLAN}\n${F}\nmore\n${F}\``, undefined],
    ["an unfenced reply", `${PLAN}\n`, undefined],
    ["a truncated reply (fence never closed)", `${F}arch\n${PLAN}`, undefined],
    ["an empty reply", "", undefined],
  ];
  for (const [name, reply, stored] of cases) {
    it(name, () => {
      const f = liveSourceFile("b1", reply);
      if (name === "CRLF line ends") {
        // The fence reader accepts CRLF, but extractArch keeps the \r in the body, so the two
        // disagree and the marker is stored: never a text that differs from the one scored.
        expect(firstArchFence(reply)).toBe(PLAN);
      }
      if (stored === undefined) {
        expect(f.name).toBe("b1.not-extracted.txt");
        expect(f.text.startsWith(`${NOT_EXTRACTED}: `)).toBe(true);
        expect(f.text.split("\n")).toHaveLength(2); // one line, nothing of the reply
        if (reply.trim() !== "") expect(f.text).not.toContain(reply.trim().split("\n")[0]!.slice(0, 12));
      } else {
        expect(f).toEqual({ name: "b1.arch", text: `${stored}\n` });
        // Stored only when it is exactly what was scored.
        expect(stored).toBe(extractArch(reply));
      }
    });
  }

  it("a four-backtick fence's body runs to the closing ````", () => {
    expect(firstArchFence(`${F}\`arch\n${PLAN}\n${F}\nmore\n${F}\``)).toBe(`${PLAN}\n${F}\nmore`);
  });

  it("no reply (the call failed) is a marker", () => {
    expect(liveSourceFile("b1", undefined)).toEqual({
      name: "b1.not-extracted.txt",
      text: `${NOT_EXTRACTED}: no reply\n`,
    });
  });
});

describe("a live-shaped run writes one file per scored brief", () => {
  it("source for a fenced reply, marker for unfenced, truncated and failed, nothing for skipped", async () => {
    const entries = loadCorpus().slice(0, 5);
    expect(entries).toHaveLength(5);
    const golden = readGolden(entries[0]!).trim();
    const replies = new Map<string, string | null>([
      [entries[0]!.id, `Sure.\n\n${F}arch\n${golden}\n${F}\n`],
      [entries[1]!.id, "I cannot draw that, but here is the idea: a room."],
      [entries[2]!.id, `${F}arch\n${golden.slice(0, 40)}`],
      [entries[3]!.id, null], // the API call fails
    ]);
    let current = "";
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const text = replies.get(current);
        if (text === null) return new Response("overloaded", { status: 529 });
        return new Response(JSON.stringify({ content: [{ type: "text", text }], stop_reason: "end_turn" }), {
          status: 200,
        });
      }),
    );
    // The same wiring main() uses: makeAuthor's onReply keeps the raw reply in memory only.
    const replyById = new Map<string, string>();
    let lastReply: string | undefined;
    const author = makeAuthor("anthropic", "claude-sonnet-5-5", new LiveLedger("claude-sonnet-5-5"), (r) => {
      lastReply = r;
    });
    const { results } = await evaluate(
      entries,
      async (e) => {
        current = e.id;
        lastReply = undefined;
        const src = await author(e.prompt);
        if (lastReply !== undefined) replyById.set(e.id, lastReply);
        return src;
      },
      { beforeEach: (e) => e.id === entries[4]!.id },
    );
    expect(results[0]!.valid).toBe(true);
    expect(results[4]!.skipped).toBe(true);

    const dir = mkdtempSync(join(tmpdir(), "ev2-"));
    try {
      writeLiveSources(dir, results, replyById);
      const files = readdirSync(dir).sort();
      expect(files).toEqual(
        [
          `${entries[0]!.id}.arch`,
          `${entries[1]!.id}.not-extracted.txt`,
          `${entries[2]!.id}.not-extracted.txt`,
          `${entries[3]!.id}.not-extracted.txt`,
        ].sort(),
      );
      expect(readFileSync(join(dir, `${entries[0]!.id}.arch`), "utf8")).toBe(`${golden}\n`);
      for (const f of files.filter((x) => x.endsWith(".txt"))) {
        const text = readFileSync(join(dir, f), "utf8");
        expect(text.startsWith(`${NOT_EXTRACTED}: `)).toBe(true);
        expect(text).not.toContain("room");
      }
      // A second run replaces the first run's files.
      writeLiveSources(dir, results.slice(0, 1), replyById);
      expect(readdirSync(dir)).toEqual([`${entries[0]!.id}.arch`]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the local directory is git-ignored", () => {
  it(`${LIVE_SOURCES_DIR}/ is ignored by git`, () => {
    for (const f of ["b1.arch", "b1.not-extracted.txt"]) {
      const r = spawnSync("git", ["check-ignore", "-q", `${LIVE_SOURCES_DIR}/${f}`], { cwd: ROOT });
      expect(r.status, `${LIVE_SOURCES_DIR}/${f}`).toBe(0);
    }
  });

  it("the eval-live workflow uploads it in the eval-results-live artifact", () => {
    const yml = readFileSync(resolve(ROOT, ".github/workflows/eval-live.yml"), "utf8");
    const upload = yml.slice(yml.indexOf("name: eval-results-live"));
    expect(upload.slice(0, 200)).toContain(`${LIVE_SOURCES_DIR}/`);
  });
});
