# OpenPlan3D sample files

The JSON files in this folder are copied byte for byte from OpenPlan3D, the open floor-plan
editor by Laan Labs: <https://github.com/laanlabs/openPlan3D>, commit
`98f9cb467e4045c6abc5d9880ada1f03dff50c68` (2026-10-22). They are the inputs of
`test/import-openplan3d.test.ts`, which checks `arch import --from openplan3d` against them.
None was written or edited here; Biome is told to leave them alone (`biome.jsonc`).

| File | Path in the OpenPlan3D repository | Format |
| --- | --- | --- |
| `two-room-web-project.json` | `docs/skills/openplan3d-plan-authoring/examples/two-room-web-project.json` | web project (cm) |
| `two-room-interchange.openplan3d.json` | `docs/skills/openplan3d-plan-authoring/examples/two-room-interchange.openplan3d.json` | interchange (m) |
| `multifloor-plan.openplan.json` | `tests/fixtures/multifloor-plan.openplan.json` | web project |
| `sketch-two-floors.openplan.json` | `tests/fixtures/sketch-two-floors.openplan.json` | web project |
| `interior-xray.openplan.json` | `tests/fixtures/interior-xray.openplan.json` | web project |
| `curved-rooms.openplan.json` | `tests/fixtures/curved-rooms.openplan.json` | web project |
| `sloped-walls.openplan.json` | `tests/fixtures/sloped-walls.openplan.json` | web project |
| `top-down-framing.openplan.json` | `tests/fixtures/top-down-framing.openplan.json` | web project |
| `interaction-plan.openplan.json` | `tests/fixtures/interaction-plan.openplan.json` | web project |
| `overlapping-rooms.openplan.json` | `tests/fixtures/overlapping-rooms.openplan.json` | web project |
| `damaged-native.openplan.json` | `tests/fixtures/damaged-native.openplan.json` | web project OpenPlan3D refuses |
| `handoff-roomplan.json` | `tests/fixtures/handoff-roomplan.json` | interchange, two storeys |
| `handoff-collapsed-wall.json` | `tests/fixtures/handoff-collapsed-wall.json` | interchange with a 0-long wall |
| `ios-sample-kitchen.openplan3d.json` | `tests/fixtures/siblings/ios-sample-kitchen.openplan3d.json` | interchange (OpenKitchen3D) |
| `handoff-plan.json` | `tests/fixtures/handoff-plan.json` | an iPhone app plan file, neither format |

The hand-written inputs the test needs beyond these (door hands, stair turns, hostile shapes) are
built inside the test file from OpenPlan3D's documented schema, and are marked there as such.

## Licence

These files are distributed under OpenPlan3D's licence:

```text
MIT License

Copyright (c) 2026 theLodgeStudio

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
