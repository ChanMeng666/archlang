// Copy the canonical repo docs into the VitePress site as page sources, and
// regenerate the example-gallery SVGs from examples/*.arch, so the site is always
// generated from the single source of truth (docs/*.md, examples/*.arch) and
// never drifts. Run automatically before `dev`/`build` via the npm scripts.
//
// Requires the core to be built first (`npm run build` at the repo root) so the
// gallery can compile the examples through the published entry point.
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");

/** Copy a canonical doc into the site, prepending a "generated" banner. */
function page(src, dest) {
  const body = readFileSync(join(repo, src), "utf8");
  const banner = `> _This page is generated from [\`${src}\`](https://github.com/chanmeng666/archlang/blob/main/${src}) — edit it there._\n\n`;
  writeFileSync(join(here, dest), banner + body);
  // eslint-disable-next-line no-console
  console.log(`  ${src} → ${dest}`);
}

console.log("syncing canonical docs into the site:");
page("docs/language-reference.md", "reference.md");
page("docs/error-codes.md", "errors.md");
page("spec.llm.md", "spec.md");

// ADRs: copy each, plus build an index.
const adrSrc = join(repo, "docs/adr");
const adrDest = join(here, "adr");
mkdirSync(adrDest, { recursive: true });
const adrs = readdirSync(adrSrc).filter((f) => f.endsWith(".md") && f !== "index.md").sort();
for (const f of adrs) copyFileSync(join(adrSrc, f), join(adrDest, f));
const index =
  "# Architecture Decision Records\n\nKey design decisions behind ArchLang, with their context and trade-offs.\n\n" +
  adrs
    .map((f) => {
      const first = readFileSync(join(adrSrc, f), "utf8").split("\n").find((l) => l.startsWith("# "));
      const title = first ? first.replace(/^#\s*/, "") : f;
      return `- [${title}](/adr/${f.replace(/\.md$/, "")})`;
    })
    .join("\n") +
  "\n";
writeFileSync(join(adrDest, "index.md"), index);
console.log(`  ${adrs.length} ADRs → adr/`);

// Example gallery: compile each example to SVG through the built core.
const exDest = join(here, "public", "examples");
mkdirSync(exDest, { recursive: true });
try {
  const { compile } = await import(pathToFileURL(join(repo, "dist", "index.js")).href);
  const examples = ["studio", "two-bed", "parametric", "themed", "relational"];
  for (const name of examples) {
    const src = readFileSync(join(repo, "examples", `${name}.arch`), "utf8");
    const { svg, diagnostics } = compile(src, { noCache: true });
    const errs = diagnostics.filter((d) => d.severity === "error");
    if (errs.length) throw new Error(`${name}.arch: ${errs[0].message}`);
    writeFileSync(join(exDest, `${name}.svg`), svg);
  }
  console.log(`  ${examples.length} example SVGs → public/examples/`);
} catch (e) {
  console.warn(`  ! skipped example SVGs (run \`npm run build\` at repo root first): ${e.message}`);
}
