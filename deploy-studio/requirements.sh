#!/usr/bin/env bash
# Install system + Python deps for deploy-studio (Debian/Ubuntu).
# Like requirements.txt — run when install.sh says deps are missing.
set -euo pipefail
cd "$(dirname "$0")"

echo "==> deploy-studio requirements"

need_sudo() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    echo "error: need root or sudo to install packages: $*" >&2
    exit 1
  fi
}

APT_PACKAGES=(
  curl
  python3
  xvfb
  xdotool
  wmctrl
  x11-utils
  imagemagick
  openbox
  g++-mingw-w64-i686
)

# Wine package name varies by distro / winehq vs debian.
if ! command -v wine >/dev/null 2>&1 && ! command -v wine32 >/dev/null 2>&1; then
  if apt-cache show wine 2>/dev/null | grep -q '^Package: wine$'; then
    APT_PACKAGES+=(wine)
  elif apt-cache show wine32 2>/dev/null | grep -q '^Package:'; then
    APT_PACKAGES+=(wine32)
  else
    echo "note: no wine package found via apt-cache — install Wine manually, then re-run." >&2
  fi
fi

if command -v apt-get >/dev/null 2>&1; then
  echo "==> apt packages: ${APT_PACKAGES[*]}"
  # Best-effort: a broken third-party repo must not block install.
  if ! need_sudo apt-get update -y; then
    echo "warning: apt-get update failed (stale indexes / bad PPA?) — continuing with install anyway" >&2
  fi
  # Export before need_sudo — "VAR=val cmd" breaks when already root (sudo ./requirements.sh).
  export DEBIAN_FRONTEND=noninteractive
  need_sudo apt-get install -y "${APT_PACKAGES[@]}"
else
  echo "error: apt-get not found — install these by hand, then re-run:" >&2
  echo "  ${APT_PACKAGES[*]}  (+ wine)" >&2
  exit 1
fi

if ! command -v uv >/dev/null 2>&1; then
  echo "==> installing uv"
  curl -LsSf https://astral.sh/uv/install.sh | sh
  # shellcheck disable=SC1091
  if [[ -f "$HOME/.local/bin/env" ]]; then
    # newer uv installer
    set +u
    # shellcheck disable=SC1090
    source "$HOME/.local/bin/env" 2>/dev/null || true
    set -u
  fi
  export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
  if ! command -v uv >/dev/null 2>&1; then
    echo "error: uv install finished but uv not on PATH — add ~/.local/bin to PATH" >&2
    exit 1
  fi
fi

echo "==> uv sync"
uv sync

if [[ ! -f .env && -f .env.example ]]; then
  cp .env.example .env
  echo "==> created .env from .env.example — edit PORTRAIT_CLIENT_DIR, tokens, passwords"
fi

echo "==> build portrait-sendinput.exe"
bash ./build-sendinput.sh

echo
echo "ok — next:"
echo "  1. edit .env  (PORTRAIT_CLIENT_DIR, PORTRAIT_STUDIO_URL/TOKEN, PORTRAIT_QUEUE_URL, passwords)"
echo "  2. ./install.sh"
echo "  3. ./studio up"
