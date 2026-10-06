/**
 * `arch watch` must arm its watcher BEFORE it announces itself.
 *
 * ## The defect this pins
 *
 * A poll watcher compares each `stat` against a baseline. Anything that changes the
 * file between the readiness banner and the moment that baseline is taken is folded
 * into it and never produces a change event — silently, and only for the very first
 * save. A user who starts `arch watch` and saves immediately watches nothing happen,
 * once, and then it works forever after, which is the hardest kind of bug to report.
 *
 * It shipped that way twice. First the banner was written on the line above
 * `fs.watchFile`. The end-to-end case in `cli-commands.test.ts` uses the banner as its
 * "ready" signal and so was *probabilistically* sensitive to it — it went red on one CI
 * leg of one run and green on a re-run, which reads as flakiness and is not. Widening the
 * window with a 1.5 s delay between the two lines made that case fail every time.
 *
 * That was fixed by reordering, on the premise that `watchFile` takes its baseline when
 * it is called — which is false: it queues its first `stat` on the libuv threadpool and
 * returns, so the banner could still beat the baseline whenever that `stat` was delayed.
 * The same end-to-end case went red again the same way (Node 22, CI, 2026-10-06). The
 * watcher is now `watchPath`, whose baseline is a synchronous `statSync` inside the call.
 *
 * ## Structural and behavioural, and why both
 *
 * `cli-commands.test.ts` spawns the real command, saves twice and requires both
 * recompiles. What that cannot do is prove the *ordering* — with the ordering correct it
 * always passes, and with it wrong it usually passes. A timing test for a race is a test
 * that reports the race as flakiness. The second premise, "the baseline exists once the
 * arming call returns", is pinned by the last block, which constructs the losing
 * interleaving with the stat source injected instead of waiting for it.
 *
 * The first block reads the source and asserts the two properties the ordering rests on. That
 * is deliberately narrow, and the narrowness is stated rather than papered over: it
 * pins the shape of one function, and it would not notice the same mistake made a
 * different way (a watcher armed inside a callback, say). It exists to stop this exact
 * window being reopened by someone tidying the function, which is how it opened.
 */

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { type WatchIO, watchPath } from "../src/cli/commands-render.js";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const SOURCE = resolve(ROOT, "src/cli/commands-render.ts");

/** The body of `cmdWatch`, from its signature to the closing brace of the function. */
function cmdWatchBody(): string {
  const src = readFileSync(SOURCE, "utf8");
  const start = src.indexOf("export async function cmdWatch(");
  expect(start, "cmdWatch not found — has it moved or been renamed?").toBeGreaterThan(-1);
  // Walk brace depth from the signature's opening brace to its match.
  const open = src.indexOf("{", start);
  let depth = 0;
  let i = open;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  return src.slice(open, i + 1);
}

describe("arch watch — the watcher is armed before it is announced", () => {
  const body = cmdWatchBody();
  const armAt = body.indexOf("watchPath(");
  // Matched on the banner's fixed tail rather than its interpolated head: a search
  // string containing `${` reads to a linter as a template literal written by mistake.
  const bannerAt = body.indexOf("(Ctrl+C to stop)");

  it("both the arming call and the readiness banner are present", () => {
    // If either disappears the ordering assertion below would pass vacuously, which is
    // the failure mode this whole file exists to argue against.
    expect(armAt, "no watchPath( call in cmdWatch").toBeGreaterThan(-1);
    expect(bannerAt, "no readiness banner in cmdWatch").toBeGreaterThan(-1);
  });

  it("arms the watcher before printing the banner", () => {
    expect(
      armAt,
      "the readiness banner is written before watchPath arms — a save landing in that " +
        "window is folded into watchPath's baseline stat and never fires. Move the " +
        "banner below the watchPath call.",
    ).toBeLessThan(bannerAt);
  });

  it("does not suspend between arming and announcing", () => {
    // Correct order is not sufficient on its own: an `await` between the two reopens the
    // same window, because the banner would then be printed a tick or more after arming
    // only in the happy case — and before it, if the awaited work yields first.
    const between = body.slice(armAt, bannerAt);
    expect(between, "an `await` between arming and announcing reopens the race").not.toMatch(/\bawait\b/);
  });
});

describe("arch watch — the watcher's baseline exists when the arming call returns", () => {
  /** A disk whose state the test sets, a record of every `stat`, and a hand-cranked poll. */
  function fakeDisk(initial: string | undefined) {
    const disk = { state: initial, stats: [] as Array<string | undefined>, poll: () => {} };
    const io: WatchIO = {
      stat: () => {
        disk.stats.push(disk.state);
        return disk.state;
      },
      every: (_ms, tick) => {
        disk.poll = tick;
        return () => {};
      },
    };
    return { disk, io };
  }

  /**
   * The interleaving that failed on CI, constructed rather than waited for: arm, then
   * save BEFORE any poll has run. Under `fs.watchFile` this is exactly the case its
   * asynchronous first `stat` loses — the save happened before the baseline did, so the
   * baseline already holds it. With the stat source and the timer injected there is no
   * clock and no threadpool, so the outcome is the same on every run.
   */
  it("a save between arming and the first poll is reported", () => {
    const { disk, io } = fakeDisk("v1");
    let changes = 0;
    watchPath("w.arch", 300, () => changes++, io);
    // The baseline was read during the call, from the file as it was then.
    expect(disk.stats).toEqual(["v1"]);

    disk.state = "v2"; // the save, landing before the first poll
    disk.poll();
    expect(changes).toBe(1);

    disk.poll(); // nothing changed since: no second report
    expect(changes).toBe(1);

    disk.state = "v3"; // and it keeps watching
    disk.poll();
    expect(changes).toBe(2);
  });

  it("a file vanishing and reappearing is reported each time", () => {
    const { disk, io } = fakeDisk("v1");
    let changes = 0;
    watchPath("w.arch", 300, () => changes++, io);
    disk.state = undefined;
    disk.poll();
    disk.state = "v2";
    disk.poll();
    expect(changes).toBe(2);
  });

  /**
   * The same interleaving against the real filesystem and timer: a save in the SAME TICK
   * as arming, which no poll can have preceded. Deterministic because the baseline is
   * synchronous — the only wait is for the first poll, bounded. `fs.watchFile` missed this
   * save 47 times in 50 on Node 22.
   */
  it("against the real filesystem, a save in the same tick as arming is reported", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "arch-watch-")), "w.arch");
    writeFileSync(file, "Alpha", "utf8");
    let changes = 0;
    const stop = watchPath(file, 20, () => changes++);
    try {
      writeFileSync(file, "Bravissimo", "utf8");
      const end = Date.now() + 30000;
      while (changes === 0 && Date.now() < end) await new Promise((r) => setTimeout(r, 20));
      expect(changes, "the save made right after arming was folded into the baseline").toBe(1);
    } finally {
      stop();
    }
  }, 60000);
});
