#!/usr/bin/env bash
# Sync client-overlay, run comp_rehash, refresh overlay manifests.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
CONFIG="${UPDATER_CONFIG:-${ROOT_DIR}/updater/config.env}"

if [[ -f "${CONFIG}" ]]; then
  # shellcheck source=/dev/null
  source "${CONFIG}"
fi

UPDATER_ROOT="${UPDATER_ROOT:-${ROOT_DIR}/updater}"
BASE_DIR="${UPDATER_ROOT}/base"
OVERLAY_DIR="${UPDATER_ROOT}/overlay"
REHASH="${BIN_DIR:-/home/cat/repos/smt/comp_hack/build-current/bin}/comp_rehash"

"${SCRIPT_DIR}/sync-updater-overlay.sh"

if [[ ! -f "${BASE_DIR}/hashlist.dat" ]]; then
  echo "missing ${BASE_DIR}/hashlist.dat; run scripts/seed-updater-base.sh first" >&2
  exit 1
fi

if [[ ! -x "${REHASH}" ]]; then
  echo "missing ${REHASH}; build comp_rehash in comp_hack (JOBS=2 recommended)" >&2
  exit 1
fi

"${REHASH}" --base "${BASE_DIR}" --overlay "${OVERLAY_DIR}"

echo
echo "overlay manifest:"
ls -la "${OVERLAY_DIR}/hashlist.dat" "${OVERLAY_DIR}/hashlist.ver" 2>/dev/null || true
echo
echo "Serve locally:"
echo "  ${SCRIPT_DIR}/serve-updater-local.py"
