#!/bin/sh
# Turns samples/buggy-app into a local git repo and points the seeded "Buggy sample app" project at it
# (file:// URL; needs ALLOW_FILE_REPOS=true in .env). Re-running resets the repo to the pristine sample.
set -eu
cd "$(dirname "$0")/.."
REPO="${SAMPLE_REPO:-$HOME/.bugswarm/repos/buggy-app}"
PROJECT_ID="b7480b4b-bcdf-499f-9f7f-00a9ff543866"

rm -rf "$REPO"
mkdir -p "$REPO"
# Copy the sample without node_modules.
tar -C samples/buggy-app --exclude node_modules -cf - . | tar -C "$REPO" -xf -
git -C "$REPO" init -q -b main
git -C "$REPO" add -A
git -C "$REPO" -c user.name=BugSwarm -c user.email=sample@bugswarm.test commit -q -m "Buggy sample app"

docker exec supabase_db_bugswarm psql -U postgres -q -c \
  "update projects set repo_url = 'file://$REPO', last_scanned_sha = null where id = '$PROJECT_ID'"
echo "Sample repo: $REPO ($(git -C "$REPO" rev-parse --short HEAD))"
echo "Project $PROJECT_ID now points at file://$REPO"
