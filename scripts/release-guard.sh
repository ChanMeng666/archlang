#!/usr/bin/env bash
# Refuses a release that is not a green, changelogged, on-main v<core version> tag.
# Env: GITHUB_REF_NAME, GITHUB_SHA, GITHUB_REPOSITORY, GH_TOKEN (needs contents + checks read).
set -euo pipefail

tag="${GITHUB_REF_NAME:?}"
sha="${GITHUB_SHA:?}"
repo="${GITHUB_REPOSITORY:?}"

fail() { echo "::error::release guard: $*"; exit 1; }

# 1. A dispatch from a branch, or a tag that is not vMAJOR.MINOR.PATCH, is refused.
[[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "ref '$tag' is not a vMAJOR.MINOR.PATCH tag (run from the release tag, not a branch)."

# 2. The tag is the core version.
version=$(node -p "require('./package.json').version")
[ "$tag" = "v$version" ] || fail "tag $tag but package.json is $version."

# 3. The changelog documents it.
grep -q "^## \[$version\]" CHANGELOG.md || fail "CHANGELOG.md has no '## [$version]' heading."

# 4. The tagged commit is on main (compare API: 'identical' or 'behind' means an ancestor).
rel=$(gh api "repos/$repo/compare/main...$sha" --jq .status)
case "$rel" in identical | behind) ;; *) fail "commit $sha is not on main (compare status: $rel)." ;; esac

# 5. CI is green for that exact commit: every required check has a success.
required=("Node 18" "Node 20" "Node 22" "Workspace builds" "Windows (tests + drift)" "Playground E2E (Playwright)" "Docs site E2E (Playwright)")
runs=$(gh api --paginate "repos/$repo/commits/$sha/check-runs?per_page=100" --jq '.check_runs[] | [.name, .conclusion] | @tsv')
for name in "${required[@]}"; do
  printf '%s\n' "$runs" | grep -Fxq "$(printf '%s\t%s' "$name" success)" || fail "required CI check '$name' is not green on $sha."
done

echo "release guard: $tag is on main, changelogged, and CI is green on $sha."
