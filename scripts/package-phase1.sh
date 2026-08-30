#!/usr/bin/env bash
# Build and install the Phase 1 removable datastore package.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
CONTENT_DIR="${ROOT_DIR}/server-content"
OUT_DIR="${CONTENT_DIR}/packages"
ZIP_NAME="zzz_ai_custom_phase1.zip"
STAGE="$(mktemp -d)"
DATASTORE_PACKAGES="${DATASTORE_PACKAGES:-/var/lib/comp_hack/datastore/packages}"
REPO_PACKAGES="${REPO_PACKAGES:-/home/cat/repos/smt/comp_hack/datastore/packages}"

cleanup() {
  rm -rf "${STAGE}"
}
trap cleanup EXIT

mkdir -p \
  "${STAGE}/zones/partial" \
  "${STAGE}/data/dropset" \
  "${OUT_DIR}" \
  "${DATASTORE_PACKAGES}" \
  "${REPO_PACKAGES}"

cp "${CONTENT_DIR}/zones/partial/ai_custom_phase1.xml" \
  "${STAGE}/zones/partial/ai_custom_phase1.xml"
cp "${CONTENT_DIR}/data/dropset/ai_custom_phase1.xml" \
  "${STAGE}/data/dropset/ai_custom_phase1.xml"

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
echo "Restart channel (or all servers) so the package mounts:"
echo "  /home/cat/repos/smt/comp_hack/scripts/stop.sh"
echo "  /home/cat/repos/smt/comp_hack/scripts/start.sh"
echo
echo "In-game: @zone 90102"
echo "Remove:  rm ${DATASTORE_PACKAGES}/${ZIP_NAME} && restart channel"
