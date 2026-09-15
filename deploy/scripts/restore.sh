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

Current trees are snapshotted to <path>.bak-YYYYMMDD-HHMMSS; archive members
are merged in (standard backups omit datastore/BinaryData — those stay put).
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

# Services that share bind mounts with ops. Never stop/recreate ops from inside
# ops — `compose down` / full `up -d` SIGKILLs the restore job (same as backup).
PEER_SERVICES=(lobby world channel website updater caddy)

peer_services() {
  local out=("${PEER_SERVICES[@]}")
  if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qx 'smt-mariadb'; then
    out+=(mariadb)
  fi
  printf '%s\n' "${out[@]}"
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
  if [[ "$IN_OPS" -eq 1 ]]; then
    mapfile -t peers < <(peer_services)
    compose start "${peers[@]}" 2>/dev/null \
      || compose up -d --no-recreate "${peers[@]}" \
      || compose up -d "${peers[@]}"
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
  if [[ "$IN_OPS" -eq 1 ]]; then
    mapfile -t peers < <(peer_services)
    echo "    (ops: stop peers only — ${peers[*]})"
    compose stop "${peers[@]}" 2>/dev/null || true
    return 0
  fi
  # Host-side CLI restore: full teardown is fine (ops is not the caller).
  compose down 2>/dev/null || \
    docker compose -f "${COMPOSE_DIR}/docker-compose.yml" --project-directory "$COMPOSE_DIR" down 2>/dev/null || true
}

# Merge archive members into a live tree. Standard backups omit datastore/
# (BinaryData/Map/zones) and only a subset of website-data — never wipe those.
merge_tree_members() {
  local src="$1" dst="$2"
  [[ -d "$src" ]] || return 1
  mkdir -p "$dst"
  local name
  for name in "$src"/* "$src"/.[!.]* "$src"/..?*; do
    [[ -e "$name" ]] || continue
    local base
    base="$(basename "$name")"
    [[ "$base" == "." || "$base" == ".." ]] && continue
    echo "    + ${base}"
    if [[ -d "$name" ]]; then
      rm -rf "${dst}/${base}"
      cp -a "$name" "${dst}/${base}"
    else
      cp -a "$name" "${dst}/${base}"
    fi
  done
}

# Snapshot a host bind source aside before in-place replace (ops mounts).
host_backup_tree() {
  local host_src="$1" host_bak="$2"
  docker run --rm \
    -v "$(dirname "$host_src"):/parent" \
    alpine:3.20 \
    sh -c "rm -rf '/parent/$(basename "$host_bak")' && cp -a '/parent/$(basename "$host_src")' '/parent/$(basename "$host_bak")'"
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

STACK_ENSURED=0
on_exit() {
  local code=$?
  if [[ "$STACK_ENSURED" -eq 0 && "$WAS_UP" -eq 1 ]]; then
    echo "==> ensuring stack is up (exit=$code)"
    start_stack || true
  fi
  rm -rf "$staging"
  exit "$code"
}
trap on_exit EXIT

echo "==> extracting"
tar -C "$staging" -xzf "$ARCHIVE"
[[ -d "${staging}/data" ]] || { echo "error: archive missing data/ (not a backup.sh archive?)" >&2; exit 1; }

echo "==> stopping stack"
if [[ "$WAS_UP" -eq 1 ]]; then
  stop_stack
else
  echo "    (nothing running — cold restore)"
  stop_stack
fi

if [[ "$IN_OPS" -eq 1 ]]; then
  # Ops bind-mounts /comp and /website-data. Never `mv` those mount points —
  # snapshot on the host, then merge archive members so omitted dirs
  # (datastore/BinaryData, portraits, …) survive a standard backup restore.
  host_deploy="${OPS_HOST_DEPLOY_DIR:-}"
  if [[ -z "$host_deploy" ]]; then
    echo "error: OPS_HOST_DEPLOY_DIR required for in-ops restore" >&2
    exit 1
  fi
  bak="${host_deploy}/data.bak-${stamp}"
  echo "==> snapshot host data → $bak"
  host_backup_tree "${host_deploy}/data" "$bak"
  echo "==> merging restored data members into /comp"
  merge_tree_members "${staging}/data" "$DATA"
  # Ops/website run as non-root; alpine copies above can leave root:root 755 on
  # /comp (breaks mkdir releases, Lane A publish). Match install world-writable.
  echo "==> ensuring /comp is writable"
  chmod -R a+rwX "$DATA" 2>/dev/null || true

  if [[ -d "${staging}/website-data" ]]; then
    wbak="${host_deploy}/website-data.bak-${stamp}"
    echo "==> snapshot host website-data → $wbak"
    host_backup_tree "${host_deploy}/website-data" "$wbak"
    echo "==> merging restored website-data members into /website-data"
    merge_tree_members "${staging}/website-data" "$WEBSITE_DATA_DIR"
    echo "==> chown website-data → 1001:1001"
    chown_website "$WEBSITE_DATA_DIR"
  fi
else
  if [[ -e "$DATA" ]]; then
    bak="${DATA}.bak-${stamp}"
    echo "==> snapshot current data → $bak"
    rm -rf "$bak"
    cp -a "$DATA" "$bak"
  fi

  echo "==> merging restored data members"
  merge_tree_members "${staging}/data" "$DATA"

  if [[ -d "${staging}/website-data" ]]; then
    if [[ -e "$WEBSITE_DATA_DIR" ]]; then
      wbak="${WEBSITE_DATA_DIR}.bak-${stamp}"
      echo "==> snapshot current website-data → $wbak"
      rm -rf "$wbak"
      cp -a "$WEBSITE_DATA_DIR" "$wbak"
    fi
    echo "==> merging restored website-data members"
    merge_tree_members "${staging}/website-data" "$WEBSITE_DATA_DIR"
    echo "==> chown website-data → 1001:1001"
    chown_website "$WEBSITE_DATA_DIR"
  fi
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
STACK_ENSURED=1

echo
echo "restore ok: $DATA"
if [[ "$IN_OPS" -eq 1 ]]; then
  echo "previous tree snapshot: ${OPS_HOST_DEPLOY_DIR}/data.bak-${stamp}"
  if [[ -d "${OPS_HOST_DEPLOY_DIR}/website-data.bak-${stamp}" ]]; then
    echo "website-data snapshot: ${OPS_HOST_DEPLOY_DIR}/website-data.bak-${stamp}"
  fi
else
  echo "previous tree (if any): ${DATA}.bak-${stamp}"
  if [[ -d "${WEBSITE_DATA_DIR}.bak-${stamp}" ]]; then
    echo "website-data: $WEBSITE_DATA_DIR (prev: ${WEBSITE_DATA_DIR}.bak-${stamp})"
  fi
fi
if [[ "$NATIVE" -eq 1 ]]; then
  echo "check: native restore complete (restart website/dev if needed)"
else
  echo "check: cd ${COMPOSE_DIR} && docker compose ps"
fi
