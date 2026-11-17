/** Live-run plan sources (EV.2, product-roadmap RM-D53), offline: fetch mocked, no network. */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
  liveReplyCollector,
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
    // Since EV.7 the fence reader drops the \r before each line end and that body is scored.
    ["CRLF line ends", `${F}arch\r\n${PLAN}\r\n${F}\r\n`, PLAN],
    ["prose around one arch block", `Here you go:\n\n${F}arch\n${PLAN}\n${F}\n\nEnjoy.`, PLAN],
    // Before EV.7 the regex skipped "```json" and opened at the json block's CLOSING fence, scoring
    // the prose between the blocks; now the json block is skipped whole and the arch block scored.
    ["a typed block, prose, then an arch block", `${F}json\n{"a":1}\n${F}\nThe plan:\n${F}arch\n${PLAN}\n${F}`, PLAN],
    // The first untyped block is the one scored, prose or not: stored, since it is that block.
    [
      "an untyped first block of prose",
      `${F}\nI will draw one room.\n${F}\n${F}arch\n${PLAN}\n${F}`,
      "I will draw one room.",
    ],
    // An inline ``` opens nothing.
    ["an inline triple backtick", `Use ${F}arch${F} fences.\n${F}arch\n${PLAN}\n${F}`, PLAN],
    // A four-backtick fence holding a ``` line: the block runs to the closing ```` (before EV.7
    // the regex stopped at the inner ```).
    ["a four-backtick fence", `${F}\`arch\n${PLAN}\n${F}\nmore\n${F}\``, `${PLAN}\n${F}\nmore`],
    ["an unfenced reply", `${PLAN}\n`, undefined],
    ["a truncated reply (fence never closed)", `${F}arch\n${PLAN}`, undefined],
    ["an empty reply", "", undefined],
  ];
  for (const [name, reply, stored] of cases) {
    it(name, () => {
      const f = liveSourceFile("b1", reply);
      // The scored text is the first arch fence's body whenever there is one.
      const block = firstArchFence(reply);
      if (block !== undefined) expect(extractArch(reply)).toBe(block);
      if (stored === undefined) {
        expect(f.name).toBe("b1.not-extracted.txt");
        expect(f.text.startsWith(`${NOT_EXTRACTED}: `)).toBe(true);
        expect(f.text.split("\n")).toHaveLength(2); // one line, nothing of the reply
        if (reply.trim() !== "") expect(f.text).not.toContain(reply.trim().split("\n")[0]!.slice(0, 12));
      } else {
        // Stored only when it is exactly what was scored, byte for byte (no added newline).
        expect(f).toEqual({ name: "b1.arch", text: extractArch(reply) });
        expect(f.text).toBe(stored);
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

describe("extractArch scores the reply's first complete arch or untyped fence (EV.7)", () => {
  it("a typed first block, prose, then an arch block: the arch block is scored", () => {
    const reply = `${F}json\n{"rooms": 1}\n${F}\n\nThe plan:\n\n${F}arch\n${PLAN}\n${F}\n`;
    expect(extractArch(reply)).toBe(PLAN);
    expect(liveSourceFile("b1", reply)).toEqual({ name: "b1.arch", text: PLAN });
  });

  it("a four-backtick fence holding a ``` line: scored to its closing ````", () => {
    const reply = `Here:\n${F}\`arch\n${PLAN}\n${F}\n// trailing note\n${F}\`\n`;
    expect(extractArch(reply)).toBe(`${PLAN}\n${F}\n// trailing note`);
    expect(liveSourceFile("b1", reply).name).toBe("b1.arch");
  });

  it("an unfenced or truncated reply is still scored as written, and stored only as a marker", () => {
    for (const reply of [`${PLAN}\n`, `${F}arch\n${PLAN}`, `  ${PLAN}  `]) {
      expect(extractArch(reply)).toBe(reply.trim());
      expect(liveSourceFile("b1", reply).name).toBe("b1.not-extracted.txt");
    }
  });

  it("openers the old regex skipped: ```ARCH, ```arch title, ``` with a trailing space", () => {
    for (const opener of [`${F}ARCH`, `${F}arch title="Flat"`, `${F} `]) {
      const reply = `${opener}\n${PLAN}\n${F}\n`;
      expect(extractArch(reply), opener).toBe(PLAN);
      expect(liveSourceFile("b1", reply), opener).toEqual({ name: "b1.arch", text: PLAN });
    }
  });

  it("a leading byte-order mark is dropped before the reply is read", () => {
    const reply = `﻿${F}arch\n${PLAN}\n${F}\n`;
    expect(firstArchFence(reply)).toBe(PLAN);
    expect(extractArch(reply)).toBe(PLAN);
    expect(liveSourceFile("b1", reply)).toEqual({ name: "b1.arch", text: PLAN });
  });
});

describe("the fallback chain: a reply the old regex took a block from never falls to the whole reply", () => {
  // No complete top-level arch/untyped fence here, so the second step, the old reader, scores the
  // block it always scored; EV.2 still stores only a marker for each (no complete arch fence).
  const cases: [string, string][] = [
    ["a ```markdown wrapper around an arch block", `${F}markdown\n${F}arch\n${PLAN}\n${F}\n${F}\n`],
    ["a four-backtick wrapper around an arch block", `${F}\`markdown\n${F}arch\n${PLAN}\n${F}\n${F}\`\n`],
    [
      "a typed opener never closed before the arch block",
      `${F}json\n{"rooms": 1}\nThe plan:\n${F}arch\n${PLAN}\n${F}\n`,
    ],
    ["a closer glued to the last line", `${F}arch\n${PLAN}${F}\n`],
  ];
  for (const [name, reply] of cases) {
    it(name, () => {
      expect(firstArchFence(reply)).toBeUndefined();
      expect(extractArch(reply)).toBe(PLAN);
      expect(liveSourceFile("b1", reply)).toEqual({
        name: "b1.not-extracted.txt",
        text: `${NOT_EXTRACTED}: no complete arch fence in the reply\n`,
      });
    });
  }

  it("the old reader's block, not the whole reply, when the first step finds none", () => {
    // A closed json block, then an arch block never closed: the old regex opens at the json
    // block's closing fence and scores the empty text up to the arch opener, as it always did.
    expect(extractArch(`${F}json\n{}\n${F}\n${F}arch\n${PLAN}`)).toBe("");
  });
});

describe("known regression, backlog EV.10: an arch block in a wrapper fence, then a later untyped block", () => {
  // The current, documented behaviour, not the desired one: step 1 skips the wrapper and takes the
  // later untyped (or, for the glued closer, the arch fence run on to the later closer) block, where
  // the old regex scored the plan. Each needs a wrapper the model was not asked for.
  const RUN = "arch compile a.arch";
  const cases: [string, string, string][] = [
    [
      "a ```markdown wrapper, then a ```bash block",
      `${F}markdown\n${F}arch\n${PLAN}\n${F}\n${F}\n\nTo compile:\n${F}bash\n${RUN}\n${F}\n`,
      `To compile:\n${F}bash\n${RUN}`,
    ],
    [
      "a four-backtick wrapper, then an untyped block",
      `${F}\`markdown\n${F}arch\n${PLAN}\n${F}\n${F}\`\n\n${F}\n${RUN}\n${F}\n`,
      RUN,
    ],
    [
      "an unclosed ```json, the arch block, then an untyped block",
      `${F}json\n{"rooms": 1}\n${F}arch\n${PLAN}\n${F}\n\n${F}\n${RUN}\n${F}\n`,
      RUN,
    ],
    [
      "a closer glued to the last line, then an untyped block",
      `${F}arch\n${PLAN}${F}\n\nRun:\n${F}\n${RUN}\n${F}\n`,
      `${PLAN}${F}\n\nRun:`,
    ],
  ];
  for (const [name, reply, scored] of cases) {
    it(name, () => {
      expect(extractArch(reply)).toBe(scored);
      expect(liveSourceFile("b1", reply)).toEqual({ name: "b1.arch", text: scored });
    });
  }
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
        return new Response(
          JSON.stringify({
            content: [{ type: "text", text }],
            stop_reason: "end_turn",
          }),
          {
            status: 200,
          },
        );
      }),
    );
    // The collector main() uses: makeAuthor's onReply keeps the raw reply in memory only.
    const collector = liveReplyCollector();
    const author = makeAuthor(
      "anthropic",
      "claude-sonnet-5-5",
      new LiveLedger("claude-sonnet-5-5"),
      undefined,
      collector.onReply,
    );
    const scored = new Map<string, string>();
    const { results } = await evaluate(
      entries,
      async (e) => {
        current = e.id;
        const src = await collector.author(e.id, () => author(e.prompt));
        scored.set(e.id, src);
        return src;
      },
      { beforeEach: (e) => e.id === entries[4]!.id },
    );
    expect(results[0]!.valid).toBe(true);
    expect(results[4]!.skipped).toBe(true);

    const dir = mkdtempSync(join(tmpdir(), "ev2-"));
    try {
      collector.write(dir, results);
      const files = readdirSync(dir).sort();
      expect(files).toEqual(
        [
          `${entries[0]!.id}.arch`,
          `${entries[1]!.id}.not-extracted.txt`,
          `${entries[2]!.id}.not-extracted.txt`,
          `${entries[3]!.id}.not-extracted.txt`,
        ].sort(),
      );
      // Byte-equal to the text that was scored.
      expect(readFileSync(join(dir, `${entries[0]!.id}.arch`), "utf8")).toBe(scored.get(entries[0]!.id));
      expect(scored.get(entries[0]!.id)).toBe(golden);
      for (const f of files.filter((x) => x.endsWith(".txt"))) {
        const text = readFileSync(join(dir, f), "utf8");
        expect(text.startsWith(`${NOT_EXTRACTED}: `)).toBe(true);
        expect(text).not.toContain("room");
      }
      // A second run replaces the first run's files.
      collector.write(dir, results.slice(0, 1));
      expect(readdirSync(dir)).toEqual([`${entries[0]!.id}.arch`]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("main() wires the collector: makeAuthor gets its onReply, each brief goes through it, it writes", () => {
    const src = readFileSync(resolve(ROOT, "eval/run.ts"), "utf8");
    const main = src.slice(src.indexOf("async function main("));
    expect(main).toContain("const replies = liveReplyCollector();");
    expect(main).toContain("makeAuthor(provider, model, ledger, system, replies.onReply)");
    expect(main).toContain("await replies.author(e.id, () => author(e.prompt))");
    expect(main).toContain("replies.write(resolve(ROOT, LIVE_SOURCES_DIR), results);");
  });
});

describe("writeLiveSources refuses an id that is not a plain slug", () => {
  for (const id of ["../x", "a/b", "a\\b", "..", "a..b", "", "C:x", "a b"]) {
    it(JSON.stringify(id), () => {
      const dir = mkdtempSync(join(tmpdir(), "ev2-"));
      try {
        writeFileSync(join(dir, "keep.txt"), "x");
        const results = [
          { id: "ok-1", skipped: false },
          { id, skipped: false },
        ] as unknown as Parameters<typeof writeLiveSources>[1];
        expect(() => writeLiveSources(dir, results, new Map())).toThrow(/unsafe brief id/);
        // Nothing was removed or written.
        expect(readdirSync(dir)).toEqual(["keep.txt"]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }
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
