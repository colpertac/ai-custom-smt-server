#!/usr/bin/env bash
# Copy newest (or named) smt-runtime backup archive to an rclone remote.
# Config: RCLONE_CONFIG (default: <out>/rclone.conf) + remote:path args.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

OUT_DIR=""
REMOTE=""
REMOTE_PATH=""
ARCHIVE=""
KEEP_LOCAL=""
KEEP_REMOTE=""
RCLONE_CONF=""
DRY_RUN=0

usage() {
  cat <<'EOF'
Usage: backup-sync.sh [options]

  --out DIR           Backups directory (default: ./backups or /backups)
  --remote NAME       rclone remote name (required unless set in schedule)
  --path PATH         Remote path/folder (default: smt-backups)
  --archive FILE      Specific local archive (default: newest smt-runtime-*.tar.gz)
  --rclone-config F   rclone.conf path (default: <out>/rclone.conf)
  --keep-local N      Keep only the newest N local archives (+ sha256)
  --keep-remote N     Keep only the newest N remote archives
  --dry-run           Print actions only
  -h, --help

Requires rclone on PATH. Uses --rclone-config so the system config is unused.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --out) OUT_DIR="$2"; shift 2 ;;
    --remote) REMOTE="$2"; shift 2 ;;
    --path) REMOTE_PATH="$2"; shift 2 ;;
    --archive) ARCHIVE="$2"; shift 2 ;;
    --rclone-config) RCLONE_CONF="$2"; shift 2 ;;
    --keep-local) KEEP_LOCAL="$2"; shift 2 ;;
    --keep-remote) KEEP_REMOTE="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown arg: $1" >&2; usage >&2; exit 1 ;;
  esac
done

if [[ -z "$OUT_DIR" ]]; then
  if [[ -d /backups ]]; then
    OUT_DIR="/backups"
  elif [[ -d "./backups" ]]; then
    OUT_DIR="$(pwd)/backups"
  else
    echo "error: set --out" >&2
    exit 1
  fi
fi
mkdir -p "$OUT_DIR"
OUT_DIR="$(cd "$OUT_DIR" && pwd)"

RCLONE_CONF="${RCLONE_CONF:-${OUT_DIR}/rclone.conf}"
REMOTE_PATH="${REMOTE_PATH:-smt-backups}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "missing $1" >&2; exit 1; }; }
need rclone

if [[ ! -f "$RCLONE_CONF" ]]; then
  echo "error: rclone config not found: $RCLONE_CONF" >&2
  echo "Create one with: rclone config --config $RCLONE_CONF" >&2
  exit 1
fi

if [[ -z "$REMOTE" ]]; then
  echo "error: --remote required" >&2
  exit 1
fi

if [[ -z "$ARCHIVE" ]]; then
  ARCHIVE="$(ls -1t "${OUT_DIR}"/smt-runtime-*.tar.gz 2>/dev/null | head -n1 || true)"
fi
[[ -n "$ARCHIVE" && -f "$ARCHIVE" ]] || { echo "error: no archive to sync" >&2; exit 1; }
ARCHIVE="$(cd "$(dirname "$ARCHIVE")" && pwd)/$(basename "$ARCHIVE")"

dest="${REMOTE}:${REMOTE_PATH}"
echo "==> sync ${ARCHIVE} → ${dest}/"
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "dry-run: rclone copy $(basename "$ARCHIVE") (+ .sha256)"
else
  rclone copy "$ARCHIVE" "$dest" --config "$RCLONE_CONF" --checksum
  if [[ -f "${ARCHIVE}.sha256" ]]; then
    rclone copy "${ARCHIVE}.sha256" "$dest" --config "$RCLONE_CONF"
  fi
fi

prune_local() {
  local n="$1"
  mapfile -t files < <(ls -1t "${OUT_DIR}"/smt-runtime-*.tar.gz 2>/dev/null || true)
  local i=0
  for f in "${files[@]}"; do
    i=$((i + 1))
    if [[ "$i" -gt "$n" ]]; then
      echo "    prune local $(basename "$f")"
      if [[ "$DRY_RUN" -eq 0 ]]; then
        rm -f "$f" "${f}.sha256"
      fi
    fi
  done
}

prune_remote() {
  local n="$1"
  mapfile -t files < <(rclone lsf "$dest" --config "$RCLONE_CONF" --files-only 2>/dev/null | grep -E '^smt-runtime-.*\.tar\.gz$' | sort -r || true)
  local i=0
  for f in "${files[@]}"; do
    i=$((i + 1))
    if [[ "$i" -gt "$n" ]]; then
      echo "    prune remote $f"
      if [[ "$DRY_RUN" -eq 0 ]]; then
        rclone delete "${dest}/${f}" --config "$RCLONE_CONF" || true
        rclone delete "${dest}/${f}.sha256" --config "$RCLONE_CONF" 2>/dev/null || true
      fi
    fi
  done
}

if [[ -n "$KEEP_LOCAL" ]]; then
  echo "==> keep-local $KEEP_LOCAL"
  prune_local "$KEEP_LOCAL"
fi
if [[ -n "$KEEP_REMOTE" ]]; then
  echo "==> keep-remote $KEEP_REMOTE"
  prune_remote "$KEEP_REMOTE"
fi

echo "sync ok: $(basename "$ARCHIVE") → ${dest}/"
