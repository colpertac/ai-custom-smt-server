#!/usr/bin/env bash
# Restore COMP portable runtime from backup.sh archive.
# Replaces --data contents after moving the current tree aside.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

ARCHIVE=""
DATA="${COMP_RUNTIME:-}"
COMPOSE_DIR=""
RESTORE_ENV=0
YES=0
PROFILE_ARGS=()

usage() {
  cat <<'EOF'
Usage: restore.sh --archive FILE [options]

  --archive FILE   smt-runtime-*.tar.gz from backup.sh
  --data DIR       Runtime tree to replace (default: ./data or $COMP_RUNTIME)
  --compose DIR    Directory with docker-compose.yml
  --restore-env    Also copy archived env → compose/.env (overwrites)
  --yes            Skip confirmation prompt
  -h, --help       Show this help

Current data is moved to <data>.bak-YYYYMMDD-HHMMSS before extract.
MariaDB datadir is installed via a root container so permissions match Docker.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --archive) ARCHIVE="$2"; shift 2 ;;
    --data) DATA="$2"; shift 2 ;;
    --compose) COMPOSE_DIR="$2"; shift 2 ;;
    --restore-env) RESTORE_ENV=1; shift ;;
    --yes|-y) YES=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown arg: $1" >&2; usage >&2; exit 1 ;;
  esac
done

[[ -n "$ARCHIVE" ]] || { echo "error: --archive required" >&2; usage >&2; exit 1; }
ARCHIVE="$(cd "$(dirname "$ARCHIVE")" && pwd)/$(basename "$ARCHIVE")"
[[ -f "$ARCHIVE" ]] || { echo "error: archive not found: $ARCHIVE" >&2; exit 1; }

if [[ -z "$DATA" ]]; then
  if [[ -d "${DEPLOY_DIR}/data" ]]; then
    DATA="${DEPLOY_DIR}/data"
  elif [[ -d "./data" ]]; then
    DATA="$(pwd)/data"
  else
    echo "error: set --data or run from a folder with ./data" >&2
    exit 1
  fi
fi
mkdir -p "$(dirname "$DATA")"
DATA="$(cd "$(dirname "$DATA")" && pwd)/$(basename "$DATA")"

if [[ -z "$COMPOSE_DIR" ]]; then
  parent="$(dirname "$DATA")"
  if [[ -f "${parent}/docker-compose.yml" ]]; then
    COMPOSE_DIR="$parent"
  else
    COMPOSE_DIR="$DEPLOY_DIR"
  fi
fi
COMPOSE_DIR="$(cd "$COMPOSE_DIR" && pwd)"

need() { command -v "$1" >/dev/null 2>&1 || { echo "missing $1" >&2; exit 1; }; }
need docker
need tar

compose() {
  docker compose -f "${COMPOSE_DIR}/docker-compose.yml" --project-directory "$COMPOSE_DIR" "${PROFILE_ARGS[@]}" "$@"
}

docker_install_tree() {
  local src="$1" dst="$2"
  mkdir -p "$(dirname "$dst")"
  # Install into a sibling path then rename (atomic-ish).
  local tmp="${dst}.incoming-$$"
  rm -rf "$tmp"
  mkdir -p "$tmp"
  docker run --rm \
    -v "${src}:/from:ro" \
    -v "${tmp}:/to" \
    alpine:3.20 \
    sh -c 'cp -a /from/. /to/'
  if [[ -e "$dst" ]]; then
    echo "error: destination exists unexpectedly: $dst" >&2
    exit 1
  fi
  mv "$tmp" "$dst"
}

if docker ps -a --format '{{.Names}}' | grep -qx 'smt-mariadb'; then
  PROFILE_ARGS=(--profile mariadb)
fi

echo "==> archive: $ARCHIVE"
echo "==> data:    $DATA"
echo "==> compose: $COMPOSE_DIR"
if [[ -f "${ARCHIVE}.sha256" ]]; then
  echo "==> verifying sha256"
  (cd "$(dirname "$ARCHIVE")" && sha256sum -c "$(basename "$ARCHIVE").sha256")
fi

if [[ "$YES" -ne 1 ]]; then
  read -r -p "Replace ${DATA}? Current tree will be renamed aside. [y/N] " ans
  [[ "$ans" == "y" || "$ans" == "Y" ]] || { echo "aborted"; exit 1; }
fi

stamp="$(date +%Y%m%d-%H%M%S)"
staging="${COMPOSE_DIR}/backups/.restore-${stamp}"
mkdir -p "$staging"
trap 'rm -rf "$staging"' EXIT

echo "==> extracting"
tar -C "$staging" -xzf "$ARCHIVE"
[[ -d "${staging}/data" ]] || { echo "error: archive missing data/ (not a backup.sh archive?)" >&2; exit 1; }

echo "==> stopping stack"
compose down 2>/dev/null || \
  docker compose -f "${COMPOSE_DIR}/docker-compose.yml" --project-directory "$COMPOSE_DIR" down 2>/dev/null || true

if [[ -e "$DATA" ]]; then
  bak="${DATA}.bak-${stamp}"
  echo "==> moving current data → $bak"
  mv "$DATA" "$bak"
fi

echo "==> installing restored data"
docker_install_tree "${staging}/data" "$DATA"

if [[ "$RESTORE_ENV" -eq 1 && -f "${staging}/env" ]]; then
  echo "==> restoring .env"
  cp -a "${staging}/env" "${COMPOSE_DIR}/.env"
fi

if grep -q 'DatabaseType">MARIADB' "${DATA}/config/lobby.xml" 2>/dev/null; then
  PROFILE_ARGS=(--profile mariadb)
fi

echo "==> starting stack"
if [[ ${#PROFILE_ARGS[@]} -gt 0 ]]; then
  docker compose -f "${COMPOSE_DIR}/docker-compose.yml" --project-directory "$COMPOSE_DIR" --profile mariadb up -d
else
  docker compose -f "${COMPOSE_DIR}/docker-compose.yml" --project-directory "$COMPOSE_DIR" up -d
fi

echo
echo "restore ok: $DATA"
echo "previous tree (if any): ${DATA}.bak-${stamp}"
echo "check: cd ${COMPOSE_DIR} && docker compose ps"
