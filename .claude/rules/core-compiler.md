---
paths:
  - "src/**"
  - "examples/**"
---

# Working on the core compiler

- No I/O, `Date.now()`, `Math.random()` or Node API outside `src/cli*`; environment comes through
  `World` (`src/world.ts`); numbers print through `src/num-format.ts`. The parse-stage `PlanNode` is
  memoised and shared — clone before mutating.
- A position derived from geometry comes from the shape (`pointInPolygon`, `polygonLabelPoint`, or
  probe one wall thickness off each face), never from `room.size`, a bbox or a centroid.
- A new language form needs a byte-identity test: plans not using it are unchanged in SVG,
  `describe()` and `lint()` (SHA-256 over the examples). Take the baseline with the test's own digest.
- An SVG+`describe()`+`lint()` corpus sweep cannot see parse/resolve diagnostics; add
  `compile().diagnostics` when a change reaches the resolver. Module map: `docs/agents/architecture.md`.
