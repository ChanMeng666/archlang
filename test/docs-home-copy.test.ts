/**
 * The docs home page's copy contract (public-surfaces PS-D1, card D2).
 *
 * The home page was rebuilt around one message for the developer room. Its wording is decided,
 * not incidental, so this pins it at the source: the h1 and its sub-line (ADR 0010; the sub-line
 * is what names the category for a crawler), the canonical line as the lede, the three Why cards
 * word for word, the proof line's derived N, the gallery captions' length, and the guardrails
 * every surface's copy is checked against. The e2e specs (homepage-links, page-chrome) prove the
 * built page; this fails in `check:quick` the moment a word moves.
 *
 * The hero displays an agent-gallery pair, but the gallery is not pinned corpus (the isolation
 * law in test/agent-gallery.test.ts): nothing here reads it, only the hero's wiring.
 */
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string): string => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const THEME = "docs-site/.vitepress/theme";
const seam = read(`${THEME}/CompileSeam.vue`);
const doors = JSON.parse(read("site-shared/doors.json"));

/**
 * A file's visible copy: no `<style>`, no comments. A single left-to-right scan drops each block
 * whole, so removing one can never splice its neighbours into a new one.
 */
function copyOf(src: string): string {
  let out = cut(cut(src, "<style", "</style>"), "<!--", "-->");
  out = cut(out, "/*", "*/");
  return out.replace(/^\s*\/\/.*$/gm, "");
}

/** `src` with every `open … close` span removed by a plain scan (no regex, so nothing re-forms). */
function cut(src: string, open: string, close: string): string {
  let out = "";
  let at = 0;
  for (;;) {
    const s = src.indexOf(open, at);
    if (s < 0) return out + src.slice(at);
    out += src.slice(at, s);
    const e = src.indexOf(close, s + open.length);
    if (e < 0) return out;
    at = e + close.length;
  }
}

describe("the hero", () => {
  it("keeps the h1 and pins its sub-line", () => {
    expect(seam).toMatch(
      /<h1 class="headline">\s*Designs that <span class="headline__accent">compile\.<\/span>\s*<span class="headline__sub">A declarative language for floor plans\.<\/span>\s*<\/h1>/,
    );
  });

  it("leads with the canonical line, read from doors.json", () => {
    expect(seam).toContain('<p class="tagline">{{ canonicalLine }}</p>');
    expect(seam).toMatch(/import \{[^}]*\bcanonicalLine\b[^}]*\} from "\.\.\/\.\.\/\.\.\/site-shared\/doors\.json"/);
    expect(doors.canonicalLine).toBe(
      "Floor plans as code. Your AI writes ArchLang; the compiler draws a precise, dimensioned plan and tells it what's wrong.",
    );
  });

  it("offers the two primaries at equal weight: ChatGPT and the agent prompt", () => {
    const titles = [...seam.matchAll(/<span class="primary__title">([^<]+)<\/span>/g)].map((m) => m[1]);
    expect(titles).toEqual(["Use it in ChatGPT", "Copy the prompt for your agent"]);
    // One grid, two equal columns: neither door is the "secondary" one.
    expect(seam).toMatch(/\.primaries \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
    expect(seam).toContain(':href="NO_INSTALL.chatgpt.url"');
    expect(seam).toContain('agentPrompt.join("\\n")');
  });

  it("states the proof line with N derived, never typed, and keeps its PNG nuance on the page", () => {
    expect(seam).toMatch(
      /\{\{ EXAMPLE_COUNT \}\} example plans, every one compiled and checked in CI · SVG · PDF · DXF · PNG ·\s*MIT/,
    );
    expect(seam).toMatch(/import \{ EXAMPLE_COUNT, HOME \} from "\.\/home-data\.js"/);
    // The bare format list is only fair beside the sentence that says PNG is an optional download.
    expect(read(`${THEME}/IsIsntTable.vue`)).toContain("SVG, PDF and DXF offline; PNG with one optional download");
    expect(read(`${THEME}/HowSteps.vue`)).toContain("or PNG with one optional download");
  });

  it("shows the pair sync-docs chose, and survives one with no brief", () => {
    expect(seam).toContain("const PAIR = HOME.hero;");
    expect(seam).toContain('<figure v-if="PAIR.brief" class="chat">');
    const sync = read("docs-site/sync-docs.mjs");
    const fallback = /hero: \{ gallery: "[^"]+", fallback: "([^"]+)" \}/.exec(sync)?.[1];
    expect(readdirSync("examples"), "HOME_PROOFS.hero's fallback must be an example").toContain(`${fallback}.arch`);
  });
});

