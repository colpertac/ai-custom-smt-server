#!/usr/bin/env bash
# Check-only gate for deploy-studio. Does not install packages.
# On failure: tell the user to run ./requirements.sh (or edit .env).
set -euo pipefail
cd "$(dirname "$0")"

# Load .env for path checks (do not override existing exports).
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
elif [[ -f .env.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

FAIL=0
HINT_REQUIREMENTS=0
HINT_ENV=0

ok() { printf '  OK  %s\n' "$*"; }
bad() {
  printf '  MISSING  %s\n' "$*" >&2
  FAIL=1
}
need_bin() {
  local name="$1"
  if command -v "$name" >/dev/null 2>&1; then
    ok "$name ($(command -v "$name"))"
  else
    bad "$name"
    HINT_REQUIREMENTS=1
  fi
}

echo "==> deploy-studio check"

# --- binaries ---
if command -v wine >/dev/null 2>&1; then
  ok "wine ($(command -v wine))"
elif command -v wine32 >/dev/null 2>&1; then
  ok "wine32 ($(command -v wine32))"
else
  bad "wine (or wine32)"
  HINT_REQUIREMENTS=1
fi

need_bin Xvfb
need_bin xdotool
need_bin wmctrl
need_bin xdpyinfo
need_bin curl
need_bin python3

if command -v import >/dev/null 2>&1; then
  ok "import/ImageMagick ($(command -v import))"
elif command -v scrot >/dev/null 2>&1; then
  ok "scrot ($(command -v scrot))"
else
  bad "import (ImageMagick) or scrot"
  HINT_REQUIREMENTS=1
fi

# --- Python env ---
if command -v uv >/dev/null 2>&1; then
  ok "uv ($(command -v uv))"
elif [[ -x .venv/bin/python ]]; then
  ok ".venv/bin/python (uv not on PATH but venv exists)"
else
  bad "uv (or existing .venv/)"
  HINT_REQUIREMENTS=1
fi

if [[ -x .venv/bin/python ]]; then
  ok ".venv present"
else
  bad ".venv (run: uv sync via ./requirements.sh)"
  HINT_REQUIREMENTS=1
fi

# Soft: openbox helps focus on Xvfb
if command -v openbox >/dev/null 2>&1; then
  ok "openbox (optional WM)"
else
  printf '  note  openbox not installed (optional; helps window focus)\n'
fi

# --- SendInput helper ---
SENDINPUT="${PORTRAIT_SENDINPUT_EXE:-./portrait-sendinput.exe}"
if [[ -f "$SENDINPUT" ]]; then
  ok "portrait-sendinput.exe ($SENDINPUT)"
else
  bad "portrait-sendinput.exe (run ./build-sendinput.sh via ./requirements.sh)"
  HINT_REQUIREMENTS=1
fi

# --- .env ---
if [[ -f .env || -f .env.local ]]; then
  ok ".env file present"
else
  bad ".env (copy .env.example → .env)"
  HINT_ENV=1
fi

require_var() {
  local key="$1"
  local val="${!key-}"
  if [[ -n "${val// }" ]]; then
    ok "$key is set"
  else
    bad "$key empty — edit .env"
    HINT_ENV=1
  fi
}

require_var PORTRAIT_CLIENT_DIR
require_var PORTRAIT_STUDIO_URL
require_var PORTRAIT_STUDIO_TOKEN
require_var PORTRAIT_QUEUE_URL

if [[ -n "${PORTRAIT_VAM1_PASS-}" || -n "${PORTRAIT_VAF1_PASS-}" ]]; then
  ok "mannequin password(s) set"
else
  bad "PORTRAIT_VAM1_PASS / PORTRAIT_VAF1_PASS — need at least one"
  HINT_ENV=1
fi

CLIENT_DIR="${PORTRAIT_CLIENT_DIR:-}"
CLIENT_EXE="${PORTRAIT_CLIENT_EXE:-ImagineClient.exe}"
if [[ -n "$CLIENT_DIR" ]]; then
  if [[ -d "$CLIENT_DIR" ]]; then
    ok "client dir $CLIENT_DIR"
  else
    bad "client dir not found: $CLIENT_DIR"
    HINT_ENV=1
  fi
  if [[ -f "$CLIENT_DIR/$CLIENT_EXE" ]]; then
    ok "client exe $CLIENT_DIR/$CLIENT_EXE"
  else
    bad "client exe missing: $CLIENT_DIR/$CLIENT_EXE"
    HINT_ENV=1
  fi
fi

# Soft TCP reachability (do not fail; auth may still be wrong)
soft_host() {
  local label="$1" base="$2"
  if ! command -v curl >/dev/null 2>&1; then
    return
  fi
  local url="${base%/}/"
  if curl -fsS --connect-timeout 2 --max-time 4 -o /dev/null -w '' "$url" >/dev/null 2>&1 \
    || curl -sS --connect-timeout 2 --max-time 4 -o /dev/null -w '' "$url" >/dev/null 2>&1; then
    ok "$label host responds ($base)"
  else
    printf '  note  %s host not reachable right now (%s)\n' "$label" "$base"
  fi
}

if [[ -n "${PORTRAIT_STUDIO_URL-}" ]]; then
  soft_host "studio" "$PORTRAIT_STUDIO_URL"
fi
if [[ -n "${PORTRAIT_QUEUE_URL-}" ]]; then
  soft_host "queue" "$PORTRAIT_QUEUE_URL"
fi

echo
if [[ "$FAIL" -ne 0 ]]; then
  echo "check FAILED" >&2
  if [[ "$HINT_REQUIREMENTS" -eq 1 ]]; then
    echo "→ run ./requirements.sh" >&2
  fi
  if [[ "$HINT_ENV" -eq 1 ]]; then
    echo "→ edit .env (see .env.example)" >&2
  fi
  exit 1
fi

echo "ok — next: ./studio up"
exit 0
