#!/usr/bin/env bash
# Cold backup of COMP portable runtime (./data or COMP_RUNTIME).
# Stops lobby/world/channel (and mariadb if up), archives, then starts again.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

DATA="${COMP_RUNTIME:-}"
OUT_DIR=""
INCLUDE_LOGS=0
INCLUDE_MARIADB=""
COMPOSE_DIR=""
PROFILE_ARGS=()
WAS_UP=0
MARIADB_WAS_UP=0

usage() {
  cat <<'EOF'
Usage: backup.sh [options]

  --data DIR          Runtime tree to back up (default: ./data or $COMP_RUNTIME)
  --out DIR           Directory for the archive (default: ./backups next to compose)
  --compose DIR       Directory with docker-compose.yml (default: parent of --data)
  --include-logs      Include data/logs/ (omitted by default)
  --include-mariadb   Always include data/mariadb/
  --skip-mariadb      Never include data/mariadb/
  -h, --help          Show this help

Creates: <out>/smt-runtime-YYYYMMDD-HHMMSS.tar.gz

MariaDB datadir is included automatically when lobby config is MARIADB
(or when --include-mariadb). Copy uses a root alpine container for permissions.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --data) DATA="$2"; shift 2 ;;
    --out) OUT_DIR="$2"; shift 2 ;;
    --compose) COMPOSE_DIR="$2"; shift 2 ;;
    --include-logs) INCLUDE_LOGS=1; shift ;;
    --include-mariadb) INCLUDE_MARIADB=1; shift ;;
    --skip-mariadb) INCLUDE_MARIADB=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown arg: $1" >&2; usage >&2; exit 1 ;;
  esac
done

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
DATA="$(cd "$DATA" && pwd)"

if [[ -z "$COMPOSE_DIR" ]]; then
  parent="$(dirname "$DATA")"
  if [[ -f "${parent}/docker-compose.yml" ]]; then
    COMPOSE_DIR="$parent"
  else
    COMPOSE_DIR="$DEPLOY_DIR"
  fi
fi
COMPOSE_DIR="$(cd "$COMPOSE_DIR" && pwd)"

if [[ -z "$OUT_DIR" ]]; then
  OUT_DIR="${COMPOSE_DIR}/backups"
fi
mkdir -p "$OUT_DIR"
OUT_DIR="$(cd "$OUT_DIR" && pwd)"

stamp="$(date +%Y%m%d-%H%M%S)"
archive="${OUT_DIR}/smt-runtime-${stamp}.tar.gz"
staging="${OUT_DIR}/.staging-${stamp}"
mkdir -p "$staging"

need() { command -v "$1" >/dev/null 2>&1 || { echo "missing $1" >&2; exit 1; }; }
need docker
need tar

compose() {
  docker compose -f "${COMPOSE_DIR}/docker-compose.yml" --project-directory "$COMPOSE_DIR" "${PROFILE_ARGS[@]}" "$@"
}

start_stack() {
  if [[ ${#PROFILE_ARGS[@]} -gt 0 ]]; then
    compose up -d
  else
    docker compose -f "${COMPOSE_DIR}/docker-compose.yml" --project-directory "$COMPOSE_DIR" up -d
  fi
}

docker_copy_tree() {
  local src="$1" dst="$2"
  mkdir -p "$dst"
  docker run --rm \
    -v "${src}:/from:ro" \
    -v "${dst}:/to" \
    alpine:3.20 \
    sh -c 'cp -a /from/. /to/'
}

config_is_mariadb() {
  local f
  for f in "${DATA}/config/lobby.xml" "${DATA}/config/.runtime-lobby.xml"; do
    if [[ -f "$f" ]] && grep -q 'DatabaseType">MARIADB' "$f"; then
      return 0
    fi
  done
  return 1
}

if docker ps -a --format '{{.Names}}' | grep -qx 'smt-mariadb'; then
  PROFILE_ARGS=(--profile mariadb)
fi

if docker ps --format '{{.Names}}' | grep -Eqx 'smt-lobby|smt-world|smt-channel'; then
  WAS_UP=1
fi
if docker ps --format '{{.Names}}' | grep -qx 'smt-mariadb'; then
  MARIADB_WAS_UP=1
fi

want_mariadb=0
if [[ "$INCLUDE_MARIADB" == "1" ]]; then
  want_mariadb=1
elif [[ "$INCLUDE_MARIADB" == "0" ]]; then
  want_mariadb=0
elif config_is_mariadb; then
  want_mariadb=1
fi

echo "==> data:    $DATA"
echo "==> compose: $COMPOSE_DIR"
echo "==> archive: $archive"
echo "==> mariadb: $([ "$want_mariadb" -eq 1 ] && echo include || echo skip)"

on_exit() {
  local code=$?
  if [[ "$WAS_UP" -eq 1 || "$MARIADB_WAS_UP" -eq 1 ]]; then
    echo "==> ensuring stack is up (exit=$code)"
    start_stack || true
  fi
  rm -rf "$staging"
  exit "$code"
}
trap on_exit EXIT

echo "==> stopping COMP stack (brief downtime)"
compose stop lobby world channel 2>/dev/null || true
if [[ "$MARIADB_WAS_UP" -eq 1 ]]; then
  compose stop mariadb 2>/dev/null || true
fi

echo "==> copying runtime tree"
mkdir -p "${staging}/data"
for name in config database datastore webroot; do
  if [[ -d "${DATA}/${name}" ]]; then
    echo "    + ${name}/"
    docker_copy_tree "${DATA}/${name}" "${staging}/data/${name}"
  fi
done

if [[ "$want_mariadb" -eq 1 && -d "${DATA}/mariadb" ]]; then
  echo "    + mariadb/"
  docker_copy_tree "${DATA}/mariadb" "${staging}/data/mariadb"
fi

find "${staging}/data/config" -name '.runtime-*.xml' -delete 2>/dev/null || true

if [[ "$INCLUDE_LOGS" -eq 1 && -d "${DATA}/logs" ]]; then
  echo "    + logs/"
  docker_copy_tree "${DATA}/logs" "${staging}/data/logs"
fi

if [[ -f "${COMPOSE_DIR}/.env" ]]; then
  cp -a "${COMPOSE_DIR}/.env" "${staging}/env"
fi

{
  echo "created=${stamp}"
  echo "host=$(hostname)"
  echo "data=${DATA}"
  echo "sqlite=$(find "${staging}/data/database" -name '*.sqlite3' 2>/dev/null | wc -l)"
  echo "mariadb_datadir=$([ -d "${staging}/data/mariadb" ] && echo yes || echo no)"
  echo "image=$(docker inspect smt-lobby --format '{{.Config.Image}}' 2>/dev/null || echo unknown)"
} >"${staging}/MANIFEST.txt"

echo "==> compressing"
tar -C "$staging" -czf "$archive" .
sha256sum "$archive" | tee "${archive}.sha256"

echo "==> starting stack"
start_stack
WAS_UP=0
MARIADB_WAS_UP=0

echo
echo "backup ok: $archive"
ls -lh "$archive"
