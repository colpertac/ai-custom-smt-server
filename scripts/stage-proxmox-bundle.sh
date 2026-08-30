#!/usr/bin/env bash
# Stage Proxmox transfer bundle onto the SMB share (default /mnt/axecat/smt).
# Prefer the generic zip bundler for Oracle / scp:
#   ./scripts/make-deploy-bundle.sh -o /tmp/smt-deploy.zip
# Images come from Docker Hub (smt-comp + smt-website) — this only stages files.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEPLOY_DIR="${ROOT_DIR}/deploy"
DEST="${PROXMOX_STAGE:-/mnt/axecat/smt}"
DATA_SRC="${COMP_RUNTIME:-/home/cat/docker/smt/data}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "missing $1" >&2; exit 1; }; }
need tar

cifs_copy_tree() {
  local src="$1" dst="$2"
  shift 2
  mkdir -p "$dst"
  local exclude_args=()
  local paths=()
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --exclude=*) exclude_args+=("${1#--exclude=}"); shift ;;
      --exclude) exclude_args+=("$2"); shift 2 ;;
      *) paths+=("$1"); shift ;;
    esac
  done
  if [[ ${#paths[@]} -eq 0 ]]; then
    paths=(.)
  fi
  (
    cd "$src"
    if [[ ${#exclude_args[@]} -gt 0 ]]; then
      # shellcheck disable=SC2046
      tar -cf - $(printf -- '--exclude=%s ' "${exclude_args[@]}") "${paths[@]}"
    else
      tar -cf - "${paths[@]}"
    fi
  ) | (
    cd "$dst"
    tar --no-same-owner --no-same-permissions --touch -xf - 2>/dev/null || \
      tar --no-same-owner --no-same-permissions -xf - 2>/dev/null || true
  )
}

if [[ ! -d "$DEST" ]]; then
  echo "stage dest missing: $DEST (mount SMB first)" >&2
  exit 1
fi
if [[ ! -d "$DATA_SRC" ]]; then
  echo "data source missing: $DATA_SRC" >&2
  exit 1
fi

echo "==> staging to $DEST (files only; pull images from Hub on the server)"
mkdir -p "$DEST"/{bundle,updater,data}
rm -rf "${DEST}/images" 2>/dev/null || true

echo "==> bundle"
rm -rf "${DEST}/bundle"
mkdir -p "${DEST}/bundle"
cifs_copy_tree "${DEPLOY_DIR}" "${DEST}/bundle" \
  --exclude=bin --exclude=data --exclude=.env \
  .

cat >"${DEST}/bundle/.env.example" <<'EOF'
EXTERNAL_IP=192.168.0.230

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

echo "==> updater"
rm -rf "${DEST}/updater"
mkdir -p "${DEST}/updater"
cifs_copy_tree "${ROOT_DIR}/updater" "${DEST}/updater" \
  --exclude=config.env \
  .

echo "==> data (sqlite; skip mariadb + logs)"
rm -rf "${DEST}/data"
mkdir -p "${DEST}/data"
cifs_copy_tree "${DATA_SRC}" "${DEST}/data" \
  --exclude=mariadb --exclude=logs \
  --exclude=config/.runtime-lobby.xml \
  --exclude=config/.runtime-world.xml \
  --exclude=config/.runtime-channel.xml \
  .

if [[ ! -f "${DEST}/data/config/lobby.xml" ]]; then
  cifs_copy_tree "${DEPLOY_DIR}/config/sqlite" "${DEST}/data/config" .
fi

cp -f "${ROOT_DIR}/docs/proxmox-smoke.md" "${DEST}/README.md"

echo
echo "staged:"
du -sh "${DEST}/bundle" "${DEST}/updater" "${DEST}/data" 2>/dev/null || true
echo
echo "On server: assemble tree, set .env, then:"
echo "  docker compose pull && docker compose up -d"
echo "docs: ${ROOT_DIR}/docs/proxmox-smoke.md"
