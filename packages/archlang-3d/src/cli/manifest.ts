/**
 * `archlang3d manifest --json` (archlang-3d plan §7.4): the CLI as data, the same shape as the core's
 * `archlang manifest --json` (`name, invoke, version, description, exitCodes, globalFlags,
 * commands[{name, summary, flags, input, output, examples}]`) plus a `d3` block. This table is the
 * ONE source of the new commands' flags: `commands.ts` parses each command's argv from it, and
 * `test/cli.test.ts` holds `view`'s hand parser and every example to it.
 */
import { ARCHLANG_3D_VERSION } from "../scene3d/build.js";
import type { CheckId } from "../check/verify.js";

export interface Flag {
  flag: string;
  alias?: string;
  /** Placeholder for a flag that takes a value, else omitted. */
  arg?: string;
  description: string;
}

export interface Command {
  name: string;
  summary: string;
  flags: Flag[];
  input: string;
  output: string;
  /** `cmd` starts with `archlang3d ` and its verb is the command's name (a test holds both). */
  examples: Array<{ cmd: string; note: string }>;
}

const JSON_FLAG: Flag = { flag: "--json", description: "structured result on stdout, messages on stderr" };
const CURVE_TOL: Flag = {
  flag: "--curve-tol",
  arg: "<mm>",
  description: "largest sagitta of an arc's chords, in mm (default 2)",
};
/** Shared by every command that builds the model, so a GLB, its check and its replay agree. */
const DOORS: Flag = {
  flag: "--doors",
  arg: "<closed|plan>",
  description:
    "closed (default): every leaf across its doorway; plan: each hinged or double leaf swung as the plan draws it (other kinds stay closed)",
};

export const COMMANDS: readonly Command[] = [
  {
    name: "build",
    summary: "a plan to a GLB (or its Scene3D), checked before it is written",
    flags: [
      {
        flag: "--out",
        alias: "-o",
        arg: "<file|->",
        description: "output file, or '-' for stdout (default: the input path with .glb, or .scene3d.json)",
      },
      { flag: "--format", alias: "-f", arg: "<glb|scene3d>", description: "output format (default glb)" },
      CURVE_TOL,
      DOORS,
      { flag: "--strict", description: "refuse a build with any W3D_* warning: E3D_STRICT, exit 2, nothing written" },
      JSON_FLAG,
    ],
    input: "<plan.arch|->",
    output: "a .glb (or .scene3d.json) file, or stdout with -o -",
    examples: [
      { cmd: "archlang3d build plan.arch -o plan.glb --json", note: "build, check and report the GLB" },
      { cmd: "archlang3d build - -o - < plan.arch > plan.glb", note: "stdin to stdout" },
      { cmd: "archlang3d build plan.arch -f scene3d -o plan.scene3d.json", note: "the plan-aligned Scene3D" },
    ],
  },
  {
    name: "check",
    summary: "run the checks (V-SCH, V-GEO, V-GLTF) without writing a model",
    flags: [CURVE_TOL, DOORS, JSON_FLAG],
    input: "<plan.arch|model.glb|->",
    output: "a report (stdout with --json); exit 2 when a check fails",
    examples: [
      { cmd: "archlang3d check plan.arch --json", note: "build in memory and check the plan's model" },
      { cmd: "archlang3d check plan.glb --json", note: "glTF-Validator and the naming rules on a GLB" },
    ],
  },
  {
    name: "view",
    summary: "a replay of the plan as one offline HTML file, optionally an MP4 (Chromium, ffmpeg)",
    flags: [
      { flag: "--replay", description: "the replay view (required; the only view so far)" },
      { flag: "--out", alias: "-o", arg: "<out.html>", description: "the HTML file to write (required)" },
      { flag: "--video", arg: "<out.mp4>", description: "also render an MP4 (needs Chromium and ffmpeg)" },
      { flag: "--seconds", arg: "<n>", description: "replay length (default 15)" },
      { flag: "--fps", arg: "<n>", description: "video frame rate (default 30)" },
      { flag: "--size", arg: "<W>x<H>", description: "canvas size (default 1920x1080)" },
      { flag: "--theme", arg: "<light|dark>", description: "light (default); dark for exports only" },
      { flag: "--storey", arg: "<n|all>", description: "one storey (1 = the lowest) or all combined (default)" },
      CURVE_TOL,
      DOORS,
      JSON_FLAG,
    ],
    input: "<plan.arch|->",
    output: "an HTML file (and an MP4 with --video)",
    examples: [
      { cmd: "archlang3d view plan.arch --replay -o plan.html --json", note: "the replay and its key-frame hashes" },
      {
        cmd: "archlang3d view plan.arch --replay -o plan.html --doors plan",
        note: "doors swung as the plan draws them",
      },
    ],
  },
  {
    name: "manifest",
    summary: "this CLI as data",
    flags: [JSON_FLAG],
    input: "none",
    output: "JSON on stdout",
    examples: [{ cmd: "archlang3d manifest --json", note: "every command, flag and exit code" }],
  },
  {
    name: "schema",
    summary: "the JSON Schema of a document the package writes (scene3d)",
    flags: [JSON_FLAG],
    input: "[scene3d]",
    output: "JSON on stdout",
    examples: [{ cmd: "archlang3d schema scene3d", note: "Scene3D v0's JSON Schema" }],
  },
  {
    name: "doctor",
    summary: "check the environment: Node, the core, glTF-Validator, Chromium, ffmpeg",
    flags: [JSON_FLAG],
    input: "none",
    output: "a report; exit 1 when something build or check needs is missing",
    examples: [{ cmd: "archlang3d doctor --json", note: "what is installed and what each part is for" }],
  },
];

export const CHECKS: readonly CheckId[] = ["V-SCH-01", "V-GEO-02", "V-GLTF-01", "V-GLTF-02"];

/** Every diagnostic code the CLI can print. */
export const DIAGNOSTIC_CODES = [
  "E3D_CORE_TOO_OLD",
  "E3D_PLAN_ERRORS",
  "E3D_NO_WALLS",
  "E3D_VERIFY_FAILED",
  "E3D_STRICT",
  "W3D_MIXED_HEIGHT_JOINT",
  "W3D_FLOOR_OVERLAP",
] as const;

export function buildManifest() {
  return {
    name: "archlang3d",
    invoke: "archlang3d",
    version: ARCHLANG_3D_VERSION,
    description:
      "archlang-3d: 3D preview of an ArchLang plan, a separate package that reads the same .arch source. Builds a checked GLB and a replay from a .arch plan. ArchLang itself draws plans.",
    exitCodes: {
      "0": "ok",
      "1": "internal / IO / environment error (a missing Chromium or ffmpeg, a file that cannot be written)",
      "2": "the plan is refused, a check failed, or build --strict met a warning (E3D_STRICT); nothing is written (deterministic: fix it, don't blindly retry)",
      "3": "bad usage",
    },
    globalFlags: [JSON_FLAG],
    commands: COMMANDS,
    d3: {
      scene3dSchemaVersion: 0,
      formats: ["glb", "scene3d"],
      checks: CHECKS,
      diagnosticCodes: DIAGNOSTIC_CODES,
    },
  };
}
