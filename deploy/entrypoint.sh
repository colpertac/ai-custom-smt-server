#!/usr/bin/env bash
# Entrypoint: patch network placeholders in config, then exec COMP.
# Placeholders (optional): __EXTERNAL_IP__ __LOBBY_HOST__ __WORLD_HOST__ __MARIADB_HOST__
# Patched file stays next to the source so sibling constants.xml resolves.
set -euo pipefail

mkdir -p /comp/config /comp/database /comp/datastore /comp/webroot /comp/logs
cd /comp

if [[ $# -lt 1 ]]; then
  echo "usage: $0 comp_lobby|comp_world|comp_channel [config.xml]" >&2
  exit 1
fi

bin="$1"
shift

if [[ $# -ge 1 && -f "$1" ]]; then
  src="$1"
  shift
  # Same directory as source (COMP resolves constants.xml beside the config).
  tmp="$(dirname "$src")/.runtime-$(basename "$src")"
  external_ip="${EXTERNAL_IP:-127.0.0.1}"
  lobby_host="${LOBBY_HOST:-lobby}"
  world_host="${WORLD_HOST:-world}"
  mariadb_host="${MARIADB_HOST:-mariadb}"
  sed \
    -e "s|__EXTERNAL_IP__|${external_ip}|g" \
    -e "s|__LOBBY_HOST__|${lobby_host}|g" \
    -e "s|__WORLD_HOST__|${world_host}|g" \
    -e "s|__MARIADB_HOST__|${mariadb_host}|g" \
    "$src" >"$tmp"
  exec "$bin" "$tmp" "$@"
fi

exec "$bin" "$@"
