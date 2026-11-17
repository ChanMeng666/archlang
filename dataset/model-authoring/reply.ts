/**
 * The one reader of a model's reply (EV.7): which text is scored as the plan. The eval harness
 * (`eval/run.ts`, re-exported there) and the `model-authoring` rows (`rows.ts`) both use these, so
 * the live score and a dataset row read a reply the same way. It lives under `dataset/` because
 * `dataset/` may import only the core and its own modules, never `eval/`; it imports nothing.
 */

/**
 * The body of a reply's first complete fenced block whose info string is empty or `arch`, read the
 * way Markdown reads fences, else `undefined`: a fence opens only at a line start (up to three
 * spaces) with three or more backticks, and closes on a line of at least as many backticks and
 * nothing else. A fence of another type (`json`) is skipped whole, an inline triple backtick opens
 * nothing, and a block left open (a truncated reply) is not complete. A `\r` before a line end is
 * dropped. Trimmed. Linear: each line is read once by the opener test and once by the closer test.
 */
export function firstArchFence(reply: string): string | undefined {
  const lines = reply.split("\n").map((l) => l.replace(/\r$/, ""));
  for (let i = 0; i < lines.length; i++) {
    const open = /^ {0,3}(`{3,})([^`]*)$/.exec(lines[i]!);
    if (!open) continue;
    const ticks = open[1]!.length;
    const info = open[2]!.trim().split(/\s+/)[0]!;
    let close = -1;
    for (let j = i + 1; j < lines.length && close < 0; j++) {
      const c = /^ {0,3}(`{3,})[ \t]*$/.exec(lines[j]!);
      if (c && c[1]!.length >= ticks) close = j;
    }
    if (close < 0) return undefined;
    if (info === "" || info.toLowerCase() === "arch")
      return lines
        .slice(i + 1, close)
        .join("\n")
        .trim();
    i = close;
  }
  return undefined;
}

/**
 * The `.arch` source scored for a reply: {@link firstArchFence}'s block, else the whole reply,
 * trimmed (an unfenced or truncated reply is scored as written, and fails as written).
 */
export function extractArch(text: string): string {
  return firstArchFence(text) ?? text.trim();
}
