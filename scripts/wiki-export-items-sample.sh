#!/usr/bin/env bash
# Legacy sample export — prefer scripts/wiki-export.sh for the full catalog.
#
# Writes: website/content/wiki/items-sample.json (9-item dev subset)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec "$ROOT/scripts/wiki-export-items-sample-legacy.sh"
