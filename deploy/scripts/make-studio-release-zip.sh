#!/usr/bin/env bash
# Pack deploy-studio/ for a GitHub release asset (Wine / portrait host).
#
#   ./deploy/scripts/make-studio-release-zip.sh
#   ./deploy/scripts/make-studio-release-zip.sh --upload v1.0.0   # needs gh + existing release tag
#
# Default output / release asset name is always smt-deploy-studio.zip so
# ``--upload`` can ``--clobber`` the same asset each time.
#
# Zip layout (extract anywhere):
#   deploy-studio/
#
# Does not include the game client — copy Imagine separately (PORTRAIT_CLIENT_DIR).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
STUDIO_DIR="${ROOT_DIR}/deploy-studio"
OUT=""
UPLOAD_TAG=""
KEEP_STAGE=0
ASSET_NAME="smt-deploy-studio.zip"

usage() {
  cat <<'EOF'
Usage: make-studio-release-zip.sh [-o FILE.zip] [--upload TAG] [--keep-stage]

  -o FILE.zip    Output path (default: ./smt-deploy-studio.zip)
  --upload TAG   Attach as smt-deploy-studio.zip on an existing GitHub release
                 (gh release upload --clobber; replaces prior asset)
  --keep-stage   Leave the staging directory next to the zip
  -h, --help     This help

Packs deploy-studio/ only (no game client tree).
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

[[ -x "${STUDIO_DIR}/studio" ]] || [[ -f "${STUDIO_DIR}/README.md" ]] || {
  echo "deploy-studio tree missing: $STUDIO_DIR" >&2
  exit 1
}

if [[ -z "$OUT" ]]; then
  OUT="${PWD}/${ASSET_NAME}"
fi
OUT="$(mkdir -p "$(dirname "$OUT")" && cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")"
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/smt-studio-release.XXXXXX")"
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

echo "==> deploy-studio/"
rsync -a \
  --exclude /.env \
  --exclude '/.env.local' \
  --exclude /.venv/ \
  --exclude /__pycache__/ \
  --exclude '*.pyc' \
  --exclude /.pytest_cache/ \
  --exclude /work/ \
  --exclude '/.git/' \
  "${STUDIO_DIR}/" "${TREE}/deploy-studio/"

echo "==> zipping → $OUT"
rm -f "$OUT"
(
  cd "$TREE"
  zip -r -q "$OUT" deploy-studio
)

echo
du -sh "$OUT" "${TREE}/deploy-studio" 2>/dev/null || true
echo
echo "Extract on the Wine / studio host, then:"
echo "  cd deploy-studio && ./requirements.sh && \$EDITOR .env && ./install.sh && ./studio up"
echo "  (also copy your Imagine client; set PORTRAIT_CLIENT_DIR)"
echo "done: $OUT"

if [[ -n "$UPLOAD_TAG" ]]; then
  need gh
  # Always publish under the stable asset name so --clobber replaces it.
  UPLOAD_FILE="$OUT"
  if [[ "$(basename "$OUT")" != "$ASSET_NAME" ]]; then
    UPLOAD_FILE="$(dirname "$OUT")/${ASSET_NAME}"
    cp -f "$OUT" "$UPLOAD_FILE"
  fi
  echo "==> uploading ${ASSET_NAME} to release $UPLOAD_TAG (clobber)"
  gh release upload "$UPLOAD_TAG" "$UPLOAD_FILE" --clobber
  echo "attached ${ASSET_NAME} to release $UPLOAD_TAG"
fi
