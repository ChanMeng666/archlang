/**
 * The docs home page's copy contract (public-surfaces PS-D1, card D2).
 *
 * The home page was rebuilt around one message for the developer room. Its wording is decided,
 * not incidental, so this pins it at the source: the h1 and its sub-line (ADR 0010; the sub-line
 * is what names the category for a crawler), the canonical line as the lede, the three Why cards
 * word for word, the proof line's derived N, the gallery captions' length, and the guardrails
 * every surface's copy is checked against. The e2e specs (homepage-links, page-chrome) prove the
 * built page; this fails in `check:quick` the moment a word moves.
 */
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string): string => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const THEME = "docs-site/.vitepress/theme";
const seam = read(`${THEME}/CompileSeam.vue`);
const doors = JSON.parse(read("site-shared/doors.json"));

/** A component's visible copy: no `<style>`, no comments. */
function copyOf(src: string): string {
  return src
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
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

  it("states the proof line with N derived, never typed", () => {
    expect(seam).toMatch(
      /\{\{ EXAMPLE_COUNT \}\} example plans, every one compiled and checked in CI on every commit · SVG · PDF ·\s*DXF · PNG · MIT/,
    );
    expect(seam).toMatch(/import \{ EXAMPLE_COUNT, HOME \} from "\.\/home-data\.js"/);
  });

  it("tells the story with a real agent-gallery pair", () => {
    const sync = read("docs-site/sync-docs.mjs");
    const hero = /hero: \{ gallery: "([^"]+)" \}/.exec(sync)?.[1];
    expect(hero, "HOME_PROOFS.hero names no gallery entry").toBeTruthy();
    const ids = JSON.parse(read("docs/gallery/gallery.json")).map((e: { id: string }) => e.id);
    expect(ids).toContain(hero);
    expect(seam).toContain("PAIR.brief");
    expect(seam).toContain("const PAIR = HOME.hero;");
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

  it("every visual is the compiler's: drawn from HOME, which sync-docs computes", () => {
    const why = read(`${THEME}/WhyCards.vue`);
    expect(why).toMatch(/import \{ HOME \} from "\.\/home-data\.js"/);
    expect(copyOf(why)).not.toMatch(/\d+(\.\d+)?\s*m²/); // no typed area
    const sync = read("docs-site/sync-docs.mjs");
    for (const k of ["exact", "change", "check"]) expect(sync).toMatch(new RegExp(`\\n  ${k}: \\{`));
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

describe("the home copy keeps the guardrails", () => {
  const files = [
    `${THEME}/CompileSeam.vue`,
    `${THEME}/WhyCards.vue`,
    `${THEME}/HowSteps.vue`,
    `${THEME}/HomeGallery.vue`,
    `${THEME}/IsIsntTable.vue`,
    `${THEME}/FactsSection.vue`,
    `${THEME}/TopicsRow.vue`,
    `${THEME}/door-copy.json`,
    `${THEME}/components/DoorsCard.vue`,
    `${THEME}/components/DoorBody.vue`,
    "docs-site/index.md",
    "docs-site/start.md",
  ];
  const BANNED: ReadonlyArray<readonly [RegExp, string]> = [
    [/before you see it/i, "B12: a check never comes 'before you see it'"],
    [/\bblocks?\b(?! of)/i, "B12: a check reports, it never 'blocks'"],
    [/(?<![-\w])first\b/i, "novelty claims are retired"],
    [/(?<![-\w])only\b/i, "novelty claims are retired"],
    [/\b(lays out|arranges|designs)\b/i, "ArchLang never designs, arranges or lays out"],
    [/no.?sign.?up/i, "say 'no install', never 'no signup'"],
    [/\bpixels?\b/i, "B1: no structure-versus-pixels contrast"],
    [/\b(beats?|replaces?) (CAD|BIM)\b/i, "no CAD/BIM displacement"],
    [/\b\d[\d,.]*\s*(stars?|downloads?|installs?)\b/i, "no traction counts"],
    [/\bv?\d+\.\d+\.\d+\b/, "no version numbers on the home page"],
    [/public check suite|lang-1\.0|conformance/i, "not until those cards ship"],
  ];
  for (const f of files) {
    it(f, () => {
      // The h1 is the brand line (ADR 0010): "Designs" there is a noun, not a claim.
      // The PS-D1 wording itself is exempt where it says "only" in the plain sense.
      const text = copyOf(read(f))
        .replace("Designs that", "")
        .replace("only what depends on it moves", "")
        .replace(/plan drawings only/gi, "");
      for (const [re, why] of BANNED) expect(re.exec(text)?.[0], `${f}: ${why}`).toBeUndefined();
    });
  }

  it("never compares ArchLang against AI images or CAD in a table (positioning B1)", () => {
    const table = copyOf(read(`${THEME}/IsIsntTable.vue`));
    expect(table).not.toMatch(/ChatGPT Images|Midjourney|DALL|AutoCAD|Revit|SketchUp/i);
    expect(table).toContain("What it is");
    expect(table).toContain("What it isn't");
  });
});
