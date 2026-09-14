#!/usr/bin/env bash
# Cold backup of COMP portable runtime + website-data.
# Stops lobby/world/channel (and mariadb if up), archives, then starts again.
#
# Modes:
#   standard (default) — config, database|mariadb, website-data, .env
#   full               — standard + datastore, webroot (+ logs if --include-logs)
#
# When run inside the ops container (OPS_BACKEND=docker + /comp mounted), copies
# use local cp and write to /backups. Host CLI keeps alpine docker_copy for
# root-owned MariaDB trees.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

DATA="${COMP_RUNTIME:-}"
WEBSITE_DATA_DIR="${WEBSITE_DATA:-}"
OUT_DIR=""
INCLUDE_LOGS=0
INCLUDE_MARIADB=""
INCLUDE_WEBSITE=""
MODE="standard"
COMPOSE_DIR=""
PROFILE_ARGS=()
WAS_UP=0
MARIADB_WAS_UP=0
IN_OPS=0

usage() {
  cat <<'EOF'
Usage: backup.sh [options]

  --data DIR          Runtime tree (default: ./data or $COMP_RUNTIME)
  --website-data DIR  Website data tree (default: sibling website-data)
  --out DIR           Archive directory (default: ./backups next to compose)
  --compose DIR       Directory with docker-compose.yml
  --mode MODE         standard (default) | full
  --include-logs      Include data/logs/ (full mode only unless forced)
  --include-mariadb   Always include data/mariadb/
  --skip-mariadb      Never include data/mariadb/
  --include-website   Always include website-data (default on)
  --skip-website      Omit website-data
  -h, --help          Show this help

Creates: <out>/smt-runtime-YYYYMMDD-HHMMSS.tar.gz (+ .sha256)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --data) DATA="$2"; shift 2 ;;
    --website-data) WEBSITE_DATA_DIR="$2"; shift 2 ;;
    --out) OUT_DIR="$2"; shift 2 ;;
    --compose) COMPOSE_DIR="$2"; shift 2 ;;
    --mode) MODE="$2"; shift 2 ;;
    --include-logs) INCLUDE_LOGS=1; shift ;;
    --include-mariadb) INCLUDE_MARIADB=1; shift ;;
    --skip-mariadb) INCLUDE_MARIADB=0; shift ;;
    --include-website) INCLUDE_WEBSITE=1; shift ;;
    --skip-website) INCLUDE_WEBSITE=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown arg: $1" >&2; usage >&2; exit 1 ;;
  esac
done

MODE="$(echo "$MODE" | tr '[:upper:]' '[:lower:]')"
if [[ "$MODE" != "standard" && "$MODE" != "full" ]]; then
  echo "error: --mode must be standard or full" >&2
  exit 1
fi

if [[ -d /comp/database || -d /comp/config ]] && [[ "${OPS_BACKEND:-}" == "docker" ]]; then
  IN_OPS=1
fi

if [[ -z "$DATA" ]]; then
  if [[ "$IN_OPS" -eq 1 ]]; then
    DATA="/comp"
  elif [[ -d "${DEPLOY_DIR}/data" ]]; then
    DATA="${DEPLOY_DIR}/data"
  elif [[ -d "./data" ]]; then
    DATA="$(pwd)/data"
  else
    echo "error: set --data or run from a folder with ./data" >&2
    exit 1
  fi
fi
if [[ ! -d "$DATA" ]]; then
  echo "error: data dir not found: $DATA" >&2
  exit 1
fi
DATA="$(cd "$DATA" && pwd)"

if [[ -z "$COMPOSE_DIR" ]]; then
  if [[ "$IN_OPS" -eq 1 && -f /compose/docker-compose.yml ]]; then
    COMPOSE_DIR="/compose"
  else
    parent="$(dirname "$DATA")"
    if [[ -f "${parent}/docker-compose.yml" ]]; then
      COMPOSE_DIR="$parent"
    else
      COMPOSE_DIR="$DEPLOY_DIR"
    fi
  fi
fi
COMPOSE_DIR="$(cd "$COMPOSE_DIR" && pwd)"

