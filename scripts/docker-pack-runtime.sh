#!/usr/bin/env bash
# Stage prebuilt COMP binaries and build the runtime image smt-comp:local.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEPLOY_DIR="${ROOT_DIR}/deploy"
BIN_SRC="${BIN_SRC:-/home/cat/repos/smt/comp_hack/build-current/bin}"
IMAGE="${COMP_IMAGE:-smt-comp:local}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "missing $1" >&2; exit 1; }; }
need docker

mkdir -p "${DEPLOY_DIR}/bin"
for name in comp_lobby comp_world comp_channel; do
  src="${BIN_SRC}/${name}"
  [[ -x "${src}" ]] || { echo "missing binary: ${src} (build COMP first)" >&2; exit 1; }
  install -m 0755 "${src}" "${DEPLOY_DIR}/bin/${name}"
  echo "staged: ${DEPLOY_DIR}/bin/${name}"
done

echo "==> docker build ${IMAGE}"
docker build -t "${IMAGE}" "${DEPLOY_DIR}"

echo
echo "built: ${IMAGE}"
echo "next:  stop bare-metal servers, then:"
echo "  cd ${DEPLOY_DIR} && docker compose up -d"
echo "docs:  ${ROOT_DIR}/docs/phase14.md"
