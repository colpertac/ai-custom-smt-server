#!/usr/bin/env bash
# SMT all-in-one bootstrap (Docker already installed).
# Usage:
#   ./install.sh --ip 203.0.113.10
#   ./install.sh --ip 203.0.113.10 --domain play.example.com
#   ./install.sh --ip 127.0.0.1 --non-interactive
set -euo pipefail

DOCKER_INSTALL_URL="https://docs.docker.com/get-docker/"

die() {
  echo "error: $*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
SMT deploy bootstrap — requires Docker + Docker Compose.

Usage:
  ./install.sh --ip <EXTERNAL_IP> [options]

Options:
  --ip IP            Public IP or hostname clients use (required)
  --domain HOST      Optional DNS name for SITE_URL / PUBLIC_UPDATER_URL
  --prefix PATH      Install root (default: /opt/smt → deploy/ + ops/ under it)
  --dir PATH         Use this deploy/ directly (skip prefix prompt / copy)
  --website-port N   Host port for website (default: 3000)
  --non-interactive  Do not prompt; fail if --ip missing
  -h, --help         Show this help

Does not install Docker, open cloud firewalls, or run certbot.

Interactive install copies this script's deploy/ + sibling ops/ into PREFIX
(default /opt/smt). If PREFIX is not writable, the script stops and tells you
to create it with sudo or pick a path under your home directory.

You can also unpack anywhere and run once:
  scp -r deploy ops user@host:~/
  cd ~/deploy && ./install.sh --ip YOUR.PUBLIC.IP
  # prompts: Install to [/opt/smt]:
EOF
}

SCRIPT_DIR="$(cd "$(dirname "$(realpath "${BASH_SOURCE[0]}")")" && pwd)"
SOURCE_OPS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)/ops"
DEFAULT_PREFIX="/opt/smt"
DEPLOY_DIR=""
INSTALL_PREFIX=""
EXTERNAL_IP=""
DOMAIN=""
WEBSITE_PORT="3000"
NON_INTERACTIVE=0
DIR_SET=0
PREFIX_SET=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ip)
      EXTERNAL_IP="${2:-}"
      shift 2
      ;;
    --domain)
      DOMAIN="${2:-}"
      shift 2
      ;;
    --prefix)
      INSTALL_PREFIX="${2:-}"
      PREFIX_SET=1
      shift 2
      ;;
    --dir)
      DEPLOY_DIR="$(cd "${2:-}" && pwd)"
      DIR_SET=1
      shift 2
      ;;
    --website-port)
      WEBSITE_PORT="${2:-3000}"
      shift 2
      ;;
    --non-interactive)
      NON_INTERACTIVE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "unknown argument: $1 (try --help)"
      ;;
  esac
done

assert_source_bundle() {
  [[ -f "$SCRIPT_DIR/docker-compose.yml" ]] || die "docker-compose.yml not found in $SCRIPT_DIR"
  [[ -d "$SOURCE_OPS_DIR" ]] || die "ops/ not found at $SOURCE_OPS_DIR — copy deploy/ and ops/ together"
}

assert_writable_prefix() {
  local prefix="$1"
  local parent probe
  prefix="$(cd "$(dirname "$prefix")" 2>/dev/null && pwd)/$(basename "$prefix")" || prefix="$1"

  if [[ -e "$prefix" && ! -d "$prefix" ]]; then
    die "$prefix exists but is not a directory"
  fi

  if [[ -d "$prefix" ]]; then
    [[ -w "$prefix" ]] || die_writable "$prefix"
    probe="$prefix/.smt-install-write-test"
    if ! mkdir "$probe" 2>/dev/null; then
      die_writable "$prefix"
    fi
    rmdir "$probe"
    return 0
  fi

  parent="$(dirname "$prefix")"
  while [[ ! -d "$parent" && "$parent" != "/" ]]; do
    parent="$(dirname "$parent")"
  done
  [[ -w "$parent" ]] || die_writable "$prefix"
  probe="$parent/.smt-install-write-test"
  if ! mkdir "$probe" 2>/dev/null; then
    die_writable "$prefix"
  fi
  rmdir "$probe"
}

