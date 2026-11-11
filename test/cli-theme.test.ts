/**
 * **`--theme <name>` on the CLI** (RM8.4, backlog VA.4): the `rendered` theme (and every other named
 * theme) reachable without writing `theme <name>` into the source.
 *
 * The flag is `CompileOptions.theme`, nothing more, so the laws are:
 *
 *  - **Byte identity without the flag.** Over the examples, `compile -o -` is the SVG `compile()` returns
 *    with no theme option, byte for byte (SHA-256 compared). Nothing in a render's path reads
 *    `args.theme` unless the flag was given.
 *  - **The flag is the option.** `compile <plan> --theme <name> -o -` equals
 *    `compile(src, { theme: THEMES[name] })`, for every name in `THEMES` and for a plan whose own
 *    `theme` statement the option must win over (`planTheme`, `src/scene-build.ts`: shallow, key by key).
 *  - **No measurement learns it.** `describe` and `lint` do not take the flag (exit 3).
 *  - **A flag that would do nothing is refused**, as `--view` is: `-f json`, `-f txt`, `-f dxf`,
 *    `preview --ascii` and `--review`. An unknown name exits 3 with the names and a did-you-mean.
 */

import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { THEMES, buildManifest, compile } from "../src/index.js";
import { VERSION, makeNodeWorld } from "../src/cli/io.js";
import { runArch } from "./helpers/cli.js";
import { examples } from "./helpers/corpus.js";
import { sha256 } from "./helpers/digest.js";

const scratch = (): string => mkdtempSync(join(tmpdir(), "archlang-theme-"));

/** The library result for `file` (no CLI), with `theme` as the compile option when given. */
function libraryResult(file: string, theme?: (typeof THEMES)[string]) {
  return compile(readFileSync(file, "utf8"), {
    noCache: true,
    world: makeNodeWorld(dirname(resolve(file))),
    ...(theme ? { theme } : {}),
  });
}

/** The SVG the library returns for `file` (no CLI), with `theme` as the compile option when given. */
function librarySvg(file: string, theme?: (typeof THEMES)[string]): string | null {
  const r = libraryResult(file, theme);
  return r.errors.length > 0 || r.pages ? null : r.svg;
}

const EXAMPLES = examples();

const THEME_NAMES = Object.keys(THEMES);

describe("--theme: without the flag the render is what it was", () => {
  it("every single-storey example: compile -o - is the library SVG, byte for byte", async () => {
    let compared = 0;
    for (const file of EXAMPLES) {
      const expected = librarySvg(file);
      if (expected === null) continue;
      const r = await runArch(["compile", file, "-o", "-"]);
      expect(r.status, file).toBe(0);
      expect(sha256(r.stdout), file).toBe(sha256(expected));
      compared++;
    }
    // 32 of the 37 examples stream; the five multi-storey ones are covered by the next case.
    expect(compared).toBeGreaterThanOrEqual(30);
  }, 120000);

  it("every multi-storey example: the per-level files are the library pages, with and without the flag", async () => {
    const dir = scratch();
    let multi = 0;
    for (const file of EXAMPLES) {
      for (const theme of [undefined, "rendered"] as const) {
        const lib = libraryResult(file, theme ? THEMES[theme] : undefined);
        if (lib.errors.length > 0 || !lib.pages) continue;
        const stem = join(dir, `${theme ?? "none"}-${file.replace(/[^a-z0-9]/g, "_")}`);
        const r = await runArch(["compile", file, ...(theme ? ["--theme", theme] : []), "-o", `${stem}-{level}.svg`]);
        expect(r.status, file).toBe(0);
        for (const p of lib.pages) {
          expect(sha256(readFileSync(`${stem}-${p.level}.svg`, "utf8")), `${file} L${p.level} ${theme}`).toBe(
            sha256(p.svg),
          );
        }
        if (!theme) multi++;
      }
    }
    expect(multi).toBeGreaterThanOrEqual(5);
  }, 180000);

  it("the committed README drawings are still what the CLI writes without the flag", async () => {
    for (const name of ["studio", "laneway-house", "courtyard-house"]) {
      const r = await runArch(["compile", `examples/${name}.arch`, "-o", "-"]);
      if (r.status !== 0) continue; // a multi-storey plan cannot stream; the per-level case above covers it
      expect(sha256(r.stdout), name).toBe(sha256(readFileSync(`examples/${name}.svg`, "utf8")));
    }
  }, 60000);
});

