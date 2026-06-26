/**
 * A tiny Wadler/Prettier "Doc" intermediate representation and printer.
 *
 * A `Doc` describes intent ("these parts go on one line if they fit, else break
 * here and indent") rather than literal text; {@link printDoc} measures each
 * `group` against the target width and renders it flat or broken. This is the
 * substrate the formatter ({@link import("./format.js")}) lowers the CST onto.
 *
 * Zero-dependency. See Philip Wadler, "A prettier printer", and Prettier's
 * "technical details" doc for the algorithm (group / indent / line / ifBreak).
 */

export type Doc =
  | string
  | { t: "concat"; parts: Doc[] }
  /** A space when its group is flat, a newline (+indent) when broken. */
  | { t: "line" }
  /** Nothing when flat, a newline (+indent) when broken. */
  | { t: "softline" }
  /** Always a newline (+indent); forces every enclosing group to break. */
  | { t: "hardline" }
  /** Try to lay the contents on one line; break them all if they don't fit. */
  | { t: "group"; doc: Doc }
  /** Indent the contents one level deeper. */
  | { t: "indent"; doc: Doc }
  /** Render `broken` when the enclosing group breaks, else `flat`. */
  | { t: "ifBreak"; broken: Doc; flat: Doc };

export const concat = (parts: Doc[]): Doc => ({ t: "concat", parts });
export const group = (doc: Doc): Doc => ({ t: "group", doc });
export const indent = (doc: Doc): Doc => ({ t: "indent", doc });
export const line: Doc = { t: "line" };
export const softline: Doc = { t: "softline" };
export const hardline: Doc = { t: "hardline" };
export const ifBreak = (broken: Doc, flat: Doc = ""): Doc => ({ t: "ifBreak", broken, flat });

/** Concatenate `items`, placing `sep` between each pair. */
export function join(sep: Doc, items: Doc[]): Doc {
  return concat(items.flatMap((it, i) => (i === 0 ? [it] : [sep, it])));
}

type Mode = "flat" | "break";
interface Cmd {
  ind: number;
  mode: Mode;
  doc: Doc;
}

/** Does the flat layout of `next` (then the rest of the stack) fit in `width`? */
function fits(width: number, next: Cmd, rest: Cmd[]): boolean {
  let remaining = width;
  const stack: Cmd[] = [next];
  let restIdx = rest.length - 1;
  while (remaining >= 0) {
    if (stack.length === 0) {
      if (restIdx < 0) return true;
      stack.push(rest[restIdx--]);
      continue;
    }
    const { ind, mode, doc } = stack.pop()!;
    if (typeof doc === "string") {
      remaining -= doc.length;
      continue;
    }
    switch (doc.t) {
      case "concat":
        for (let i = doc.parts.length - 1; i >= 0; i--) stack.push({ ind, mode, doc: doc.parts[i] });
        break;
      case "indent":
        stack.push({ ind: ind + 1, mode, doc: doc.doc });
        break;
      case "group":
        stack.push({ ind, mode, doc: doc.doc });
        break;
      case "line":
        if (mode === "flat") remaining -= 1;
        else return true; // a break ends the line — it fits
        break;
      case "softline":
        if (mode === "break") return true;
        break;
      case "hardline":
        // A hardline in the surrounding (break-mode) content just ends the
        // current line — the candidate fits. One inside the flat candidate
        // itself cannot be flattened, so it does not fit.
        if (mode === "break") return true;
        return false;
      case "ifBreak":
        stack.push({ ind, mode, doc: mode === "break" ? doc.broken : doc.flat });
        break;
    }
  }
  return false;
}

/** Render a {@link Doc} to text. `width` is the target column count. */
export function printDoc(doc: Doc, width = 80, tab = "  "): string {
  const out: string[] = [];
  let pos = 0;
  const cmds: Cmd[] = [{ ind: 0, mode: "break", doc }];
  const newline = (ind: number): void => {
    out.push("\n" + tab.repeat(ind));
    pos = ind * tab.length;
  };
  while (cmds.length > 0) {
    const { ind, mode, doc: d } = cmds.pop()!;
    if (typeof d === "string") {
      out.push(d);
      pos += d.length;
      continue;
    }
    switch (d.t) {
      case "concat":
        for (let i = d.parts.length - 1; i >= 0; i--) cmds.push({ ind, mode, doc: d.parts[i] });
        break;
      case "indent":
        cmds.push({ ind: ind + 1, mode, doc: d.doc });
        break;
      case "group": {
        const flat: Cmd = { ind, mode: "flat", doc: d.doc };
        cmds.push(fits(width - pos, flat, cmds) ? flat : { ind, mode: "break", doc: d.doc });
        break;
      }
      case "line":
        if (mode === "flat") {
          out.push(" ");
          pos += 1;
        } else newline(ind);
        break;
      case "softline":
        if (mode === "break") newline(ind);
        break;
      case "hardline":
        newline(ind);
        break;
      case "ifBreak":
        cmds.push({ ind, mode, doc: mode === "break" ? d.broken : d.flat });
        break;
    }
  }
  // Strip any trailing whitespace a break-then-indent may have left on a line.
  return out.join("").replace(/[ \t]+$/gm, "");
}
