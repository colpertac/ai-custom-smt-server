#!/usr/bin/env bash
# Launch one Imagine client under Wine (mannequin box / local QA).
#
# Usage:
#   ./scripts/portrait/portrait-launch.sh           # one client
#   ./scripts/portrait/portrait-launch.sh --second  # 2nd process (same install)
#
# Env overrides:
#   PORTRAIT_CLIENT_DIR   default /home/cat/software/smt/game/reimagine
#   PORTRAIT_CLIENT_EXE   default ImagineClient.exe
#   PORTRAIT_WINE         default wine
#   WINEPREFIX            optional separate prefix per mannequin
#
# After launch, login with:
#   PORTRAIT_VAM1_PASS=… npm run portrait-login -- vam1
#   PORTRAIT_VAF1_PASS=… npm run portrait-login -- vaf1
# Two windows need PORTRAIT_WINDOW_VAM1 / PORTRAIT_WINDOW_VAF1 (wmctrl -l).

set -euo pipefail

CLIENT_DIR="${PORTRAIT_CLIENT_DIR:-/home/cat/software/smt/game/reimagine}"
CLIENT_EXE="${PORTRAIT_CLIENT_EXE:-ImagineClient.exe}"
WINE_BIN="${PORTRAIT_WINE:-wine}"

if [[ ! -d "$CLIENT_DIR" ]]; then
  echo "error: client dir not found: $CLIENT_DIR" >&2
  echo "set PORTRAIT_CLIENT_DIR" >&2
  exit 1
fi
if [[ ! -f "$CLIENT_DIR/$CLIENT_EXE" ]]; then
  echo "error: missing $CLIENT_DIR/$CLIENT_EXE" >&2
  exit 1
fi

cd "$CLIENT_DIR"
echo "launch: $WINE_BIN $CLIENT_EXE  (cwd=$CLIENT_DIR)"
if [[ -n "${WINEPREFIX:-}" ]]; then
  echo "WINEPREFIX=$WINEPREFIX"
fi
# Detach so the shell returns; logs go to portrait-client.log in cwd.
nohup "$WINE_BIN" "$CLIENT_EXE" >>portrait-client.log 2>&1 &
echo "pid $!  (tail -f $CLIENT_DIR/portrait-client.log)"
echo "Next: wait for login UI, then npm run portrait-login -- vam1|vaf1"
