import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { compile, renderAscii, renderErrorSvg, toDxf } from "../src/index.js";
import type { Diagnostic } from "../src/index.js";

/**
 * Output-escaping fuzz (workstream WS-G).
 *
 * `compile()` is the boundary between untrusted `.arch` text and three container
 * formats with completely different lexical rules — XML/SVG, the fixed-width ASCII
 * plan, and DXF's line-oriented group-code stream. This suite drives hostile text
 * through every user-controlled text position of a small valid plan and asserts
 * the properties each container needs, rather than spot-checking known payloads
 * (that is what `test/security.test.ts` does).
 *
 * The three laws under test, per backend:
 *   (a) the payload never reaches the output as structure — every `<` in an SVG
 *       opens a tag this project actually emits, or it is an entity;
 *   (b) the output is well-formed in its own format — strictly checked here by a
 *       small hand-written XML scanner (no new dependency) for SVG, by "no control
 *       characters" for the ASCII plan, and by group-code pair invariance for DXF;
 *   (c) determinism — the house law, re-asserted on hostile input.
 */

// ---------------------------------------------------------------------------
// Hostile-string generator
// ---------------------------------------------------------------------------

/** Markup / escaping metacharacters and the classic breakout payloads. */
const META = [
  "<",
  ">",
  "&",
  '"',
  "'",
  "`",
  "\\",
  "/",
  "]]>",
  "<![CDATA[",
  "<!--",
  "-->",
  "<?xml",
  "?>",
  "<script>alert(1)</script>",
  "</text><script>x</script><text>",
  "</svg>",
  '" onload="alert(1)',
  "' onload='alert(1)",
  "javascript:alert(1)",
  "url(data:image/svg+xml,x)",
  "&amp;",
  "&#60;",
  "&#x3c;",
  "&lt",
  "%3Cscript%3E",
  "{expr}",
  "0\nSECTION\n2\nENTITIES", // a DXF group-code stream, if newlines survived
  "\r0\rEOF", // the same, via carriage return
];

/** C0 control characters — ESC drives a terminal, NUL/LF/CR break a record. */
const controlChar = fc.integer({ min: 0x00, max: 0x1f }).map((c) => String.fromCharCode(c));

/** Unpaired surrogates — not encodable as UTF-8, not a legal XML character. */
const loneSurrogate = fc.integer({ min: 0xd800, max: 0xdfff }).map((c) => String.fromCharCode(c));

/** Bidi overrides, zero-width joiners and a BOM — legal, but visually deceptive. */
const trickyUnicode = fc.constantFrom(
  "\u202E",
  "\u202D",
  "\u200B",
  "\u200F",
  "\u2066",
  "\u2069",
  "\uFEFF",
  "\uFFFD",
  "\uFFFE",
  "\u{1f600}",
  "\u007F",
);

/** One chunk of a payload, weighted towards the shapes that break a serializer. */
const chunk = fc.oneof(
  { arbitrary: fc.constantFrom(...META), weight: 6 },
  { arbitrary: controlChar, weight: 4 },
  { arbitrary: loneSurrogate, weight: 2 },
  { arbitrary: trickyUnicode, weight: 3 },
  { arbitrary: fc.string({ minLength: 1, maxLength: 12 }), weight: 3 },
  { arbitrary: fc.string({ minLength: 200, maxLength: 400 }), weight: 1 },
);

/** A hostile string: several weighted chunks concatenated. */
const hostile = fc.array(chunk, { minLength: 1, maxLength: 8 }).map((cs) => cs.join(""));

/**
 * Escape a payload so the LEXER reads it back as one string literal: `"` and `\`
 * take a backslash, a newline becomes the `\n` escape (strings never span lines),
 * and `{` is escaped so the payload cannot open a `{expr}` interpolation. The
 * point is to get the payload INTO the label, not to test the lexer.
 */
function lit(payload: string): string {
  return payload.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\{/g, "\\{").replace(/\r?\n/g, "\\n");
}

// ---------------------------------------------------------------------------
// A strict, dependency-free XML well-formedness checker
// ---------------------------------------------------------------------------

/** Element names the SVG + error-card backends actually emit. Anything else in the
 *  output came from a payload — which is exactly the failure this catches. */
const ALLOWED_TAGS = new Set([
  "svg",
  "defs",
  "pattern",
  "g",
  "rect",
  "line",
  "circle",
  "path",
  "polygon",
  "text",
  "title",
  "desc",
]);

