/**
 * The DXF through an independent reader: `npm run check:dxf`, the driver of `e2e/dxf_check.py`.
 *
 * Every example, every storey, and a plan that holds each door and window kind, are written twice:
 * as the file `toDxf` writes, and with no blocks, which is what a Scene with no `parts` writes. ezdxf
 * reads both and has to explode the first into the second. What the plan holds comes from
 * `describe()`, never from the file or the Scene, so the check cannot agree with itself.
 *
 * Before anything else it proves it can fail: a file with one INSERT removed has to be refused.
 *
 * The reader is `$ARCHLANG_DXF_PYTHON`, else `python3`, else `python`, run with `-I`. With no ezdxf
 * the check fails under `CI` and says so loudly otherwise, exiting 0 (docs/testing.md §4). To
 * install it: `python -m venv <dir>`, `<dir>/bin/pip install -r e2e/requirements.txt`, and point
 * `ARCHLANG_DXF_PYTHON` at that interpreter. `-I` ignores `PYTHONPATH` and the user site.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compile, describe, type Scene, toDxf } from "../src/index.js";
import { makeNodeWorld } from "../src/cli/io.js";
import { CATALOG_CATEGORIES } from "../src/fixtures-catalog.js";
import { DOOR_KINDS, WINDOW_KINDS } from "../src/grammar/tokens.js";
import { everyWord } from "../test/sheet-text-plans.js";

const CHECK = "e2e/dxf_check.py";

/** The first interpreter that can import ezdxf, in isolated mode. */
function findReader(): string | null {
  const wanted = process.env.ARCHLANG_DXF_PYTHON;
  for (const python of wanted ? [wanted] : ["python3", "python"]) {
    const r = spawnSync(python, ["-I", "-c", "import ezdxf"], { encoding: "utf8" });
    if (r.status === 0) return python;
  }
  return null;
}

/** One door and one window of every kind, each on a wall of its own: the kinds the examples may not hold. */
function everyKind(): string {
  const kinds = [...DOOR_KINDS.map((k) => `door ${k}`), ...WINDOW_KINDS.map((k) => `window ${k}`)];
  const body = kinds.flatMap((kind, i) => {
    const [word, name] = kind.split(" ");
    return [
      `wall id=w${i} exterior thickness 200 { (0,${3000 * i}) (4000,${3000 * i}) }`,
      `${word} id=o${i} ${name} on w${i} at center width 900`,
    ];
  });
  return `plan "every kind" {\n  units mm\n  ${body.join("\n  ")}\n}\n`;
}

interface Row {
  name: string;
  dxf: string;
  flat: string;
  inserts: number;
  dimensions: number;
}

type Facts = ReturnType<typeof describe>;

/** What a storey's facts say it draws as a block. */
const blockCount = (f: Pick<Facts, "doors" | "windows" | "furniture">): number =>
  f.doors.length + f.windows.length + f.furniture.filter((p) => CATALOG_CATEGORIES.includes(p.category)).length;

/** The line of a file's first INSERT in ENTITIES. Lines pair up as code and value, so step by two. */
function insertAt(lines: readonly string[]): number {
  let inEntities = false;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    if (lines[i] === "2" && lines[i + 1] === "ENTITIES") inEntities = true;
    if (inEntities && lines[i] === "0" && lines[i + 1] === "INSERT") return i;
  }
  throw new Error("no INSERT to plant on");
}

/** The line where the entity starting at `from` ends. */
function nextEntity(lines: readonly string[], from: number): number {
  for (let i = from + 2; i + 1 < lines.length; i += 2) if (lines[i] === "0") return i;
  throw new Error("an entity with no end");
}

/** The file with the INSERT at `at` standing a millimetre to the east. */
function nudged(lines: readonly string[], at: number): string[] {
  const out = [...lines];
  for (let i = at; i < nextEntity(lines, at); i += 2) {
    if (out[i] === "10") {
      out[i + 1] = String(Number(out[i + 1]) + 1);
      return out;
    }
  }
  throw new Error("an INSERT with no position");
}

