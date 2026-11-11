#!/usr/bin/env bash
# Run Dump.java read-only against an analyzed ImagineClient.exe Ghidra project.
#
# Usage: run-dump.sh <projectDir> <decomp|xrefs|strings|label> <out> ...
#   e.g. run-dump.sh ~/software/smt/ghidra decomp /tmp/out 1 0x460590
#
# Env: GHIDRA_HOME (default /opt/ghidra_12.2_PUBLIC), GHIDRA_PROJECT_NAME (default imagine),
#      GHIDRA_HEADLESS_MAXMEM (default 4G). "label" needs a writable project: set DUMP_WRITABLE=1.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PROJ="$1"; shift
GHIDRA_HOME="${GHIDRA_HOME:-/opt/ghidra_12.2_PUBLIC}"
RO="-readOnly"
[[ "${DUMP_WRITABLE:-0}" == "1" ]] && RO=""
GHIDRA_HEADLESS_MAXMEM="${GHIDRA_HEADLESS_MAXMEM:-4G}" "$GHIDRA_HOME/support/analyzeHeadless" \
  "$PROJ" "${GHIDRA_PROJECT_NAME:-imagine}" -process ImagineClient.exe -noanalysis $RO \
  -scriptPath "$HERE" -postScript Dump.java "$@" 2>&1 \
  | grep -E 'Dump.java>|ERROR|Exception' || true
