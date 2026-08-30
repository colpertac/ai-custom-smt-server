#!/usr/bin/env bash
# Install rebuilt Shield BinaryData from client-overlay into the live server
# datastore. Loose Shield files override package ZIPs.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
OVERLAY_SHIELD="${ROOT_DIR}/client-overlay/BinaryData/Shield"
DATASTORE_SHIELD="${DATASTORE_SHIELD:-/var/lib/comp_hack/datastore/BinaryData/Shield}"
BACKUP_DIR="${BACKUP_DIR:-/home/cat/backups/ai-custom-smt/shield-$(date +%Y-%m-%d)}"

# Install whichever overlay Shield tables are present.
CANDIDATES=(ItemData.sbin CItemData.sbin DevilData.sbin)
TO_INSTALL=()
for f in "${CANDIDATES[@]}"; do
  if [[ -f "${OVERLAY_SHIELD}/${f}" ]]; then
    TO_INSTALL+=("${f}")
  fi
done

if [[ ${#TO_INSTALL[@]} -eq 0 ]]; then
  echo "no overlay Shield tables in ${OVERLAY_SHIELD}; run build-client-overlay.sh first" >&2
  exit 1
fi

mkdir -p "${BACKUP_DIR}" "${DATASTORE_SHIELD}"

for f in "${TO_INSTALL[@]}"; do
  if [[ -f "${DATASTORE_SHIELD}/${f}" ]]; then
    cp -a "${DATASTORE_SHIELD}/${f}" "${BACKUP_DIR}/${f}"
  fi
  install -m 0644 "${OVERLAY_SHIELD}/${f}" "${DATASTORE_SHIELD}/${f}"
  echo "installed: ${DATASTORE_SHIELD}/${f}"
done

echo
echo "stock backup: ${BACKUP_DIR}"
echo "Restart channel (or all servers) so DefinitionManager reloads BinaryData:"
echo "  /home/cat/repos/smt/comp_hack/scripts/stop.sh"
echo "  /home/cat/repos/smt/comp_hack/scripts/start.sh"