# Auto-detect website data for native Next.js (website/data) when unset.
if [[ -z "$WEBSITE_DATA_DIR" ]]; then
  if [[ "$IN_OPS" -eq 1 && -d /website-data ]]; then
    WEBSITE_DATA_DIR="/website-data"
  elif [[ -d "${COMPOSE_DIR}/website-data" ]]; then
    WEBSITE_DATA_DIR="${COMPOSE_DIR}/website-data"
  elif [[ -d "$(dirname "$DATA")/website-data" ]]; then
    WEBSITE_DATA_DIR="$(dirname "$DATA")/website-data"
  elif [[ -f "${DEPLOY_DIR}/../website/data/web.sqlite" ]]; then
    WEBSITE_DATA_DIR="$(cd "${DEPLOY_DIR}/../website/data" && pwd)"
  elif [[ -d "${DEPLOY_DIR}/../website/data" ]]; then
    WEBSITE_DATA_DIR="$(cd "${DEPLOY_DIR}/../website/data" && pwd)"
  fi
fi
if [[ -n "$WEBSITE_DATA_DIR" && -d "$WEBSITE_DATA_DIR" ]]; then
  WEBSITE_DATA_DIR="$(cd "$WEBSITE_DATA_DIR" && pwd)"
fi

if [[ -z "$OUT_DIR" ]]; then
  if [[ "$IN_OPS" -eq 1 && -d /backups ]]; then
    OUT_DIR="/backups"
  else
    OUT_DIR="${COMPOSE_DIR}/backups"
  fi
fi
mkdir -p "$OUT_DIR"
OUT_DIR="$(cd "$OUT_DIR" && pwd)"

want_website=1
if [[ "$INCLUDE_WEBSITE" == "0" ]]; then
  want_website=0
elif [[ "$INCLUDE_WEBSITE" == "1" ]]; then
  want_website=1
fi

stamp="$(date +%Y%m%d-%H%M%S)"
archive="${OUT_DIR}/smt-runtime-${stamp}.tar.gz"
staging="${OUT_DIR}/.staging-${stamp}"
mkdir -p "$staging"

need() { command -v "$1" >/dev/null 2>&1 || { echo "missing $1" >&2; exit 1; }; }
need tar

BACKEND="$(echo "${OPS_BACKEND:-docker}" | tr '[:upper:]' '[:lower:]')"
NATIVE=0
if [[ "$BACKEND" == "native" ]]; then
  NATIVE=1
fi

if [[ "$NATIVE" -eq 0 ]]; then
  need docker
fi

# Remap compose bind sources when ops runs against the host Docker engine.
if [[ -n "${OPS_HOST_DEPLOY_DIR:-}" ]]; then
  host="${OPS_HOST_DEPLOY_DIR}"
  export COMP_ENTRYPOINT="${COMP_ENTRYPOINT:-${host}/entrypoint.sh}"
  export COMP_RUNTIME="${COMP_RUNTIME:-${host}/data}"
  export WEBSITE_DATA="${WEBSITE_DATA:-${host}/website-data}"
  export UPDATER_ROOT="${UPDATER_ROOT:-${host}/updater}"
  export SMT_BACKUPS="${SMT_BACKUPS:-${host}/backups}"
fi