describe("--theme: the flag is CompileOptions.theme", () => {
  it("--theme rendered is compile(src, { theme: THEMES.rendered }), byte for byte", async () => {
    for (const file of ["examples/studio.arch", "examples/furnished-flat.arch", "examples/bungalow.arch"]) {
      const expected = librarySvg(file, THEMES.rendered!);
      expect(expected, file).not.toBeNull();
      const r = await runArch(["compile", file, "--theme", "rendered", "-o", "-"]);
      expect(r.status, file).toBe(0);
      expect(sha256(r.stdout), file).toBe(sha256(expected!));
      expect(r.stdout, file).not.toBe(librarySvg(file));
    }
  }, 60000);

  it("accepts exactly the names in THEMES, and --theme=<name> is the same flag", async () => {
    const file = "examples/one-room.arch";
    for (const name of THEME_NAMES) {
      const expected = librarySvg(file, THEMES[name]!);
      const spaced = await runArch(["compile", file, "--theme", name, "-o", "-"]);
      const equals = await runArch(["compile", file, `--theme=${name}`, "-o", "-"]);
      expect(spaced.status, name).toBe(0);
      expect(spaced.stdout, name).toBe(expected);
      expect(equals.stdout, name).toBe(expected);
    }
    // `--help` lists the same names, read from THEMES.
    const compileCmd = buildManifest(VERSION).commands.find((c) => c.name === "compile")!;
    expect(compileCmd.flags.find((f) => f.flag === "--theme")?.arg).toBe(`<${THEME_NAMES.join("|")}>`);
  });

  it("wins over a `theme` statement in the source, colour by colour", async () => {
    const dir = scratch();
    const plan = join(dir, "blue.arch");
    writeFileSync(
      plan,
      readFileSync("examples/one-room.arch", "utf8").replace("  north up\n", "  north up\n  theme blueprint\n"),
    );
    const own = await runArch(["compile", plan, "-o", "-"]);
    const flagged = await runArch(["compile", plan, "--theme", "rendered", "-o", "-"]);
    expect(own.status).toBe(0);
    expect(flagged.status).toBe(0);
    // The source really draws blueprint without the flag, so the next lines test a replacement.
    expect(own.stdout).toContain(THEMES.blueprint!.bg!);
    // Same bytes as the option through the library, and not the source's own theme.
    expect(flagged.stdout).toBe(librarySvg(plan, THEMES.rendered!));
    expect(flagged.stdout).not.toBe(own.stdout);
    expect(flagged.stdout).toContain(THEMES.rendered!.bg!);
    expect(flagged.stdout).not.toContain(THEMES.blueprint!.bg!);
  });

  it("also wins over style blocks, theme from and a single furniture colour; a key it leaves unset keeps the source's", async () => {
    const dir = scratch();
    const base = readFileSync("examples/one-room.arch", "utf8");
    const write = (name: string, source: string): string => {
      const p = join(dir, name);
      writeFileSync(p, source);
      return p;
    };
    const flag = async (plan: string): Promise<string> => {
      const r = await runArch(["compile", plan, "--theme", "rendered", "-o", "-"]);
      expect(r.status, plan).toBe(0);
      return r.stdout;
    };
    const own = async (plan: string): Promise<string> => (await runArch(["compile", plan, "-o", "-"])).stdout;

    // Insert a line after the plan's `north up`.
    const withLine = (line: string): string => base.replace("  north up", `  north up\n  ${line}`);

    const styled = write("style.arch", withLine('style room { fill: "#ff00ff" }'));
    expect(await own(styled)).toContain("#ff00ff");
    expect(await flag(styled)).not.toContain("#ff00ff");

    const derived = write("from.arch", withLine('theme from "#336699"'));
    expect(await flag(derived)).toBe(librarySvg(derived, THEMES.rendered!));
    expect(await flag(derived)).not.toBe(await own(derived));

    const sofa = "  furniture sofa in r_main anchor top flush size 2200x900\n  title";
    const furnished = write(
      "furniture.arch",
      withLine('theme rendered { furniture: "#123456" }').replace("  title", sofa),
    );
    expect(await own(furnished)).toContain("#123456");
    expect(await flag(furnished)).not.toContain("#123456");

    // `rendered` sets neither `font` nor `lineWeight`, so the source's own stay.
    const pen = write("pen.arch", withLine('theme { lineWeight: 2 font: "Courier" }'));
    const out = await flag(pen);
    expect(out).toContain("Courier");
    expect(out).toBe(librarySvg(pen, THEMES.rendered!));
  });

  it("batch and md carry the flag; batch writes the themed bytes", async () => {
    const dir = scratch();
    const b = await runArch(["batch", "examples/one-room.arch", "-o", dir, "--theme", "rendered", "--json"]);
    expect(b.status).toBe(0);
    expect(readFileSync(join(dir, "one-room.svg"), "utf8")).toBe(
      librarySvg("examples/one-room.arch", THEMES.rendered!),
    );

    const md = join(dir, "doc.md");
    writeFileSync(md, "# t\n\n```arch\n" + readFileSync("examples/one-room.arch", "utf8") + "```\n");
    const out = join(dir, "doc.out.md");
    const m = await runArch(["md", md, "-o", out, "--theme", "rendered", "--json"]);
    expect(m.status).toBe(0);
    const img = readdirSync(dir).find((f) => /^doc\.out-1\.svg$/.test(f));
    expect(img, "md writes an image beside the output").toBeDefined();
    expect(existsSync(join(dir, img!))).toBe(true);
    expect(readFileSync(join(dir, img!), "utf8")).toBe(librarySvg("examples/one-room.arch", THEMES.rendered!));
  }, 60000);
});