const NAME_START = /[A-Za-z_:]/;
const NAME_CHAR = /[A-Za-z0-9_:.-]/;
/** The only entities this project emits, plus numeric character references. */
const ENTITY = /^&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9A-Fa-f]+);/;
/** Code points XML 1.0 forbids outright (the `u` flag makes surrogates mean UNPAIRED). */
// biome-ignore lint/suspicious/noControlCharactersInRegex: the point of the check is to REJECT control characters
const XML_ILLEGAL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uD800-\uDFFF\uFFFE\uFFFF]/u;

/**
 * Scan `doc` as XML and throw on the first violation. Deliberately strict and
 * deliberately small: balanced tags, quoted attribute values, no raw `<` or bare
 * `&` in text or attribute values, and no XML-illegal code point anywhere.
 * Returns the element and attribute names it saw.
 */
function checkXml(doc: string): { tags: Set<string>; attrs: Set<string> } {
  const bad = XML_ILLEGAL.exec(doc);
  if (bad) {
    const cp = bad[0].codePointAt(0) ?? 0;
    throw new Error(`XML-illegal code point U+${cp.toString(16).toUpperCase()} at index ${bad.index}`);
  }
  const stack: string[] = [];
  const tags = new Set<string>();
  const attrs = new Set<string>();
  let i = 0;
  const readName = (): string => {
    const start = i;
    if (!NAME_START.test(doc[i] ?? ""))
      throw new Error(`bad name start at ${i}: ${JSON.stringify(doc.slice(i, i + 12))}`);
    i++;
    while (i < doc.length && NAME_CHAR.test(doc[i]!)) i++;
    return doc.slice(start, i);
  };
  const skipSpace = (): void => {
    while (i < doc.length && /\s/.test(doc[i]!)) i++;
  };
  const checkChars = (s: string, where: string): void => {
    for (let k = 0; k < s.length; k++) {
      const ch = s[k]!;
      if (ch === "<") throw new Error(`raw '<' in ${where}`);
      if (ch === "&") {
        if (!ENTITY.test(s.slice(k))) throw new Error(`bare '&' in ${where}: ${JSON.stringify(s.slice(k, k + 10))}`);
      }
    }
  };

  while (i < doc.length) {
    if (doc[i] !== "<") {
      const next = doc.indexOf("<", i);
      const end = next === -1 ? doc.length : next;
      checkChars(doc.slice(i, end), "text content");
      i = end;
      continue;
    }
    // A markup construct.
    if (doc.startsWith("<!--", i)) {
      const end = doc.indexOf("-->", i + 4);
      if (end === -1) throw new Error("unterminated comment");
      i = end + 3;
      continue;
    }
    if (doc.startsWith("<![CDATA[", i)) {
      const end = doc.indexOf("]]>", i + 9);
      if (end === -1) throw new Error("unterminated CDATA");
      i = end + 3;
      continue;
    }
    if (doc.startsWith("<?", i)) {
      const end = doc.indexOf("?>", i + 2);
      if (end === -1) throw new Error("unterminated processing instruction");
      i = end + 2;
      continue;
    }
    if (doc.startsWith("</", i)) {
      i += 2;
      const name = readName();
      skipSpace();
      if (doc[i] !== ">") throw new Error(`malformed end tag </${name}`);
      i++;
      const open = stack.pop();
      if (open !== name) throw new Error(`end tag </${name}> closes <${open ?? "nothing"}>`);
      continue;
    }
    // Start tag.
    i++;
    const name = readName();
    tags.add(name);
    for (;;) {
      const before = i;
      skipSpace();
      if (i >= doc.length) throw new Error(`unterminated start tag <${name}`);
      if (doc[i] === ">") {
        i++;
        stack.push(name);
        break;
      }
      if (doc.startsWith("/>", i)) {
        i += 2;
        break;
      }
      if (i === before) throw new Error(`attributes must be separated by space in <${name}> at ${i}`);
      const attr = readName();
      attrs.add(attr);
      skipSpace();
      if (doc[i] !== "=") throw new Error(`attribute ${attr} of <${name}> has no value`);
      i++;
      skipSpace();
      const q = doc[i];
      if (q !== '"' && q !== "'") throw new Error(`attribute ${attr} of <${name}> is unquoted`);
      i++;
      const close = doc.indexOf(q, i);
      if (close === -1) throw new Error(`unterminated value for ${attr} of <${name}>`);
      checkChars(doc.slice(i, close), `attribute ${attr} of <${name}>`);
      i = close + 1;
    }
  }
  if (stack.length > 0) throw new Error(`unclosed elements: ${stack.join(", ")}`);
  return { tags, attrs };
}

