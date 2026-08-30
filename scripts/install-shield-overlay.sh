#!/usr/bin/env bash
# Install rebuilt BinaryData from client-overlay into the live server datastore.
# Loose BinaryData files override package ZIPs.
# Installs Shield tables (Item/CItem/Devil) and Client DynamicMapData when present.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
OVERLAY_SHIELD="${ROOT_DIR}/client-overlay/BinaryData/Shield"
OVERLAY_CLIENT="${ROOT_DIR}/client-overlay/BinaryData/Client"
DATASTORE_BD="${DATASTORE_BD:-/home/cat/repos/smt/comp_hack/runtime/datastore/BinaryData}"
DATASTORE_SHIELD="${DATASTORE_SHIELD:-${DATASTORE_BD}/Shield}"
DATASTORE_CLIENT="${DATASTORE_CLIENT:-${DATASTORE_BD}/Client}"
BACKUP_DIR="${BACKUP_DIR:-/home/cat/backups/ai-custom-smt/shield-$(date +%Y-%m-%d)}"

installed_any=0

install_files() {
  local src_dir="$1"
  local dst_dir="$2"
  shift 2
  local -a files=("$@")
  local -a to_install=()
  local f

  for f in "${files[@]}"; do
    if [[ -f "${src_dir}/${f}" ]]; then
      to_install+=("${f}")
    fi
  done

  if [[ ${#to_install[@]} -eq 0 ]]; then
    return 0
  fi

  mkdir -p "${BACKUP_DIR}" "${dst_dir}"
  for f in "${to_install[@]}"; do
    if [[ -f "${dst_dir}/${f}" ]]; then
      cp -a "${dst_dir}/${f}" "${BACKUP_DIR}/${f}"
    fi
    install -m 0644 "${src_dir}/${f}" "${dst_dir}/${f}"
    echo "installed: ${dst_dir}/${f}"
    installed_any=1
  done
}

install_files "${OVERLAY_SHIELD}" "${DATASTORE_SHIELD}" \
  ItemData.sbin CItemData.sbin DevilData.sbin SkillData.sbin
install_files "${OVERLAY_CLIENT}" "${DATASTORE_CLIENT}" \
  DynamicMapData.bin

if [[ "${installed_any}" -eq 0 ]]; then
  echo "no overlay BinaryData tables found; run build-client-overlay.sh first" >&2
  exit 1
fi

echo
echo "stock backup: ${BACKUP_DIR}"
echo "Restart channel (or all servers) so DefinitionManager reloads BinaryData:"
echo "  /home/cat/repos/smt/comp_hack/scripts/stop.sh"
echo "  /home/cat/repos/smt/comp_hack/scripts/start.sh"
