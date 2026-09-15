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
  # JP UI text under Wine (login errors show as □ without these)
  locales
  fonts-noto-cjk
  cabextract
  winetricks
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

echo "==> Japanese locale (Wine / Imagine UI — fixes tofu □ on error banners)"
WINE_LANG="${PORTRAIT_WINE_LANG:-ja_JP.UTF-8}"
if ! locale -a 2>/dev/null | grep -qiE '^ja_JP\.(utf8|UTF-8)$'; then
  # Uncomment/generate ja_JP.UTF-8 without clobbering the whole locale.gen.
  if [[ -f /etc/locale.gen ]]; then
    need_sudo sed -i -E 's/^#\s*(ja_JP\.UTF-8.*)$/\1/' /etc/locale.gen || true
    if ! grep -qE '^\s*ja_JP\.UTF-8' /etc/locale.gen 2>/dev/null; then
      echo "ja_JP.UTF-8 UTF-8" | need_sudo tee -a /etc/locale.gen >/dev/null
    fi
  fi
  need_sudo locale-gen ja_JP.UTF-8 || need_sudo locale-gen "$WINE_LANG" || true
fi
if locale -a 2>/dev/null | grep -qiE '^ja_JP\.(utf8|UTF-8)$'; then
  echo "  OK  ja_JP.UTF-8 available"
else
  echo "warning: ja_JP.UTF-8 not in locale -a — Wine may still show □ until locale-gen works" >&2
fi

echo "==> Wine CJK fonts + Japanese user locale (tofu □ fix)"
# Honor WINEPREFIX / LANG from .env if present (do not override shell).
if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  set -a
  # shellcheck disable=SC1090
  source .env
  set +a
fi
PREFIX="${WINEPREFIX:-$HOME/.wine}"
FONTS_DIR="$PREFIX/drive_c/windows/Fonts"
WINE_BIN="$(command -v wine || command -v wine32 || true)"
export WINEDEBUG="${WINEDEBUG:--all}"
export WINEPREFIX="$PREFIX"

if [[ -z "$WINE_BIN" ]]; then
  echo "warning: wine not on PATH — skip Wine font/locale setup; install Wine and re-run" >&2
else
  # 1) Optional winetricks bundle (slow; often incomplete if interrupted).
  if command -v winetricks >/dev/null 2>&1; then
    FONT_COUNT=0
    if [[ -d "$FONTS_DIR" ]]; then
      FONT_COUNT="$(find "$FONTS_DIR" -type f 2>/dev/null | wc -l | tr -d ' ')"
    fi
    if [[ "${FONT_COUNT:-0}" -ge 20 ]] \
      && find "$FONTS_DIR" \( -iname '*gothic*' -o -iname '*msgothic*' -o -iname '*noto*' \) 2>/dev/null \
        | head -1 | grep -q .; then
      echo "  OK  CJK-ish fonts already in $FONTS_DIR ($FONT_COUNT files)"
    else
      echo "  → winetricks -q cjkfonts  (prefix=$PREFIX; may take several minutes)"
      if ! winetricks -q cjkfonts; then
        echo "warning: winetricks cjkfonts failed — continuing with system Noto links" >&2
      else
        echo "  OK  winetricks cjkfonts finished"
      fi
    fi
  else
    echo "  note  winetricks missing — using system fonts-noto-cjk only"
  fi

  # 2) Always link Debian/Ubuntu Noto CJK into the prefix (reliable vs partial cjkfonts).
  mkdir -p "$FONTS_DIR"
  NOTO_LINKED=0
  for f in /usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc \
    /usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc \
    /usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc; do
    if [[ -f "$f" ]]; then
      ln -sfn "$f" "$FONTS_DIR/$(basename "$f")"
      NOTO_LINKED=1
    fi
  done
  if [[ "$NOTO_LINKED" -eq 1 ]]; then
    echo "  OK  linked system Noto CJK into $FONTS_DIR"
  else
    echo "warning: fonts-noto-cjk files not found under /usr/share/fonts/opentype/noto/" >&2
  fi

  # 3) Point common JP face names at Noto (GDI / Scaleform lookups).
  for face in "MS Gothic" "MS PGothic" "MS UI Gothic" "ＭＳ ゴシック" "ＭＳ Ｐゴシック" \
    "Meiryo" "Meiryo UI" "Yu Gothic" "メイリオ" "游ゴシック"; do
    "$WINE_BIN" reg add "HKCU\\Software\\Wine\\Fonts\\Replacements" \
      /v "$face" /t REG_SZ /d "Noto Sans CJK JP" /f >/dev/null 2>&1 || true
  done

  # 4) Wine user locale → Japanese so GetACP/_setmbcp(932) work with LANG=ja_JP.UTF-8.
  #    Host LANG alone is not enough while HKCU International stays en-US.
  "$WINE_BIN" reg add "HKCU\\Control Panel\\International" /v Locale /t REG_SZ /d 00000411 /f >/dev/null 2>&1 || true
  "$WINE_BIN" reg add "HKCU\\Control Panel\\International" /v LocaleName /t REG_SZ /d ja-JP /f >/dev/null 2>&1 || true
  "$WINE_BIN" reg add "HKCU\\Control Panel\\International" /v sLanguage /t REG_SZ /d JPN /f >/dev/null 2>&1 || true
  "$WINE_BIN" reg add "HKCU\\Control Panel\\International" /v sCountry /t REG_SZ /d Japan /f >/dev/null 2>&1 || true
  "$WINE_BIN" reg add "HKCU\\Control Panel\\International" /v iCountry /t REG_SZ /d 81 /f >/dev/null 2>&1 || true
  echo "  OK  Wine HKCU locale set to ja-JP (00000411)"
  echo "  note  restart Imagine clients after this (./studio kill && ./studio orch-up)"
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

# Ensure Wine locale knobs exist in .env (do not overwrite user values).
ensure_env_line() {
  local key="$1" val="$2"
  [[ -f .env ]] || return 0
  if grep -qE "^[[:space:]]*${key}=" .env 2>/dev/null; then
    return 0
  fi
  printf '\n# Added by ./requirements.sh (Imagine JP UI under Wine)\n%s=%s\n' "$key" "$val" >> .env
  echo "==> appended $key=$val to .env"
}
ensure_env_line PORTRAIT_WINE_LANG "$WINE_LANG"
ensure_env_line LANG "$WINE_LANG"
ensure_env_line LC_ALL "$WINE_LANG"

echo "==> build portrait-sendinput.exe"
bash ./build-sendinput.sh

echo
echo "ok — next:"
echo "  1. edit .env  (PORTRAIT_CLIENT_DIR, PORTRAIT_STUDIO_URL/TOKEN, PORTRAIT_QUEUE_URL, passwords)"
echo "  2. ./install.sh"
echo "  3. ./studio up"
echo "  Wine UI locale: ${WINE_LANG} (override with PORTRAIT_WINE_LANG)"