/** Constructs the backends never emit — any occurrence came from a payload. */
const FORBIDDEN_LITERALS = ["<script", "<foreignObject", "<!--", "<![CDATA[", "]]>", "<?"];

/** Every structural assertion an SVG this project emits must satisfy. */
function assertSafeSvg(svg: string): void {
  // (b) well-formed XML — throws with a precise reason.
  const { tags, attrs } = checkXml(svg);
  for (const tag of tags) {
    // (a) every element is one this project emits; a payload-derived tag fails here.
    expect(ALLOWED_TAGS.has(tag), `unexpected element <${tag}> in output`).toBe(true);
  }
  for (const attr of attrs) {
    // …and no attribute that could carry script. Read from the PARSED attribute
    // names, never from a regex over the raw text: escaped text content may legally
    // contain the literal characters ` onload=`, and that is not an attribute.
    expect(/^on/i.test(attr), `event-handler attribute ${attr} in output`).toBe(false);
    expect(["href", "xlink:href", "style", "srcset"].includes(attr), `active attribute ${attr}`).toBe(false);
  }
  for (const bad of FORBIDDEN_LITERALS) expect(svg).not.toContain(bad);
}

// ---------------------------------------------------------------------------
// Plans with a payload in each user-controlled text position
// ---------------------------------------------------------------------------

const WALL = `wall w thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }`;

/** The text positions a `.arch` author controls, each as a whole plan source. */
const INJECTION_SITES: Record<string, (p: string) => string> = {
  planName: (p) => `plan "${lit(p)}" { ${WALL} }`,
  roomLabel: (p) => `plan "P" { ${WALL} room id=r at (0,0) size 6000x4000 label "${lit(p)}" }`,
  furnitureLabel: (p) =>
    `plan "P" { ${WALL} room id=r at (0,0) size 6000x4000 label "Room"\n furniture desk at (1000,1000) size 1200x600 label "${lit(p)}" }`,
  dimText: (p) => `plan "P" { ${WALL} dim (0,-100)->(6000,-100) offset 600 text "${lit(p)}" }`,
  titleBlock: (p) => `plan "P" { title { project "${lit(p)}" drawn_by "${lit(p)}" date "${lit(p)}" } ${WALL} }`,
  accMetadata: (p) => `plan "P" { accTitle "${lit(p)}" accDescr "${lit(p)}" ${WALL} }`,
  themeValue: (p) => `plan "P" { theme { wall: "${lit(p)}" font: "${lit(p)}" } ${WALL} }`,
  interpolated: (p) => `plan "P" { let bad = "${lit(p)}" ${WALL} room id=r at (0,0) size 6000x4000 label "N: {bad}" }`,
};

const SITE_NAMES = Object.keys(INJECTION_SITES);

// ---------------------------------------------------------------------------
// (1) SVG — default, annotate, accessible
// ---------------------------------------------------------------------------

describe("escaping fuzz — SVG", () => {
  it("stays well-formed XML with only known tags, in every text position", () => {
    fc.assert(
      fc.property(fc.constantFrom(...SITE_NAMES), hostile, (site, payload) => {
        const src = INJECTION_SITES[site]!(payload);
        for (const opts of [{}, { annotate: true }, { accessible: true }]) {
          const { svg } = compile(src, { noCache: true, ...opts });
          if (svg === "") continue; // errored plan renders nothing — the default contract
          assertSafeSvg(svg);
        }
      }),
      { numRuns: 220 },
    );
  });

  it("never lets a payload's markup through verbatim", () => {
    fc.assert(
      fc.property(fc.constantFrom(...SITE_NAMES), hostile, (site, payload) => {
        const { svg } = compile(INJECTION_SITES[site]!(payload), { noCache: true, accessible: true });
        if (svg === "") return;
        // Anything the payload contributes is entity-escaped, so a construct the
        // backends never emit cannot appear at all — not even once.
        for (const probe of FORBIDDEN_LITERALS) expect(svg.split(probe).length - 1).toBe(0);
        // …and a metacharacter the payload carried survives only in entity form.
        // `themeValue` is exempt because a theme string carrying markup is BLANKED
        // outright by `sanitizeConfig` (W_SANITIZED_CONFIG) rather than escaped —
        // a stronger defence, so there is no `&lt;` to find.
        if (site === "themeValue") return;
        for (const [ch, entity] of [
          ["<", "&lt;"],
          [">", "&gt;"],
        ] as const) {
          if (!payload.includes(ch)) continue;
          expect(svg).toContain(entity);
        }
      }),
      { numRuns: 220 },
    );
  });

  it("is byte-identical across repeated compiles of the same hostile source", () => {
    fc.assert(
      fc.property(fc.constantFrom(...SITE_NAMES), hostile, (site, payload) => {
        const src = INJECTION_SITES[site]!(payload);
        expect(compile(src, { noCache: true }).svg).toBe(compile(src, { noCache: true }).svg);
        expect(compile(src, { noCache: true, annotate: true }).svg).toBe(
          compile(src, { noCache: true, annotate: true }).svg,
        );
      }),
      { numRuns: 150 },
    );
  });
});

