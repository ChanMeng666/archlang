// Copy the canonical repo docs into the VitePress site as page sources, and
// regenerate the example-gallery SVGs from examples/*.arch, so the site is always
// generated from the single source of truth (docs/*.md, examples/*.arch) and
// never drifts. Run automatically before `dev`/`build` via the npm scripts.
//
// REQUIRES the core to be built first (`npm run build` at the repo root) so the
// gallery can compile the examples through the published entry point. That is a hard
// requirement: a missing dist/ or a broken example EXITS 1 rather than warning and
// carrying on, because the alternative is a site that builds and deploys with an
// examples page whose every image 404s.
import { copyFileSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
// The README's permalink minter, reused rather than re-implemented: the `#z=` codec has
// three implementations already (playground/src/share.ts, this one, and ArchLive.vue's
// inline copy), welded by test/share-codec.test.ts. The home page's per-example links are
// a fourth CONSUMER of that encoder, never a fourth copy of it.
import { encodePlanHash } from "../scripts/gen-permalink.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");

/** Where an example's "Open in Playground" link points. */
const PLAYGROUND = "https://playground.archlang.uk";

// ───────────────────────────────────────────────────────────────────────────────
// THE THREE SOURCE TABLES. Everything this script writes is derived from these
// plus the contents of `examples/` and `docs/adr/` — nothing downstream is
// hand-listed twice. `scripts/smoke.mjs` and `test/docs-sync-list.test.ts` parse
// these same tables out of this file, so keep them literal, top-level, and in the
// uniform `["src", "dest"],` tuple shape those parsers expect.
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Canonical repo doc → site page source. `page()` writes the bannered page AND the
 * raw, unbannered copy at `public/<dest>` (served verbatim at `/<dest>`).
 */
const PAGES = [
  ["docs/language-reference.md", "reference.md"],
  ["docs/showcase.md", "showcase.md"],
  ["docs/cli-reference.md", "cli.md"],
  ["docs/furniture.md", "furniture.md"],
  ["docs/analysis.md", "analysis.md"],
  ["docs/axonometric.md", "axonometric.md"],
  ["docs/intent.md", "intent.md"],
  ["docs/error-codes.md", "errors.md"],
  ["spec.llm.md", "spec.md"],
];

/**
 * Repo-root artifacts copied byte-for-byte into `public/`, so a tool can fetch them
 * at the site root (all advertised in llms.txt): the llms.txt map + full-context
 * bundle (llms.txt hand-maintained, llms-full.txt from `npm run gen:llms`), the two
 * JSON schemas (`gen:plan-schema` / `gen:intent-schema`) and the GBNF grammar
 * (`gen:gbnf`).
 */
const ROOT_COPIES = [
  ["llms.txt", "llms.txt"],
  ["llms-full.txt", "llms-full.txt"],
  ["schemas/plan.schema.json", "plan.schema.json"],
  ["schemas/intent.schema.json", "intent.schema.json"],
  ["grammars/archlang.gbnf", "archlang.gbnf"],
];

/**
 * Examples deliberately kept OUT of the gallery, each with the reason it stays off.
 * The gallery itself is DERIVED (readdirSync minus this set), so a new
 * `examples/*.arch` ships to the site automatically — adding an example can no
 * longer be silently invisible here. An entry lands below only for a reason that
 * would survive review, never to quieten a build.
 */
const EXCLUDED_EXAMPLES = [
  // Resolves `import "lib/…"` through the World seam (file I/O). The gallery compiles
  // with the pure browser-safe `compile()` and no World, so it cannot render here.
  ["imports.arch", "needs the World seam to read examples/lib/*.arch"],
  // Imports its sibling museum-wing.arch as a whole-file component — same World-seam
  // dependency, so the composed building cannot compile in a live widget either.
  ["museum-wings.arch", "imports museum-wing.arch through the World seam"],
  // The component HALF of that pair: a wing drawn in local coordinates, published as a
  // component source rather than as a building in its own right.
  ["museum-wing.arch", "a component source, only meaningful as half of museum-wings"],
];

