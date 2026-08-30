# Ops tools mount

Place Linux amd64 binaries here (or point `OPS_TOOLS_DIR` at another dir).
Compose mounts this at `/opt/comp-tools` (`BIN_DIR` for the ops sidecar).

| Binary | Needed for |
| --- | --- |
| `comp_rehash` | Lane B / overlay hashlist after client content changes |
| `comp_encrypt` | Client prep (`webaccess.sdat`) + Shield BinaryData write |
| `comp_decrypt` | Shield BinaryData read (custom dialog messages) |
| `comp_bdpatch` | Custom `CEventMessage` labels for Dungeon loot NPC packages |

Example (from repo root):

```bash
ln -sf ../../comp_hack/build-localdeps-v31/bin/comp_rehash .
ln -sf ../../comp_hack/build-localdeps-v31/bin/comp_encrypt .
ln -sf ../../comp_hack/build-localdeps-v31/bin/comp_decrypt .
ln -sf ../../comp_hack/build-localdeps-v31/bin/comp_bdpatch .
```

Without `comp_bdpatch` + decrypt/encrypt, Lane A publish still works for
**stock** report-trade costs (10/50/100/…). Custom item costs fail upsert with
a clear error until these tools are present.
