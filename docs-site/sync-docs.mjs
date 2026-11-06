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
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
// The README's permalink minter, reused rather than re-implemented: the `#z=` codec has
// three implementations already (playground/src/share.ts, this one, and ArchLive.vue's
// inline copy), welded by test/share-codec.test.ts. The home page's per-example links are
// a fourth CONSUMER of that encoder, never a fourth copy of it.
import { encodePlanHash } from "../scripts/gen-permalink.mjs";
import { siteMarkdown } from "./site-markdown.mjs";
import { HOME_3D_PLAN, MANIFEST, PAYLOAD, previewLines, sizeLabel, threeDAssets, VIEW3D_PARAM } from "./three-d.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");

/** Where an example's "Open in Playground" link points. */
const PLAYGROUND = "https://playground.archlang.uk";

// ───────────────────────────────────────────────────────────────────────────────
// THE FOUR SOURCE TABLES. Everything this script writes is derived from these
// plus the contents of `examples/` and `docs/adr/` — nothing downstream is
// hand-listed twice (the `_headers` `.md` rules are generated from PAGES + SITE_PAGES). `scripts/smoke.mjs` and `test/docs-sync-list.test.ts` parse
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
  ["docs/import.md", "import.md"],
  ["docs/from-an-image.md", "from-an-image.md"],
  ["docs/edit-one-room.md", "edit-one-room.md"],
  ["docs/common-mistakes.md", "common-mistakes.md"],
  ["docs/whats-new.md", "whats-new.md"],
  ["spec.llm.md", "spec.md"],
];

/**
 * The HAND-WRITTEN docs-site pages (tracked `docs-site/*.md`), each published as a raw
 * markdown copy at `public/<dest>` (`/<dest>`) by `siteMarkdown()` (`site-markdown.mjs`) — Vue
 * components and VitePress-only syntax replaced by their text fallback. Same tuple shape
 * as `PAGES` (`["src", "dest"]`, src relative to the repo root) so `scripts/smoke.mjs`
 * reads both. The `_headers` rule for every `.md` route is GENERATED from `PAGES` + this
 * table (`npm run gen:docs-headers`), and `test/docs-sync-list.test.ts` fails when a
 * tracked page is missing here — a page without a `.md` route cannot ship.
 */
