#!/usr/bin/env bash
# Seed updater/base/hashlist.dat for comp_rehash.
#
# Modes:
#   (default) Copy ImagineUpdate2.dat / hashlist — lists ALL stock files.
#             Only works for downloads if you also host base/*.compressed
#             (full vanilla mirror). Incremental clients whose stock files
#             diverge from that manifest will 404 on missing base files.
#
#   --overlay-only  Minimal base hashlist so build-updater-overlay.sh produces
#                   an overlay hashlist that only contains files you ship.
#                   Recommended for private-server MVP / Proxmox / Oracle until
#                   a full base mirror exists.

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
OVERLAY_ONLY=0
SOURCE=""

usage() {
  cat <<'EOF'
Usage: seed-updater-base.sh [--overlay-only] [path/to/hashlist-or-ImagineUpdate2.dat]

  --overlay-only   Write a minimal base hashlist (private-server default).
  PATH             Copy that file to base/hashlist.dat (full-catalog mode).

Or set UPDATER_BASE_SOURCE in updater/config.env for full-catalog mode.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --overlay-only) OVERLAY_ONLY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) SOURCE="$1"; shift ;;
  esac
done

mkdir -p "${BASE_DIR}"

if [[ "$OVERLAY_ONLY" -eq 1 ]]; then
  stamp="$(date +%Y%m%d%H%M%S)"
  # comp_rehash requires a readable base/hashlist.dat; empty FILE list is OK.
  # Use CRLF like official lists; trailing spaces match COMP samples.
  {
    printf 'EXE : .\\ImagineClient.exe \r\n'
    printf 'VERSION : %s\r\n' "$stamp"
  } >"${BASE_DIR}/hashlist.dat"
  echo "seeded overlay-only ${BASE_DIR}/hashlist.dat (VERSION ${stamp})"
  echo "Next: ./scripts/build-updater-overlay.sh"
  echo "Hashlist will list only files under updater/overlay/ (not full Reimagine)."
  exit 0
fi

SOURCE="${SOURCE:-${UPDATER_BASE_SOURCE:-}}"

if [[ -z "${SOURCE}" ]]; then
  echo "usage: $0 [--overlay-only] [path/to/hashlist.dat-or-ImagineUpdate2.dat]" >&2
  echo "or set UPDATER_BASE_SOURCE in updater/config.env" >&2
  echo
  echo "For private-server MVP prefer: $0 --overlay-only" >&2
  exit 1
fi

if [[ ! -f "${SOURCE}" ]]; then
  echo "source not found: ${SOURCE}" >&2
  exit 1
fi

cp -f "${SOURCE}" "${BASE_DIR}/hashlist.dat"

echo "seeded ${BASE_DIR}/hashlist.dat"
echo "  from ${SOURCE}"
echo
echo "Note: this catalogs ~all stock client files. Hosting downloads for those"
echo "requires base/*.compressed (vanilla mirror). Prefer --overlay-only until then."
