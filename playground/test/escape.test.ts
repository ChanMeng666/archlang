import { describe, expect, it } from "vitest";
import { escapeHtml } from "../src/escape.js";

describe("escapeHtml", () => {
  it("escapes the four entities it handles", () => {
    expect(escapeHtml("&")).toBe("&amp;");
    expect(escapeHtml("<")).toBe("&lt;");
    expect(escapeHtml(">")).toBe("&gt;");
    expect(escapeHtml('"')).toBe("&quot;");
  });

  it("DOES NOT escape the apostrophe", () => {
    // Actual behaviour, pinned: the panels only interpolate into element TEXT and
    // into DOUBLE-quoted attribute values (`title="…"`, `value="…"`), where a bare
    // `'` cannot break out. Add `'` to the table before using this in a
    // single-quoted attribute.
    expect(escapeHtml("it's")).toBe("it's");
  });

  it("is NOT idempotent — escaping twice double-escapes the ampersand", () => {
    // `&` maps to `&amp;`, whose own `&` is escaped on a second pass. Callers must
    // escape exactly once, at the point of interpolation.
    expect(escapeHtml(escapeHtml("&"))).toBe("&amp;amp;");
    expect(escapeHtml(escapeHtml("<b>"))).toBe("&amp;lt;b&amp;gt;");
  });

  it("escapes every occurrence, not just the first", () => {
    expect(escapeHtml("<<>>")).toBe("&lt;&lt;&gt;&gt;");
    expect(escapeHtml("a&b&c")).toBe("a&amp;b&amp;c");
  });

  it("neutralises a script-tag injection attempt", () => {
    expect(escapeHtml(`<script>alert("x")</script>`)).toBe(`&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;`);
    expect(escapeHtml(`" onload="evil()`)).toBe(`&quot; onload=&quot;evil()`);
  });

  it("passes through text with nothing to escape, unchanged and identical", () => {
    const plain = "room id=r label ünïcode ✓ — 12 m²";
    expect(escapeHtml(plain.replace(/"/g, ""))).toBe(plain.replace(/"/g, ""));
    expect(escapeHtml("")).toBe("");
  });

  it("escapes a realistic diagnostic message containing markup-ish text", () => {
    expect(escapeHtml(`expected <number>, got "close"`)).toBe(`expected &lt;number&gt;, got &quot;close&quot;`);
  });
});
