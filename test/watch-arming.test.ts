/**
 * `arch watch` must arm its watcher BEFORE it announces itself.
 *
 * ## The defect this pins
 *
 * `watchFile` takes its baseline `stat` at the moment it is called. Anything that
 * changes the file between the readiness banner and that call is folded into the
 * baseline and never produces a change event — silently, and only for the very first
 * save. A user who starts `arch watch` and saves immediately watches nothing happen,
 * once, and then it works forever after, which is the hardest kind of bug to report.
 *
 * It shipped that way: the banner was written on the line above `watchFile`. The
 * end-to-end case in `cli-commands.test.ts` uses the banner as its "ready" signal and
 * so was *probabilistically* sensitive to it — it went red on one CI leg of one run and
 * green on a re-run, which reads as flakiness and is not. Widening the window with a
 * 1.5 s delay between the two lines makes that case fail every time.
 *
 * ## Why this test is structural rather than behavioural
 *
 * The behaviour is already covered: `cli-commands.test.ts` spawns the real command,
 * saves twice and requires both recompiles. What that cannot do is prove the *ordering*
 * — with the ordering correct it always passes, and with it wrong it usually passes.
 * A timing test for a race is a test that reports the race as flakiness.
 *
 * So this reads the source and asserts the two properties the ordering rests on. That
 * is deliberately narrow, and the narrowness is stated rather than papered over: it
 * pins the shape of one function, and it would not notice the same mistake made a
 * different way (a watcher armed inside a callback, say). It exists to stop this exact
 * window being reopened by someone tidying the function, which is how it opened.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

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
  const armAt = body.indexOf("watchFile(");
  // Matched on the banner's fixed tail rather than its interpolated head: a search
  // string containing `${` reads to a linter as a template literal written by mistake.
  const bannerAt = body.indexOf("(Ctrl+C to stop)");

  it("both the arming call and the readiness banner are present", () => {
    // If either disappears the ordering assertion below would pass vacuously, which is
    // the failure mode this whole file exists to argue against.
    expect(armAt, "no watchFile( call in cmdWatch").toBeGreaterThan(-1);
    expect(bannerAt, "no readiness banner in cmdWatch").toBeGreaterThan(-1);
  });

  it("arms the watcher before printing the banner", () => {
    expect(
      armAt,
      "the readiness banner is written before watchFile arms — a save landing in that " +
        "window is folded into watchFile's baseline stat and never fires. Move the " +
        "banner below the watchFile call.",
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
