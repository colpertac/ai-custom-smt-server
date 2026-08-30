#!/usr/bin/env bash
# Build and install Phase 6 Golden Apple compressor package.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
CONTENT_DIR="${ROOT_DIR}/server-content"
OUT_DIR="${CONTENT_DIR}/packages"
ZIP_NAME="zzz_ai_custom_phase6.zip"
STAGE="$(mktemp -d)"
DATASTORE_PACKAGES="${DATASTORE_PACKAGES:-/home/cat/repos/smt/comp_hack/runtime/datastore/packages}"
REPO_PACKAGES="${REPO_PACKAGES:-/home/cat/repos/smt/comp_hack/datastore/packages}"

cleanup() { rm -rf "${STAGE}"; }
trap cleanup EXIT

mkdir -p \
  "${STAGE}/data/compressors" \
  "${STAGE}/data/dropset" \
  "${OUT_DIR}" \
  "${DATASTORE_PACKAGES}" \
  "${REPO_PACKAGES}"

cp "${CONTENT_DIR}/data/compressors/ai_custom_phase6.xml" \
  "${STAGE}/data/compressors/ai_custom_phase6.xml"
cp "${CONTENT_DIR}/data/dropset/ai_custom_phase6_apple.xml" \
  "${STAGE}/data/dropset/ai_custom_phase6_apple.xml"

(
  cd "${STAGE}"
  rm -f "${OUT_DIR}/${ZIP_NAME}"
  zip -qr "${OUT_DIR}/${ZIP_NAME}" data
)

install -m 0644 "${OUT_DIR}/${ZIP_NAME}" "${DATASTORE_PACKAGES}/${ZIP_NAME}"
install -m 0644 "${OUT_DIR}/${ZIP_NAME}" "${REPO_PACKAGES}/${ZIP_NAME}"

echo "built:    ${OUT_DIR}/${ZIP_NAME}"
echo "installed:${DATASTORE_PACKAGES}/${ZIP_NAME}"
echo "In-game: @item 21941 N  (Magical Golden Apple; apple auto-compress deferred)"
echo "         Macca/Mag auto-compress still active (799/800)"