die_writable() {
  local prefix="$1"
  echo "error: cannot write to $prefix" >&2
  echo >&2
  echo "Create it and give your user ownership, for example:" >&2
  echo "  sudo mkdir -p $prefix" >&2
  echo "  sudo chown \"\$USER:\$USER\" $prefix" >&2
  echo "  ./install.sh --ip … --prefix $prefix" >&2
  echo >&2
  echo "Or install under your home directory (no sudo):" >&2
  echo "  ./install.sh --ip … --prefix \"\$HOME/smt\"" >&2
  exit 1
}

copy_install_tree() {
  local dest_prefix="$1"
  local dest_deploy="$dest_prefix/deploy"
  local dest_ops="$dest_prefix/ops"
  echo "Installing to $dest_prefix …"
  mkdir -p "$dest_prefix"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a \
      --exclude data --exclude updater --exclude website-data \
      --exclude .env \
      "$SCRIPT_DIR/" "$dest_deploy/"
    rsync -a --exclude audit.log "$SOURCE_OPS_DIR/" "$dest_ops/"
  else
    mkdir -p "$dest_deploy" "$dest_ops"
    cp -a "$SCRIPT_DIR/." "$dest_deploy/"
    cp -a "$SOURCE_OPS_DIR/." "$dest_ops/"
  fi
  echo "Copied deploy/ and ops/ → $dest_prefix"
  if [[ "$(realpath "$SCRIPT_DIR")" != "$(realpath -m "$dest_deploy")" ]]; then
    echo "Note: source bundle at $(dirname "$SCRIPT_DIR") was left in place."
    echo "      Docker runs from $dest_deploy — you can delete the source copy when done."
  fi
}

resolve_install_paths() {
  assert_source_bundle

  if [[ "$DIR_SET" -eq 1 ]]; then
    [[ -f "$DEPLOY_DIR/docker-compose.yml" ]] || die "docker-compose.yml not found in $DEPLOY_DIR"
    [[ -d "$DEPLOY_DIR/../ops" ]] || die "ops/ not found next to deploy/ (expected $DEPLOY_DIR/../ops). scp -r deploy ops …"
    return 0
  fi

  if [[ "$PREFIX_SET" -eq 0 && "$NON_INTERACTIVE" -eq 0 ]]; then
    read -r -p "Install to [$DEFAULT_PREFIX]: " INSTALL_PREFIX
    INSTALL_PREFIX="${INSTALL_PREFIX:-$DEFAULT_PREFIX}"
  elif [[ "$PREFIX_SET" -eq 0 ]]; then
    INSTALL_PREFIX="$DEFAULT_PREFIX"
  fi

  INSTALL_PREFIX="$(realpath -m "$INSTALL_PREFIX")"
  DEPLOY_DIR="$INSTALL_PREFIX/deploy"

  if [[ "$(realpath "$SCRIPT_DIR")" == "$(realpath -m "$DEPLOY_DIR")" ]]; then
    echo "Using existing install at $DEPLOY_DIR"
    return 0
  fi

  assert_writable_prefix "$INSTALL_PREFIX"
  copy_install_tree "$INSTALL_PREFIX"
}

resolve_install_paths

if [[ "$DIR_SET" -eq 0 ]]; then
  [[ -f "$DEPLOY_DIR/docker-compose.yml" ]] || die "docker-compose.yml not found in $DEPLOY_DIR"
  [[ -d "$DEPLOY_DIR/../ops" ]] || die "ops/ not found at $DEPLOY_DIR/../ops"
fi

if [[ -z "$EXTERNAL_IP" && "$NON_INTERACTIVE" -eq 0 ]]; then
  read -r -p "External IP or hostname for clients: " EXTERNAL_IP
fi
[[ -n "$EXTERNAL_IP" ]] || die "--ip is required (client-facing address)"
if [[ "$EXTERNAL_IP" == "0.0.0.0" || "$EXTERNAL_IP" == "::" ]]; then
  die "EXTERNAL_IP cannot be $EXTERNAL_IP — use the VM's LAN/public IP (e.g. 192.168.122.143)"
fi

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "'$1' not found. Install Docker: $DOCKER_INSTALL_URL"
}

