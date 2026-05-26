#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="${SENTRA_AGENT_WORKER_SERVICE:-sentra-agent-worker}"
REPO_DIR="${SENTRA_REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
NPM_BIN="${NPM_BIN:-$(command -v npm)}"
RUN_AS_USER="${SENTRA_AGENT_WORKER_USER:-root}"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

if [[ ! -x "$NPM_BIN" ]]; then
  echo "npm was not found in PATH" >&2
  exit 1
fi

if [[ ! -f "${REPO_DIR}/package.json" ]]; then
  echo "SENTRA repo not found at ${REPO_DIR}" >&2
  exit 1
fi

cat >"/tmp/${SERVICE_NAME}.service" <<UNIT
[Unit]
Description=SENTRA Agent Worker
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${RUN_AS_USER}
WorkingDirectory=${REPO_DIR}
Environment=NODE_ENV=production
EnvironmentFile=-${REPO_DIR}/.env
EnvironmentFile=-${REPO_DIR}/.env.arc.example
ExecStart=${NPM_BIN} run agents:run
Restart=always
RestartSec=20
TimeoutStopSec=30
KillSignal=SIGINT

[Install]
WantedBy=multi-user.target
UNIT

install -m 644 "/tmp/${SERVICE_NAME}.service" "$SERVICE_FILE"
systemctl daemon-reload
systemctl enable --now "${SERVICE_NAME}.service"
systemctl --no-pager --full status "${SERVICE_NAME}.service"
