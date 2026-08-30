#!/usr/bin/env bash
# Pack a deploy zip: compose + runtime data + updater (Hub images pulled on VM).
#
#   ./deploy/scripts/make-deploy-bundle.sh
#   ./deploy/scripts/make-deploy-bundle.sh -o /tmp/smt-oracle.zip
#   COMP_RUNTIME=/path/to/data ./deploy/scripts/make-deploy-bundle.sh
#
# Zip layout (extract to /opt/smt or similar):
#   docker-compose.yml, entrypoint.sh, .env.example, config/, nginx/, …
#   data/      — config, database, datastore (incl. BinaryData), webroot
#   updater/   — overlay-only site for nginx
#   INSTALL.txt
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DEPLOY_DIR="${ROOT_DIR}/deploy"
DATA_SRC="${COMP_RUNTIME:-${HOME}/docker/smt/data}"
UPDATER_SRC="${UPDATER_ROOT:-${ROOT_DIR}/updater}"
OUT=""
KEEP_STAGE=0

usage() {
  cat <<'EOF'
Usage: make-deploy-bundle.sh [-o FILE.zip] [--keep-stage]

  -o FILE.zip    Output path (default: ./smt-deploy-YYYYMMDD-HHMMSS.zip)
  --keep-stage   Leave the staging directory next to the zip
  -h, --help     This help

Env:
  COMP_RUNTIME   Runtime data root (default: ~/docker/smt/data)
  UPDATER_ROOT   Updater tree (default: ai_custom_smt_server/updater)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -o) OUT="$2"; shift 2 ;;
    --keep-stage) KEEP_STAGE=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown arg: $1" >&2; usage >&2; exit 1 ;;
  esac
done

need() { command -v "$1" >/dev/null 2>&1 || { echo "missing $1" >&2; exit 1; }; }
need zip
need rsync

if [[ ! -d "$DATA_SRC" ]]; then
  echo "data source missing: $DATA_SRC" >&2
  echo "set COMP_RUNTIME=… to your portable runtime (config/database/datastore/…)" >&2
  exit 1
fi
if [[ ! -d "$UPDATER_SRC" ]]; then
  echo "updater missing: $UPDATER_SRC" >&2
  exit 1
fi
if [[ ! -f "${DEPLOY_DIR}/docker-compose.yml" ]]; then
  echo "deploy tree missing: $DEPLOY_DIR" >&2
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
if [[ -z "$OUT" ]]; then
  OUT="${PWD}/smt-deploy-${STAMP}.zip"
fi
OUT="$(mkdir -p "$(dirname "$OUT")" && cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")"
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/smt-deploy.XXXXXX")"
TREE="${STAGE}/smt"

cleanup() {
  if [[ "$KEEP_STAGE" -eq 1 ]]; then
    echo "stage kept: $TREE"
  else
    rm -rf "$STAGE"
  fi
}
trap cleanup EXIT

echo "==> staging under $TREE"
mkdir -p "$TREE"

echo "==> compose / deploy files"
rsync -a \
  --exclude bin \
  --exclude data \
  --exclude .env \
  --exclude '.env.*' \
  "${DEPLOY_DIR}/" "${TREE}/"

# Drop local absolute paths; VM will use /opt/smt-style paths.
cat >"${TREE}/.env.example" <<'EOF'
EXTERNAL_IP=REPLACE_WITH_PUBLIC_OR_LAN_IP

SESSION_SECRET=replace-with-openssl-rand-base64-48

UPDATER_ROOT=/opt/smt/updater
COMP_RUNTIME=/opt/smt/data
COMP_ENTRYPOINT=/opt/smt/entrypoint.sh
UPDATER_NGINX_CONF=/opt/smt/nginx/updater.conf

COMP_IMAGE=colpertac/smt-comp:latest
WEBSITE_IMAGE=colpertac/smt-website:latest
WEBSITE_PORT=3000
UPDATER_PORT=8765

COMP_API_URL=http://lobby:10999
EOF

echo "==> data (skip logs + mariadb + runtime xml patches)"
mkdir -p "${TREE}/data"
rsync -a \
  --exclude logs \
  --exclude mariadb \
  --exclude 'config/.runtime-*.xml' \
  "${DATA_SRC}/" "${TREE}/data/"

if [[ ! -f "${TREE}/data/config/lobby.xml" ]]; then
  echo "==> seeding sqlite config templates"
  mkdir -p "${TREE}/data/config"
  rsync -a "${DEPLOY_DIR}/config/sqlite/" "${TREE}/data/config/"
fi

echo "==> updater"
mkdir -p "${TREE}/updater"
rsync -a \
  --exclude config.env \
  "${UPDATER_SRC}/" "${TREE}/updater/"

cat >"${TREE}/INSTALL.txt" <<'EOF'
SMT deploy bundle
=================

Images are NOT in this zip. On the VM:

  sudo mkdir -p /opt/smt && sudo chown "$USER:$USER" /opt/smt
  cd /opt/smt
  unzip -o /path/to/smt-deploy-….zip
  # zip contains top-level "smt/" — either:
  mv smt/* smt/.* . 2>/dev/null; rmdir smt
  # or: unzip and use the smt/ folder as your root

  cp .env.example .env
  # set EXTERNAL_IP, SESSION_SECRET, keep /opt/smt paths (or edit to match)
  chmod +x entrypoint.sh

  docker compose pull
  docker compose up -d
  docker compose ps

Docs:
  Proxmox: docs/proxmox-smoke.md
  Oracle:  docs/oracle-vps.md
  Client IP files: guides/client-host-config.md
EOF

echo "==> zipping → $OUT"
rm -f "$OUT"
(
  cd "$STAGE"
  zip -r -q "$OUT" smt
)

echo
du -sh "$OUT" "${TREE}/data" "${TREE}/updater" 2>/dev/null || true
echo
echo "Copy to VM, then:"
echo "  unzip -o $(basename "$OUT")"
echo "  # see smt/INSTALL.txt"
echo "done: $OUT"
