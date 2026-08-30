#!/usr/bin/env bash
# Build runtime image and optionally push to Docker Hub.
#
# Usage:
#   ./scripts/docker-pack-runtime.sh              # build smt-comp:local only
#   ./scripts/docker-push-hub.sh                  # pack + tag + push colpertac/smt-comp
#   DOCKER_HUB_USER=me IMAGE_NAME=smt-comp ./scripts/docker-push-hub.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

DOCKER_HUB_USER="${DOCKER_HUB_USER:-colpertac}"
IMAGE_NAME="${IMAGE_NAME:-smt-comp}"
LOCAL_TAG="${COMP_IMAGE_LOCAL:-smt-comp:local}"
HUB_REPO="${DOCKER_HUB_USER}/${IMAGE_NAME}"
DATE_TAG="$(date +%Y%m%d)"

need() { command -v "$1" >/dev/null 2>&1 || { echo "missing $1" >&2; exit 1; }; }
need docker

echo "==> ensure local image exists (pack from binaries)"
COMP_IMAGE="${LOCAL_TAG}" "${SCRIPT_DIR}/docker-pack-runtime.sh"

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
echo "docs: ${ROOT_DIR}/docs/docker-hub.md"
