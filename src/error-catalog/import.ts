/**
 * Error catalogue: the import family. `import` of other `.arch` files: specs, resolution, the
 * root, cycles, depth and size caps.
 *
 * Merged into `ERROR_CATALOG` by `mergeFamilies` in `src/error-catalog.ts`; each code is written once, as its key.
 */

import { MAX_IMPORT_LEVELS } from "../import/limits.js";
import { MODULE_CAP_BYTES } from "../input-limit.js";
import { defineEntries, e, w } from "./entry.js";
import { pure } from "../pure.js";

export const IMPORT_ENTRIES = defineEntries({
  E_IMPORT_BAD_SPEC: e(
    "Malformed import spec.",
    "The string after `import` is not a recognizable module reference.",
    'Use a relative path ("lib/x.arch") or a namespaced spec ("@scope/name:1.0.0").',
    'import "???" : a   # error',
  ),
  E_IMPORT_CONFLICT: e(
    "Imported name conflicts with an existing component.",
    "An imported component has the same name as one already defined or imported.",
    "Rename with `as`, or remove the duplicate.",
    'import "lib.arch": bed as lib_bed',
  ),
  E_IMPORT_CYCLE: e(
    "Cyclic import.",
    "Modules import each other in a cycle, which cannot be resolved.",
    "Break the cycle so module dependencies form a tree.",
    "# a.arch imports b.arch which imports a.arch  → error",
  ),
  E_IMPORT_FORMAT: e(
    "A file given to `archlang import` is not a valid plan in the format it was read as.",
    "`archlang import --from openplan3d` (`openPlan3dToArch()`) checks the JSON the way OpenPlan3D's own validators do (`readProject` for a web project in centimetres, `validateRoomPlan` for a prepared RoomPlan interchange file in metres) before converting anything, and reports each problem with OpenPlan3D's path and reason: a missing `id`, `floors` or `walls` array, a door on a wall of another floor, a `position` outside 0–1, a zero thickness or width, an unknown `type`, a repeated id, a transform that is not 16 finite numbers. A file OpenPlan3D would refuse is refused here too, and nothing is written. It is not raised by `compile()`: the input is JSON, not `.arch` source.",
    "Fix the field the message names (its path is the JSON path in the file), or re-export the plan from OpenPlan3D. A file read as the wrong format can be forced with `--format web` or `--format handoff`.",
    "archlang import --from openplan3d plan.json   # error: Invalid project: floors[0].doors[1].wallId must refer to a wall on the same floor.",
  ),
  E_IMPORT_LIMIT: e(
    "A file given to `archlang import` needs more work to convert than any plan does.",
    /* @__PURE__ */ pure(
      () =>
        "Converting an OpenPlan3D plan finds its rooms the way OpenPlan3D does, by comparing every wall with every other wall on a floor, so the work grows with the square of a floor's walls. It is counted, as the evaluator's work is (`E_STEP_LIMIT`), and past the same budget of 5,000,000 steps the import stops with nothing written. A floor of a few thousand walls reaches it; a house has tens. A file of more than " +
        String(MAX_IMPORT_LEVELS) +
        " storeys is refused the same way before any storey is built: each storey is a whole drawing.",
    ),
    "Split the plan into several files, a floor or a wing each, and import them one by one.",
    "archlang import --from openplan3d huge.json   # error: one floor with 100,000 walls",
  ),
  E_IMPORT_NOT_ARCH: e(
    "An imported module is not a `.arch` file.",
    "The `archlang` CLI reads an `import` only from a file whose name ends in `.arch` (in any case). Any other file is refused before it is opened, so an `import` cannot pull a text, config or system file into a drawing, nor learn what it holds from the parse error it would raise. A symbolic link whose target is not `.arch` is refused the same way. Hosts with no file system (the playground, the hosted MCP server) never read files at all.",
    "Import the `.arch` module itself; rename the file to end in `.arch` if it is one.",
    'import "notes.txt" as n   # error: not an .arch file',
  ),
  E_IMPORT_NOT_EXPORTED: e(
    "Imported name is not exported by the module.",
    "The module has no component with the requested name.",
    "Import a name the module actually defines (check its `component`s).",
    'import "lib.arch": nope   # error if lib.arch has no `component nope`',
  ),
  E_IMPORT_NOT_FOUND: e(
    "Import path could not be resolved.",
    "The World could not read the module at the given path.",
    "Check the path (relative to the importing file) and that the file exists.",
    'import "lib/missing.arch": a   # error',
  ),
  E_IMPORT_OUTSIDE_ROOT: e(
    "An imported module lies outside the import root.",
    "The `archlang` CLI reads an `import` only from inside its import root (the directory it was started in, or the directory `--import-root <dir>` names) or from under the compiled plan's own directory. The path is resolved with symbolic links and junctions followed, so a `..`, an absolute path, a drive letter or a link cannot leave the root. A library beside or below the plan, or in a sibling directory under the root, still imports; one above both does not.",
    "Run `archlang` from a directory that contains both the plan and the library, or pass `--import-root <dir>` naming a directory that contains them.",
    'import "lib.arch" as lib   # error when lib.arch resolves outside the import root (e.g. through a link)',
  ),
  E_IMPORT_PARSE: e(
    "Imported module has a parse error.",
    "The module referenced by `import` does not itself parse. The message gives the module's own error code and its `<path>:<line>:<col>`, never the module's text, so an `import` cannot read a file it reached by quoting it back.",
    "Fix the syntax error in the imported module at the line and column given; `archlang lint <module>.arch` shows it in full.",
    "# error originates in the imported file",
  ),
  E_IMPORT_TOO_LARGE: e(
    "An imported module is larger than the CLI reads.",
    /* @__PURE__ */ pure(
      () =>
        "The `archlang` CLI reads an imported `.arch` module of at most " +
        String(MODULE_CAP_BYTES) +
        " bytes (`MODULE_CAP_BYTES`) and refuses a larger file without reading it. No plan library comes near it; the cap stops an `import` from pulling a huge file into memory.",
    ),
    "Split the module into several smaller `.arch` files and import each.",
    'import "huge.arch" as h   # error: the module is larger than the cap',
  ),
  W_IMPORT_DROPPED: w(
    "Part of an imported plan has no ArchLang form and was left out.",
    "`archlang import --from openplan3d` writes what ArchLang can say (walls, rooms, doors, windows, openings, straight stairs, square columns, furniture with a matching fixture family, storeys) and leaves out the rest: finishes and textures, notes and prices, text and dimension annotations, round columns, turning or spiral stairs, furniture turned off a quarter turn or with no family, a wall's slope. Each left-out entity is listed in the report's `dropped`, each left-out field in its `fields`, with the reason, and each kind and reason gives one warning. Fields whose loss changes nothing on a plan (project and capture metadata, editor settings, format markers, a room's stored area) are listed in the report only, with no warning. Nothing is left out without a report entry.",
    "Read the report (`--json`). Add what matters by hand in the `.arch` file (a `furniture` piece, a `dim`, a stair), or accept the loss: none of these changes the walls, rooms and openings the checks read.",
    "archlang import --from openplan3d plan.json   # warning: 3 textAnnotations not imported: free text on the plan is not modelled",
  ),
  W_IMPORT_EMPTY_FILE: w(
    "Whole-file import binds an empty component.",
    "`import \"<file>\" as <name>` turns a module's TOP-LEVEL drawable statements into one component, but that module's plan body has none (it may only declare `component`s, or only `level` blocks — a storey is a page, so levels are dropped).",
    'Draw in the module\'s plan body, or import one of its named components with `import "<file>": <name>`.',
    'import "lib.arch" as lib   # warning when lib.arch only declares components',
  ),
});
