#!/usr/bin/env bash
# Bring back Created/Exited SMT containers without recreating healthy ones.
# Safe to run every few minutes (compose up -d is a no-op when already up).
#
#   ./scripts/compose-heal.sh
#   ./scripts/compose-heal.sh /path/to/deploy

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY="${1:-$(cd "${SCRIPT_DIR}/.." && pwd)}"

cd "$DEPLOY"
[[ -f docker-compose.yml ]] || {
  echo "error: no docker-compose.yml in $DEPLOY" >&2
  exit 1
}

exec docker compose --env-file .env up -d
