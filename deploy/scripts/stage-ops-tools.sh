#!/usr/bin/env bash
# Stage comp_encrypt / comp_rehash / comp_decrypt / comp_bdpatch for ops.
#
# Copies Linux amd64 binaries from a local comp_hack build into:
#   deploy/ops-tools/     (host reference / optional override)
#   ops/comp-tools/       (baked into smt-ops image at build time)
#
# Usage:
#   ./deploy/scripts/stage-ops-tools.sh
#   COMP_HACK_DIR=/path/to/comp_hack ./deploy/scripts/stage-ops-tools.sh
#   DEPLOY_DIR=/opt/smt/deploy ./deploy/scripts/stage-ops-tools.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="${DEPLOY_DIR:-$(cd "${SCRIPT_DIR}/.." && pwd)}"
OPS_TOOLS="${OPS_TOOLS_DIR:-${DEPLOY_DIR}/ops-tools}"
OPS_DIR="$(cd "${DEPLOY_DIR}/../ops" && pwd)"
OPS_COMP_TOOLS="${OPS_DIR}/comp-tools"

TOOLS=(comp_encrypt comp_rehash comp_decrypt comp_bdpatch)
REQUIRED=(comp_encrypt)

find_comp_hack() {
  if [[ -n "${COMP_HACK_DIR:-}" && -d "${COMP_HACK_DIR}" ]]; then
    cd "${COMP_HACK_DIR}" && pwd
    return 0
  fi
  local root deploy_parent
  deploy_parent="$(cd "${DEPLOY_DIR}/.." && pwd)"
  local candidates=(
    "${deploy_parent}/../comp_hack"
    "${DEPLOY_DIR}/../../comp_hack"
    "${deploy_parent}/comp_hack"
  )
  local c
  for c in "${candidates[@]}"; do
    if [[ -d "${c}" ]]; then
      cd "${c}" && pwd
      return 0
    fi
  done
  return 1
}

find_tool_bin() {
  local name="$1" hack="$2"
  local d
  for d in "${hack}/build-current/bin" "${hack}/build-localdeps-v31/bin"; do
    if [[ -x "${d}/${name}" ]]; then
      echo "${d}/${name}"
      return 0
    fi
  done
  return 1
}

already_staged() {
  local req
  for req in "${REQUIRED[@]}"; do
    [[ -x "${OPS_TOOLS}/${req}" ]] || return 1
  done
  return 0
}

sync_to_ops_comp_tools() {
  mkdir -p "${OPS_COMP_TOOLS}"
  local name
  for name in "${TOOLS[@]}"; do
    [[ -x "${OPS_TOOLS}/${name}" ]] || continue
    install -m 0755 "${OPS_TOOLS}/${name}" "${OPS_COMP_TOOLS}/${name}"
  done
}

main() {
  mkdir -p "${OPS_TOOLS}" "${OPS_COMP_TOOLS}"

  local hack="" src name
  if hack="$(find_comp_hack)"; then
    echo "==> staging ops tools from ${hack}"
    for name in "${TOOLS[@]}"; do
      if src="$(find_tool_bin "${name}" "${hack}")"; then
        install -m 0755 "${src}" "${OPS_TOOLS}/${name}"
        install -m 0755 "${src}" "${OPS_COMP_TOOLS}/${name}"
        echo "  ${name}"
      else
        echo "  warn: ${name} not built under ${hack} (cmake --build … --target ${name})" >&2
      fi
    done
  elif already_staged; then
    echo "==> ops-tools already populated at ${OPS_TOOLS}"
    sync_to_ops_comp_tools
  else
    cat >&2 <<EOF
error: comp_encrypt not available.

Build comp_hack tools on this machine, then re-run install:
  cd comp_hack && cmake --build build-current --target comp_encrypt comp_rehash comp_decrypt comp_bdpatch

Or set COMP_HACK_DIR=/path/to/comp_hack and run:
  ${SCRIPT_DIR}/stage-ops-tools.sh

VM installs without comp_hack pull colpertac/smt-ops:latest (tools baked in).
EOF
    exit 1
  fi

  local req
  for req in "${REQUIRED[@]}"; do
    [[ -x "${OPS_TOOLS}/${req}" ]] || {
      echo "error: required ${req} missing in ${OPS_TOOLS}" >&2
      exit 1
    }
  done
  echo "ops tools ready: ${OPS_TOOLS}"
}

main "$@"
