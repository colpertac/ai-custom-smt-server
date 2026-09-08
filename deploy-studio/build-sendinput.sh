#!/usr/bin/env bash
# Build 32-bit portrait-sendinput.exe (Wine SendInput helper).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
CC="${MINGW_CC:-i686-w64-mingw32-gcc}"
if ! command -v "$CC" >/dev/null 2>&1; then
  echo "error: need $CC (sudo apt install g++-mingw-w64-i686)" >&2
  exit 1
fi
"$CC" -O2 -o "$HERE/portrait-sendinput.exe" "$HERE/portrait-sendinput.c" -luser32
echo "built $HERE/portrait-sendinput.exe"
file "$HERE/portrait-sendinput.exe"
