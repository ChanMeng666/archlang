/**
 * The inputs of the CLI contract table: per command, an OK input, a user-error input and a
 * usage-error input, run in-process, and what each returns (exit code + `--json` envelope keys).
 * Shared by `test/cli-contract.test.ts` (asserts) and `test/cli-envelopes-gen.ts` (records), so
 * both observe exactly the same runs. The runner is passed in: the test hands over `runArch`
 * (`test/helpers/cli.ts`), the generator a plain `runCli` wrapper (that helper needs vitest).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { EXIT } from "../../src/cli/io.js";

export type Run = (args: string[]) => Promise<{ status: number | null; stdout: string; stderr: string }>;

export const SCENARIOS = ["ok", "user", "usage"] as const;
export type Scenario = (typeof SCENARIOS)[number];

/** A command's argv builders; `d` is the scratch directory {@link setup} filled. */
export interface Case {
  /** Argv for a run that succeeds. Absent: not run, `skip` says why. */
  ok?: (d: string) => string[];
  /** Argv for a run whose input is the user's fault, and the exit code it ends with. `none` says why there is no such input. */
  user?: { argv: (d: string) => string[]; exit: number; note?: string } | { none: string };
  /** Why the ok/user runs are not made at all (a resident or network-bound command). */
  skip?: string;
}

const STUDIO = "examples/studio.arch";
const OP3D = "test/fixtures/openplan3d/two-room-web-project.json";

/**
 * One row per manifest command (the test checks the set equals the manifest's). `exit` for a
 * user-error input is the code the command ends with TODAY: most analysers end `EXIT.USER`; the
 * authoring and sharing commands (`fmt`, `repair`, `reroll`, `suggest`, `link`, `complete`) answer a
 * plan that does not parse with exit 0 (documented in the manifest; `impact` exits 2), and this
 * table pins that (`note`) so a change to either side is a finding, not an accident.
 */
export const CASES: Record<string, Case> = {
  compile: {
    ok: (d) => ["compile", STUDIO, "-o", join(d, "o.svg"), "--json"],
    user: { argv: (d) => ["compile", join(d, "bad.arch"), "-o", join(d, "b.svg"), "--json"], exit: EXIT.USER },
  },
  batch: {
    ok: (d) => ["batch", STUDIO, "-o", join(d, "batch-ok"), "--json"],
    user: { argv: (d) => ["batch", join(d, "bad.arch"), "-o", join(d, "batch-bad"), "--json"], exit: EXIT.USER },
  },
  md: {
    ok: (d) => ["md", join(d, "ok.md"), "-o", join(d, "ok.out.md"), "--json"],
    user: {
      argv: (d) => ["md", join(d, "bad.md"), "-o", join(d, "bad.out.md"), "--json"],
      exit: EXIT.USER,
      note: "a block that fails to render is left untouched in the output, and the run ends 2",
    },
  },
  preview: {
    ok: (d) => ["preview", STUDIO, "-o", join(d, "p.png"), "--json"],
    user: { argv: (d) => ["preview", join(d, "bad.arch"), "-o", join(d, "bad.png"), "--json"], exit: EXIT.USER },
  },
  link: {
    ok: () => ["link", STUDIO, "--json"],
    user: {
      argv: (d) => ["link", join(d, "bad.arch"), "--json"],
      exit: EXIT.OK,
      note: "a plan that does not compile still gets a link, with an `errors` key and a stderr warning",
    },
  },
  watch: {
    skip: "resident: runArch refuses a command that stays alive (RESIDENT); its loop is driven by spawnArch in test/cli-commands.test.ts. Only the usage-error run is made.",
  },
  validate: {
    ok: () => ["validate", STUDIO, "--json"],
    user: { argv: (d) => ["validate", join(d, "bad.arch"), "--json"], exit: EXIT.USER },
  },
  describe: {
    ok: () => ["describe", STUDIO, "--json"],
    user: { argv: (d) => ["describe", join(d, "bad.arch"), "--json"], exit: EXIT.USER },
  },
  takeoff: {
    ok: () => ["takeoff", STUDIO, "--json"],
    user: { argv: (d) => ["takeoff", join(d, "bad.arch"), "--json"], exit: EXIT.USER },
  },
  score: {
    ok: () => ["score", STUDIO, "--taste", "generic", "--json"],
    user: { argv: (d) => ["score", join(d, "bad.arch"), "--taste", "generic", "--json"], exit: EXIT.USER },
  },
  lint: {
    ok: () => ["lint", STUDIO, "--json"],
    user: { argv: (d) => ["lint", join(d, "bad.arch"), "--json"], exit: EXIT.USER },
  },
  ast: {
    ok: () => ["ast", STUDIO, "--json"],
    user: { argv: (d) => ["ast", join(d, "bad.arch"), "--json"], exit: EXIT.USER },
  },
  complete: {
    ok: () => ["complete", STUDIO, "--at", "0", "--json"],
    user: {
      argv: (d) => ["complete", join(d, "bad.arch"), "--at", "0", "--json"],
      exit: EXIT.OK,
      note: "completion of a broken source is still a list of items",
    },
  },
  fmt: {
    ok: () => ["fmt", STUDIO, "--json"],
    user: {
      argv: (d) => ["fmt", join(d, "bad.arch"), "--json"],
      exit: EXIT.OK,
      note: "an unparseable source is returned unchanged",
    },
  },
  repair: {
    ok: () => ["repair", STUDIO, "--json"],
    user: {
      argv: (d) => ["repair", join(d, "bad.arch"), "--json"],
      exit: EXIT.OK,
      note: "nothing to repair is not a failure",
    },
  },
  fix: {
    ok: () => ["fix", STUDIO, "--dry-run", "--json"],
    user: { argv: (d) => ["fix", join(d, "bad.arch"), "--dry-run", "--json"], exit: EXIT.USER },
  },
  finish: {
    ok: () => ["finish", STUDIO, "--dry-run", "--json"],
    user: { argv: (d) => ["finish", join(d, "bad.arch"), "--dry-run", "--json"], exit: EXIT.USER },
  },
  reroll: {
    ok: () => ["reroll", STUDIO, "--json"],
    user: {
      argv: (d) => ["reroll", join(d, "bad.arch"), "--json"],
      exit: EXIT.OK,
      note: "no suggestions is not a failure",
    },
  },
  impact: {
    ok: () => ["impact", STUDIO, "--against", STUDIO, "--json"],
    user: {
      argv: (d) => ["impact", STUDIO, "--against", join(d, "bad.arch"), "--json"],
      // EH1.18: a CI gate on `impact` must not pass on a plan that does not parse; moved 0 -> 2.
      exit: EXIT.USER,
      note: "a side that does not parse is a user error: its diagnostics in the envelope",
    },
  },
  suggest: {
    ok: () => ["suggest", STUDIO, "--json"],
    user: {
      argv: (d) => ["suggest", join(d, "bad.arch"), "--json"],
      exit: EXIT.OK,
      note: "no suggestions is not a failure",
    },
  },
  manifest: {
    ok: () => ["manifest", "--json"],
    user: { none: "reads no input: it has nothing a user can get wrong beyond a flag (the usage run)" },
  },
  spec: {
    ok: () => ["spec", "--json"],
    user: { none: "reads no input: it has nothing a user can get wrong beyond a flag (the usage run)" },
  },
  context: {
    ok: () => ["context", "--section", "cli", "--json"],
    user: {
      none: "its only user error is an unknown --section, a usage error that prints no envelope (exit 3, as the usage run)",
    },
  },
  new: {
    ok: () => ["new", "--json"],
    user: {
      none: "writes a fixed starter; its only failure is an IO error (exit 1) on an existing --out, covered in test/cli-flag-matrix.test.ts",
    },
  },
  explain: {
    ok: () => ["explain", "E_PARSE", "--json"],
    user: {
      argv: () => ["explain", "E_NO_SUCH_CODE", "--json"],
      exit: EXIT.USAGE,
      note: "an unknown code is a usage error that still prints an envelope",
    },
  },
  import: {
    ok: () => ["import", "--from", "openplan3d", OP3D, "--json"],
    user: { argv: (d) => ["import", "--from", "openplan3d", join(d, "bad.json"), "--json"], exit: EXIT.USER },
  },
};

