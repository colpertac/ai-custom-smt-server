#!/bin/sh
# nextjs is uid 1001. Bind-mounted portrait dirs are often root:root — chmod
# here so studio ingest cannot 500 with EACCES (the old image-only public/ dir).
set -e

ensure_writable() {
  dir=$1
  mkdir -p "$dir"
  chown nextjs:nodejs "$dir" 2>/dev/null || true
  chmod a+rwX "$dir" 2>/dev/null || true
}

ensure_writable /app/public/armory/portraits
data=${WEBSITE_DATA_DIR:-/website-data}
if [ -d "$data" ]; then
  ensure_writable "$data/armory/portraits"
  ensure_writable "$data/portrait-captures"
fi

if [ "$(id -u)" = "0" ]; then
  exec setpriv --reuid=1001 --regid=1001 --init-groups -- "$@"
fi
exec "$@"
