#!/usr/bin/env bash
# Create ~/.snowflake/connections.toml for Monday SSO (external browser).
# Replace REPLACE_WITH_YOUR_EMAIL@monday.com with your real Monday email before connecting.
set -euo pipefail

SNOWFLAKE_DIR="${HOME}/.snowflake"
CONFIG_PATH="${SNOWFLAKE_DIR}/connections.toml"

mkdir -p "${SNOWFLAKE_DIR}"

if [[ -f "${CONFIG_PATH}" ]]; then
  backup="${CONFIG_PATH}.bak.$(date +%Y%m%d%H%M%S)"
  echo "Existing config found; backing up to ${backup}"
  cp "${CONFIG_PATH}" "${backup}"
fi

cat >"${CONFIG_PATH}" <<'EOF'
[monday-sso]
account = "monday-prod.monday1.us-east-1.a.p1.satoricyber.net"
user = "REPLACE_WITH_YOUR_EMAIL@monday.com"
host = "monday-prod.monday1.us-east-1.a.p1.satoricyber.net"
authenticator = "externalbrowser"
database = "bigbrain"
warehouse = "analytics_wh_01"
role = ""
EOF

chmod 600 "${CONFIG_PATH}" 2>/dev/null || true

echo "Wrote ${CONFIG_PATH}"
echo "Edit user= with your Monday email, then connect (e.g. snowsql -c monday-sso)."
echo ""

if command -v cursor >/dev/null 2>&1; then
  exec cursor "${CONFIG_PATH}"
elif command -v code >/dev/null 2>&1; then
  exec code "${CONFIG_PATH}"
fi

echo "Open this file in your editor: ${CONFIG_PATH}"
