#!/usr/bin/env bash
# Restore COMP portable runtime (+ website-data) from backup.sh archive.
# Replaces --data / --website-data after moving current trees aside.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

ARCHIVE=""
DATA="${COMP_RUNTIME:-}"
WEBSITE_DATA_DIR="${WEBSITE_DATA:-}"
COMPOSE_DIR=""
RESTORE_ENV=0
YES=0
PROFILE_ARGS=()
IN_OPS=0

usage() {
  cat <<'EOF'
Usage: restore.sh --archive FILE [options]

  --archive FILE       smt-runtime-*.tar.gz from backup.sh
  --data DIR           Runtime tree to replace (default: ./data or $COMP_RUNTIME)
  --website-data DIR   Website data tree (default: sibling website-data)
  --compose DIR        Directory with docker-compose.yml
  --restore-env        Also copy archived env → compose/.env (overwrites)
  --yes                Skip confirmation prompt
  -h, --help           Show this help

Current trees are moved to <path>.bak-YYYYMMDD-HHMMSS before extract.
website-data is chown'd to uid 1001 after restore (Next.js container user).
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --archive) ARCHIVE="$2"; shift 2 ;;
    --data) DATA="$2"; shift 2 ;;
    --website-data) WEBSITE_DATA_DIR="$2"; shift 2 ;;
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
mkdir -p "$(dirname "$DATA")"
DATA="$(cd "$(dirname "$DATA")" && pwd)/$(basename "$DATA")"

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

if [[ -z "$WEBSITE_DATA_DIR" ]]; then
  if [[ "$IN_OPS" -eq 1 && -d /website-data ]]; then
    WEBSITE_DATA_DIR="/website-data"
  elif [[ -d "${COMPOSE_DIR}/website-data" ]]; then
    WEBSITE_DATA_DIR="${COMPOSE_DIR}/website-data"
  elif [[ -d "$(dirname "$DATA")/website-data" ]]; then
    WEBSITE_DATA_DIR="$(dirname "$DATA")/website-data"
  else
    WEBSITE_DATA_DIR="$(dirname "$DATA")/website-data"
  fi
fi
mkdir -p "$(dirname "$WEBSITE_DATA_DIR")"
WEBSITE_DATA_DIR="$(cd "$(dirname "$WEBSITE_DATA_DIR")" && pwd)/$(basename "$WEBSITE_DATA_DIR")"

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

if [[ -n "${OPS_HOST_DEPLOY_DIR:-}" ]]; then
  host="${OPS_HOST_DEPLOY_DIR}"
  export COMP_ENTRYPOINT="${COMP_ENTRYPOINT:-${host}/entrypoint.sh}"
  export COMP_RUNTIME="${COMP_RUNTIME:-${host}/data}"
  export WEBSITE_DATA="${WEBSITE_DATA:-${host}/website-data}"
  export UPDATER_ROOT="${UPDATER_ROOT:-${host}/updater}"
  export SMT_BACKUPS="${SMT_BACKUPS:-${host}/backups}"
fi

# Load compose .env so docker compose interpolations (UPDATER_ROOT, …) work.
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
      echo "    (native: no start.sh — start game processes yourself)"
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
      echo "    (native: no stop.sh — ensure game processes are stopped)"
    fi
    return 0
  fi
  compose down 2>/dev/null || \
    docker compose -f "${COMPOSE_DIR}/docker-compose.yml" --project-directory "$COMPOSE_DIR" down 2>/dev/null || true
}

docker_install_tree() {
  local src="$1" dst="$2"
  mkdir -p "$(dirname "$dst")"
  local tmp="${dst}.incoming-$$"
  rm -rf "$tmp"
  mkdir -p "$tmp"
  if [[ "$IN_OPS" -eq 1 || "$NATIVE" -eq 1 ]]; then
    cp -a "${src}/." "$tmp/"
  else
    docker run --rm \
      -v "${src}:/from:ro" \
      -v "${tmp}:/to" \
      alpine:3.20 \
      sh -c 'cp -a /from/. /to/'
  fi
  if [[ -e "$dst" ]]; then
    echo "error: destination exists unexpectedly: $dst" >&2
    exit 1
  fi
  mv "$tmp" "$dst"
}

chown_website() {
  local dst="$1"
  # Next.js container image runs as uid 1001; native website keeps host ownership.
  if [[ "$NATIVE" -eq 1 ]]; then
    echo "    (native: skip chown 1001)"
    return 0
  fi
  if [[ "$IN_OPS" -eq 1 && -n "${OPS_HOST_DEPLOY_DIR:-}" ]]; then
    docker run --rm \
      -v "${OPS_HOST_DEPLOY_DIR}/website-data:/to" \
      alpine:3.20 \
      sh -c 'chown -R 1001:1001 /to'
  elif [[ "$IN_OPS" -eq 1 ]]; then
    chown -R 1001:1001 "$dst" 2>/dev/null || \
      docker run --rm -v "${dst}:/to" alpine:3.20 sh -c 'chown -R 1001:1001 /to'
  else
    docker run --rm \
      -v "${dst}:/to" \
      alpine:3.20 \
      sh -c 'chown -R 1001:1001 /to'
  fi
}

