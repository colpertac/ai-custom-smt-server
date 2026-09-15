#!/usr/bin/env bash
# Bring back Created/Exited SMT containers without recreating healthy ones.
# Safe to run every few minutes.
#
# Uses the same flock as ops Lane C (data/.smt-compose.lock) so this never
# races Admin → Update Docker stack (that race left Created leftovers + 502).
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

LOCK="${COMPOSE_LOCK:-$DEPLOY/data/.smt-compose.lock}"
mkdir -p "$(dirname "$LOCK")"

# --no-recreate: start Created/Exited only; never bounce a running ops/website
# mid Lane C update. Omit --force-recreate forever in this script.
exec flock -w 60 "$LOCK" \
  docker compose --env-file .env up -d --no-recreate