describe("the Why cards say exactly what PS-D1 decided", () => {
  it("three cards, word for word", () => {
    const why = read(`${THEME}/WhyCards.vue`);
    const cards = [...why.matchAll(/title: "([^"]+)",\s*body: "([^"]+)",/g)].map((m) => [m[1], m[2]]);
    expect(cards).toEqual([
      [
        "Exact.",
        "Areas and reachability are computed, not estimated; the same text gives the same drawing, byte for byte.",
      ],
      [
        "Change one line, see what moved.",
        "Edit a number and only what depends on it moves; `impact --lock` proves the rest didn't.",
      ],
      [
        "It checks itself.",
        "An unreachable room or an opening off its wall comes back as a message with a code and a fix your AI can apply; checks other than reachability and area are advisory.",
      ],
    ]);
  });

  it("every visual is the compiler's: drawn from HOME, which sync-docs computes on examples/", () => {
    const why = read(`${THEME}/WhyCards.vue`);
    expect(why).toMatch(/import \{ HOME \} from "\.\/home-data\.js"/);
    expect(copyOf(why)).not.toMatch(/\d+(\.\d+)?\s*m²/); // no typed area
    const sync = read("docs-site/sync-docs.mjs");
    const table = /const HOME_PROOFS = \{([\s\S]*?)\n\};/.exec(sync)?.[1] ?? "";
    for (const k of ["exact", "change", "check"]) {
      expect(table, `HOME_PROOFS.${k} must read examples/, the pinned corpus`).toMatch(
        new RegExp(`\\n  ${k}: \\{ example: "[a-z0-9-]+"`),
      );
    }
  });
});

describe("the home gallery", () => {
  const vue = read(`${THEME}/HomeGallery.vue`);
  const plans = [...vue.matchAll(/\{ example: "([^"]+)", caption: "([^"]+)" \}/g)].map((m) => ({
    example: m[1]!,
    caption: m[2]!,
  }));

  it("shows six to eight plans from examples/, each caption at most 20 words", () => {
    expect(plans.length).toBeGreaterThanOrEqual(6);
    expect(plans.length).toBeLessThanOrEqual(8);
    const files = new Set(readdirSync("examples"));
    for (const p of plans) {
      expect(files.has(`${p.example}.arch`), p.example).toBe(true);
      expect(p.caption.split(/\s+/).length, `${p.example}: "${p.caption}"`).toBeLessThanOrEqual(20);
    }
  });

  it("says it is a selection, not a benchmark", () => {
    expect(vue).toContain("Selected examples, not a benchmark.");
  });
});