WAS_UP=0
if [[ "$NATIVE" -eq 0 ]]; then
  if docker ps -a --format '{{.Names}}' | grep -qx 'smt-mariadb'; then
    PROFILE_ARGS=(--profile mariadb)
  fi
  if docker ps --format '{{.Names}}' | grep -Eqx 'smt-lobby|smt-world|smt-channel|smt-website|smt-ops'; then
    WAS_UP=1
  fi
else
  if pgrep -f 'comp_lobby|comp_world|comp_channel' >/dev/null 2>&1; then
    WAS_UP=1
  fi
fi

echo "==> archive: $ARCHIVE"
echo "==> backend: $BACKEND"
echo "==> data:    $DATA"
echo "==> website: $WEBSITE_DATA_DIR"
echo "==> compose: $COMPOSE_DIR"
if [[ -f "${ARCHIVE}.sha256" ]]; then
  echo "==> verifying sha256"
  (cd "$(dirname "$ARCHIVE")" && sha256sum -c "$(basename "$ARCHIVE").sha256")
fi

if [[ "$YES" -ne 1 ]]; then
  read -r -p "Replace ${DATA} (and website-data if present in archive)? [y/N] " ans
  [[ "$ans" == "y" || "$ans" == "Y" ]] || { echo "aborted"; exit 1; }
fi

stamp="$(date +%Y%m%d-%H%M%S)"
if [[ "$IN_OPS" -eq 1 && -d /backups ]]; then
  staging="/backups/.restore-${stamp}"
else
  staging="${COMPOSE_DIR}/backups/.restore-${stamp}"
fi
mkdir -p "$staging"
trap 'rm -rf "$staging"' EXIT

echo "==> extracting"
tar -C "$staging" -xzf "$ARCHIVE"
[[ -d "${staging}/data" ]] || { echo "error: archive missing data/ (not a backup.sh archive?)" >&2; exit 1; }

echo "==> stopping stack"
if [[ "$WAS_UP" -eq 1 ]]; then
  stop_stack
else
  echo "    (nothing running — cold restore)"
  # Still try a soft stop in case processes exist outside our detection.
  stop_stack
fi

if [[ -e "$DATA" ]]; then
  bak="${DATA}.bak-${stamp}"
  echo "==> moving current data → $bak"
  mv "$DATA" "$bak"
fi

echo "==> installing restored data"
docker_install_tree "${staging}/data" "$DATA"

if [[ -d "${staging}/website-data" ]]; then
  if [[ -e "$WEBSITE_DATA_DIR" ]]; then
    wbak="${WEBSITE_DATA_DIR}.bak-${stamp}"
    echo "==> moving current website-data → $wbak"
    mv "$WEBSITE_DATA_DIR" "$wbak"
  fi
  echo "==> installing restored website-data"
  docker_install_tree "${staging}/website-data" "$WEBSITE_DATA_DIR"
  echo "==> chown website-data → 1001:1001"
  chown_website "$WEBSITE_DATA_DIR"
fi

if [[ "$RESTORE_ENV" -eq 1 && -f "${staging}/env" ]]; then
  echo "==> restoring .env"
  if [[ "$IN_OPS" -eq 1 && -n "${OPS_HOST_DEPLOY_DIR:-}" ]]; then
    docker run --rm \
      -v "${staging}:/from:ro" \
      -v "${OPS_HOST_DEPLOY_DIR}:/to" \
      alpine:3.20 \
      sh -c 'cp -a /from/env /to/.env'
  else
    cp -a "${staging}/env" "${COMPOSE_DIR}/.env"
  fi
fi

if [[ "$NATIVE" -eq 0 ]] && grep -q 'DatabaseType">MARIADB' "${DATA}/config/lobby.xml" 2>/dev/null; then
  PROFILE_ARGS=(--profile mariadb)
fi

echo "==> starting stack"
start_stack

echo
echo "restore ok: $DATA"
echo "previous tree (if any): ${DATA}.bak-${stamp}"
if [[ -d "${staging}/website-data" ]]; then
  echo "website-data: $WEBSITE_DATA_DIR (prev: ${WEBSITE_DATA_DIR}.bak-${stamp})"
fi
if [[ "$NATIVE" -eq 1 ]]; then
  echo "check: native restore complete (restart website/dev if needed)"
else
  echo "check: cd ${COMPOSE_DIR} && docker compose ps"
fi
