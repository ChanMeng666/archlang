# @chanmeng666/archlang-3d (private, unpublished)

A downstream reader of a resolved ArchLang plan. ArchLang itself draws plans; this package is separate
([ADR 0030](../../docs/adr/0030-3d-as-downstream-package.md)) and reads the core only through its public
seam ([ADR 0031](../../docs/adr/0031-core-exports-for-downstream-consumers.md)).

Today (milestone M0) it adapts a `.arch` source to a plan-aligned **Scene3D v0**, or refuses by name:

```ts
import { adaptPlan, validateScene3D } from "@chanmeng666/archlang-3d";
import { makeNodeWorld } from "@chanmeng666/archlang-3d/node";

const r = adaptPlan(source, { world: makeNodeWorld("examples") });
if (r.ok) validateScene3D(r.scene); // [] — or r.refusal.code: E3D_PLAN_ERRORS | E3D_NO_WALLS | E3D_CORE_TOO_OLD
```

- `src/walls/ownership.ts`: each wall's owned region from the core's `joinWallSet` split (H1), and
  `W3D_MIXED_HEIGHT_JOINT` where a lower wall owns a joint with a taller one.
- `src/scene3d/`: the types, `scene3d.schema.json` and a zero-dependency validator.
- `src/node.ts`: the Node `World` (kept out of the browser entry).

Tests: `test/*.test.ts` run in the core's `npm test`; heavy tests go in `e2e/*.e2e.ts` and run with
`npm run check:3d` at the repository root. The plan and its cards: `docs/plans/archlang-3d/`,
`docs/plans/preview-and-remodel/`.