describe("--theme: the formats that carry colour", () => {
  it("compile -f pdf and preview (PNG) change with the flag, and are stable without it", async () => {
    const dir = scratch();
    const plan = "examples/one-room.arch";
    const bytes = async (args: string[], out: string): Promise<string> => {
      const r = await runArch([...args, "-o", out]);
      expect(r.status, args.join(" ")).toBe(0);
      return sha256(readFileSync(out));
    };
    // The PDF is compared across themes only (a different drawing, different bytes).
    const pdfPlain = await bytes(["compile", plan, "-f", "pdf"], join(dir, "a.pdf"));
    const pdfMono = await bytes(["compile", plan, "-f", "pdf", "--theme", "mono"], join(dir, "b.pdf"));
    expect(pdfMono).not.toBe(pdfPlain);

    const pngPlain = await bytes(["preview", plan], join(dir, "a.png"));
    const pngMono = await bytes(["preview", plan, "--theme", "mono"], join(dir, "b.png"));
    expect(pngMono).not.toBe(pngPlain);
    expect(await bytes(["preview", plan, "--theme", "mono"], join(dir, "c.png"))).toBe(pngMono);
    expect(await bytes(["compile", plan, "-f", "png", "--theme", "mono"], join(dir, "d.png"))).not.toBe(
      await bytes(["compile", plan, "-f", "png"], join(dir, "e.png")),
    );
  }, 120000);
});

describe("--theme: refusals (exit 3, nothing written)", () => {
  it("an unknown name lists the names and offers the nearest", async () => {
    const r = await runArch(["compile", "examples/one-room.arch", "--theme", "rendred", "-o", "-"]);
    expect(r.status).toBe(3);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain('unknown theme "rendred"');
    for (const name of THEME_NAMES) expect(r.stderr).toContain(name);
    expect(r.stderr).toContain('did you mean "rendered"');
  });

  it("is refused where the output carries no theme colour", async () => {
    for (const [fmt, why] of [
      ["json", "Plan JSON"],
      ["txt", "text renderer"],
      ["dxf", "DXF"],
    ] as const) {
      const r = await runArch(["compile", "examples/one-room.arch", "--theme", "rendered", "-f", fmt, "-o", "-"]);
      expect(r.status, fmt).toBe(3);
      expect(r.stdout, fmt).toBe("");
      expect(r.stderr, fmt).toContain(`--theme cannot be combined with -f ${fmt}`);
      expect(r.stderr, fmt).toContain(why);
    }
  });

  it("preview --ascii and preview --review refuse it; watch refuses a bad name instead of watching", async () => {
    const ascii = await runArch(["preview", "examples/one-room.arch", "--ascii", "--theme", "rendered"]);
    expect(ascii.status).toBe(3);
    expect(ascii.stderr).toContain("--theme cannot be combined with -f txt");
    const review = await runArch(["preview", "examples/one-room.arch", "--review", "--theme", "rendered"]);
    expect(review.status).toBe(3);
    expect(review.stderr).toContain("--review cannot be combined with --theme");
    const watch = await runArch(["watch", "examples/one-room.arch", "--theme", "nope"]);
    expect(watch.status).toBe(3);
    expect(watch.stderr).toContain('unknown theme "nope"');
  });

  it("describe, lint and validate do not take it: no measurement learns the theme", async () => {
    for (const cmd of ["describe", "lint", "validate"]) {
      const r = await runArch([cmd, "examples/one-room.arch", "--theme", "rendered", "--json"]);
      expect(r.status, cmd).toBe(3);
    }
  });
});