// ---------------------------------------------------------------------------
// (2) The error-card SVG — hostile diagnostic content
// ---------------------------------------------------------------------------

describe("escaping fuzz — error-card SVG", () => {
  it("renders hostile diagnostic text as well-formed, tag-safe XML", () => {
    fc.assert(
      fc.property(hostile, hostile, hostile, (message, code, source) => {
        const diagnostics: Diagnostic[] = [
          { severity: "error", code, message, span: { start: 0, end: 1 } },
          { severity: "warning", code: `${code}_W`, message: `${message} again`, span: { start: 0, end: 2 } },
        ];
        const svg = renderErrorSvg(source, diagnostics);
        assertSafeSvg(svg);
        expect(renderErrorSvg(source, diagnostics)).toBe(svg); // determinism
      }),
      { numRuns: 200 },
    );
  });

  it("is well-formed for a plan compiled with onError: 'svg'", () => {
    fc.assert(
      fc.property(hostile, (payload) => {
        // A deliberately broken plan whose text carries the payload.
        const src = `plan "${lit(payload)}" { room id=r at (0,0) size ??? }`;
        const { svg } = compile(src, { noCache: true, onError: "svg" });
        if (svg === "") return;
        assertSafeSvg(svg);
      }),
      { numRuns: 150 },
    );
  });
});

// ---------------------------------------------------------------------------
// (3) ASCII plan — printable, grid-preserving
// ---------------------------------------------------------------------------

/** Control characters and unpaired surrogates a terminal must never receive. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: the point of the check is to REJECT control characters
const ASCII_UNSAFE = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F\uD800-\uDFFF]/u;

describe("escaping fuzz — ASCII plan", () => {
  it("emits no control character and keeps the fixed-width grid intact", () => {
    fc.assert(
      fc.property(fc.constantFrom("roomLabel", "furnitureLabel", "planName"), hostile, (site, payload) => {
        const src = INJECTION_SITES[site]!(payload);
        const { scene } = compile(src, { noCache: true, annotate: true });
        if (!scene) return;
        const txt = renderAscii(scene);
        // (a)+(b): nothing but printable text and the row separators the format
        // itself emits — so a payload cannot drive the terminal this is printed to.
        expect(ASCII_UNSAFE.test(txt), `control char in ASCII plan: ${JSON.stringify(txt.slice(0, 200))}`).toBe(false);
        // The grid stays rectangular: the row count comes from the geometry, so no
        // label text may add a row (a newline plotted into a cell once split one).
        const baseline = compile(INJECTION_SITES[site]!("Room"), { noCache: true, annotate: true });
        expect(txt.split("\n").length).toBe(renderAscii(baseline.scene!).split("\n").length);
        expect(renderAscii(scene)).toBe(txt); // determinism
      }),
      { numRuns: 150 },
    );
  });

  it("keeps every row within the requested width", () => {
    fc.assert(
      fc.property(hostile, (payload) => {
        const { scene } = compile(INJECTION_SITES.roomLabel!(payload), { noCache: true, annotate: true });
        if (!scene) return;
        for (const row of renderAscii(scene, { cols: 60 }).split("\n")) {
          expect([...row].length).toBeLessThanOrEqual(60);
        }
      }),
      { numRuns: 120 },
    );
  });
});

// ---------------------------------------------------------------------------
// (4) DXF — group-code stream integrity
// ---------------------------------------------------------------------------

/** Count the entities in a DXF: a `0` group code whose value is an entity type. */
function dxfEntityCount(dxf: string): number {
  const lines = dxf.split("\n");
  let n = 0;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    if (lines[i] === "0") n++;
  }
  return n;
}