// VitePress publishes public/ verbatim at the site root. Create it up front so
// page() can also drop a raw-markdown copy of each generated page there.
const publicDir = join(here, "public");
mkdirSync(publicDir, { recursive: true });

/**
 * Copy a canonical doc into the site as a page source (with a "generated" banner),
 * AND publish the raw canonical markdown at `/<route>.md` (public/<dest>) so a tool
 * can fetch the plain source of any doc page by appending `.md` — the same
 * append-`.md` convention llms.txt advertises. The raw copy is the unbannered body,
 * i.e. exactly the repo's canonical markdown, so machines get clean text.
 */
function page(src, dest) {
  const body = readFileSync(join(repo, src), "utf8");
  const banner = `> _This page is generated from [\`${src}\`](https://github.com/chanmeng666/archlang/blob/main/${src}) — edit it there._\n\n`;
  writeFileSync(join(here, dest), banner + body);
  writeFileSync(join(publicDir, dest), body); // raw markdown at /<route>.md
  // eslint-disable-next-line no-console
  console.log(`  ${src} → ${dest}  (+ /${dest})`);
}

console.log("syncing canonical docs into the site:");
for (const [src, dest] of PAGES) page(src, dest);

for (const [src, dest] of ROOT_COPIES) {
  copyFileSync(join(repo, src), join(publicDir, dest));
  console.log(`  ${src} → public/${dest}`);
}

// ADRs: copy each, plus build an index.
const adrSrc = join(repo, "docs/adr");
const adrDest = join(here, "adr");
mkdirSync(adrDest, { recursive: true });
const adrs = readdirSync(adrSrc)
  .filter((f) => f.endsWith(".md") && f !== "index.md")
  .sort();
