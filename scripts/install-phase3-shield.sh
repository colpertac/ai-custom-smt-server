#!/usr/bin/env bash
# Compatibility wrapper: installs all present Shield overlay tables.
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/install-shield-overlay.sh" "$@"
