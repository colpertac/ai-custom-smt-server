// Stub build.nut for comp_translator (Phase 8 later batches).
// Run from translation/ with:
//   /home/cat/repos/smt/comp_hack/build-current/bin/comp_translator build.nut
//
// MVP day-to-day work uses scripts/translation-extract-table.sh + comp_bdpatch.
// Expand CLIENT_FILES / SHIELD_FILES as XML sources land under extract/.

OUT_DIR <- "build";

CLIENT_FILES <- {
  // "CMessageData_SysHelp": "cmessage",
};

SHIELD_FILES <- {
  // "CItemData": "citem",
};

function main() {
  print("Phase 8 build.nut stub — enable CLIENT_FILES/SHIELD_FILES when ready.\n");
  return 0;
}