/** A DXF is a strict stream of (code, value) LINE PAIRS: every even line is an integer. */
function assertDxfPairing(dxf: string): void {
  const lines = dxf.split("\n");
  expect(lines[lines.length - 1]).toBe(""); // trailing newline
  const body = lines.slice(0, -1);
  expect(body.length % 2, "odd number of DXF lines — the group-code stream desynchronized").toBe(0);
  for (let i = 0; i < body.length; i += 2) {
    expect(body[i], `line ${i} should be a group code`).toMatch(/^\d+$/);
  }
}

describe("escaping fuzz — DXF export", () => {
  it("keeps the group-code pairing and the entity count independent of the payload", () => {
    const baseline = compile(INJECTION_SITES.roomLabel!("Room"), { noCache: true });
    const baseCount = dxfEntityCount(toDxf(baseline.scene!));
    fc.assert(
      fc.property(fc.constantFrom("roomLabel", "furnitureLabel", "dimText"), hostile, (site, payload) => {
        const { scene } = compile(INJECTION_SITES[site]!(payload), { noCache: true });
        if (!scene) return;
        const dxf = toDxf(scene);
        assertDxfPairing(dxf);
        // No control character survives, so neither LF nor CR can end a record early
        // and no ESC can reach a terminal reading the file.
        expect(ASCII_UNSAFE.test(dxf.replace(/\n/g, ""))).toBe(false);
        expect(dxf.includes("\r")).toBe(false);
        if (site === "roomLabel") {
          // Structural injection would show up as extra entities.
          expect(dxfEntityCount(dxf)).toBe(baseCount);
        }
        expect(toDxf(scene)).toBe(dxf); // determinism
      }),
      { numRuns: 150 },
    );
  });
});

// ---------------------------------------------------------------------------
// (5) Shrunk regressions — the concrete bugs this fuzz found (see text-safe.ts)
// ---------------------------------------------------------------------------

describe("escaping fuzz — shrunk regressions", () => {
  const ESC = "\u001B[2J"; // an ANSI screen-clear sequence
  const NUL = "\u0000";

  it("a control character in a label never reaches the SVG (it made the XML ill-formed)", () => {
    const { svg } = compile(INJECTION_SITES.roomLabel!(`a${NUL}b${ESC}c`), { noCache: true });
    expect(svg).not.toBe("");
    expect(svg).not.toContain(NUL);
    expect(svg).not.toContain("\u001B");
    assertSafeSvg(svg);
  });

  it("a control character in a THEME value never reaches an SVG attribute", () => {
    const { svg } = compile(INJECTION_SITES.themeValue!(`#fff${NUL}${ESC}`), { noCache: true });
    assertSafeSvg(svg);
  });

  it("an unpaired surrogate never reaches the SVG (it is not encodable as UTF-8)", () => {
    const { svg } = compile(INJECTION_SITES.roomLabel!("a\uD800b"), { noCache: true });
    assertSafeSvg(svg);
    expect(svg).not.toContain("\uD800");
  });

  it("a newline in a label no longer splits an ASCII grid row", () => {
    const hit = compile(INJECTION_SITES.roomLabel!("a\nb"), { noCache: true, annotate: true });
    const flat = compile(INJECTION_SITES.roomLabel!("axb"), { noCache: true, annotate: true });
    const txt = renderAscii(hit.scene!);
    expect(txt.split("\n").length).toBe(renderAscii(flat.scene!).split("\n").length);
    expect(ASCII_UNSAFE.test(txt)).toBe(false);
  });

  it("a carriage return in a label never reaches the DXF group-code stream", () => {
    const { scene } = compile(INJECTION_SITES.roomLabel!("x\u000D0\u000DEOF"), { noCache: true });
    const dxf = toDxf(scene!);
    expect(dxf).not.toContain("\r");
    assertDxfPairing(dxf);
  });

  it("a well-formed plan is untouched by all of the above", () => {
    const clean = `plan "Flat" { ${WALL} room id=r at (0,0) size 6000x4000 label "Living 客厅" }`;
    const { svg, scene } = compile(clean, { noCache: true });
    assertSafeSvg(svg);
    expect(svg).toContain("Living 客厅");
    expect(toDxf(scene!)).toContain("Living 客厅");
  });
});
