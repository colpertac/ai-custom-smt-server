#!/usr/bin/env bash
# Stage comp tools and push the ops sidecar image to Docker Hub.
#
# Usage:
#   ./deploy/scripts/docker-push-ops-hub.sh
#   COMP_HACK_DIR=/path/to/comp_hack ./deploy/scripts/docker-push-ops-hub.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
OPS_DIR="${ROOT_DIR}/ops"
DEPLOY_DIR="${ROOT_DIR}/deploy"

DOCKER_HUB_USER="${DOCKER_HUB_USER:-colpertac}"
IMAGE_NAME="${IMAGE_NAME:-smt-ops}"
LOCAL_TAG="${OPS_IMAGE_LOCAL:-smt-ops:local}"
HUB_REPO="${DOCKER_HUB_USER}/${IMAGE_NAME}"
DATE_TAG="$(date +%Y%m%d)"

need() { command -v "$1" >/dev/null 2>&1 || { echo "missing $1" >&2; exit 1; }; }
need docker

echo "==> stage comp tools for ops image"
DEPLOY_DIR="${DEPLOY_DIR}" "${SCRIPT_DIR}/stage-ops-tools.sh"

[[ -x "${OPS_DIR}/comp-tools/comp_encrypt" ]] || {
  echo "comp_encrypt missing in ${OPS_DIR}/comp-tools after staging" >&2
  exit 1
}

echo "==> stage AGPL server datastore for ops image"
DEPLOY_DIR="${DEPLOY_DIR}" "${SCRIPT_DIR}/stage-server-datastore.sh" || {
  echo "server datastore staging failed (need sibling comp_hack/datastore)" >&2
  exit 1
}
[[ -f "${OPS_DIR}/server-datastore/zones/zone-90105.xml" ]] || {
  echo "zones missing in ${OPS_DIR}/server-datastore after staging" >&2
  exit 1
}

echo "==> docker build ${LOCAL_TAG}"
docker build -t "${LOCAL_TAG}" "${OPS_DIR}"

echo "==> tag for Docker Hub"
docker tag "${LOCAL_TAG}" "${HUB_REPO}:latest"
docker tag "${LOCAL_TAG}" "${HUB_REPO}:${DATE_TAG}"

echo "==> push ${HUB_REPO}:latest and :${DATE_TAG}"
docker push "${HUB_REPO}:latest"
docker push "${HUB_REPO}:${DATE_TAG}"

echo
echo "published:"
echo "  docker pull ${HUB_REPO}:latest"
echo "  docker pull ${HUB_REPO}:${DATE_TAG}"
echo "compose: OPS_IMAGE=${HUB_REPO}:latest"
