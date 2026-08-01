/**
 * Output-text safety — the single place a string that came from user source is
 * made safe to embed in a **container format**.
 *
 * Escaping `& < > "` is only half the job. Every backend interpolates user text
 * (room labels, the plan name, the caption, title-block values, diagnostic
 * messages, theme values) into a format whose *lexical* layer forbids characters
 * the language itself happily accepts: the lexer takes any raw character except a
 * newline inside a `"…"` literal, so a `.arch` file can carry NUL, ESC, or an
 * unpaired surrogate straight through to a backend. Two containers care:
 *
 *   - **XML/SVG.** XML 1.0's `Char` production excludes the C0 controls other
 *     than tab/LF/CR, unpaired surrogates, and U+FFFE/U+FFFF. Emitting one makes
 *     the whole document ill-formed, so a browser's XML parser rejects the
 *     drawing outright — a stray control character in a label silently produces a
 *     file that renders nothing.
 *   - **Plain text (ASCII plan, DXF).** These are read by terminals and
 *     line-oriented parsers, where ESC begins an ANSI control sequence and LF/CR
 *     end a record. A control character in a label must never reach either.
 *
 * Both replacements are total, pure and deterministic, and are the identity on
 * text that has no forbidden character — which is every well-formed plan, so the
 * default output stays byte-identical.
 */

/**
 * Characters XML 1.0 forbids. The `u` flag is load-bearing: under it the engine
 * matches whole code points, so `[\uD800-\uDFFF]` catches only *unpaired*
 * surrogates and leaves a well-formed astral character (an emoji in a label) alone.
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is this modules entire purpose
const XML_ILLEGAL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uD800-\uDFFF\uFFFE\uFFFF]/gu;

/** Characters a plain-text container (terminal, line-oriented parser) must not see. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is this modules entire purpose
const PLAIN_UNSAFE = /[\u0000-\u001F\u007F-\u009F\uD800-\uDFFF]/gu;

/** U+FFFD REPLACEMENT CHARACTER — the standard stand-in, and legal everywhere. */
const REPLACEMENT = "�";

/**
 * XML-escape a string **and** neutralise every character XML 1.0 forbids, so the
 * result is safe both as element content and inside a double-quoted attribute.
 * `'` needs no escape: every attribute this project emits is double-quoted.
 */
export function xmlText(s: string): string {
  return s
    .replace(XML_ILLEGAL, REPLACEMENT)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Replace every control character (C0 incl. LF/CR/ESC, DEL, C1) and unpaired
 * surrogate with `replacement`, so the text cannot break a plain-text record or
 * drive a terminal. Defaults to a space — which is exactly what the DXF backend
 * has always done to a newline, so existing output is unchanged.
 */
export function plainText(s: string, replacement = " "): string {
  return s.replace(PLAIN_UNSAFE, replacement);
}
