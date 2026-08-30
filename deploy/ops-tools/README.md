# Ops tools mount

`install.sh` stages Linux amd64 binaries from a local **comp_hack** build
(`comp_encrypt`, `comp_rehash`, `comp_decrypt`, `comp_bdpatch`) into this
directory and into `ops/comp-tools/` for the Docker image.

VM installs without comp_hack use **`colpertac/smt-ops:latest`** from Docker Hub
(tools baked in at `/opt/comp-tools`).

Build on the same glibc as `colpertac/smt-comp` (Debian trixie / glibc 2.38+).

| Binary | Needed for |
| --- | --- |
| `comp_rehash` | Lane B / overlay hashlist after client content changes |
| `comp_encrypt` | Client prep (`webaccess.sdat`) + Shield BinaryData write |
| `comp_decrypt` | Shield BinaryData read (custom dialog messages) |
| `comp_bdpatch` | Custom `CEventMessage` labels for Dungeon loot NPC packages |

Manual staging:

```bash
./deploy/scripts/stage-ops-tools.sh
# or: COMP_HACK_DIR=/path/to/comp_hack ./deploy/scripts/stage-ops-tools.sh
```

Without `comp_bdpatch` + decrypt/encrypt, Lane A publish still works for
**stock** report-trade costs (10/50/100/…). Custom item costs fail upsert with
a clear error until these tools are present.
