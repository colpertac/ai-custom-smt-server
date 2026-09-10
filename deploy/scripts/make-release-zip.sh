#!/usr/bin/env bash
# Pack deploy/ + ops/ for a GitHub release asset (Hub images pulled on install).
#
#   ./deploy/scripts/make-release-zip.sh
#   ./deploy/scripts/make-release-zip.sh -o /tmp/smt-deploy-ops.zip
#   ./deploy/scripts/make-release-zip.sh --upload v1.0.0   # needs gh + existing release tag
#
# Zip layout (extract next to each other):
#   deploy/
#   ops/
#
# Excludes runtime junk and local build artifacts (binaries live in Hub images).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DEPLOY_DIR="${ROOT_DIR}/deploy"
OPS_DIR="${ROOT_DIR}/ops"
OUT=""
UPLOAD_TAG=""
KEEP_STAGE=0

usage() {
  cat <<'EOF'
Usage: make-release-zip.sh [-o FILE.zip] [--upload TAG] [--keep-stage]

  -o FILE.zip    Output path (default: ./smt-deploy-ops-YYYYMMDD-HHMMSS.zip)
  --upload TAG   Attach the zip to an existing GitHub release (gh release upload)
  --keep-stage   Leave the staging directory next to the zip
  -h, --help     This help

Packs sibling deploy/ + ops/ only. No INSTALL.txt.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -o) OUT="$2"; shift 2 ;;
    --upload) UPLOAD_TAG="$2"; shift 2 ;;
    --keep-stage) KEEP_STAGE=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown arg: $1" >&2; usage >&2; exit 1 ;;
  esac
done

need() { command -v "$1" >/dev/null 2>&1 || { echo "missing $1" >&2; exit 1; }; }
need zip
need rsync

[[ -f "${DEPLOY_DIR}/install.sh" ]] || {
  echo "deploy tree missing: $DEPLOY_DIR" >&2
  exit 1
}
[[ -d "$OPS_DIR" ]] || {
  echo "ops tree missing: $OPS_DIR" >&2
  exit 1
}

STAMP="$(date +%Y%m%d-%H%M%S)"
if [[ -z "$OUT" ]]; then
  OUT="${PWD}/smt-deploy-ops-${STAMP}.zip"
fi
OUT="$(mkdir -p "$(dirname "$OUT")" && cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")"
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/smt-release.XXXXXX")"
TREE="${STAGE}/tree"

cleanup() {
  if [[ "$KEEP_STAGE" -eq 1 ]]; then
    echo "stage kept: $TREE"
  else
    rm -rf "$STAGE"
  fi
}
trap cleanup EXIT

echo "==> staging under $TREE"
mkdir -p "$TREE"

# Root-anchored excludes so seed/updater stays in the zip.
echo "==> deploy/"
rsync -a \
  --exclude /bin/ \
  --exclude /data/ \
  --exclude /updater/ \
  --exclude /website-data/ \
  --exclude /ops-tools/ \
  --exclude /.env \
  --exclude '/.env.local' \
  "${DEPLOY_DIR}/" "${TREE}/deploy/"

echo "==> ops/"
rsync -a \
  --exclude /comp-tools/ \
  --exclude /__pycache__/ \
  --exclude '*.pyc' \
  --exclude /audit.log \
  --exclude '.pytest_cache' \
  "${OPS_DIR}/" "${TREE}/ops/"

echo "==> zipping → $OUT"
rm -f "$OUT"
(
  cd "$TREE"
  zip -r -q "$OUT" deploy ops
)

echo
du -sh "$OUT" "${TREE}/deploy" "${TREE}/ops" 2>/dev/null || true
echo
echo "Extract on the server, then:"
echo "  cd deploy && ./install.sh --ip YOUR.PUBLIC.IP"
echo "done: $OUT"

if [[ -n "$UPLOAD_TAG" ]]; then
  need gh
  echo "==> uploading to release $UPLOAD_TAG"
  gh release upload "$UPLOAD_TAG" "$OUT" --clobber
  echo "attached to release $UPLOAD_TAG"
fi
