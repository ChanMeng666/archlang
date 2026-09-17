---
paths:
  - "src/**"
  - "examples/**"
---

# Working on the core compiler

Before changing code here, read `docs/agents/architecture.md` (pipeline, conventions, module map)
and the untagged + `(place)` entries of `docs/agents/gotchas.md`. If the change adds a language form
or derives a position from geometry, also read `docs/agents/iron-laws.md` (byte-identity law,
shape-not-bounding-box law). Prove it with `docs/agents/verification.md`.