/** Write the scratch inputs the cases name into `d`. */
export function setup(d: string): void {
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "bad.arch"), 'plan "B" { units mm room at (0,0) size 4000x3000 label "R" @ }\n');
  writeFileSync(join(d, "bad.json"), "{ nope");
  const block = (src: string): string => `# T\n\n\`\`\`arch\n${src}\n\`\`\`\n`;
  writeFileSync(join(d, "ok.md"), block('plan "A" { units mm room at (0,0) size 4000x3000 label "R" }'));
  writeFileSync(join(d, "bad.md"), block('plan "B" { units mm room at (0,0) size 4000x3000 label "R" @ }'));
}

export interface Observed {
  /** Which run: `<command> <scenario>`, the key of the envelope table. */
  key: string;
  argv: string[];
  status: number | null;
  stdout: string;
  stderr: string;
  /** Top-level keys of the `--json` envelope, sorted; `null` when stdout is not one JSON object. */
  keys: string[] | null;
}

export function envelopeKeys(stdout: string): string[] | null {
  try {
    const j: unknown = JSON.parse(stdout);
    return j !== null && typeof j === "object" && !Array.isArray(j) ? Object.keys(j).sort() : null;
  } catch {
    return null;
  }
}

/** The usage-error input of every command: a flag no command takes. */
export const usageArgv = (cmd: string): string[] => [cmd, "--no-such-flag", "--json"];

export async function observe(run: Run, d: string, cmd: string, scenario: Scenario): Promise<Observed | undefined> {
  const c = CASES[cmd];
  let argv: string[] | undefined;
  if (scenario === "usage") argv = usageArgv(cmd);
  else if (c?.skip) argv = undefined;
  else if (scenario === "ok") argv = c?.ok?.(d);
  else argv = c?.user && "argv" in c.user ? c.user.argv(d) : undefined;
  if (argv === undefined) return undefined;
  const r = await run(argv);
  return { key: `${cmd} ${scenario}`, argv, ...r, keys: envelopeKeys(r.stdout) };
}
