/**
 * Brand-asset copy-fidelity gate.
 *
 * `brand/` is the byte-sacred logo kit (AGENTS.md's brand iron law: one master SVG, every
 * variant a fill-swap only — never re-traced, re-simplified or re-fitted). The two public
 * sites cannot import from it, so each keeps its own COPY under `public/brand/`, served
 * verbatim as favicons, apple-touch icons and the OG social card. Nothing kept those copies
 * honest: re-exporting an icon into `playground/public/brand/` alone would leave the docs
 * site serving the old art, and touching a copy instead of the master would fork the kit
 * from its source with no build step to notice.
 *
 * The law this pins is COPY FIDELITY, not full-kit parity: the sites are free to publish a
 * subset of `brand/` (they do — no `.png` variants of the SVG icons, no brand book), but
 * every file they DO publish must be byte-identical to the master kit, and the two sites
 * must publish the SAME set (a favicon that exists on one site only is a bug, not a choice).
 * Files that are legitimately site-only — not part of the logo kit at all — are listed in
 * SITE_ONLY below, one comment each.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const BRAND = "brand";
const COPIES = ["playground/public/brand", "docs-site/public/brand"] as const;

/**
 * Files the sites publish under `brand/` that are NOT part of the logo kit, so they have
 * no master in `brand/` to be compared against. One comment per entry.
 */
const SITE_ONLY = new Set<string>([
  // The author's avatar, used in the sites' footer/title block — a photo-substitute
  // portrait mark, not a variant of the ArchLang logo, so it never entered the kit.
  "chan-meng-monkey.svg",
]);

/** Plain files directly inside `dir`, sorted (the brand dirs are flat). */
const filesIn = (dir: string): string[] =>
  readdirSync(dir)
    .filter((f) => statSync(join(dir, f)).isFile())
    .sort();

describe("site brand copies stay byte-identical to the master kit in brand/", () => {
  const master = new Set(filesIn(BRAND));

  it("the master kit is present and non-trivial", () => {
    expect(master.has("archlang-logo-master.svg")).toBe(true);
    expect(master.size).toBeGreaterThan(5);
  });

  it("both sites publish exactly the same set of brand files", () => {
    const [a, b] = COPIES;
    expect(
      filesIn(b),
      `The two sites' brand copies have diverged:\n  ${a}\n  ${b}\n` +
        `Both are served as favicons / social cards from the ONE kit in ${BRAND}/, so a file ` +
        `added to (or dropped from) one site must land on the other too — otherwise one site ` +
        `silently serves different art. Copy the file across, or remove it from both.`,
    ).toEqual(filesIn(a));
  });

  describe.each(COPIES)("%s", (dir) => {
    const copied = filesIn(dir);

    it("publishes something", () => {
      expect(copied.length).toBeGreaterThan(0);
    });

    it.each(copied)("%s is byte-identical to its brand/ master", (name) => {
      if (SITE_ONLY.has(name)) return; // not a logo-kit asset — see SITE_ONLY above
      expect(
        master.has(name),
        `${dir}/${name} has no master in ${BRAND}/. Brand assets are byte-sacred: every published ` +
          `variant is generated from ${BRAND}/archlang-logo-master.svg by a FILL SWAP ONLY and lives ` +
          `in ${BRAND}/ first. Add the master (and its sibling site copy), or — if this file is not ` +
          `part of the logo kit at all — list it in SITE_ONLY here with a reason.`,
      ).toBe(true);
      const want = readFileSync(join(BRAND, name));
      const got = readFileSync(join(dir, name));
      expect(
        got.equals(want),
        `${dir}/${name} has drifted from ${BRAND}/${name} (${got.length} vs ${want.length} bytes). ` +
          `The site copies are COPIES — never edit or re-export one in place. Fix ${BRAND}/${name} ` +
          `(fill-swap only, never re-trace the path data) and re-copy it to BOTH ${COPIES.join(" and ")}.`,
      ).toBe(true);
    });
  });
});
