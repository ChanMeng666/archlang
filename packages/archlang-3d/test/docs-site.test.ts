/**
 * The package's words and commands as the docs site carries them (public-surfaces card X6). The
 * site reads `PREVIEW_LEAD`, `PREVIEW_LABEL` and `PREVIEW_LIMITS` out of `src/replay/payload.ts`'s
 * text (`docs-site/three-d.mjs`, a plain build script that cannot import TypeScript), so this holds
 * that reading equal to the real exports, and the plan's PS-D12 line
 * (`docs/plans/public-surfaces/3d.md` §2) equal to them plus the download sentence. And every
 * `npx -y @chanmeng666/archlang-3d <cmd> --flag` the `/3d` page writes is a flag that command
 * declares in `COMMANDS` (`src/cli/manifest.ts`), the table the CLI parses its argv from.
 *
 * It lives here, not in the repository's `test/`, because importing the CLI table pulls in the
 * package's own modules, which the package's tsconfig types and the root's does not.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COMMANDS } from "../src/cli/manifest.js";
import { PREVIEW_ABOUT_URL, PREVIEW_LABEL, PREVIEW_LEAD, PREVIEW_LIMITS } from "../src/replay/payload.js";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const read = (p: string): string =>
  readFileSync(new URL(`../../../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

// A plain `.mjs` module (no declaration file): loaded by a computed specifier.
const THREE_D = "../../../docs-site/three-d.mjs";
const T = (await import(/* @vite-ignore */ THREE_D)) as {
  PREVIEW_DOWNLOAD: string;
  previewLines: (repo: string) => { lead: string; title: string; rest: string; label: string; limits: string };
};
const page = read("docs-site/3d.md");

describe("the docs site's lines are the package's", () => {
  it("three-d.mjs reads the three constants exactly as payload.ts exports them", () => {
    const p = T.previewLines(REPO);
    expect(p.lead).toBe(PREVIEW_LEAD);
    expect(p.label).toBe(PREVIEW_LABEL);
    expect(p.limits).toBe(PREVIEW_LIMITS);
    expect(`${p.lead} ${p.rest}`).toBe(PREVIEW_LABEL);
    expect(p.title).toBe(PREVIEW_LEAD.replace(/\.$/, ""));
  });

  it("the plan's PS-D12 line is PREVIEW_LABEL plus the download sentence, and its limits line PREVIEW_LIMITS", () => {
    const plan = read("docs/plans/public-surfaces/3d.md");
    /** The blockquote after `intro`, as plain text (no `>`, bold or code marks). */
    const quote = (intro: string): string => {
      const at = plan.indexOf(intro);
      expect(at, `3d.md no longer says "${intro}"`).toBeGreaterThan(0);
      const lines = plan.slice(at + intro.length).split("\n");
      const body: string[] = [];
      for (const l of lines.slice(lines.findIndex((x) => x.startsWith("> ")))) {
        if (!l.startsWith(">")) break;
        body.push(l.replace(/^>\s?/, ""));
      }
      return body
        .join(" ")
        .replace(/\*\*|`/g, "")
        .replace(/\s+/g, " ")
        .trim();
    };
    expect(quote("The line every surface uses:")).toBe(`${PREVIEW_LABEL} ${T.PREVIEW_DOWNLOAD}`);
    expect(quote("The limits line, always near a 3D view:")).toBe(PREVIEW_LIMITS);
  });

  it("the /3d page carries both lines through its component, never typed", () => {
    expect(page).toMatch(/^<PreviewLine which="label" \/>$/m);
    expect(page).toMatch(/^<PreviewLine which="limits" \/>$/m);
    expect(page).not.toContain(PREVIEW_LIMITS);
    expect(page).not.toContain(PREVIEW_LABEL.slice(PREVIEW_LEAD.length).trim());
  });

  it("PREVIEW_ABOUT_URL is the docs site's /3d page, which the site builds", () => {
    expect(PREVIEW_ABOUT_URL).toBe("https://archlang.uk/3d");
    // `docs-site/3d.md` is the page VitePress serves at /3d (cleanUrls), published by sync-docs.
    expect(read("docs-site/sync-docs.mjs")).toContain('["docs-site/3d.md", "3d.md"],');
    expect(page).toMatch(/^# The 3D preview/m);
  });
});

describe("the /3d page's commands are the package's", () => {
  const flags = new Map(
    COMMANDS.map((c) => [c.name, new Set(["--help", "-h", ...c.flags.flatMap((f) => [f.flag, f.alias ?? f.flag])])]),
  );
  const usages = [...page.matchAll(/npx -y @chanmeng666\/archlang-3d\s+([a-z][a-z-]*)((?:\s+[^\n`|]*)?)/g)];

  it("names the replay and the GLB commands", () => {
    expect(usages.map((u) => u[1])).toEqual(["view", "build"]);
  });

  it("every flag is one that command declares", () => {
    for (const [, cmd, rest] of usages) {
      const declared = flags.get(cmd!);
      expect(declared, `\`${cmd}\` is not an archlang3d command`).toBeTruthy();
      for (const f of (rest ?? "").match(/(?<![\w-])--?[a-zA-Z][\w-]*/g) ?? []) {
        expect(declared!.has(f), `\`archlang3d ${cmd} … ${f}\` is not a flag of \`${cmd}\``).toBe(true);
      }
    }
    // The flags the prose names, too (`build --doors plan`, `build --json`).
    const prose = [...page.matchAll(/`(view|build) (--[a-z-]+)/g)];
    expect(prose.length).toBeGreaterThan(0);
    for (const [, cmd, f] of prose) expect(flags.get(cmd!)?.has(f!), `\`${cmd} ${f}\``).toBe(true);
    // And `build --doors plan` names a value the flag takes.
    expect(COMMANDS.find((c) => c.name === "build")?.flags.find((f) => f.flag === "--doors")?.arg).toContain("plan");
  });

  it("never a prompting npx, an unscoped bin or a bare `arch`", () => {
    expect(page).not.toMatch(/npx (?!-y )\S*archlang/);
    expect(page).not.toMatch(/npx -y archlang3d/);
    expect(page).not.toMatch(/(?<![\w./@-])arch\s+[a-z]/);
  });
});
