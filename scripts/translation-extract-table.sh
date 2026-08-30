#!/usr/bin/env bash
# Extract one BinaryData table from Reimagine and/or vanilla JP for translation.
#
# Usage:
#   scripts/translation-extract-table.sh cmessage Client/CMessageData_SysHelp.bin
#   scripts/translation-extract-table.sh citem Shield/CItemData.sbin
#
# TYPE is a comp_bdpatch type. PATH is relative to BinaryData/.
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 TYPE BinaryDataRelPath" >&2
  echo "Example: $0 cmessage Client/CMessageData_SysHelp.bin" >&2
  exit 1
fi

TYPE="$1"
REL="$2"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="${BIN:-/home/cat/repos/smt/comp_hack/build-current/bin}"
REI="${REI:-/home/cat/software/smt/game/reimagine}"
JP="${JP:-/home/cat/software/smt/game/smt_1666/MegaTen jp}"
EXTRACT="${ROOT}/translation/extract"
BASE="$(basename "$REL")"
STEM="${BASE%.*}"
IS_SHIELD=0
[[ "$REL" == Shield/* ]] && IS_SHIELD=1

mkdir -p "$EXTRACT/reimagine" "$EXTRACT/jp" "$EXTRACT/work"

extract_one() {
  local label="$1" client_root="$2"
  local src="$client_root/BinaryData/$REL"
  local out_dir="$EXTRACT/$label"
  local plain="$EXTRACT/work/${label}-${STEM}.plain.bin"

  if [[ ! -f "$src" ]]; then
    echo "Missing: $src" >&2
    return 1
  fi

  if [[ "$IS_SHIELD" -eq 1 ]]; then
    "$BIN/comp_decrypt" "$src" "$plain"
  else
    cp -f "$src" "$plain"
  fi

  "$BIN/comp_bdpatch" load "$TYPE" "$plain" "$out_dir/${STEM}.xml"
  "$BIN/comp_bdpatch" flatten "$TYPE" "$plain" "$out_dir/${STEM}.tsv"
  echo "Wrote $out_dir/${STEM}.{xml,tsv}"
}

extract_one reimagine "$REI"
extract_one jp "$JP"

echo
echo "Next: compare TSVs, update glossary, edit reimagine XML (or a new EN XML),"
echo "then: $BIN/comp_bdpatch save $TYPE … && overlay to a disposable client."