describe("the copy keeps the guardrails", () => {
  /** Claims no surface may make, in any sense of the words. */
  const CLAIMS: ReadonlyArray<readonly [RegExp, string]> = [
    [/before you see it/i, "B12: a check never comes 'before you see it'"],
    [/\b(lays out|arranges|designs)\b/i, "ArchLang never designs, arranges or lays out"],
    [/no.?sign.?up/i, "say 'no install', never 'no signup'"],
    [/\bpixels?\b/i, "B1: no structure-versus-pixels contrast"],
    [/\b(beats?|replaces?|displaces?) (CAD|BIM)\b|\bdisplac\w*|instead of (CAD|BIM)\b/i, "no CAD/BIM displacement"],
    [/\b\d[\d,.]*\s*(stars?|downloads?|installs?)\b/i, "no traction counts"],
    [/public check suite|lang-1\.0|conformance/i, "not until those cards ship"],
  ];
  /** Words whose plain sense is fine in long reference prose, but not in the short home copy. */
  const WORDS: ReadonlyArray<readonly [RegExp, string]> = [
    [/\bblocks?\b(?! of)/i, "B12: a check reports, it never 'blocks'"],
    [/(?<![-\w])first\b/i, "novelty claims are retired"],
    [/(?<![-\w])only\b/i, "novelty claims are retired"],
    [/\bv?\d+\.\d+\.\d+\b/, "no version numbers on the home page"],
  ];
  /** An unmeasured time promise. */
  const TIME = /\b\d+\s*(seconds?|minutes?|secs?|mins?)\b/i;

  const HOME_COPY = [
    `${THEME}/CompileSeam.vue`,
    `${THEME}/SameSource.vue`,
    `${THEME}/PreviewLine.vue`,
    `${THEME}/WhyCards.vue`,
    `${THEME}/HowSteps.vue`,
    `${THEME}/HomeGallery.vue`,
    `${THEME}/IsIsntTable.vue`,
    `${THEME}/FactsSection.vue`,
    `${THEME}/TopicsRow.vue`,
    `${THEME}/door-copy.json`,
    `${THEME}/components/DoorsCard.vue`,
    `${THEME}/components/DoorBody.vue`,
    `${THEME}/components/StartDoors.vue`,
    `${THEME}/components/FilmFacade.vue`,
    `${THEME}/TitleBlockFooter.vue`,
    "docs-site/index.md",
    "docs-site/start.md",
  ];
  const PAGES = ["docs-site/guide.md", "docs-site/examples.md", "docs-site/gallery.md", "docs-site/3d.md"];

  /** Copy with the decided wording that uses a word in its plain sense taken out. */
  const visible = (f: string) =>
    copyOf(read(f))
      // The h1 is the brand line (ADR 0010): "Designs" there is a noun, not a claim.
      .replace("Designs that", "")
      // The PS-D1 wording itself says "only" in the plain sense.
      .replace("only what depends on it moves", "")
      .replace(/plan drawings only/gi, "")
      // CSS that survives in a component's inline style values.
      .replace(/inline-block|display: block|title block/g, "");

  for (const f of HOME_COPY) {
    it(f, () => {
      const text = visible(f);
      for (const [re, why] of [...CLAIMS, ...WORDS]) expect(re.exec(text)?.[0], `${f}: ${why}`).toBeUndefined();
      expect(TIME.exec(text)?.[0], `${f}: an unmeasured time claim`).toBeUndefined();
    });
  }

  for (const f of PAGES) {
    it(`${f} (claims, and time promises in its headings)`, () => {
      const text = visible(f);
      for (const [re, why] of CLAIMS) expect(re.exec(text)?.[0], `${f}: ${why}`).toBeUndefined();
      for (const h of text.split("\n").filter((l) => /^#{1,6} /.test(l))) {
        expect(TIME.exec(h)?.[0], `${f}: "${h}" promises a time nobody measured`).toBeUndefined();
      }
    });
  }

  it("docs-site/.vitepress/config.ts PAGE_META (every title and description)", () => {
    const config = read("docs-site/.vitepress/config.ts");
    const meta = /const PAGE_META = \[([\s\S]*?)\n\] as const;/.exec(config)?.[1] ?? "";
    const rows = [...meta.matchAll(/\[\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)",?\s*\]/g)];
    expect(rows.length).toBeGreaterThan(30);
    for (const [, route, title, description] of rows) {
      for (const [re, why] of CLAIMS) {
        expect(re.exec(`${title} ${description}`)?.[0], `${route}: ${why}`).toBeUndefined();
      }
      expect(TIME.exec(title!)?.[0], `${route}: "${title}" promises a time nobody measured`).toBeUndefined();
    }
  });

  /**
   * The 3D preview's wording bans (the 10-28 positioning record, restated in
   * docs/plans/public-surfaces/3d.md §1): the product word is "3D preview" and the replay a
   * "drafting-order replay"; never "3D CAD", "render", "walkthrough", "photoreal" or "model" as a
   * product claim, and BIM only as what it is not. "Not a renderer" is the one sanctioned use of
   * the word, in the is/isn't row the plan wrote.
   */
  const BANS_3D: ReadonlyArray<readonly [RegExp, string]> = [
    [/3D[\s-]*CAD/i, "never '3D CAD'"],
    [/walk[\s-]*through/i, "never a 'walkthrough'"],
    [/photo[\s-]*real/i, "never 'photoreal'"],
    [/\brender(s|ed|ing)?\b/i, "a 3D preview, never a render"],
    [/(?<!not a )\brenderers?\b/i, "'renderer' only as 'not a renderer'"],
    [/\bmodel(s|led|ling)?\b/i, "never 'model' as a product claim"],
    [/(?<![-\w])(first|only)\b/i, "novelty claims are retired"],
  ];
  /** Each `BIM` with no `no`/`not`/`or` in the words before it: a BIM claim. */
  const bimClaims = (text: string): string[] =>
    [...text.matchAll(/\bBIM\b/g)]
      .filter((m) => !/\b(no|not|nor|or)\b/i.test(text.slice(Math.max(0, m.index! - 40), m.index)))
      .map((m) => text.slice(Math.max(0, m.index! - 40), m.index! + 3));
  const check3d = (label: string, text: string) => {
    for (const [re, why] of [...BANS_3D, ...CLAIMS]) expect(re.exec(text)?.[0], `${label}: ${why}`).toBeUndefined();
    expect(bimClaims(text), `${label}: BIM only as what the 3D preview is not`).toEqual([]);
  };

  it("the 3D bans catch what they are for (canaries)", () => {
    for (const bad of [
      "A photoreal render of your plan.",
      "Take a walkthrough of the 3D model.",
      "3D CAD from text.",
      "BIM-ready output.",
      "The first 3D preview.",
    ]) {
      expect(() => check3d("canary", bad), bad).toThrow();
    }
    expect(() => check3d("canary", "Not a renderer, not BIM: no sections, elevations or BIM.")).not.toThrow();
  });

  const COPY_3D = [
    `${THEME}/SameSource.vue`,
    `${THEME}/ThreeDPlans.vue`,
    `${THEME}/PreviewLine.vue`,
    `${THEME}/HomeGallery.vue`,
    `${THEME}/IsIsntTable.vue`,
    "docs-site/3d.md",
  ];
  for (const f of COPY_3D) {
    it(`${f} keeps the 3D preview's wording bans`, () => check3d(f, visible(f)));
  }

  it("the package's lines and the download sentence keep the 3D bans and the home words", () => {
    const payload = read("packages/archlang-3d/src/replay/payload.ts");
    const lines = [...payload.matchAll(/export const PREVIEW_(?:LEAD|LABEL|LIMITS) =\s*"([^"]+)";/g)].map((m) => m[1]!);
    expect(lines).toHaveLength(3);
    const download = /export const PREVIEW_DOWNLOAD = "([^"]+)";/.exec(read("docs-site/three-d.mjs"))?.[1];
    expect(download).toBeTruthy();
    for (const text of [...lines, download!]) {
      check3d(text, text);
      for (const [re, why] of WORDS) expect(re.exec(text)?.[0], `${text}: ${why}`).toBeUndefined();
    }
  });

  it("the /3d PAGE_META row keeps the 3D bans", () => {
    const config = read("docs-site/.vitepress/config.ts");
    const row = /\[\s*"\/3d",\s*"([^"]+)",\s*"([^"]+)",?\s*\]/.exec(config);
    expect(row).toBeTruthy();
    check3d("/3d PAGE_META", `${row![1]} ${row![2]}`);
  });

  it("never compares ArchLang against AI images or CAD in a table (positioning B1)", () => {
    const table = copyOf(read(`${THEME}/IsIsntTable.vue`));
    expect(table).not.toMatch(/ChatGPT Images|Midjourney|DALL|AutoCAD|Revit|SketchUp/i);
    expect(table).toContain("What it is");
    expect(table).toContain("What it isn't");
  });
});
