#!/usr/bin/env bash
[[ -f .reset_done ]] && rm .reset_done
#
# recreate-player-login-pr.sh
# ---------------------------
# One-shot script to re-create the "player login screen" branch + PR after the
# repo has been rolled back for a demo.
#
# It:
#   1. Creates the branch `add-player-login` off `main`
#   2. Applies the committed change from player-login.patch (via `git am`)
#   3. Pushes the branch to origin
#   4. Opens a pull request (uses `gh` if available, otherwise the GitHub API
#      with your stored git credential)
#
# Usage:
#   ./recreate-player-login-pr.sh
#
# Safe to re-run: if the branch already exists it is deleted and recreated.

set -euo pipefail

REPO_SLUG="codecowboydotio/space-invaders"
BRANCH="add-player-login"
BASE="main"
PATCH="player-login.patch"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ ! -f "$PATCH" ]]; then
  echo "ERROR: $PATCH not found next to this script." >&2
  exit 1
fi

echo "==> Switching to $BASE and refreshing"
git checkout "$BASE"

echo "==> (Re)creating branch $BRANCH"
git branch -D "$BRANCH" 2>/dev/null || true
git checkout -b "$BRANCH"

echo "==> Applying $PATCH"
git am "$PATCH"

echo "==> Pushing branch"
git push -u origin "$BRANCH" --force-with-lease

PR_TITLE="Add player login screen to capture callsign"
PR_BODY=$'## Summary\n\nAdds an arcade-style **player login screen** that captures the pilot'\''s callsign before the game starts.\n\n- New `ENTER CALLSIGN` overlay shown on load, styled to match the CRT/phosphor cabinet aesthetic.\n- Callsign is sanitised (alphanumerics/space/dash/underscore, uppercased, max 12 chars) and rendered into a new **PLAYER** field in the HUD.\n- Name is persisted to `localStorage`, so returning pilots have it pre-filled.\n- Empty/whitespace-only names are rejected with a `CALLSIGN REQUIRED` message.\n- The callsign is set as the LaunchDarkly context key so sprite flags can target per-player.\n- Game hotkeys (Space/P/R) are ignored while typing in the input.\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'

echo "==> Opening pull request"
if command -v gh >/dev/null 2>&1; then
  gh pr create --repo "$REPO_SLUG" --base "$BASE" --head "$BRANCH" \
    --title "$PR_TITLE" --body "$PR_BODY"
else
  echo "    gh not found — using GitHub API with stored git credential"
  CRED=$(printf "protocol=https\nhost=github.com\n\n" | git credential fill)
  TOKEN=$(echo "$CRED" | sed -n 's/^password=//p')
  # jq-free JSON body: escape via python
  JSON=$(BASE="$BASE" BRANCH="$BRANCH" TITLE="$PR_TITLE" BODY="$PR_BODY" python3 - <<'PY'
import json, os
print(json.dumps({
    "title": os.environ["TITLE"],
    "head":  os.environ["BRANCH"],
    "base":  os.environ["BASE"],
    "body":  os.environ["BODY"],
}))
PY
)
  curl -s -X POST \
    -H "Authorization: token $TOKEN" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/$REPO_SLUG/pulls" \
    -d "$JSON" | grep -E '"html_url"' | head -1
fi

echo "==> Done."