function main(): number {
  const python = findReader();
  if (!python) {
    const why = `no Python with ezdxf (tried ${process.env.ARCHLANG_DXF_PYTHON ?? "python3, python"}); see the header of scripts/check-dxf.ts`;
    if (process.env.CI) {
      console.error(`FAIL check:dxf: ${why}`);
      return 1;
    }
    console.error(`\n*** SKIPPED check:dxf: ${why} ***\n`);
    return 0;
  }
  const dir = mkdtempSync(join(tmpdir(), "archlang-dxf-"));
  try {
    const rows: Row[] = [];
    const add = (name: string, scene: Scene, facts: Pick<Facts, "doors" | "windows" | "furniture">): void => {
      const dxf = join(dir, `${rows.length}.dxf`);
      const flat = join(dir, `${rows.length}.flat.dxf`);
      writeFileSync(dxf, toDxf(scene));
      writeFileSync(flat, toDxf({ ...scene }));
      const dimensions = scene.parts?.filter((p) => p.t === "dimension").length ?? 0;
      rows.push({ name, dxf, flat, inserts: blockCount(facts), dimensions });
    };
    const world = makeNodeWorld("examples");
    const plans = readdirSync("examples")
      .filter((f) => f.endsWith(".arch"))
      .sort()
      .map((f) => ({ name: f, src: readFileSync(join("examples", f), "utf8") }));
    // What the examples may not hold: every door and window kind, a corner window, and a sheet with a
    // decimal comma, which belongs in a TEXT and a DIMENSION's text and never in a number.
    const cases = [
      { name: "every-kind", src: everyKind() },
      { name: "corner-window", src: readFileSync("test/fixtures/corner-window/corner-window.arch", "utf8") },
      { name: "window-kinds", src: readFileSync("test/fixtures/window-kinds/window-kinds.arch", "utf8") },
      { name: "decimal-comma", src: everyWord('  sheet text { decimal "," }') },
    ];
    for (const { name, src } of [...plans, ...cases]) {
      const c = compile(src, { noCache: true, world });
      const errors = c.diagnostics.filter((d) => d.severity === "error");
      if (errors.length > 0) throw new Error(`${name}: ${errors[0]?.code} ${errors[0]?.message}`);
      const facts = describe(src, { world });
      if (c.pages) for (const p of c.pages) add(`${name} L${p.level}`, p.scene, facts.levels![c.pages.indexOf(p)]!);
      else add(name, c.scene!, facts);
    }

    const run = (manifest: string) => spawnSync(python, ["-I", CHECK, manifest], { encoding: "utf8" });

    // The plants. A file that has lost an INSERT, or whose block stands a millimetre off, has to be
    // refused by name, or a green below means nothing. A refusal is a FAIL line, never a crash.
    const planted = rows.find((r) => r.inserts > 0)!;
    const lines = readFileSync(planted.dxf, "utf8").split("\n");
    const at = insertAt(lines);
    const stop = nextEntity(lines, at);
    const plants: Array<[string, string[]]> = [
      ["lost", [...lines.slice(0, at), ...lines.slice(stop)]],
      ["moved", nudged(lines, at)],
    ];
    const refusals: string[] = [];
    for (const [name, text] of plants) {
      const dxf = join(dir, `plant-${name}.dxf`);
      const list = join(dir, `plant-${name}.json`);
      writeFileSync(dxf, text.join("\n"));
      writeFileSync(list, JSON.stringify([{ ...planted, dxf }]));
      const refused = run(list)
        .stdout.split("\n")
        .find((l) => l.startsWith("FAIL"));
      if (!refused) {
        console.error(`FAIL check:dxf: the ${name} plant passed: the check cannot fail`);
        return 1;
      }
      refusals.push(`plant ${name} refused: ${refused}`);
    }

    const manifest = join(dir, "manifest.json");
    writeFileSync(manifest, JSON.stringify(rows));
    const r = run(manifest);
    process.stdout.write(r.stdout);
    process.stderr.write(r.stderr);
    for (const line of refusals) console.log(line);
    return r.status ?? 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

process.exitCode = main();