const SITE_PAGES = [
  ["docs-site/index.md", "index.md"],
  ["docs-site/start.md", "start.md"],
  ["docs-site/guide.md", "guide.md"],
  ["docs-site/agents.md", "agents.md"],
  ["docs-site/examples.md", "examples.md"],
  ["docs-site/gallery.md", "gallery.md"],
  ["docs-site/relational.md", "relational.md"],
  ["docs-site/embed.md", "embed.md"],
  ["docs-site/privacy.md", "privacy.md"],
  ["docs-site/terms.md", "terms.md"],
  ["docs-site/floor-plans-as-code.md", "floor-plans-as-code.md"],
  ["docs-site/floor-plan-dsl.md", "floor-plan-dsl.md"],
  ["docs-site/mcp.md", "mcp.md"],
  ["docs-site/javascript.md", "javascript.md"],
  ["docs-site/vs-mermaid.md", "vs-mermaid.md"],
  ["docs-site/floor-plan-tools-for-ai-agents.md", "floor-plan-tools-for-ai-agents.md"],
  ["docs-site/floor-plan-with-a-coding-agent.md", "floor-plan-with-a-coding-agent.md"],
  ["docs-site/text-to-dxf-floor-plan.md", "text-to-dxf-floor-plan.md"],
  ["docs-site/check-a-floor-plan.md", "check-a-floor-plan.md"],
  ["docs-site/3d.md", "3d.md"],
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

// ───────────────────────────────────────────────────────────────────────────────
// SITEMAP DATES for the pages this script GENERATES.
//
// VitePress dates each sitemap entry from the git history of the built page — and
// every page above is untracked build output, so `git log` on it returns nothing and
// the entry shipped with no <lastmod> at all. The honest date is the CANONICAL
// source's last commit, which only this script knows the mapping for. Write it as
// data; `.vitepress/config.ts` stamps it through `sitemap.transformItems`.
//
// A fabricated date would be worse than none (a build-time `new Date()` on unchanged
// content is noise search engines discount), so a file git cannot date is OMITTED,
// and any git failure at all — a shallow clone, no git, an export tarball — leaves
// the map empty rather than failing the docs build.
// ───────────────────────────────────────────────────────────────────────────────
const lastmod = {};
try {
  const commitDate = (src) =>
    execFileSync("git", ["log", "-1", "--format=%cI", "--", src], { cwd: repo, encoding: "utf8" }).trim();
  for (const [src, dest] of PAGES) {
    const iso = commitDate(src);
    if (iso) lastmod[`/${dest.replace(/\.md$/, "")}`] = iso;
  }
  for (const f of adrs) {
    const iso = commitDate(`docs/adr/${f}`);
    if (iso) lastmod[`/adr/${f.replace(/\.md$/, "")}`] = iso;
  }
  // The ADR index is generated from the directory, so it is as new as its newest ADR.
  const newestAdr = adrs
    .map((f) => lastmod[`/adr/${f.replace(/\.md$/, "")}`])
    .filter(Boolean)
    .sort()
    .pop();
  if (newestAdr) lastmod["/adr/"] = newestAdr;
} catch (e) {
  console.warn(`  (no sitemap lastmod dates: ${e.message.split("\n")[0]})`);
}
writeFileSync(join(here, ".vitepress", "lastmod.json"), `${JSON.stringify(lastmod, null, 2)}\n`);
console.log(`  ${Object.keys(lastmod).length} sitemap lastmod dates → .vitepress/lastmod.json`);

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

// The 3D preview (public-surfaces card X6): the package's PS-D12 and limits lines and the plans
// gen:3d-assets wrote into public/3d/, each with its playground link opening on the 3D preview.
// The links are minted here like the examples' above, from the same source the drawing is.
const preview3d = previewLines(repo);
const assets3d = threeDAssets(repo).map((a) => {
  if (!links[a.name]) throw new Error(`sync-docs: the 3D asset ${a.name} is not a gallery example`);
  return { ...a, link3d: `${links[a.name]}&${VIEW3D_PARAM}`, glbSize: sizeLabel(a.glb.bytes) };
});
if (!assets3d.some((a) => a.name === HOME_3D_PLAN && a.video)) {
  throw new Error(`sync-docs: the home band's plan ${HOME_3D_PLAN} has no 3D assets with a replay in ${MANIFEST}`);
}
writeFileSync(
  join(here, ".vitepress", "theme", "three-d-data.js"),
  `// GENERATED by sync-docs.mjs from ${PAYLOAD} and ${MANIFEST} — do not edit.\n` +
    `export const PREVIEW = ${JSON.stringify(preview3d, null, 2)};\n\n` +
    `export const HOME_3D_PLAN = ${JSON.stringify(HOME_3D_PLAN)};\n\n` +
    `export const ASSETS_3D = ${JSON.stringify(assets3d, null, 2)};\n`,
);
console.log(`  ${assets3d.length} plans' 3D preview → .vitepress/theme/three-d-data.js`);

// The gallery is a HARD requirement of the build, not a nice-to-have.
//
// This block used to `try { … } catch { console.warn("skipped") }` and carry on, so a
// missing `dist/` or a genuinely broken example produced a docs site with an intact
// examples page whose every <img> 404s — green build, silently broken deploy, and
// `scripts/smoke.mjs` only catches it AFTER the deploy is live. Every failure is now
// collected (so one run reports ALL the broken examples, not just the first) and the
// script exits 1.
/**
 * A STOREY's file name inside the gallery: `<stem>.L<level>.svg`.
 *
 * This is the CLI's own law — `levelTarget()` in `src/cli/io.ts`, which is what
 * `arch compile townhouse.arch` applies when it writes `townhouse.L1.svg` — restated
 * here because this is a plain `.mjs` build script and cannot import the TypeScript
 * CLI (`dist/cli.js` runs `main()` on import). A restatement rots, so it is PROVED
 * rather than trusted, twice: `test/docs-level-svgs.test.ts` extracts this very arrow
 * and asserts it agrees with `levelTarget()` across a spread of levels, and
 * `docs-site/e2e/routes.spec.ts` derives the routes it fetches from `levelTarget()`
 * itself. A level file on the site and a level file from the CLI cannot disagree.
 */
const levelSvgName = (name, level) => `${name}.L${level}.svg`;

const failures = [];
let levelSvgCount = 0;
let compile = null;
let describe = null;
let lint = null;
let impact = null;
let applyLetOverride = null;
let diagnosticToJson = null;
try {
  ({ compile, describe, lint, impact, applyLetOverride, diagnosticToJson } = await import(
    pathToFileURL(join(repo, "dist", "index.js")).href
  ));
} catch (e) {
  failures.push(`cannot load the built core from dist/ — run \`npm run build\` at the repo root first (${e.message})`);
}
if (compile) {
  for (const name of examples) {
    try {
      const { svg, diagnostics, pages } = compile(sources[name], { noCache: true });
      const errs = diagnostics.filter((d) => d.severity === "error");
      if (errs.length) {
        // A recovered parse error carries no `code` — don't print "[undefined]".
        const code = errs[0].code ? `[${errs[0].code}] ` : "";
        failures.push(`examples/${name}.arch does not compile: ${code}${errs[0].message}`);
        continue;
      }
      writeFileSync(join(exDest, `${name}.svg`), svg);
      // The source beside its drawing, so `<arch-plan src="https://archlang.uk/examples/<name>.arch">`
      // (the /embed page) and any other fetcher can load a gallery plan by URL.
      writeFileSync(join(exDest, `${name}.arch`), sources[name]);
      // A multi-storey plan is one drawing PER STOREY, and `.svg` above is only page 1
      // (the lowest level) — so a page that wants to show a building's floors has
      // nothing to point at. `pages` is absent for a single-storey plan, so this is
      // append-only and picks a NEW multi-storey example up for free.
      for (const p of pages ?? []) {
        writeFileSync(join(exDest, levelSvgName(name, p.level)), p.svg);
        levelSvgCount++;
      }
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
console.log(`  ${examples.length} example SVGs + sources (+ ${levelSvgCount} per-storey pages) → public/examples/`);

// ───────────────────────────────────────────────────────────────────────────────
// AGENT GALLERY (`/gallery`): plans written by AI agents from a one-paragraph brief.
//
// `docs/gallery/gallery.json` lists the entries in page order; beside it sit each
// entry's `<id>.brief.txt` (the brief, byte for byte) and `<id>.arch` (the plan as the
// agent delivered it, after one `arch finish` — never edited by hand; to replace one,
// run `arch finish` on the agent's file and copy the result). Those files are the ONE
// copy: this block compiles them into `public/gallery/` and into the data module
// `<AgentPlan>` renders from, and `test/agent-gallery.test.ts` reads the same files.
// They are not examples of the language, so they stay out of `examples/`.
//
// The drawings are PRE-RENDERED and loaded as lazy `<img>`s, not compiled in the
// reader's browser: inlined, the sheets are most of a megabyte of SVG markup in one
// HTML document, which a phone parses in full before the first one is on screen.
// ───────────────────────────────────────────────────────────────────────────────
const gallerySrc = join(repo, "docs", "gallery");
const galleryDest = join(publicDir, "gallery");
mkdirSync(galleryDest, { recursive: true });
const galleryFailures = [];
const gallery = [];
/** `width="420mm" height="297mm"` → the sheet's size, so an <img> reserves its box before it loads. */
const sheetSize = (svg) => {
  const m = /<svg[^>]*?\swidth="([\d.]+)mm"[^>]*?\sheight="([\d.]+)mm"/.exec(svg);
  return m ? { width: Number(m[1]), height: Number(m[2]) } : {};
};
for (const { id, title, model } of JSON.parse(readFileSync(join(gallerySrc, "gallery.json"), "utf8"))) {
  try {
    const source = readFileSync(join(gallerySrc, `${id}.arch`), "utf8");
    const brief = readFileSync(join(gallerySrc, `${id}.brief.txt`), "utf8").trim();
    const { svg, diagnostics, pages } = compile(source, { noCache: true });
    const errs = diagnostics.filter((d) => d.severity === "error");
    if (errs.length) {
      galleryFailures.push(`docs/gallery/${id}.arch does not compile: ${errs[0].message}`);
      continue;
    }
    // A multi-storey plan is one sheet per storey, named by the CLI's own law (above).
    const drawn = pages?.length
      ? pages.map((p) => ({ file: levelSvgName(id, p.level), level: p.level, svg: p.svg }))
      : [{ file: `${id}.svg`, level: null, svg }];
    const sheets = [];
    for (const d of drawn) {
      writeFileSync(join(galleryDest, d.file), d.svg);
      sheets.push({ file: d.file, level: d.level, ...sheetSize(d.svg) });
    }
    if (sheets.some((s) => !s.width || !s.height)) {
      galleryFailures.push(
        `docs/gallery/${id}.arch compiled to a sheet with no mm size (\`arch finish\` adds \`paper\`)`,
      );
      continue;
    }
    copyFileSync(join(gallerySrc, `${id}.arch`), join(galleryDest, `${id}.arch`));
    gallery.push({ id, title, model, brief, source, sheets, link: `${PLAYGROUND}/#z=${encodePlanHash(source)}` });
  } catch (e) {
    galleryFailures.push(`docs/gallery/${id}: ${e.message}`);
  }
}
if (galleryFailures.length > 0) {
  console.error(`\nsync-docs FAILED — ${galleryFailures.length} agent gallery problem(s):`);
  for (const f of galleryFailures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
writeFileSync(
  join(here, ".vitepress", "theme", "gallery-data.js"),
  "// GENERATED by sync-docs.mjs from docs/gallery/ — do not edit.\n" +
    `export const GALLERY = ${JSON.stringify(gallery, null, 2)};\n`,
);
console.log(`  ${gallery.length} agent gallery plans → public/gallery/  (+ .vitepress/theme/gallery-data.js)`);

// ───────────────────────────────────────────────────────────────────────────────
// HOME PAGE PROOFS: the drawings and facts behind the three Why cards, the gallery's
// facts lines and the proof line's count. Every one is a compile, `describe()`, `lint()` or
// `impact()` run here on a file in the repo; the cards hold no figure of their own.
//
// HOME_PROOFS is the one hand-written part: WHICH file each card reads, and the one edit it
// makes to show a change. The three Why proofs read examples/ (pinned corpus), and each edit is
// checked, so a card cannot claim what the compiler no longer says: the build fails if the edit
// stops doing what the card shows.
//
// The hero is different. It DISPLAYS an agent-gallery pair, and the gallery is not corpus: "a
// compiler change may redraw them freely; it may not break them" (test/agent-gallery.test.ts),
// and no test pins its bytes. So the hero never fails the build: if its entry is gone, it falls
// back to another gallery entry, then to an example with no brief, and says so.
// ───────────────────────────────────────────────────────────────────────────────
const HOME_PROOFS = {
  // The hero: one agent-gallery pair, its brief in a chat bubble, its source streamed. `fallback`
  // is the example shown, with no brief, if the gallery has no compiled entry at all.
  hero: { gallery: "studio", fallback: "laneway-house" },
  // "Exact": areas and reachability, computed, on one example.
  exact: { example: "laneway-house" },
  // "Change one line, see what moved": one top-level `let`, and the ids that must hold.
  change: { example: "knob-flat", let: "BEDROOM", to: "3900", lock: ["r_live", "r_hall", "d_front"] },
  // "It checks itself": the same flat with its bedroom window taken out (the playground's
  // "Flat with one thing to fix" tells the same story).
  check: { example: "knob-flat", drop: "window on r_bed.top", code: "W_BEDROOM_NO_WINDOW" },
};

const homeDest = join(publicDir, "home");
mkdirSync(homeDest, { recursive: true });
const homeFailures = [];
const home = {};
{
  // Exact.
  const name = HOME_PROOFS.exact.example;
  const d = describe(sources[name]);
  const reach = new Map(d.access.rooms.map((r) => [r.id, r.reachable]));
  home.exact = {
    example: name,
    plan: d.plan,
    rooms: d.rooms.map((r) => ({
      label: r.label,
      area_m2: r.area_m2,
      net_area_m2: r.net_area_m2,
      reachable: reach.get(r.id) === true,
    })),
    floor_area_m2: d.totals.floor_area_m2,
    entrance: d.access.hasEntrance,
  };
  if (!home.exact.entrance || home.exact.rooms.some((r) => !r.reachable)) {
    homeFailures.push(`HOME_PROOFS.exact: examples/${name}.arch is no longer reachable room by room`);
  }
}
{
  // Change one line.
  const { example, let: name, to, lock } = HOME_PROOFS.change;
  const set = applyLetOverride(sources[example], name, to);
  if (!set.ok) {
    homeFailures.push(`HOME_PROOFS.change: \`--set ${name}=${to}\` is refused on examples/${example}.arch`);
  } else {
    const after = compile(set.source, { noCache: true });
    const report = impact(sources[example], set.source, { lock });
    const file = `${example}.${name}-${to}.svg`;
    writeFileSync(join(homeDest, file), after.svg);
    home.change = {
      example,
      let: name,
      from: set.before,
      to: set.after,
      after: `/home/${file}`,
      changed: report.changed.length,
      held: report.held.length,
      lock,
      lockOk: report.lock?.ok === true,
    };
    if (after.errors.length || !home.change.lockOk || home.change.changed === 0) {
      homeFailures.push(
        `HOME_PROOFS.change: ${name}=${to} on ${example} no longer moves some elements and holds ${lock.join(",")}`,
      );
    }
  }
}
{
  // It checks itself: without the line the code is raised, with it (the example as it is) it is not.
  const { example: id, drop, code } = HOME_PROOFS.check;
  const source = sources[id].replace(/\r\n/g, "\n");
  const lines = source.split("\n");
  const variant = lines.filter((l) => !l.trimStart().startsWith(drop)).join("\n");
  const raised = lint(variant).find((x) => x.code === code);
  const cleared = !lint(source).some((x) => x.code === code);
  if (lines.length - variant.split("\n").length !== 1 || !raised || !cleared) {
    homeFailures.push(
      `HOME_PROOFS.check: dropping \`${drop}\` from examples/${id}.arch no longer raises ${code} alone`,
    );
  } else {
    // The flagged element is found by the diagnostic's own span, through the compiler's opt-in
    // source annotation (ADR 0007). The drawing is the compiler's; the highlight is the SITE's:
    // a style rule this script adds on the element the compiler already labels, never a shape.
    // Redline hexes as in style.css.
    const svg = compile(variant, { noCache: true, annotate: true }).svg;
    const at = `${raised.span.start}:${raised.span.end}`;
    const mark =
      `<style>polygon[data-span="${at}"][data-arch-primary]{fill:#f6d7d3;stroke:#c2362b;stroke-width:80}` +
      `text[data-span="${at}"]{fill:#b3261e}</style>`;
    if (!svg.includes(`data-span="${at}"`)) {
      homeFailures.push(`HOME_PROOFS.check: the compiled drawing has no element at the span of ${code}`);
    }
    // Both drawings are framed on the plan rather than the whole sheet, so the mark reads at a
    // card's size: the same window for both, from the rooms' own floor polygons plus a margin
    // for the walls, the door swings and the dimension chains. A frame, never an edit.
    const pts = describe(source).rooms.flatMap((r) => r.floor_polygon);
    const [x0, y0] = [Math.min(...pts.map((p) => p.x)), Math.min(...pts.map((p) => p.y))];
    const [x1, y1] = [Math.max(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.y))];
    const M = 1500;
    // The root tag only: a sheet carries width/height in mm, a plain plan carries a viewBox alone.
    const frame = (s) =>
      s.replace(/<svg\b[^>]*>/, (root) => {
        const [w, h] = [x1 - x0 + 2 * M, y1 - y0 + 2 * M];
        return root
          .replace(/\s(width|height)="[^"]*"/g, "")
          .replace(/\sviewBox="[^"]*"/, ` viewBox="${x0 - M} ${y0 - M} ${w} ${h}"`);
      });
    const framedRaised = frame(svg);
    const framedCleared = frame(compile(source, { noCache: true }).svg);
    if (framedRaised === svg || !framedCleared.includes(`viewBox="${x0 - M} ${y0 - M} `)) {
      homeFailures.push("HOME_PROOFS.check: the compiled SVG's root no longer carries width, height and viewBox");
    }
    const file = `${id}.${code}.raised.svg`;
    writeFileSync(join(homeDest, file), framedRaised.replace(/(<svg[^>]*>)/, `$1${mark}`));
    writeFileSync(join(homeDest, `${id}.${code}.cleared.svg`), framedCleared);
    home.check = {
      example: id,
      drop,
      code,
      message: raised.message,
      // The catalogued fix line, as `archlang lint --json` prints it.
      fix: diagnosticToJson(variant, raised).fix ?? null,
      raised: `/home/${file}`,
      cleared: `/home/${id}.${code}.cleared.svg`,
    };
  }
}
{
  // The hero: never a build failure. `gallery` holds only the entries that compiled above.
  const wanted = HOME_PROOFS.hero.gallery;
  const entry = gallery.find((g) => g.id === wanted) ?? gallery[0];
  if (entry) {
    if (entry.id !== wanted) console.warn(`  ⚠ home hero: gallery entry "${wanted}" is missing; showing "${entry.id}"`);
    const { id, title, model, brief, source, link } = entry;
    // LF, as every other source this script reads; the `#z=` link carries the file as read.
    home.hero = { id, title, model, brief, source: source.replace(/\r\n/g, "\n"), link, gallery: true };
  } else {
    const id = HOME_PROOFS.hero.fallback;
    console.warn(`  ⚠ home hero: no gallery entry compiled; showing examples/${id}.arch with no brief`);
    home.hero = { id, title: id, model: null, brief: null, source: sources[id], link: links[id], gallery: false };
  }
}
if (homeFailures.length > 0) {
  console.error(`\nsync-docs FAILED — ${homeFailures.length} home page proof problem(s):`);
  for (const f of homeFailures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
// Rooms and floor area of every gallery example, for the home gallery's facts lines.
const exampleFacts = {};
for (const name of examples) {
  const t = describe(sources[name]).totals;
  exampleFacts[name] = { rooms: t.rooms, floor_area_m2: t.floor_area_m2 };
}
writeFileSync(
  join(here, ".vitepress", "theme", "home-data.js"),
  "// GENERATED by sync-docs.mjs (HOME_PROOFS) from examples/ and docs/gallery/ — do not edit.\n" +
    `export const HOME = ${JSON.stringify(home, null, 2)};\n\n` +
    "// How many example plans this build compiled into the site: the proof line's N.\n" +
    `export const EXAMPLE_COUNT = ${examples.length};\n\n` +
    `export const EXAMPLE_FACTS = ${JSON.stringify(exampleFacts, null, 2)};\n`,
);
console.log("  3 home page proofs → public/home/  (+ .vitepress/theme/home-data.js)");

// The hand-written pages' raw markdown at /<route>.md. Last, because it needs the built core (the
// home page's facts band is `describe()`, the agent gallery's sheet names come from
// `compile().pages`) and the home hero chosen above; the transform lives in site-markdown.mjs.
for (const [src, dest] of SITE_PAGES) {
  const md = siteMarkdown(src, {
    repo,
    compile,
    describe,
    encodePlanHash,
    levelSvgName,
    playground: PLAYGROUND,
    exampleCount: examples.length,
    hero: home.hero,
  });
  writeFileSync(join(publicDir, dest), md);
  console.log(`  ${src} → public/${dest}  (+ /${dest})`);
}
