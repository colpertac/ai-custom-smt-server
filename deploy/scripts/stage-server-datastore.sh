#!/usr/bin/env bash
# Stage AGPL server datastore (zones, events, data/, …) from comp_hack.
#
# Does NOT copy BinaryData or Map — those come from the game client and must be
# uploaded separately (Admin → Game files). See README.md.
#
# Usage:
#   ./deploy/scripts/stage-server-datastore.sh
#   COMP_HACK_DIR=/path/to/comp_hack ./deploy/scripts/stage-server-datastore.sh
#   DEPLOY_DIR=/opt/smt/deploy ./deploy/scripts/stage-server-datastore.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="${DEPLOY_DIR:-$(cd "${SCRIPT_DIR}/.." && pwd)}"
DATASTORE="${COMP_RUNTIME:-${DEPLOY_DIR}/data}"/datastore
OPS_SEED="$(cd "${DEPLOY_DIR}/../ops" && pwd)/server-datastore"

# Folders channel/world load via ServerDataManager (not client BinaryData/Map).
SERVER_DIRS=(data zones events partials shops skills webapps webgames migrations packages)

REQUIRED_SENTINELS=(
  "zones/zone-90105.xml"
  "data/zoneinstance/00_stock.xml"
)

find_comp_hack() {
  if [[ -n "${COMP_HACK_DIR:-}" && -d "${COMP_HACK_DIR}" ]]; then
    cd "${COMP_HACK_DIR}" && pwd
    return 0
  fi
  local deploy_parent root candidates c
  deploy_parent="$(cd "${DEPLOY_DIR}/.." && pwd)"
  candidates=(
    "${deploy_parent}/../comp_hack"
    "${DEPLOY_DIR}/../../comp_hack"
    "${deploy_parent}/comp_hack"
  )
  for c in "${candidates[@]}"; do
    if [[ -d "${c}/datastore" ]]; then
      cd "${c}" && pwd
      return 0
    fi
  done
  return 1
}

already_staged() {
  local rel
  for rel in "${REQUIRED_SENTINELS[@]}"; do
    [[ -f "${DATASTORE}/${rel}" ]] || return 1
  done
  return 0
}

main() {
  mkdir -p "${DATASTORE}" "${OPS_SEED}"

  local hack="" src name
  if hack="$(find_comp_hack)"; then
    local src_root="${hack}/datastore"
    [[ -d "${src_root}" ]] || {
      echo "error: ${src_root} missing — run: cd ${hack} && git submodule update --init datastore" >&2
      return 1
    }
    echo "==> staging server datastore from ${src_root}"
    for name in "${SERVER_DIRS[@]}"; do
      src="${src_root}/${name}"
      [[ -d "${src}" ]] || continue
      mkdir -p "${DATASTORE}/${name}" "${OPS_SEED}/${name}"
      rsync -a "${src}/" "${DATASTORE}/${name}/"
      rsync -a "${src}/" "${OPS_SEED}/${name}/"
      echo "  ${name}/"
    done
  elif already_staged; then
    echo "server datastore already present at ${DATASTORE}"
    # Still sync into ops image seed if empty (for docker-push-ops-hub).
    if [[ ! -f "${OPS_SEED}/zones/zone-90105.xml" ]]; then
      for name in "${SERVER_DIRS[@]}"; do
        [[ -d "${DATASTORE}/${name}" ]] || continue
        mkdir -p "${OPS_SEED}/${name}"
        rsync -a "${DATASTORE}/${name}/" "${OPS_SEED}/${name}/"
      done
      echo "  synced → ${OPS_SEED} for ops image"
    fi
  else
    cat >&2 <<EOF
error: server zone data not found under ${DATASTORE}.

When comp_hack is a sibling repo, re-run install from a machine that has it:
  git clone https://github.com/colpertac/comp_hack.git ../comp_hack
  cd comp_hack && git submodule update --init datastore
  cd ../ai-custom-smt-server/deploy && ./install.sh --ip …

Or upload zones/ + data/ in a content zip (Admin → Game files).
Hub installs: pull colpertac/smt-ops:latest (auto-seeds zones on first health check).
EOF
    return 1
  fi

  local rel
  for rel in "${REQUIRED_SENTINELS[@]}"; do
    [[ -f "${DATASTORE}/${rel}" ]] || {
      echo "error: expected ${DATASTORE}/${rel} after staging" >&2
      return 1
    }
  done
  echo "server datastore ready: ${DATASTORE}"
  echo "ops image seed: ${OPS_SEED}"
}

main "$@"
