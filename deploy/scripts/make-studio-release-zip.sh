#!/usr/bin/env bash
# Pack deploy-studio/ for a GitHub release asset (Wine / portrait host).
#
#   ./deploy/scripts/make-studio-release-zip.sh
#   ./deploy/scripts/make-studio-release-zip.sh -o /tmp/smt-deploy-studio.zip
#   ./deploy/scripts/make-studio-release-zip.sh --upload v1.0.0   # needs gh + existing release tag
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

usage() {
  cat <<'EOF'
Usage: make-studio-release-zip.sh [-o FILE.zip] [--upload TAG] [--keep-stage]

  -o FILE.zip    Output path (default: ./smt-deploy-studio-YYYYMMDD-HHMMSS.zip)
  --upload TAG   Attach the zip to an existing GitHub release (gh release upload)
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

STAMP="$(date +%Y%m%d-%H%M%S)"
if [[ -z "$OUT" ]]; then
  OUT="${PWD}/smt-deploy-studio-${STAMP}.zip"
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
  echo "==> uploading to release $UPLOAD_TAG"
  gh release upload "$UPLOAD_TAG" "$OUT" --clobber
  echo "attached to release $UPLOAD_TAG"
fi
