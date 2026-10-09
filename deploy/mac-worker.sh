#!/usr/bin/env bash
# Run the production worker on this Mac as a launchd agent: starts at login, restarts if it crashes.
# Usage: deploy/mac-worker.sh install | uninstall | restart | logs | status
# Reads ../.env (AI keys, models) and then .env.production (hosted database, overrides).
set -euo pipefail

LABEL=com.bugswarm.worker
ROOT=$(cd "$(dirname "$0")/.." && pwd)
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/bugswarm-worker.log"
NODE=$(command -v node)
DOCKER_DIR=$(dirname "$(command -v docker)")
DOMAIN="gui/$(id -u)"

xml_escape() { sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' <<<"$1"; }

install() {
  [[ -f "$ROOT/.env.production" ]] || { echo "Missing $ROOT/.env.production" >&2; exit 1; }
  grep -qE '^DATABASE_URL=.+' "$ROOT/.env.production" || { echo "Fill DATABASE_URL in .env.production first." >&2; exit 1; }
  grep -qE '^SUPABASE_SERVICE_ROLE_KEY=.+' "$ROOT/.env.production" || { echo "Fill SUPABASE_SERVICE_ROLE_KEY in .env.production first." >&2; exit 1; }

  echo "==> Building the worker"
  (cd "$ROOT" && pnpm --filter worker build >/dev/null)
  mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"

  local root; root=$(xml_escape "$ROOT")
  cat >"$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>--env-file=$root/.env</string>
    <string>--env-file=$root/.env.production</string>
    <string>dist/index.js</string>
  </array>
  <key>WorkingDirectory</key><string>$root/worker</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$DOCKER_DIR:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
    <key>NODE_ENV</key><string>production</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>ExitTimeOut</key><integer>90</integer>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLIST
  plutil -lint "$PLIST" >/dev/null
  launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
  launchctl bootstrap "$DOMAIN" "$PLIST"
  echo "==> Installed. It starts at login; logs: $LOG"
  sleep 4
  tail -n 3 "$LOG" || true
}

case "${1:-}" in
  install) install ;;
  uninstall) launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true; rm -f "$PLIST"; echo "Removed." ;;
  restart) (cd "$ROOT" && pnpm --filter worker build >/dev/null); launchctl kickstart -k "$DOMAIN/$LABEL"; echo "Restarted." ;;
  logs) tail -n 50 -f "$LOG" ;;
  status) launchctl print "$DOMAIN/$LABEL" 2>/dev/null | grep -E 'state =|pid =|last exit' || echo "Not installed." ;;
  *) echo "usage: $0 install|uninstall|restart|logs|status" >&2; exit 2 ;;
esac
