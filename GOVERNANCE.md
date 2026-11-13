# Project Governance

This document describes how **ArchLang** is governed and how decisions are made.

## Overview

This is an open-source project currently maintained by a single lead maintainer. We follow a
lightweight "benevolent maintainer" model: the project is open to community contributions, and the
maintainer is responsible for the project's direction, quality, and releases.

## Roles

### Lead Maintainer

- **Chan Meng** ([@ChanMeng666](https://github.com/ChanMeng666)) — founder and lead maintainer.

The lead maintainer reviews and merges pull requests, triages issues, sets the roadmap, cuts
releases, and has the final say on technical and community decisions.

### Contributors

Anyone who submits an issue, pull request, documentation improvement, or other contribution is a
contributor. Contributors are expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md) and the
[Contributing Guide](CONTRIBUTING.md).

## Decision Making

- **Day-to-day changes** (bug fixes, docs, small features) are decided through normal pull-request
  review by the maintainer.
- **Significant changes** (breaking changes, major features, direction shifts) are discussed openly
  in [GitHub Issues](https://github.com/chanmeng666/archlang/issues) or
  [Discussions](https://github.com/chanmeng666/archlang/discussions) before implementation, so the
  community can weigh in.

## Becoming a Maintainer

Sustained, high-quality contributions can lead to an invitation to become a maintainer. There is no
fixed quota — a track record of good judgment, helpful reviews, and reliable contributions is what
matters. If you're interested, start by contributing and engaging in discussions.

## Compatibility and deprecation

This is what users of the published schemas, the language and the library can rely on. A schema's
identity is its `$id`, a public URL; under ADR 0019 such a URL does not move.

1. **Additive only within a major version.** Under one `$id` a schema only gains optional fields
   and looser enums and bounds. It never renames, retypes, removes or tightens. The release
   compatibility gate (`scripts/compat-check.mjs`) enforces this for Plan JSON, the MCP tool
   schemas, the public types and the error codes, and it also fails when a schema's root `$id`
   changes.
2. **A breaking change is a new major version and a new `$id`.** The same change writes a
   `BREAKING:` line under `[Unreleased]` in `CHANGELOG.md`, and the core releases a major. The
   schema file of an older major stays at its old URL and is never deleted.
3. **Deprecate before removing.** A schema field is first marked `deprecated: true` with a
   "Deprecated: ..." description and stays for at least one minor release; it goes only in the next
   major. A language form first gets a `W_*_DEPRECATED` warning in 1.x and is removed in 2.0. A
   public export gets `@deprecated` and a CHANGELOG line (ADR 0031).
4. **Drafts are marked `v0`.** A `v0` schema may change its shape, and each change is a CHANGELOG
   line. Moving from `v0` to `v1` is itself a declaration; from then on rule 1 applies.
5. **Names of new schemas.** A new schema is published at
   `https://archlang.uk/schemas/<name>/v<major>.schema.json`. The two older schemas keep their
   `$id` values (`https://archlang.uk/plan.schema.json`, `https://archlang.uk/intent.schema.json`);
   they are the `$id` of major version 1 and do not change.

## Changes to Governance

This document may evolve as the project and its community grow. Proposed changes are made via pull
request and decided by the lead maintainer.
