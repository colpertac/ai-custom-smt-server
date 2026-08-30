#!/usr/bin/env bash
# Export COMP shop → item reverse index for the wiki.
#
# Usage:
#   scripts/wiki-export-comp-shops.sh
#
# Writes: website/content/wiki/item-comp-shops.json
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/website"
pnpm exec tsx --tsconfig tsconfig.json scripts/wiki-export-comp-shops.ts
