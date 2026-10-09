#!/usr/bin/env bash
# Build the worker locally and ship it to a server prepared with setup-worker.sh.
# Usage: deploy/deploy-worker.sh root@<server>
# Dependencies are pure JavaScript, so a bundle built on macOS runs on Linux unchanged.
set -euo pipefail

HOST=${1:?"usage: deploy/deploy-worker.sh root@<server>"}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
cd "$ROOT"

echo "==> Building"
pnpm --filter worker build
# Self-contained folder: compiled JS + production dependencies only.
pnpm --filter worker deploy --prod "$STAGE/worker" >/dev/null
rm -rf "$STAGE/worker/src" "$STAGE/worker/tsconfig"*.json

echo "==> Uploading to $HOST"
rsync -az --delete "$STAGE/worker/" "$HOST:/opt/bugswarm/worker/"
scp -q deploy/bugswarm-worker.service deploy/bugswarm-housekeeping.service deploy/bugswarm-housekeeping.timer \
  "$HOST:/etc/systemd/system/"

echo "==> Installing on the server"
ssh "$HOST" bash -s <<'REMOTE'
set -euo pipefail
chown -R bugswarm:bugswarm /opt/bugswarm/worker
cd /opt/bugswarm/worker
# Chromium's system libraries (root), then the browser itself for the service user.
node node_modules/playwright/cli.js install-deps chromium >/dev/null
sudo -u bugswarm env PLAYWRIGHT_BROWSERS_PATH=/var/lib/bugswarm/ms-playwright \
  node node_modules/playwright/cli.js install chromium >/dev/null
systemctl daemon-reload
systemctl enable --now bugswarm-housekeeping.timer >/dev/null
if [[ -f /etc/bugswarm/worker.env ]]; then
  chmod 600 /etc/bugswarm/worker.env
  systemctl enable bugswarm-worker >/dev/null
  systemctl restart bugswarm-worker
  sleep 3
  journalctl -u bugswarm-worker -n 5 --no-pager
else
  echo "Not starting yet: create /etc/bugswarm/worker.env (see deploy/worker.env.example), then run"
  echo "  systemctl enable --now bugswarm-worker"
fi
REMOTE
echo "==> Done"
