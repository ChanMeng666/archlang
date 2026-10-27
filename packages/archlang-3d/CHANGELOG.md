# Changelog

The package is private and unpublished; versions start with its first 0.x publication.

## [Unreleased]

### Added

- M1a geometry (card A2): `buildMesh(scene)` → Mesh3D, one deterministic triangulation in integer
  micrometres and glTF axes, every shell closed and outward-wound. Scene3D gains each wall's body
  (owned pieces less every opening's cut), each opening's jambs and a door's closed leaves (from the
  core's `doorSwing`/`doorLeaves`), and each storey's wall footprint; arcs are discretised to a chord
  tolerance (`curveTolMm`, default 2 mm). The adapter returns `W3D_MIXED_HEIGHT_JOINT` warnings.
  Adds `earcut` (ISC).

- M0 (preview-and-remodel card A1): the package skeleton, the `resolvePlan` adapter with named
  refusals, per-wall ownership from the core's joinery (H1) with `W3D_MIXED_HEIGHT_JOINT`, Scene3D v0
  (types, JSON Schema, zero-dependency validator), the Node `World`, and the light test suite (corpus
  adaptation, H1 on `s1…s11` and the corpus, orientation, schema agreement, browser safety, the
  downstream contract). `npm run check:3d` runs the (empty) heavy suite.
