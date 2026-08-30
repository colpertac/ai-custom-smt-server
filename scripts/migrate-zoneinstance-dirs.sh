#!/usr/bin/env bash
# Idempotent: split stock zoneinstance(+variant).xml into directories so packages
# can add files without skipping the stock definitions (LoadObjects fileOrPath).

set -euo pipefail

DATASTORE_DATA="${DATASTORE_DATA:-/home/cat/repos/smt/comp_hack/runtime/datastore/data}"
REPO_DATA="${REPO_DATA:-/home/cat/repos/smt/comp_hack/datastore/data}"

migrate_one() {
  local base_dir="$1"
  local stem="$2" # zoneinstance | zoneinstancevariant
  local file="${base_dir}/${stem}.xml"
  local dir="${base_dir}/${stem}"
  local stock="${dir}/00_stock.xml"

  if [[ -d "${dir}" ]]; then
    if [[ -f "${stock}" ]]; then
      echo "ok: ${dir}/ already has 00_stock.xml"
      return 0
    fi
    if [[ -f "${file}" ]]; then
      echo "error: both ${file} and ${dir}/ exist without 00_stock.xml" >&2
      return 1
    fi
    echo "warn: ${dir}/ exists but has no 00_stock.xml; leaving as-is" >&2
    return 0
  fi

  if [[ ! -f "${file}" ]]; then
    echo "skip: ${file} not found"
    return 0
  fi

  mkdir -p "${dir}"
  mv "${file}" "${stock}"
  echo "migrated: ${file} -> ${stock}"
}

echo "Migrating under ${DATASTORE_DATA}"
migrate_one "${DATASTORE_DATA}" zoneinstance
migrate_one "${DATASTORE_DATA}" zoneinstancevariant

if [[ -d "${REPO_DATA}" ]]; then
  echo
  echo "Migrating under ${REPO_DATA} (repo mirror)"
  migrate_one "${REPO_DATA}" zoneinstance
  migrate_one "${REPO_DATA}" zoneinstancevariant
fi

echo
echo "Done. Packages may now add data/zoneinstance/*.xml and"
echo "data/zoneinstancevariant/*.xml without replacing stock."
