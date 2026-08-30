#!/usr/bin/env bash
# Build and push the Next.js website image to Docker Hub.
#
# Usage:
#   ./scripts/docker-push-website-hub.sh
#   DOCKER_HUB_USER=colpertac IMAGE_NAME=smt-website ./scripts/docker-push-website-hub.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
WEBSITE_DIR="${WEBSITE_CONTEXT:-${ROOT_DIR}/website}"

DOCKER_HUB_USER="${DOCKER_HUB_USER:-colpertac}"
IMAGE_NAME="${IMAGE_NAME:-smt-website}"
LOCAL_TAG="${WEBSITE_IMAGE_LOCAL:-smt-website:local}"
HUB_REPO="${DOCKER_HUB_USER}/${IMAGE_NAME}"
DATE_TAG="$(date +%Y%m%d)"

need() { command -v "$1" >/dev/null 2>&1 || { echo "missing $1" >&2; exit 1; }; }
need docker

[[ -f "${WEBSITE_DIR}/Dockerfile" ]] || {
  echo "missing ${WEBSITE_DIR}/Dockerfile" >&2
  exit 1
}

echo "==> build ${LOCAL_TAG}"
docker build -t "${LOCAL_TAG}" "${WEBSITE_DIR}"

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
echo "compose: WEBSITE_IMAGE=${HUB_REPO}:latest"
echo "docs: ${ROOT_DIR}/docs/docker-hub.md / docs/proxmox-smoke.md"
