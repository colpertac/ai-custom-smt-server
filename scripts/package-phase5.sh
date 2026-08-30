#!/usr/bin/env bash
# Build and install the Phase 5 removable datastore package (AI Test Dungeon).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
CONTENT_DIR="${ROOT_DIR}/server-content"
OUT_DIR="${CONTENT_DIR}/packages"
ZIP_NAME="zzz_ai_custom_phase5.zip"
STAGE="$(mktemp -d)"
DATASTORE_PACKAGES="${DATASTORE_PACKAGES:-/home/cat/repos/smt/comp_hack/runtime/datastore/packages}"
REPO_PACKAGES="${REPO_PACKAGES:-/home/cat/repos/smt/comp_hack/datastore/packages}"

cleanup() {
  rm -rf "${STAGE}"
}
trap cleanup EXIT

mkdir -p \
  "${STAGE}/zones/partial" \
  "${STAGE}/data/zoneinstance" \
  "${STAGE}/data/zoneinstancevariant" \
  "${OUT_DIR}" \
  "${DATASTORE_PACKAGES}" \
  "${REPO_PACKAGES}"

cp "${CONTENT_DIR}/zones/partial/ai_custom_phase5.xml" \
  "${STAGE}/zones/partial/ai_custom_phase5.xml"
cp "${CONTENT_DIR}/data/zoneinstance/ai_custom_phase5.xml" \
  "${STAGE}/data/zoneinstance/ai_custom_phase5.xml"
cp "${CONTENT_DIR}/data/zoneinstancevariant/ai_custom_phase5.xml" \
  "${STAGE}/data/zoneinstancevariant/ai_custom_phase5.xml"

(
  cd "${STAGE}"
  zip -qr "${OUT_DIR}/${ZIP_NAME}" zones data
)

install -m 0644 "${OUT_DIR}/${ZIP_NAME}" "${DATASTORE_PACKAGES}/${ZIP_NAME}"
install -m 0644 "${OUT_DIR}/${ZIP_NAME}" "${REPO_PACKAGES}/${ZIP_NAME}"

echo "built:    ${OUT_DIR}/${ZIP_NAME}"
echo "installed:${DATASTORE_PACKAGES}/${ZIP_NAME}"
echo "repo copy:${REPO_PACKAGES}/${ZIP_NAME}"
echo
echo "Prerequisite: split stock zoneinstance files into directories:"
echo "  ${SCRIPT_DIR}/migrate-zoneinstance-dirs.sh"
echo
echo "Also install Shield/Devil overlays on server + client (Phase 3/4 demon name)."
echo "  ${SCRIPT_DIR}/build-client-overlay.sh"
echo "  ${SCRIPT_DIR}/install-shield-overlay.sh"
echo "  ${SCRIPT_DIR}/apply-client-overlay.sh /path/to/reimagine-phase5-test"
echo
echo "Restart servers:"
echo "  /home/cat/repos/smt/comp_hack/scripts/stop.sh"
echo "  /home/cat/repos/smt/comp_hack/scripts/start.sh"
echo
echo "In-game: @instance 900001   (Home III Service Entrance dungeon)"
echo "Compare: @instance 5201       (stock; same map family)"
echo "Suginami tunnels (stock): @instance 5401"
echo "Phase 1: @zone 90102          (unchanged global Home II)"
echo "Remove:  rm ${DATASTORE_PACKAGES}/${ZIP_NAME} && restart channel"
