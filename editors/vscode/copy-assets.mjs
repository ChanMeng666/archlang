// Copy the generated grammar + language-configuration from the canonical source
// (editors/, written by `npm run gen:grammars` and CI-checked) into this
// extension folder, so the packaged .vsix is self-contained (VS Code resolves
// `contributes.grammars[].path` relative to the extension root, which cannot be
// a `../` path in a published extension). The copies are git-ignored.
import { copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, ".."); // editors/
const repoRoot = join(here, "..", ".."); // repo root

for (const f of ["archlang.tmLanguage.json", "language-configuration.json"]) {
  copyFileSync(join(src, f), join(here, f));
  // eslint-disable-next-line no-console
  console.log(`  copied ${f}`);
}

// The extension bundles the MIT-licensed core; ship the license inside the .vsix
// (Marketplace/vsce expect a LICENSE next to package.json). Copied from the repo
// root so it can never drift; the copy is git-ignored.
copyFileSync(join(repoRoot, "LICENSE"), join(here, "LICENSE"));
// eslint-disable-next-line no-console
console.log("  copied LICENSE");
