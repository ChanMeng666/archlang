/**
 * The replace-and-reparse oracle for a parse error's `expected` (card AF4, the red team's check on
 * #987, rounds 1 and 2). For each parse error spanned on one token: put each candidate token in
 * that token's place and parse again. A candidate the parser ACCEPTS there (no error starts at it
 * or covers it) must be listed in `expected` (`omitted` otherwise); a listed entry the parser
 * REJECTS there (an error spanned on that token alone names it, and the token after it is not the
 * same word, which the message could be naming instead) must not be (`rejected`). An error
 * spanned from the token over more is the statement the token began failing further on, so the
 * token was read. An `id` entry is tried as `id=<name>`, the only way it is read.
 *
 * The did-you-mean word (`hint`) is listed only when the position reads it: `hintBad` says when a
 * hinted word left out of `expected` is one the parser accepts there.
 *
 * Exemptions, each one the oracle's blind spot and not a gap in `expected`:
 * - a site whose `expected` has `expectedAt` or `expectedMore` (spanned on its statement, or cut);
 * - a word written where `expected` lists `<name>` (any word is a name there);
 * - in a block's statement list, the words the block reads only to refuse (`strip`, `level`,
 *   `accTitle`, `accDescr`, and a component's `keep` and `roof`): replacing a token with one may
 *   fail inside it before the refusal;
 * - `(` or `=` right after a word: it makes that word a call or an assignment of its own (a
 *   furniture `mirror` then `=`), which re-reads the statement before, not the position;
 * - a listed entry in {@link NEEDS_WHAT_FOLLOWS}: it is read at the position, but only with what
 *   follows it, which one token in the place of another cannot write.
 */
import { lexUnmemoised } from "../../src/lexer.js";
import { parseUnmemoised } from "../../src/parser.js";
import { KEYWORDS, STATEMENT_STARTS } from "../../src/grammar/tokens.js";
import { BUILTIN_REGISTRY } from "../../src/registry.js";
import type { Diagnostic } from "../../src/diagnostics.js";

/** Every candidate: the language's words, one token of each class, and the punctuation. */
export const ORACLE_WORDS: readonly string[] = [
  ...new Set<string>([
    ...(Object.values(KEYWORDS).flat() as string[]),
    ...STATEMENT_STARTS,
    ...BUILTIN_REGISTRY.byKeyword.keys(),
    "hidden",
    "sheet",
    "section",
    "id",
  ]),
].filter((w) => /^[A-Za-z_][\w-]*$/.test(w));
const CLASS_TOKEN: Record<string, string> = { "<number>": "1", "<string>": '"s"', "<name>": "zzq9", "<W>x<H>": "2x3" };
const PUNCT = ["(", ")", "{", "}", ",", "=", "[", "]", "-", "+", "!", ":"];
const REFUSED_IN_BLOCK = new Set(["strip", "level", "accTitle", "accDescr", "keep", "roof"]);
/** Entries read at their position only with what follows them, each with the shape it needs. */
export const NEEDS_WHAT_FOLLOWS: ReadonlyMap<string, string> = new Map([
  ["section", "`section <name> (x,y) (x,y)`: the word alone is no statement"],
  ["floor", "`floor <material>`: a room's `floor` clause needs a material word on its line"],
]);

const errorsOf = (s: string): Diagnostic[] =>
  parseUnmemoised(s, BUILTIN_REGISTRY).diagnostics.filter((d) => d.severity === "error" && d.span);
const names = (msg: string, c: string): boolean =>
  msg.includes(`"${c}"`) || msg.includes(`found ${c}`) || (c === '"s"' && msg.includes('string "s"'));

export interface OracleSite {
  id: string;
  message: string;
  expected: string[];
  omitted: string[];
  rejected: string[];
  /** The did-you-mean word, if the error has one. */
  hint?: string;
  /** Set when `hint` is left out of `expected` although the parser accepts it there. */
  hintBad?: string;
}

