/**
 * The one reader of a model's reply (EV.7): which text is scored as the plan. The eval harness
 * (`eval/run.ts`, re-exported there) and the `model-authoring` rows (`rows.ts`) both use these, so
 * the live score and a dataset row read a reply the same way. It lives under `dataset/` because
 * `dataset/` may import only the core and its own modules, never `eval/`; it imports nothing.
 */

/** A leading byte-order mark, dropped before a reply is read. */
const stripBom = (text: string): string => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);

/**
 * The body of a reply's first complete top-level fenced block whose info string is empty or `arch`,
 * read the way Markdown reads fences, else `undefined`: a fence opens only at a line start (up to
 * three spaces) with three or more backticks, and closes on a line of at least as many backticks and
 * nothing else. A fence of another type (`json`) is skipped whole, an inline triple backtick opens
 * nothing, and a block left open (a truncated reply) is not complete. There is no container
 * handling (a list item or a block quote is not read). A leading byte-order mark is dropped, and so
 * is a `\r` before a line end. Trimmed. Linear: each line is read once by the opener test and once
 * by the closer test.
 */
export function firstArchFence(reply: string): string | undefined {
  const lines = stripBom(reply)
    .split("\n")
    .map((l) => l.replace(/\r$/, ""));
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
 * The reader `extractArch` used before EV.7, kept as the second step: the regex
 * `` /```(?:arch)?\n([\s\S]*?)```/ `` of `eval/run.ts`, which takes the text after the first
 * ```` ``` ```` or ```` ```arch ```` that a newline follows, up to the next ```` ``` ```` anywhere,
 * trimmed; `undefined` when it finds no such pair. Written as `rows.ts` wrote it, with `indexOf`
 * rather than the lazy regex, so it is linear; the two were pinned equal by the rows parity test
 * before EV.7, and the body is that function's, with its whole-reply fallback left to the caller.
 */
export function legacyRegexBlock(text: string): string | undefined {
  let from = 0;
  for (;;) {
    const i = text.indexOf("```", from);
    if (i === -1) break;
    const after = i + 3;
    let start = -1;
    if (text.startsWith("arch\n", after)) start = after + 5;
    else if (text[after] === "\n") start = after + 1;
    if (start !== -1) {
      const end = text.indexOf("```", start);
      if (end === -1) break; // no closing fence anywhere later: no block
      return text.slice(start, end).trim();
    }
    from = i + 1;
  }
  return undefined;
}

/**
 * The `.arch` source scored for a reply, the first step that finds one: (1) {@link firstArchFence}'s
 * block; (2) else {@link legacyRegexBlock}'s, so a reply the old reader took a block from (a
 * ```` ```markdown ```` wrapper, a typed opener never closed, a closer glued to the last line) is
 * never pushed to the whole reply; (3) else the whole reply, trimmed (an unfenced or truncated reply
 * is scored as written, and fails as written). Known gap (backlog EV.10): such a wrapped block
 * followed by a later fenced block lets step 1 take the later block, where the old regex took the
 * plan.
 */
export function extractArch(text: string): string {
  return firstArchFence(text) ?? legacyRegexBlock(text) ?? text.trim();
}
