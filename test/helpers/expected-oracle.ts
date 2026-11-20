/**
 * The replace-and-reparse oracle for a parse error's `expected` (card AF4, the red team's check on
 * #987, round 1). For each parse error spanned on one token: put each candidate token in that
 * token's place and parse again. A candidate the parser ACCEPTS there (no error starts at it or
 * covers it) must be listed in `expected`; one it REJECTS (an error starts at it and names it) is
 * reported as listed-but-rejected, which is allowed: some entries need what follows them (`id` as
 * `id=`, `section` as `section A (`, `floor` before a material), and the did-you-mean word is listed
 * even where it would not parse.
 *
 * Exemptions, each one the oracle's blind spot and not a gap in `expected`:
 * - a site whose `expected` has `expectedAt` or `expectedMore` (spanned on its statement, or cut);
 * - a word written where `expected` lists `<name>` (any word is a name there);
 * - in a block's statement list, the words the block reads only to refuse (`strip`, `level`,
 *   `accTitle`, `accDescr`): replacing a token with one may fail inside it before the refusal.
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
const REFUSED_IN_BLOCK = new Set(["strip", "level", "accTitle", "accDescr"]);

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
}

/** Judge one parse error of `src` (see the module header); null when it is not a one-token site. */
export function judge(id: string, src: string, d: Diagnostic): OracleSite | null {
  if (!d.expected || !d.span || d.expectedAt !== undefined || d.expectedMore !== undefined) return null;
  const tok = lexUnmemoised(src).tokens.find((t) => t.start === d.span!.start && t.end === d.span!.end);
  if (!tok || tok.type === "eof") return null;
  const exp = d.expected;
  const put = (c: string): string =>
    `${src.slice(0, tok.start)} ${c === "id" && exp.includes("id") ? "id=zzq8" : c} ${src.slice(tok.end)}`;
  const at = tok.start + 1;
  const verdict = (c: string): "rejected" | "accepted" | "unclear" => {
    const es = errorsOf(put(c));
    if (es.some((e) => e.span!.start === at && names(e.message, c))) return "rejected";
    if (es.some((e) => e.span!.start <= at && at < e.span!.end) || es.some((e) => e.span!.start === at))
      return "unclear";
    return "accepted";
  };
  const block = exp.includes("<name>") && !exp.includes("units");
  const nameOk = exp.includes("<name>") && verdict("zzq9") !== "rejected";
  const rejected = exp.filter((e) => {
    if (e === "<end of input>" || (e === "<name>" && /statement/i.test(d.message))) return false;
    return verdict(CLASS_TOKEN[e] ?? e) === "rejected";
  });
  const omitted: string[] = [];
  for (const c of [...ORACLE_WORDS, ...Object.values(CLASS_TOKEN), ...PUNCT]) {
    const entry = Object.entries(CLASS_TOKEN).find(([, v]) => v === c)?.[0] ?? c;
    if (exp.includes(entry)) continue;
    if (nameOk && /^[A-Za-z_]/.test(c)) continue;
    if (block && REFUSED_IN_BLOCK.has(c)) continue;
    if (verdict(c) === "accepted") omitted.push(c);
  }
  return { id, message: d.message, expected: exp, omitted, rejected };
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
