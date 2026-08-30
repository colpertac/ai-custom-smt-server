# Client BinaryData

Client BinaryData controls names, descriptions, icons, models, skills, items,
demons, maps, and other client-facing definitions. COMP_hack also loads many
of the same tables on the server.

## Guides

- [Extract, edit, and rebuild a table](round-trip.md)
- [Create a custom item](custom-item.md)
- [Create a custom demon](custom-demon.md)

## Project layout

```text
ai_custom_smt_server/
├── client-source/BinaryData/    # editable extracted XML (gitignored)
├── client-overlay/BinaryData/   # rebuilt client output (gitignored)
└── scripts/
    ├── build-client-overlay.sh
    ├── apply-client-overlay.sh
    └── install-shield-overlay.sh
```

`client-overlay/` is the only client distribution output. Do not hand-edit
generated `.bin` or `.sbin` files there.

## The two common table locations

| Location | Encryption | Typical role |
| --- | --- | --- |
| `BinaryData/Client/*.bin` | None | Client-only messages and presentation |
| `BinaryData/Shield/*.sbin` | Shield-encrypted | Shared gameplay/display definitions |

`comp_bdpatch` reads and writes plaintext BinaryData. Shield files must be
decrypted before loading and encrypted after saving.

## Important rules

1. Round-trip a stock table without edits before changing it.
2. Rebuild the complete table; a one-record file replaces, rather than merges
   with, the stock table.
3. Keep client and server definitions synchronized.
4. Test through a disposable client before modifying the live client.
5. Loose server BinaryData overrides package ZIP content, so replacement
   Shield tables must be installed as loose files.

The schemas under
`/home/cat/repos/smt/comp_hack/libcomp/libcomp/schema/binarydata/` are the
authoritative member reference.
