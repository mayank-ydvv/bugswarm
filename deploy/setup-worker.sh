#!/usr/bin/env bash
# One-time server setup for the BugSwarm worker. Idempotent: safe to re-run.
# Usage (as root on Ubuntu 24.04):  bash setup-worker.sh [--gvisor]
#   --gvisor  also install gVisor (runsc) for kernel-level isolation of sandbox containers;
#             then set SANDBOX_RUNTIME=runsc in /etc/bugswarm/worker.env.
set -euo pipefail

GVISOR=0
[[ "${1:-}" == "--gvisor" ]] && GVISOR=1
[[ $EUID -eq 0 ]] || { echo "Run as root." >&2; exit 1; }
. /etc/os-release
[[ "${ID:-}" == "ubuntu" ]] || echo "Warning: written for Ubuntu 24.04; continuing on ${PRETTY_NAME:-unknown}." >&2

export DEBIAN_FRONTEND=noninteractive
step() { printf '\n==> %s\n' "$*"; }

step "System packages (Docker, git, firewall, automatic security updates)"
apt-get update -q
apt-get install -yq ca-certificates curl gnupg git rsync ufw unattended-upgrades docker.io
systemctl enable --now docker
dpkg-reconfigure -f noninteractive unattended-upgrades

step "Node.js 20 (NodeSource signed apt repo)"
if ! node -v 2>/dev/null | grep -qE '^v(2[0-9]|[3-9][0-9])\.'; then
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
  apt-get update -q
  apt-get install -yq nodejs
fi
node -v

step "Service user and directories"
id bugswarm >/dev/null 2>&1 || useradd --system --home-dir /var/lib/bugswarm --shell /usr/sbin/nologin bugswarm
# Docker group membership is root-equivalent: keep this server dedicated to the worker.
usermod -aG docker bugswarm
install -d -o bugswarm -g bugswarm -m 0750 /var/lib/bugswarm /var/lib/bugswarm/work /var/lib/bugswarm/tmp /var/lib/bugswarm/ms-playwright
install -d -o bugswarm -g bugswarm -m 0755 /opt/bugswarm /opt/bugswarm/worker
# systemd reads the env file as root before dropping privileges, so root-only is enough.
install -d -o root -g root -m 0700 /etc/bugswarm

step "Sandbox and tool images"
for img in node:20-slim semgrep/semgrep:latest zricethezav/gitleaks:latest ghcr.io/google/osv-scanner:latest; do
  docker pull -q "$img"
done

step "Firewall: SSH only (the worker makes outbound connections only)"
ufw allow OpenSSH
ufw --force enable

if [[ $GVISOR == 1 ]]; then
  step "gVisor (runsc)"
  curl -fsSL https://gvisor.dev/archive.key | gpg --dearmor --yes -o /usr/share/keyrings/gvisor-archive-keyring.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/gvisor-archive-keyring.gpg] https://storage.googleapis.com/gvisor/releases release main" \
    > /etc/apt/sources.list.d/gvisor.list
  apt-get update -q
  apt-get install -yq runsc
  runsc install
  systemctl restart docker
  docker run --rm --runtime=runsc node:20-slim node -e "console.log('gVisor sandbox OK')"
fi

cat <<'NEXT'

Server is ready. Next:
  1. Create /etc/bugswarm/worker.env from deploy/worker.env.example (chmod 600).
  2. From your machine: deploy/deploy-worker.sh root@<this-server>
NEXT