/** Judge one parse error of `src` (see the module header); null when it is not a one-token site. */
export function judge(id: string, src: string, d: Diagnostic): OracleSite | null {
  if (!d.expected || !d.span || d.expectedAt !== undefined || d.expectedMore !== undefined) return null;
  const toks = lexUnmemoised(src).tokens;
  const k = toks.findIndex((t) => t.start === d.span!.start && t.end === d.span!.end);
  const tok = toks[k];
  if (!tok || tok.type === "eof") return null;
  const afterWord = toks[k - 1]?.type === "ident";
  // The token after the replaced one: when it is the candidate's own text, a message naming the
  // candidate may be naming it (a strip's second `room` after a first one with no `size`).
  const next = toks[k + 1];
  const nextText = next && next.type !== "eof" ? src.slice(next.start, next.end) : "";
  const exp = d.expected;
  const put = (c: string): string =>
    `${src.slice(0, tok.start)} ${c === "id" && exp.includes("id") ? "id=zzq8" : c} ${src.slice(tok.end)}`;
  const at = tok.start + 1;
  const verdict = (c: string): "rejected" | "accepted" | "unclear" => {
    const es = errorsOf(put(c));
    const refused = (e: Diagnostic): boolean =>
      e.span!.start === at && e.span!.end === at + c.length && names(e.message, c) && nextText !== c;
    if (es.some(refused)) return "rejected";
    if (es.some((e) => e.span!.start <= at && at < e.span!.end) || es.some((e) => e.span!.start === at))
      return "unclear";
    return "accepted";
  };
  const block = exp.includes("<name>") && !exp.includes("units");
  const nameOk = exp.includes("<name>") && verdict("zzq9") !== "rejected";
  const rejected = exp.filter((e) => {
    if (e === "<end of input>" || (e === "<name>" && /statement/i.test(d.message))) return false;
    if (NEEDS_WHAT_FOLLOWS.has(e)) return false;
    return verdict(CLASS_TOKEN[e] ?? e) === "rejected";
  });
  const hint = d.hints?.map((h) => /^did you mean `([^` ]+)/.exec(h)?.[1]).find((w) => w !== undefined);
  const hintBad =
    hint !== undefined && !exp.includes(hint) && verdict(hint) === "accepted"
      ? `\`${hint}\` is read here but not listed`
      : undefined;
  const omitted: string[] = [];
  for (const c of [...ORACLE_WORDS, ...Object.values(CLASS_TOKEN), ...PUNCT]) {
    const entry = Object.entries(CLASS_TOKEN).find(([, v]) => v === c)?.[0] ?? c;
    if (exp.includes(entry)) continue;
    if (nameOk && /^[A-Za-z_]/.test(c)) continue;
    if (block && REFUSED_IN_BLOCK.has(c)) continue;
    if (afterWord && (c === "(" || c === "=")) continue;
    if (verdict(c) === "accepted") omitted.push(c);
  }
  return {
    id,
    message: d.message,
    expected: exp,
    omitted,
    rejected,
    ...(hint !== undefined ? { hint } : {}),
    ...(hintBad !== undefined ? { hintBad } : {}),
  };
}

/**
 * The red team's mutants of `src`: each `stride`-th token deleted, and an identifier replaced by an
 * unknown word. Each mutant's parse errors are judged once per (message shape, expected list), and
 * at most `max` sites are judged.
 */
export function oracleSites(
  name: string,
  src: string,
  stride: number,
  seen: Set<string>,
  max = Number.POSITIVE_INFINITY,
): OracleSite[] {
  const toks = lexUnmemoised(src).tokens.filter((t) => t.type !== "eof");
  const out: OracleSite[] = [];
  for (let i = 1; i < toks.length && out.length < max; i += stride) {
    const t = toks[i]!;
    const muts: [string, string][] = [["del", src.slice(0, t.start) + src.slice(t.end)]];
    if (t.type === "ident") muts.push(["zzq", `${src.slice(0, t.start)}zzq${src.slice(t.end)}`]);
    for (const [kind, m] of muts)
      for (const d of parseUnmemoised(m, BUILTIN_REGISTRY).diagnostics) {
        if (d.code !== "E_PARSE" || !d.expected || out.length >= max) continue;
        const key = `${d.message.replace(/"[^"]*"/g, '"…"').replace(/\d+/g, "N")} || ${d.expected.join(" ")}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const site = judge(`${name}#${i}#${kind}`, m, d);
        if (site) out.push(site);
      }
  }
  return out;
}