need_cmd docker
docker info >/dev/null 2>&1 || die "Docker daemon not running. Start Docker, then retry. $DOCKER_INSTALL_URL"
docker compose version >/dev/null 2>&1 || die "'docker compose' missing. Install Docker Compose v2: $DOCKER_INSTALL_URL"

# Wrong VM clock breaks Docker Hub TLS (certs look "not yet valid").
if command -v timedatectl >/dev/null 2>&1; then
  if ! timedatectl status 2>/dev/null | grep -qE 'System clock synchronized: yes|NTP service: active'; then
    echo "warning: system clock may be wrong — sync before pulling images:" >&2
    echo "  sudo timedatectl set-ntp true && sleep 3 && timedatectl status" >&2
  fi
fi

[[ -f "$DEPLOY_DIR/docker-compose.yml" ]] || die "docker-compose.yml not found in $DEPLOY_DIR"
[[ -f "$DEPLOY_DIR/.env.example" ]] || die ".env.example not found in $DEPLOY_DIR"
[[ -d "$DEPLOY_DIR/../ops" ]] || die "ops/ not found next to deploy/ (needed to build smt-ops)"
echo "Using deploy dir: $DEPLOY_DIR"

rand_b64() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 48 | tr -d '\n'
  else
    head -c 48 /dev/urandom | base64 | tr -d '\n'
  fi
}

rand_hex() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 24
  else
    head -c 24 /dev/urandom | xxd -p -c 24
  fi
}

ENV_FILE="$DEPLOY_DIR/.env"
UPDATER_ROOT="$DEPLOY_DIR/updater"
DATA_DIR="$DEPLOY_DIR/data"
OPS_TOOLS="$DEPLOY_DIR/ops-tools"
WEBSITE_DATA="$DEPLOY_DIR/website-data"

mkdir -p "$UPDATER_ROOT/overlay" "$UPDATER_ROOT/base" "$UPDATER_ROOT/site" "$DATA_DIR" "$OPS_TOOLS"

seed_updater_if_needed() {
  local seed="$DEPLOY_DIR/seed/updater"
  [[ -d "$seed" ]] || return 0
  if [[ ! -f "$UPDATER_ROOT/overlay/hashlist.ver" ]]; then
    cp -a "$seed/." "$UPDATER_ROOT/"
    echo "Seeded updater from deploy/seed/updater (empty overlay — hashlist.ver ready)"
  fi
}

seed_updater_if_needed
mkdir -p \
  "$WEBSITE_DATA/server-content/config" \
  "$WEBSITE_DATA/server-content/shops" \
  "$WEBSITE_DATA/server-content/payouts" \
  "$WEBSITE_DATA/server-content/report-rewards" \
  "$WEBSITE_DATA/server-content/report-rewards/dungeons"
# Website image runs as uid 1001 (nextjs); open perms so bind-mount writes work.
chmod -R a+rwX "$WEBSITE_DATA" || true

