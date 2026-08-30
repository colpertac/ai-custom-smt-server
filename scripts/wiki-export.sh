#!/usr/bin/env bash
# Full wiki content export (items JSON + icon PNGs).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
"$ROOT/scripts/wiki-export-items.sh"
"$ROOT/scripts/wiki-export-enchants.sh"
"$ROOT/scripts/wiki-export-armory-stats.sh"
"$ROOT/scripts/wiki-export-comp-shops.sh"
"$ROOT/scripts/wiki-export-item-icons.sh"
