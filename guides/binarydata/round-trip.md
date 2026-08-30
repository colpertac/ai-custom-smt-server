# BinaryData round-trip workflow

Extract a table to XML, edit it, rebuild it, and install it through
`client-overlay/`.

## Tools

```bash
BIN=/home/cat/repos/smt/comp_hack/build-current/bin
```

| Tool | Role |
| --- | --- |
| `comp_bdpatch load TYPE IN OUT` | Plain BinaryData to XML |
| `comp_bdpatch save TYPE IN OUT` | XML to plain BinaryData |
| `comp_bdpatch flatten TYPE IN OUT` | Table to TSV for scanning |
| `comp_decrypt IN OUT` | Shield `.sbin` to plain BinaryData |
| `comp_encrypt IN OUT` | Plain BinaryData to Shield `.sbin` |

Run `comp_bdpatch` with no arguments for the complete type list.

## Unencrypted Client table

Phase 2 changed English basic-command help:

```bash
CLIENT=/home/cat/software/smt/game/reimagine
SRC=/home/cat/repos/smt/ai_custom_smt_server/client-source/BinaryData/Client
OUT=/home/cat/repos/smt/ai_custom_smt_server/client-overlay/BinaryData/Client

"$BIN"/comp_bdpatch load cmessage \
  "$CLIENT/BinaryData/Client/CMessageData_basicCommandHelp.bin" \
  "$SRC/CMessageData_basicCommandHelp.xml"

# Edit message ID 1 (Sit), then rebuild:
"$BIN"/comp_bdpatch save cmessage \
  "$SRC/CMessageData_basicCommandHelp.xml" \
  "$OUT/CMessageData_basicCommandHelp.bin"
```

## Encrypted Shield table

```bash
"$BIN"/comp_decrypt path/to/Foo.sbin /tmp/Foo.plain.bin
"$BIN"/comp_bdpatch load <type> /tmp/Foo.plain.bin /tmp/Foo.xml

# Edit the XML, preserving every stock record.

"$BIN"/comp_bdpatch save <type> /tmp/Foo.xml /tmp/Foo.plain.bin
"$BIN"/comp_encrypt /tmp/Foo.plain.bin path/to/overlay/Foo.sbin
```

Use regular intermediate files, not pipes, for large tables such as
`ItemData` and `CItemData`.

## Verification

Before editing, an identity round-trip should be byte-identical:

```bash
cmp stock.plain.bin rebuilt.plain.bin
```

After editing, reload the rebuilt plaintext and confirm both a stock record
and the custom record still exist:

```bash
"$BIN"/comp_bdpatch load <type> rebuilt.plain.bin verify.xml
```

## Build and apply this project

```bash
cd /home/cat/repos/smt/ai_custom_smt_server
./scripts/build-client-overlay.sh
./scripts/apply-client-overlay.sh /path/to/disposable-client
```

`apply-client-overlay.sh` overwrites matching paths. It does not restore stock
files.

## Safe disposable client

```bash
cp -al /home/cat/software/smt/game/reimagine \
       /home/cat/software/smt/game/reimagine-test

# Break hardlinks for files that the overlay will replace.
rm -f /home/cat/software/smt/game/reimagine-test/BinaryData/Shield/ItemData.sbin
rm -f /home/cat/software/smt/game/reimagine-test/BinaryData/Shield/CItemData.sbin

./scripts/apply-client-overlay.sh \
  /home/cat/software/smt/game/reimagine-test
```

Keep the Phase 0 backup for restoring the live client.
