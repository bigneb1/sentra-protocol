#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="${SENTRA_AGENT_RUNTIME_SERVICE:-sentra-agent-runtime}"
REPO_DIR="${SENTRA_REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
NPM_BIN="${NPM_BIN:-$(command -v npm)}"
RUN_AS_USER="${SENTRA_AGENT_RUNTIME_USER:-root}"
RUNTIME_PORT="${SENTRA_AGENT_RUNTIME_PORT:-19080}"
RUNTIME_HOST="${SENTRA_AGENT_RUNTIME_HOST:-0.0.0.0}"
RUNTIME_PUBLIC_URL="${SENTRA_AGENT_RUNTIME_PUBLIC_URL:-${SENTRA_PUBLIC_RUNTIME_URL:-}}"
STATE_PATH="${SENTRA_AGENT_RUNTIME_STATE_PATH:-/var/lib/sentra-agent-runtime/state.json}"
ENV_FILE="${REPO_DIR}/.env"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

if [[ ! -x "$NPM_BIN" ]]; then
  echo "npm was not found in PATH" >&2
  exit 1
fi

if [[ ! -f "${REPO_DIR}/package.json" ]]; then
  echo "SENTRA repo not found at ${REPO_DIR}" >&2
  exit 1
fi

touch "$ENV_FILE"
chmod 600 "$ENV_FILE"

upsert_env() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i "s#^${key}=.*#${key}=${value}#" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >>"$ENV_FILE"
  fi
}

if ! grep -q '^SENTRA_AGENT_WORKER_SECRET=' "$ENV_FILE"; then
  SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
  printf '\nSENTRA_AGENT_WORKER_SECRET=%s\n' "$SECRET" >>"$ENV_FILE"
fi

upsert_env "SENTRA_AGENT_RUNTIME_URL" "http://127.0.0.1:${RUNTIME_PORT}/dataset"

if [[ -n "$RUNTIME_PUBLIC_URL" ]]; then
  upsert_env "SENTRA_AGENT_RUNTIME_PUBLIC_URL" "${RUNTIME_PUBLIC_URL%/}"
  upsert_env "SENTRA_PUBLIC_RUNTIME_URL" "${RUNTIME_PUBLIC_URL%/}"
fi

mkdir -p "$(dirname "$STATE_PATH")"

cat >"/tmp/${SERVICE_NAME}.service" <<UNIT
[Unit]
Description=SENTRA VPS Agent Runtime
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${RUN_AS_USER}
WorkingDirectory=${REPO_DIR}
Environment=NODE_ENV=production
Environment=SENTRA_AGENT_RUNTIME_HOST=${RUNTIME_HOST}
Environment=SENTRA_AGENT_RUNTIME_PORT=${RUNTIME_PORT}
Environment=SENTRA_AGENT_RUNTIME_STATE_PATH=${STATE_PATH}
Environment=SENTRA_AGENT_RUNTIME_PUBLIC_URL=${RUNTIME_PUBLIC_URL}
EnvironmentFile=-${ENV_FILE}
ExecStart=${NPM_BIN} run agents:runtime
Restart=always
RestartSec=20
TimeoutStopSec=30
KillSignal=SIGINT

[Install]
WantedBy=multi-user.target
UNIT

install -m 644 "/tmp/${SERVICE_NAME}.service" "$SERVICE_FILE"
systemctl daemon-reload
systemctl enable "${SERVICE_NAME}.service"
systemctl restart "${SERVICE_NAME}.service"
systemctl --no-pager --full status "${SERVICE_NAME}.service"
