# mask-to-plan (experimental)

A label mask (PNG, one class per pixel value) to a rooms-only ArchLang Plan JSON, then `.arch`.
The recipe, its limits and a worked example: [`docs/import.md`](../../docs/import.md)
(published at https://archlang.uk/import).

| File | What it does |
|---|---|
| `mask_to_plan.py` | mask + classes file + mm per pixel → rooms-only Plan JSON (`python -I`, numpy, SciPy, Pillow) |
| `json_to_arch.mjs` | Plan JSON → `.arch` source, through the library's `planJsonToArch` |
| `check_areas.mjs` | each region's mask area against the net area `describe` reports (default tolerance 2 %) |
| `make_example.py` | draws `example/mask.png` from a known layout |
| `example/` | the worked example: `mask.png`, `classes.json`, and the tool's outputs `plan.json`, `areas.json`, `plan.arch` |

The outputs in `example/` are generated: after changing a script, regenerate them with the commands
in `docs/import.md` rather than editing them. `test/tools-mask-to-plan.test.ts` compiles the committed
`plan.json` and holds the area check, without Python.

Nothing here is part of the npm package, and the compiler never reads an image.
