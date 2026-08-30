#!/usr/bin/env bash
# Rebuild client-overlay BinaryData from editable client-source XML.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BIN_DIR="${BIN_DIR:-/home/cat/repos/smt/comp_hack/build-current/bin}"
BDPATCH="${BIN_DIR}/comp_bdpatch"
ENCRYPT="${BIN_DIR}/comp_encrypt"
CLIENT_SRC="${ROOT_DIR}/client-source/BinaryData/Client"
SHIELD_SRC="${ROOT_DIR}/client-source/BinaryData/Shield"
CLIENT_OUT="${ROOT_DIR}/client-overlay/BinaryData/Client"
SHIELD_OUT="${ROOT_DIR}/client-overlay/BinaryData/Shield"

if [[ ! -x "${BDPATCH}" ]]; then
  echo "missing ${BDPATCH}; build tools first" >&2
  exit 1
fi

mkdir -p "${CLIENT_OUT}" "${SHIELD_OUT}"

# Phase 2 sample: English basic-command help (unencrypted Client CMessageData)
FILE="CMessageData_basicCommandHelp"
if [[ -f "${CLIENT_SRC}/${FILE}.xml" ]]; then
  "${BDPATCH}" save cmessage \
    "${CLIENT_SRC}/${FILE}.xml" \
    "${CLIENT_OUT}/${FILE}.bin"
  echo "built: ${CLIENT_OUT}/${FILE}.bin"
else
  echo "skip: ${CLIENT_SRC}/${FILE}.xml not present" >&2
fi

# Phase 3: full Shield ItemData / CItemData tables (encrypted .sbin)
build_shield() {
  local type="$1"
  local stem="$2"
  local xml="${SHIELD_SRC}/${stem}.xml"
  local plain="${SHIELD_OUT}/${stem}.plain.bin"
  local sbin="${SHIELD_OUT}/${stem}.sbin"

  if [[ ! -f "${xml}" ]]; then
    echo "skip: ${xml} not present" >&2
    return 0
  fi
  if [[ ! -x "${ENCRYPT}" ]]; then
    echo "missing ${ENCRYPT}; build tools first" >&2
    exit 1
  fi

  "${BDPATCH}" save "${type}" "${xml}" "${plain}"
  "${ENCRYPT}" "${plain}" "${sbin}"
  rm -f "${plain}"
  echo "built: ${sbin}"
}

build_shield item ItemData
build_shield citem CItemData

echo
echo "Apply with:"
echo "  ${SCRIPT_DIR}/apply-client-overlay.sh /path/to/client"
echo "Install matching server Shield copies with:"
echo "  ${SCRIPT_DIR}/install-phase3-shield.sh"
