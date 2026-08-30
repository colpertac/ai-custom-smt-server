#!/usr/bin/env bash
# Build and install Phase 13 dungeon-payout package for bronze Suginami (5401).
# Also requires the stock event next-hooks in dungeon_events-540X.xml (patched).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
CONTENT_DIR="${ROOT_DIR}/server-content"
OUT_DIR="${CONTENT_DIR}/packages"
ZIP_NAME="zzz_ai_custom_phase13.zip"
STAGE="$(mktemp -d)"
DATASTORE_PACKAGES="${DATASTORE_PACKAGES:-/home/cat/repos/smt/comp_hack/runtime/datastore/packages}"
REPO_PACKAGES="${REPO_PACKAGES:-/home/cat/repos/smt/comp_hack/datastore/packages}"

cleanup() {
  rm -rf "${STAGE}"
}
trap cleanup EXIT

mkdir -p \
  "${STAGE}/events" \
  "${STAGE}/data/dropset" \
  "${OUT_DIR}" \
  "${DATASTORE_PACKAGES}" \
  "${REPO_PACKAGES}"

cp "${CONTENT_DIR}/events/ai_custom_phase13_suginami.xml" \
  "${STAGE}/events/ai_custom_phase13_suginami.xml"
cp "${CONTENT_DIR}/data/dropset/ai_custom_phase13.xml" \
  "${STAGE}/data/dropset/ai_custom_phase13.xml"

(
  cd "${STAGE}"
  rm -f "${OUT_DIR}/${ZIP_NAME}"
  zip -qr "${OUT_DIR}/${ZIP_NAME}" events data
)

install -m 0644 "${OUT_DIR}/${ZIP_NAME}" "${DATASTORE_PACKAGES}/${ZIP_NAME}"
install -m 0644 "${OUT_DIR}/${ZIP_NAME}" "${REPO_PACKAGES}/${ZIP_NAME}"

echo "built:    ${OUT_DIR}/${ZIP_NAME}"
echo "installed:${DATASTORE_PACKAGES}/${ZIP_NAME}"
echo "repo copy:${REPO_PACKAGES}/${ZIP_NAME}"
echo
echo "Required stock patch (already applied in this workspace):"
echo "  dungeon_events-540X.xml loot events next → AI_P13_5401_AFTER_*"
echo
echo "Also rebuild Phase 5 package if its DefeatActions were reverted:"
echo "  ${SCRIPT_DIR}/package-phase5.sh"
echo
echo "Restart:"
echo "  /home/cat/repos/smt/comp_hack/scripts/stop.sh"
echo "  /home/cat/repos/smt/comp_hack/scripts/start.sh"
echo
echo "Smoke: @instance 5401 → clear boss room → stock crates + Phase 13"
echo "       bonus crates (DropSet 900003) + +10 CP. Exit via return device."
