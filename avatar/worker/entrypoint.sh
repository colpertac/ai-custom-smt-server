#!/bin/sh
# Container entrypoint for the portrait render worker (avatar/worker/Dockerfile).
#
# 1. Brings the converted assets on the volume up to date from the read-only game client
#    (tables.py when the client tables changed, convert.py all (incremental), catalog.py), unless
#    AVATAR_CONVERT=off. Skipped with a warning when the client or nif.xml is not mounted but
#    converted assets already exist on the volume.
# 2. exec node avatar/worker/worker.mjs "$@".
set -eu

log() { printf '{"ts":"%s","level":"%s","msg":"%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)" "$1" "$2"; }

: "${AVATAR_BUILD_DIR:=/data}"
: "${AVATAR_ASSETS_DIR:=$AVATAR_BUILD_DIR/assets}"
: "${IMAGINE_CLIENT_DIR:=/client}"
: "${NIF_XML:=/opt/nif/nif.xml}"
: "${AVATAR_CONVERT:=auto}"
export AVATAR_BUILD_DIR AVATAR_ASSETS_DIR IMAGINE_CLIENT_DIR NIF_XML

TOOLS=/app/avatar/tools
TABLES="$AVATAR_BUILD_DIR/tables"
have_assets() { [ -f "$AVATAR_ASSETS_DIR/manifest.json" ] && [ -f "$AVATAR_ASSETS_DIR/rig.json" ]; }
# newer SRC... : true when any existing SRC is newer than REF (or REF is missing)
newer() {
  ref=$1; shift
  [ -f "$ref" ] || return 0
  for f in "$@"; do [ -e "$f" ] && [ "$f" -nt "$ref" ] && return 0; done
  return 1
}

if [ "$AVATAR_CONVERT" = "off" ]; then
  log info "asset conversion disabled (AVATAR_CONVERT=off)"
elif [ ! -d "$IMAGINE_CLIENT_DIR/Avatar" ]; then
  if have_assets; then log warn "game client not mounted at $IMAGINE_CLIENT_DIR; using existing assets"
  else log error "game client not mounted at $IMAGINE_CLIENT_DIR and no converted assets in $AVATAR_ASSETS_DIR"; exit 1; fi
else
  start=$(date +%s)
  mkdir -p "$AVATAR_BUILD_DIR"
  cd "$TOOLS"
  BD="$IMAGINE_CLIENT_DIR/BinaryData"
  if newer "$TABLES/stances.json" "$IMAGINE_CLIENT_DIR/ImagineClient.exe" "$BD/Client/CModelData1.bin" \
      "$BD/Client/CEquipHairData.bin" "$BD/Client/CEquipFaceData.bin" "$BD/Client/CEquipEyeData.bin" \
      "$BD/Shield/CEquipModelData.sbin" "$BD/Shield/ItemData.sbin" "$BD/Shield/CItemData.sbin" "$TOOLS/tables.py"; then
    log info "decoding client tables (tables.py)"
    python3 tables.py
  fi
  if [ -f "$NIF_XML" ]; then
    log info "converting assets (convert.py all, incremental)"
    python3 convert.py all ${AVATAR_CONVERT_JOBS:+-j "$AVATAR_CONVERT_JOBS"}
  elif have_assets; then
    log warn "NIF_XML $NIF_XML not found; skipping convert.py (existing assets may be stale)"
  else
    log error "NIF_XML $NIF_XML not found and no converted assets: mount nif.xml (ships with NifSkope)"; exit 1
  fi
  if newer "$AVATAR_ASSETS_DIR/catalog.json" "$TABLES"/*.json "$TOOLS/catalog.py" "$TOOLS/resolve.py"; then
    log info "writing resolver catalog (catalog.py)"
    python3 catalog.py
  fi
  log info "assets ready in $(( $(date +%s) - start )) s"
fi

cd /app
exec node /app/avatar/worker/worker.mjs "$@"
