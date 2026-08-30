#!/usr/bin/env bash
# Rebuild client-overlay BinaryData from editable client-source XML.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BIN_DIR="${BIN_DIR:-/home/cat/repos/smt/comp_hack/build-current/bin}"
BDPATCH="${BIN_DIR}/comp_bdpatch"
SRC="${ROOT_DIR}/client-source/BinaryData/Client"
OUT="${ROOT_DIR}/client-overlay/BinaryData/Client"

if [[ ! -x "${BDPATCH}" ]]; then
  echo "missing ${BDPATCH}; build tools first" >&2
  exit 1
fi

mkdir -p "${OUT}"

# Phase 2 sample: English basic-command help (unencrypted Client CMessageData)
FILE="CMessageData_basicCommandHelp"
if [[ -f "${SRC}/${FILE}.xml" ]]; then
  "${BDPATCH}" save cmessage \
    "${SRC}/${FILE}.xml" \
    "${OUT}/${FILE}.bin"
  echo "built: ${OUT}/${FILE}.bin"
else
  echo "skip: ${SRC}/${FILE}.xml not present" >&2
fi

echo
echo "Apply with:"
echo "  ${SCRIPT_DIR}/apply-client-overlay.sh /path/to/client"