seed_server_content_subdir() {
  local sub="$1"
  local dest="$WEBSITE_DATA/server-content/$sub"
  local seed="$DEPLOY_DIR/seed/server-content/$sub"
  [[ -d "$seed" ]] || return 0
  if [[ -z "$(find "$dest" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]]; then
    cp -a "$seed/." "$dest/"
    echo "Seeded server-content/$sub from deploy/seed/server-content/$sub"
  fi
}

seed_server_content_subdir shops
seed_server_content_subdir payouts
seed_server_content_subdir report-rewards

# Seed minimal config XMLs if data/ is empty (lobby needs constants.xml etc.).
if [[ ! -f "$DATA_DIR/config/lobby.xml" ]]; then
  mkdir -p "$DATA_DIR/config"
  if [[ -d "$DEPLOY_DIR/seed/config" ]]; then
    cp -a "$DEPLOY_DIR/seed/config/." "$DATA_DIR/config/"
    echo "Seeded data/config from deploy/seed/config"
  elif [[ -d "$DEPLOY_DIR/config/sqlite" ]]; then
    cp -a "$DEPLOY_DIR/config/sqlite/." "$DATA_DIR/config/"
    echo "Seeded data/config from deploy/config/sqlite (may still need constants.xml from a full data pack)"
  fi
fi

SITE_URL="http://${DOMAIN:-$EXTERNAL_IP}:${WEBSITE_PORT}"
PUBLIC_UPDATER_URL="http://${DOMAIN:-$EXTERNAL_IP}:8765"

if [[ -f "$ENV_FILE" ]]; then
  echo "Keeping secrets from existing $ENV_FILE when present."
  SESSION_SECRET="$(grep -E '^SESSION_SECRET=' "$ENV_FILE" | head -1 | cut -d= -f2- || true)"
  OPS_TOKEN="$(grep -E '^OPS_TOKEN=' "$ENV_FILE" | head -1 | cut -d= -f2- || true)"
  COMP_RESET_SECRET="$(grep -E '^COMP_RESET_SECRET=' "$ENV_FILE" | head -1 | cut -d= -f2- || true)"
  RESEND_API_KEY="$(grep -E '^RESEND_API_KEY=' "$ENV_FILE" | head -1 | cut -d= -f2- || true)"
  RESEND_FROM_EMAIL="$(grep -E '^RESEND_FROM_EMAIL=' "$ENV_FILE" | head -1 | cut -d= -f2- || true)"
  RESEND_FROM_NAME="$(grep -E '^RESEND_FROM_NAME=' "$ENV_FILE" | head -1 | cut -d= -f2- || true)"
  RESEND_SUPPORT_EMAIL="$(grep -E '^RESEND_SUPPORT_EMAIL=' "$ENV_FILE" | head -1 | cut -d= -f2- || true)"
  if [[ -z "$SESSION_SECRET" || "$SESSION_SECRET" == replace-with* ]]; then
    SESSION_SECRET="$(rand_b64)"
  fi
  if [[ -z "$OPS_TOKEN" || "$OPS_TOKEN" == replace-with* ]]; then
    OPS_TOKEN="$(rand_hex)"
  fi
  if [[ -z "$COMP_RESET_SECRET" ]]; then
    COMP_RESET_SECRET="$(rand_hex)"
  fi
else
  SESSION_SECRET="$(rand_b64)"
  OPS_TOKEN="$(rand_hex)"
  COMP_RESET_SECRET="$(rand_hex)"
fi

STAGE_SCRIPT="$DEPLOY_DIR/scripts/stage-ops-tools.sh"
OPS_DIR="$(cd "$DEPLOY_DIR/.." && pwd)/ops"
OPS_BUILD_LOCAL=0
OPS_IMAGE="colpertac/smt-ops:latest"
if [[ -x "$STAGE_SCRIPT" && -f "$OPS_DIR/Dockerfile" ]]; then
  if DEPLOY_DIR="$DEPLOY_DIR" "$STAGE_SCRIPT"; then
    OPS_BUILD_LOCAL=1
    OPS_IMAGE="colpertac/smt-ops:local"
    echo "Ops tools staged — will build smt-ops:local from ../ops."
  else
    echo "No local comp_hack build — will pull colpertac/smt-ops:latest (tools baked in)."
  fi
elif [[ -x "$OPS_TOOLS/comp_encrypt" && -f "$OPS_DIR/Dockerfile" ]]; then
  if [[ -x "$STAGE_SCRIPT" ]]; then
    DEPLOY_DIR="$DEPLOY_DIR" "$STAGE_SCRIPT" || true
  fi
  OPS_BUILD_LOCAL=1
  OPS_IMAGE="colpertac/smt-ops:local"
  echo "Using existing ops-tools — will build smt-ops:local from ../ops."
else
  echo "Will pull colpertac/smt-ops:latest (tools baked in)."
fi

SERVERDATA_SCRIPT="$DEPLOY_DIR/scripts/stage-server-datastore.sh"
if [[ -x "$SERVERDATA_SCRIPT" ]]; then
  if DEPLOY_DIR="$DEPLOY_DIR" COMP_RUNTIME="$DATA_DIR" "$SERVERDATA_SCRIPT"; then
    echo "Server zone definitions staged (zones/, data/, events/, …)."
  else
    echo "Note: server zone data not staged — include zones/ + data/ in content upload, or clone comp_hack with datastore submodule."
  fi
fi

{
  echo "# Generated by install.sh — $(date -u +%Y-%m-%dT%H:%MZ)"
  echo "EXTERNAL_IP=$EXTERNAL_IP"
  echo "SESSION_SECRET=$SESSION_SECRET"
  echo "OPS_TOKEN=$OPS_TOKEN"
  echo "COMP_RESET_SECRET=$COMP_RESET_SECRET"
  echo "UPDATER_ROOT=$UPDATER_ROOT"
  echo "COMP_RUNTIME=$DATA_DIR"
  echo "COMP_ENTRYPOINT=$DEPLOY_DIR/entrypoint.sh"
  echo "WEBSITE_DATA=$WEBSITE_DATA"
  echo "OPS_HOST_DEPLOY_DIR=$DEPLOY_DIR"
  echo "WEBSITE_PORT=$WEBSITE_PORT"
  echo "SITE_URL=$SITE_URL"
  echo "PUBLIC_UPDATER_URL=$PUBLIC_UPDATER_URL"
  echo "COOKIE_SECURE=false"
  echo "OPS_URL=http://ops:14710"
  echo "COMP_IMAGE=colpertac/smt-comp:latest"
  echo "WEBSITE_IMAGE=colpertac/smt-website:latest"
  echo "OPS_IMAGE=$OPS_IMAGE"
  if [[ -n "${RESEND_API_KEY:-}" ]]; then
    echo "RESEND_API_KEY=$RESEND_API_KEY"
  fi
  if [[ -n "${RESEND_FROM_EMAIL:-}" ]]; then
    echo "RESEND_FROM_EMAIL=$RESEND_FROM_EMAIL"
  fi
  if [[ -n "${RESEND_FROM_NAME:-}" ]]; then
    echo "RESEND_FROM_NAME=$RESEND_FROM_NAME"
  fi
  if [[ -n "${RESEND_SUPPORT_EMAIL:-}" ]]; then
    echo "RESEND_SUPPORT_EMAIL=$RESEND_SUPPORT_EMAIL"
  fi
} >"$ENV_FILE"

echo "Wrote $ENV_FILE"
echo "  EXTERNAL_IP=$EXTERNAL_IP"
echo "  SITE_URL=$SITE_URL"
echo "  PUBLIC_UPDATER_URL=$PUBLIC_UPDATER_URL"
echo "  (SESSION_SECRET, OPS_TOKEN, COMP_RESET_SECRET stored in .env — keep private)"

cd "$DEPLOY_DIR"
echo "Pulling Hub images and starting stack…"
PULL_SERVICES=(lobby world channel website updater)
if [[ "$OPS_BUILD_LOCAL" -eq 0 ]]; then
  PULL_SERVICES+=(ops)
fi
if ! docker compose pull "${PULL_SERVICES[@]}" 2>&1; then
  echo >&2
  echo "error: docker pull failed (often VM clock not synced — see timedatectl status)" >&2
  echo "  sudo timedatectl set-ntp true" >&2
  echo "  cd $DEPLOY_DIR && docker compose pull && docker compose up -d --build" >&2
  exit 1
fi
if [[ "$OPS_BUILD_LOCAL" -eq 1 ]]; then
  docker compose build ops
  docker compose up -d
else
  docker compose up -d
fi

echo
echo "=== SMT stack starting ==="
echo "Website:  $SITE_URL"
echo "Updater:  $PUBLIC_UPDATER_URL"
echo "Lobby:    $EXTERNAL_IP:10666"
echo "Channel:  $EXTERNAL_IP:14666"
echo
echo "Next:"
echo "  1. Open $SITE_URL — register / sign in (admin needs userLevel >= 1000)."
echo "  2. Admin → Overview — confirm ops is healthy."
echo "  3. If first boot: Admin → Game files — upload BinaryData + maps (from game client), then Start."
echo "     Server zones/events copy automatically when comp_hack is present; otherwise include zones/ + data/ in the zip."
echo "  4. Admin → Download — Client prep zip, ship client, paste MediaFire/Drive URL."
echo "  5. Open cloud firewall / security list for ports 10666, 14666, 8765, $WEBSITE_PORT if public."
echo "  6. Optional: Admin → Email — paste Resend API key + from address for forgot-password mail."
echo "     Restart lobby once after saving (Overview → restart services if needed)."
echo
echo "Docs: docs/youtube-1.0-setup.md  |  docs/oracle-vps.md"