# Load compose .env so docker compose interpolations (UPDATER_ROOT, …) work
# when backup is invoked outside `cd deploy && docker compose …`.
if [[ "$NATIVE" -eq 0 && -f "${COMPOSE_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${COMPOSE_DIR}/.env"
  set +a
fi

COMP_SCRIPTS="${OPS_COMP_SCRIPTS:-}"
if [[ -z "$COMP_SCRIPTS" ]]; then
  if [[ -x "${DEPLOY_DIR}/../comp_hack/scripts/stop.sh" ]]; then
    COMP_SCRIPTS="$(cd "${DEPLOY_DIR}/../comp_hack/scripts" && pwd)"
  fi
fi

compose() {
  docker compose -f "${COMPOSE_DIR}/docker-compose.yml" --project-directory "$COMPOSE_DIR" "${PROFILE_ARGS[@]}" "$@"
}

start_stack() {
  if [[ "$NATIVE" -eq 1 ]]; then
    if [[ -x "${COMP_SCRIPTS}/start.sh" ]]; then
      bash "${COMP_SCRIPTS}/start.sh" || true
    else
      echo "    (native: no start.sh — left stopped)"
    fi
    return 0
  fi
  if [[ ${#PROFILE_ARGS[@]} -gt 0 ]]; then
    compose up -d
  else
    docker compose -f "${COMPOSE_DIR}/docker-compose.yml" --project-directory "$COMPOSE_DIR" up -d
  fi
}

stop_stack() {
  if [[ "$NATIVE" -eq 1 ]]; then
    if [[ -x "${COMP_SCRIPTS}/stop.sh" ]]; then
      bash "${COMP_SCRIPTS}/stop.sh" || true
    else
      echo "    (native: no stop.sh — copying live files)"
    fi
    return 0
  fi
  compose stop lobby world channel 2>/dev/null || true
  if [[ "$MARIADB_WAS_UP" -eq 1 ]]; then
    compose stop mariadb 2>/dev/null || true
  fi
}

copy_tree() {
  local src="$1" dst="$2"
  mkdir -p "$dst"
  if [[ "$IN_OPS" -eq 1 || "$NATIVE" -eq 1 ]]; then
    cp -a "${src}/." "$dst/"
  else
    docker run --rm \
      -v "${src}:/from:ro" \
      -v "${dst}:/to" \
      alpine:3.20 \
      sh -c 'cp -a /from/. /to/'
  fi
}

# MariaDB datadir is usually root-owned; always copy via alpine + host path when possible.
copy_mariadb() {
  local src="$1" dst="$2"
  mkdir -p "$dst"
  if [[ "$NATIVE" -eq 1 ]]; then
    cp -a "${src}/." "$dst/" 2>/dev/null || {
      echo "error: cannot copy mariadb datadir as current user" >&2
      return 1
    }
    return 0
  fi
  local vol_src="$src"
  if [[ "$IN_OPS" -eq 1 && -n "${OPS_HOST_DEPLOY_DIR:-}" ]]; then
    vol_src="${OPS_HOST_DEPLOY_DIR}/data/mariadb"
  fi
  local vol_dst="$dst"
  if [[ "$IN_OPS" -eq 1 && -n "${OPS_HOST_DEPLOY_DIR:-}" ]]; then
    local rel="${dst#/backups/}"
    vol_dst="${SMT_BACKUPS:-${OPS_HOST_DEPLOY_DIR}/backups}/${rel}"
  fi
  docker run --rm \
    -v "${vol_src}:/from:ro" \
    -v "${vol_dst}:/to" \
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

if [[ "$NATIVE" -eq 0 ]]; then
  if docker ps -a --format '{{.Names}}' | grep -qx 'smt-mariadb'; then
    PROFILE_ARGS=(--profile mariadb)
  fi
  if docker ps --format '{{.Names}}' | grep -Eqx 'smt-lobby|smt-world|smt-channel'; then
    WAS_UP=1
  fi
  if docker ps --format '{{.Names}}' | grep -qx 'smt-mariadb'; then
    MARIADB_WAS_UP=1
  fi
else
  # Native: treat running lobby/world/channel binaries as "was up".
  if pgrep -f 'comp_lobby|comp_world|comp_channel' >/dev/null 2>&1; then
    WAS_UP=1
  fi
fi

want_mariadb=0
if [[ "$INCLUDE_MARIADB" == "1" ]]; then
  want_mariadb=1
elif [[ "$INCLUDE_MARIADB" == "0" ]]; then
  want_mariadb=0
elif config_is_mariadb; then
  want_mariadb=1
fi

echo "==> mode:    $MODE"
echo "==> backend: $BACKEND"
echo "==> data:    $DATA"
echo "==> website: ${WEBSITE_DATA_DIR:-'(none)'}"
echo "==> compose: $COMPOSE_DIR"
echo "==> archive: $archive"
echo "==> mariadb: $([ "$want_mariadb" -eq 1 ] && echo include || echo skip)"
echo "==> website: $([ "$want_website" -eq 1 ] && echo include || echo skip)"

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
if [[ "$WAS_UP" -eq 1 || "$MARIADB_WAS_UP" -eq 1 ]]; then
  stop_stack
else
  echo "    (nothing running — cold copy only)"
fi

echo "==> copying runtime tree"
mkdir -p "${staging}/data"

# Always: config + DB
for name in config database; do
  if [[ -d "${DATA}/${name}" ]]; then
    echo "    + data/${name}/"
    copy_tree "${DATA}/${name}" "${staging}/data/${name}"
  fi
done

if [[ "$want_mariadb" -eq 1 && -d "${DATA}/mariadb" ]]; then
  echo "    + data/mariadb/"
  copy_mariadb "${DATA}/mariadb" "${staging}/data/mariadb"
fi

if [[ "$MODE" == "full" ]]; then
  for name in datastore webroot; do
    if [[ -d "${DATA}/${name}" ]]; then
      echo "    + data/${name}/"
      copy_tree "${DATA}/${name}" "${staging}/data/${name}"
    fi
  done
fi

find "${staging}/data/config" -name '.runtime-*.xml' -delete 2>/dev/null || true

if [[ "$INCLUDE_LOGS" -eq 1 && -d "${DATA}/logs" ]]; then
  echo "    + data/logs/"
  copy_tree "${DATA}/logs" "${staging}/data/logs"
fi

if [[ "$want_website" -eq 1 && -n "$WEBSITE_DATA_DIR" && -d "$WEBSITE_DATA_DIR" ]]; then
  echo "    + website-data/"
  mkdir -p "${staging}/website-data"
  # Include secrets + sqlite + server-content; skip bulky caches.
  for name in web.sqlite comp-reset-secret server-content; do
    if [[ -e "${WEBSITE_DATA_DIR}/${name}" ]]; then
      echo "      + ${name}"
      if [[ -d "${WEBSITE_DATA_DIR}/${name}" ]]; then
        copy_tree "${WEBSITE_DATA_DIR}/${name}" "${staging}/website-data/${name}"
      else
        cp -a "${WEBSITE_DATA_DIR}/${name}" "${staging}/website-data/${name}"
      fi
    fi
  done
fi

if [[ -f "${COMPOSE_DIR}/.env" ]]; then
  cp -a "${COMPOSE_DIR}/.env" "${staging}/env"
elif [[ "$IN_OPS" -eq 1 && -n "${OPS_HOST_DEPLOY_DIR:-}" && -f "${OPS_HOST_DEPLOY_DIR}/.env" ]]; then
  # .env is on the host; /compose is often a copy without secrets — prefer host via alpine.
  docker run --rm \
    -v "${OPS_HOST_DEPLOY_DIR}:/from:ro" \
    -v "${staging}:/to" \
    alpine:3.20 \
    sh -c 'cp -a /from/.env /to/env' 2>/dev/null || true
fi

sqlite_count=0
if [[ -d "${staging}/data/database" ]]; then
  sqlite_count="$(find "${staging}/data/database" -name '*.sqlite3' 2>/dev/null | wc -l | tr -d ' ')"
fi
website_sqlite=no
[[ -f "${staging}/website-data/web.sqlite" ]] && website_sqlite=yes

{
  echo "created=${stamp}"
  echo "host=$(hostname)"
  echo "mode=${MODE}"
  echo "data=${DATA}"
  echo "website_data=${WEBSITE_DATA_DIR:-}"
  echo "sqlite=${sqlite_count}"
  echo "website_sqlite=${website_sqlite}"
  echo "mariadb_datadir=$([ -d "${staging}/data/mariadb" ] && echo yes || echo no)"
  echo "image=$(docker inspect smt-lobby --format '{{.Config.Image}}' 2>/dev/null || echo unknown)"
} >"${staging}/MANIFEST.txt"

echo "==> compressing"
tar -C "$staging" -czf "$archive" .
sha256sum "$archive" | tee "${archive}.sha256"

if [[ "$WAS_UP" -eq 1 || "$MARIADB_WAS_UP" -eq 1 ]]; then
  echo "==> starting stack"
  start_stack
  WAS_UP=0
  MARIADB_WAS_UP=0
else
  echo "==> stack was not running — skip start"
fi

echo
echo "backup ok: $archive"
ls -lh "$archive"
