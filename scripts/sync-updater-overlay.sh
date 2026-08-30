#!/usr/bin/env bash
# Copy tracked overlay assets into updater/overlay (uncompressed paths only).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
CONFIG="${UPDATER_CONFIG:-${ROOT_DIR}/updater/config.env}"

if [[ -f "${CONFIG}" ]]; then
  # shellcheck source=/dev/null
  source "${CONFIG}"
fi

UPDATER_ROOT="${UPDATER_ROOT:-${ROOT_DIR}/updater}"
OVERLAY_SRC="${CLIENT_OVERLAY:-${ROOT_DIR}/client-overlay}"
OVERLAY_DST="${UPDATER_ROOT}/overlay"

sync_tree() {
  local src="$1" dest="$2"
  [[ -d "$src" ]] || return 0
  mkdir -p "$dest"
  rsync -a --checksum --no-links --exclude='*.compressed' "${src}/" "${dest}/"
}

mkdir -p "${OVERLAY_DST}"

sync_tree "${OVERLAY_SRC}/BinaryData" "${OVERLAY_DST}/BinaryData"
sync_tree "${OVERLAY_SRC}/Event" "${OVERLAY_DST}/Event"
sync_tree "${OVERLAY_SRC}/translations" "${OVERLAY_DST}/translations"

for extra in VersionData.txt ImagineUpdate.dat ImagineUpdate-user.dat \
  ImagineUpdate.exe webaccess.sdat.local; do
  if [[ -f "${OVERLAY_SRC}/${extra}" ]]; then
    cp -f "${OVERLAY_SRC}/${extra}" "${OVERLAY_DST}/${extra}"
    echo "copied ${extra}"
  fi
done

if [[ ! -f "${OVERLAY_DST}/VersionData.txt" && -f "${UPDATER_ROOT}/VersionData.txt.example" ]]; then
  cp -f "${UPDATER_ROOT}/VersionData.txt.example" "${OVERLAY_DST}/VersionData.txt"
  echo "copied VersionData.txt from example"
fi

echo "synced client overlay -> ${OVERLAY_DST}"
