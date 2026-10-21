#!/usr/bin/env bash
# Publish this folder to github.com/mayank-ydvv/bugswarm as a new commit on top of its `main`.
# The folder lives inside a larger repo, so a plain `git push` can't be used; this keeps a mirror
# clone, copies the tracked files into it, commits, and pushes (fast-forward only, never --force).
#
#   scripts/push-github.sh "Commit message"
set -euo pipefail

MSG=${1:?usage: scripts/push-github.sh "Commit message"}
REMOTE=git@github.com:mayank-ydvv/bugswarm.git
ROOT=$(cd "$(dirname "$0")/.." && pwd)
MIRROR=${BUGSWARM_MIRROR:-$HOME/.bugswarm/github-mirror}

if [[ -d "$MIRROR/.git" ]]; then
  git -C "$MIRROR" fetch -q origin main
  git -C "$MIRROR" checkout -q main
  git -C "$MIRROR" reset -q --hard origin/main
else
  mkdir -p "$(dirname "$MIRROR")"
  git clone -q --branch main "$REMOTE" "$MIRROR"
fi

# Mirror exactly the files git tracks here (ignored files like .env never leave this machine).
git -C "$MIRROR" rm -rq --cached --ignore-unmatch . >/dev/null
find "$MIRROR" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
(cd "$ROOT" && git ls-files -z) | (cd "$ROOT" && rsync -a --from0 --files-from=- ./ "$MIRROR/")
git -C "$MIRROR" add -A

if git -C "$MIRROR" diff --cached --quiet; then
  echo "Nothing new to push."
  exit 0
fi
git -C "$MIRROR" commit -q -m "$MSG"
git -C "$MIRROR" push -q origin main
echo "Pushed: $(git -C "$MIRROR" log -1 --format='%h %s')"
