#!/usr/bin/env bash
# Copy client-overlay files into a game client tree (overwrites matching paths).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
OVERLAY="${ROOT_DIR}/client-overlay"
CLIENT_DIR="${1:-}"

if [[ -z "${CLIENT_DIR}" ]]; then
  echo "usage: $0 /path/to/reimagine-client" >&2
  exit 1
fi

if [[ ! -d "${CLIENT_DIR}" ]]; then
  echo "client dir not found: ${CLIENT_DIR}" >&2
  exit 1
fi

if [[ ! -d "${OVERLAY}/BinaryData" && ! -d "${OVERLAY}/Event" ]]; then
  echo "no overlay BinaryData or Event; nothing to apply" >&2
  exit 1
fi

# Break hardlinks before replace so disposable clones do not mutate the base.
sync_tree() {
  local src="$1" dest="$2"
  [[ -d "$src" ]] || return 0
  mkdir -p "$dest"
  # Prefer rsync; delete conflicting hardlinked files first via checksum copy.
  rsync -a --checksum --no-links "${src}/" "${dest}/"
}

sync_tree "${OVERLAY}/BinaryData" "${CLIENT_DIR}/BinaryData"
sync_tree "${OVERLAY}/Event" "${CLIENT_DIR}/Event"

echo "applied overlay -> ${CLIENT_DIR}"
echo
echo "Checks:"
echo "  Phase 2: Sit help text may contain [AI P2] if that Client bin is present."
echo "  Phase 3: inventory item 900001 should read 'AI Test Token' (needs Shield overlay)."
echo "  Phase 4: zone 90102 enemy should read 'AI Test Demon' (needs DevilData overlay)."
echo "  Phase 5: @instance 900001 (Home III Service Entrance; needs DevilData overlay)."
echo "  Phase 8: Izumi Macca tutorial uses Event/PolygonMovie/BinaryData/CEventData.bin."
