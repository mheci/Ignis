#!/usr/bin/env bash
# Called only on a tested main push. Existing assets/tags are immutable.
set -euo pipefail
: "${GITHUB_SHA:?}" "${GITHUB_REPOSITORY:?}"
[[ $(git rev-parse HEAD) == "$GITHUB_SHA" ]]
current=$(git ls-remote --exit-code origin refs/heads/main)
if [[ ${current%%[[:space:]]*} != "$GITHUB_SHA" ]]; then
  echo 'Superseded main run; leaving the channel unchanged.'; exit 0
fi
tag="v$(node build.js --version)"
node build.js
git diff --exit-code -- ignis.user.js
scratch=$(mktemp -d); trap 'rm -rf "$scratch"' EXIT
# Listing must succeed. A network/auth failure is not evidence that a release
# is missing. Reject an existing draft/prerelease under the same version too.
gh api --paginate "repos/$GITHUB_REPOSITORY/releases?per_page=100" \
  --jq '.[] | [.tag_name,.draft,.prerelease] | @tsv' > "$scratch/releases"
if grep -Eq $'\tfalse\tfalse$' "$scratch/releases"; then
  latest=$(gh api "repos/$GITHUB_REPOSITORY/releases/latest" --jq .tag_name)
  [[ "$latest" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || { echo 'Unexpected latest tag'; exit 1; }
  [[ $(printf '%s\n' "$latest" "$tag" | sort -V | head -n 1) == "$latest" ]] || { echo 'Refusing to downgrade latest'; exit 1; }
fi
if git show-ref --verify --quiet "refs/tags/$tag"; then
  git show "refs/tags/$tag:ignis.user.js" > "$scratch/tag.js"
  cmp "$scratch/tag.js" ignis.user.js || { echo 'Version is already used by different bytes'; exit 1; }
  target=$(git rev-parse "refs/tags/$tag^{commit}")
else
  target=''
fi
if awk -F '\t' -v t="$tag" '$1==t {found=1} END {exit !found}' "$scratch/releases"; then
  [[ -n "$target" ]] && grep -Fxq "$tag"$'\tfalse\tfalse' "$scratch/releases" || { echo 'Existing release is not a tagged stable'; exit 1; }
  echo "Checking existing $tag without modifying it."
else
  if [[ -z "$target" ]]; then
    git tag -a "$tag" "$GITHUB_SHA" -m "IGNIS $tag"
    git push origin "refs/tags/$tag:refs/tags/$tag"
  elif [[ "$target" != "$GITHUB_SHA" ]]; then
    echo 'Unreleased tag targets a different commit; refusing to attach an asset'; exit 1
  fi
  gh release create "$tag" ignis.user.js --repo "$GITHUB_REPOSITORY" --verify-tag \
    --title "IGNIS $tag" --notes-file /dev/null --latest
fi
for channel in "download/$tag" latest/download; do
  url="https://github.com/$GITHUB_REPOSITORY/releases/$channel/ignis.user.js"
  ok=false
  for delay in 0 2 4 8 16; do
    sleep "$delay"
    if curl --proto '=https' --proto-redir '=https' --fail --silent --show-error --location --max-time 30 \
      --output "$scratch/published.js" "$url" && cmp -s ignis.user.js "$scratch/published.js"; then ok=true; break; fi
  done
  "$ok" || { echo "Published bytes do not match: $url"; exit 1; }
  echo "Verified $url ($(sha256sum ignis.user.js | cut -d' ' -f1))"
done
