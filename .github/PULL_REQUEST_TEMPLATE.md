## Description

Please include a summary of the change and which issue is fixed. Include relevant motivation and context.

## Related Issue

Closes #(issue number), if applicable.

## Type of Change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Documentation update

## How Has This Been Tested?

What you ran locally (`npm run check:quick`, plus `npm run docs:build` for docs) and the CLI evidence
(`arch compile|describe|lint --json` output) for a behaviour change. The full suite runs in CI.

## Risk

Which surface could break (compiler output, a published package, a site, CI itself), and whether any
golden, digest or generated artifact moved. A change to `.github/workflows/` or a test's config that
weakens a check is a blocker unless the owner approved it.

## How to revert

Usually "revert the merge commit". Say so if more is needed (a package already published, a
regenerated artifact, a site deploy).

## Checklist

- [ ] My commits follow the [Conventional Commits](https://www.conventionalcommits.org/) style
- [ ] `npm run check:quick` is green locally; CI green is the merge gate
- [ ] I have updated documentation where needed
- [ ] I agree to follow this project's [Code of Conduct](../CODE_OF_CONDUCT.md)
