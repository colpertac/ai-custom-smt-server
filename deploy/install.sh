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
  --dir PATH         Install / compose directory (default: this script's dir)
  --website-port N   Host port for website (default: 3000)
  --non-interactive  Do not prompt; fail if --ip missing
  -h, --help         Show this help

Does not install Docker, open cloud firewalls, or run certbot.

You must copy the whole deploy/ folder plus sibling ops/ (not only this script):
  scp -r deploy ops user@host:~/smt/
  cd ~/smt/deploy && ./install.sh --ip YOUR.PUBLIC.IP
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR=""
EXTERNAL_IP=""
DOMAIN=""
WEBSITE_PORT="3000"
NON_INTERACTIVE=0
DIR_SET=0

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

# Resolve deploy/ (needs docker-compose.yml + sibling ../ops). install.sh alone in ~ is not enough.
resolve_deploy_dir() {
  local cand
  for cand in \
    "$SCRIPT_DIR" \
    "$SCRIPT_DIR/deploy" \
    "$HOME/smt/deploy" \
    "$HOME/smt/ai_custom_smt_server/deploy" \
    "$(pwd)/deploy" \
    "$(pwd)"
  do
    if [[ -f "$cand/docker-compose.yml" && -d "$cand/../ops" ]]; then
      (cd "$cand" && pwd)
      return 0
    fi
  done
  return 1
}

explain_missing_deploy() {
  echo "Could not find a valid deploy directory." >&2
  echo >&2
  if [[ -f "$SCRIPT_DIR/docker-compose.yml" && ! -d "$SCRIPT_DIR/../ops" ]]; then
    echo "Found docker-compose.yml in $SCRIPT_DIR" >&2
    echo "but sibling ops/ is missing at $(cd "$SCRIPT_DIR/.." && pwd)/ops" >&2
    echo >&2
    echo "Copy BOTH folders (same parent):" >&2
    echo "  scp -r deploy ops smt@host:~/" >&2
    echo "  # results in ~/deploy and ~/ops" >&2
    echo "  cd ~/deploy && ./install.sh --ip YOUR.LAN.OR.PUBLIC.IP" >&2
  else
    echo "You need the full tree, e.g.:" >&2
    echo "  scp -r deploy ops smt@host:~/smt/" >&2
    echo "  cd ~/smt/deploy && ./install.sh --ip YOUR.LAN.OR.PUBLIC.IP" >&2
  fi
  echo >&2
  echo "Do not use --ip 0.0.0.0 — use the VM address clients dial (e.g. 192.168.122.143)." >&2
}

if [[ "$DIR_SET" -eq 0 ]]; then
  DEPLOY_DIR="$(resolve_deploy_dir)" || {
    explain_missing_deploy
    exit 1
  }
fi

if [[ "$DIR_SET" -eq 1 ]]; then
  [[ -f "$DEPLOY_DIR/docker-compose.yml" ]] || die "docker-compose.yml not found in $DEPLOY_DIR"
  [[ -d "$DEPLOY_DIR/../ops" ]] || die "ops/ not found next to deploy/ (expected $DEPLOY_DIR/../ops). scp -r deploy ops …"
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

mkdir -p "$UPDATER_ROOT/overlay" "$UPDATER_ROOT/base" "$DATA_DIR" "$OPS_TOOLS"
mkdir -p \
  "$WEBSITE_DATA/server-content/config" \
  "$WEBSITE_DATA/server-content/shops" \
  "$WEBSITE_DATA/server-content/payouts"
# Website image runs as uid 1001 (nextjs); open perms so bind-mount writes work.
chmod -R a+rwX "$WEBSITE_DATA" || true

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
# Pull published services only — ops is built from ../ops (not on Hub yet).
docker compose pull lobby world channel website updater || true
docker compose up -d --build

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
echo "  3. If first boot: Admin → Game files — upload content zips, then Start."
echo "  4. Admin → Download — Client prep zip, ship client, paste MediaFire/Drive URL."
echo "  5. Open cloud firewall / security list for ports 10666, 14666, 8765, $WEBSITE_PORT if public."
echo "  6. Optional: Admin → Email — paste Resend API key + from address for forgot-password mail."
echo "     Restart lobby once after saving (Overview → restart services if needed)."
echo
echo "Optional: put Linux amd64 comp_rehash + comp_encrypt in $OPS_TOOLS for Lane B / Client prep encrypt."
echo "Docs: docs/youtube-1.0-setup.md  |  docs/oracle-vps.md"