for (const f of adrs) copyFileSync(join(adrSrc, f), join(adrDest, f));
const adrEntries = adrs.map((f) => {
  const first = readFileSync(join(adrSrc, f), "utf8")
    .split("\n")
    .find((l) => l.startsWith("# "));
  // Strip the "ADR NNNN — " prefix: the sidebar is already an ordered ADR list.
  const title = (first ? first.replace(/^#\s*/, "") : f).replace(/^ADR\s*\d+\s*[—-]\s*/i, "");
  return { text: title, link: `/adr/${f.replace(/\.md$/, "")}` };
});
const index =
  "# Architecture Decision Records\n\nKey design decisions behind ArchLang, with their context and trade-offs.\n\n" +
  adrEntries.map((e) => `- [${e.text}](${e.link})`).join("\n") +
  "\n";
writeFileSync(join(adrDest, "index.md"), index);
// Emit the ADR sidebar as data so .vitepress/config.ts never hand-lists them. The
// hand-written list had frozen at 0005 while docs/adr/ grew to 0014 — same rot as the
// stale CLI docs, same fix: derive it from the source of truth.
writeFileSync(
  join(here, ".vitepress", "theme", "adr-data.js"),
  "// GENERATED by sync-docs.mjs from docs/adr/*.md — do not edit.\n" +
    `export const ADRS = ${JSON.stringify(adrEntries, null, 2)};\n`,
);
console.log(`  ${adrs.length} ADRs → adr/  (+ .vitepress/theme/adr-data.js)`);

// Example gallery: compile each example to SVG through the built core, and emit a
// data module with each example's *source* so the docs pages can seed live,
// editable `<ArchLive>` widgets from the same single source of truth.
const exDest = join(here, "public", "examples");
mkdirSync(exDest, { recursive: true });
// DERIVED, never hand-listed: every top-level `examples/*.arch` except the ones
// EXCLUDED_EXAMPLES names. The list used to be typed out here and froze — an example
// added to the repo shipped to npm, the spec and the README while staying invisible on
// the site, exactly the rot the ADR sidebar had before it started reading its directory.
//
// NB `two-storey` is a MULTI-STOREY plan: `compile().svg` (and therefore the gallery SVG
// and the live widget) is page 1 — the lowest level. The whole set is `compile().pages`.
const excluded = new Set(EXCLUDED_EXAMPLES.map(([f]) => f));
const examples = readdirSync(join(repo, "examples"))
  .filter((f) => f.endsWith(".arch") && statSync(join(repo, "examples", f)).isFile() && !excluded.has(f))
  .map((f) => f.replace(/\.arch$/, ""))
  .sort();
const sources = {};
for (const name of examples) {
  sources[name] = readFileSync(join(repo, "examples", `${name}.arch`), "utf8");
}
// Every example's playground permalink, minted at BUILD time. The home page's drawings
// are fixed source (unlike ArchLive's, which the reader edits), so their links can be
// plain `<a href>`s — middle-clickable, crawlable, no async click handler, nothing to
// encode in the browser. Keyed by the same names as EXAMPLES, so a card can never link
// to a plan whose drawing it is not showing.
const links = {};
for (const name of examples) links[name] = `${PLAYGROUND}/#z=${encodePlanHash(sources[name])}`;

// Always write the source data (needed for the live widgets even if the core
// isn't built yet — the widget compiles at runtime in that case).
writeFileSync(
  join(here, ".vitepress", "theme", "examples-data.js"),
  "// GENERATED by sync-docs.mjs from examples/*.arch — do not edit.\n" +
    `export const EXAMPLES = ${JSON.stringify(sources, null, 2)};\n\n` +
    "// Playground permalinks for the same sources — `#z=<base64url(deflate-raw(utf8))>`,\n" +
    "// the exact scheme playground/src/share.ts decodes.\n" +
    `export const EXAMPLE_LINKS = ${JSON.stringify(links, null, 2)};\n`,
);
console.log(`  ${examples.length} example sources + permalinks → .vitepress/theme/examples-data.js`);

// The gallery is a HARD requirement of the build, not a nice-to-have.
//
// This block used to `try { … } catch { console.warn("skipped") }` and carry on, so a
// missing `dist/` or a genuinely broken example produced a docs site with an intact
// examples page whose every <img> 404s — green build, silently broken deploy, and
// `scripts/smoke.mjs` only catches it AFTER the deploy is live. Every failure is now
// collected (so one run reports ALL the broken examples, not just the first) and the
// script exits 1.
const failures = [];
let compile = null;
try {
  ({ compile } = await import(pathToFileURL(join(repo, "dist", "index.js")).href));
} catch (e) {
  failures.push(`cannot load the built core from dist/ — run \`npm run build\` at the repo root first (${e.message})`);
}
if (compile) {
  for (const name of examples) {
    try {
      const { svg, diagnostics } = compile(sources[name], { noCache: true });
      const errs = diagnostics.filter((d) => d.severity === "error");
      if (errs.length) {
        // A recovered parse error carries no `code` — don't print "[undefined]".
        const code = errs[0].code ? `[${errs[0].code}] ` : "";
        failures.push(`examples/${name}.arch does not compile: ${code}${errs[0].message}`);
        continue;
      }
      writeFileSync(join(exDest, `${name}.svg`), svg);
    } catch (e) {
      failures.push(`examples/${name}.arch threw while compiling: ${e.message}`);
    }
  }
}
if (failures.length > 0) {
  console.error(`\nsync-docs FAILED — ${failures.length} example gallery problem(s):`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error(
    "\nThe docs site cannot be built without its example gallery: every /examples/<name>.svg\n" +
      "route and every live <ArchLive> widget is derived from these files. Fix the source (or\n" +
      "add it to EXCLUDED_EXAMPLES at the top of this file, with a reason) and re-run.\n",
  );
  process.exit(1);
}
console.log(`  ${examples.length} example SVGs → public/examples/`);
