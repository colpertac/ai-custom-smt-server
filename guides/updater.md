# Client updater overlay

HTTP distribution for custom client files using COMP's overlay-first updater
model. Manual overlay copy remains valid for quick local tests; this guide is
for the **updater path** (Phase 9).

## Prerequisites

- `comp_rehash` built: `cmake --build build-current --target comp_rehash -j2`
- Populated `client-overlay/` (see [BinaryData round-trip](binarydata/round-trip.md)
  and [translation](translation.md))
- Disposable client directory (do not point your daily Reimagine install at dev
  servers until intentional)

## One-time setup

```bash
cd /home/cat/repos/smt/ai_custom_smt_server
cp updater/config.env.example updater/config.env
cmake --build /home/cat/repos/smt/comp_hack/build-current --target comp_rehash -j16
./scripts/seed-updater-base.sh --overlay-only
```

**`--overlay-only` (recommended for private server / Proxmox / Oracle):** base
hashlist is empty of stock files. After rehash, the published `hashlist.dat`
lists **only** files under `client-overlay/` / `updater/overlay/`. The updater
will not try to download `SItemData` and other vanilla files you are not hosting.

Full-catalog mode (`./scripts/seed-updater-base.sh` copying
`ImagineUpdate2.dat`) lists ~all Reimagine files. That only works if you also
host `base/*.compressed` (clean-install mirror) — deferred.

## Publish overlay changes (every client content update)

Whenever you change `client-overlay/` (translations, Shield tables, Event, …):

```bash
./scripts/build-client-overlay.sh     # if client-source XML changed
./scripts/build-updater-overlay.sh    # rsync + comp_rehash — required
```

`build-updater-overlay.sh` writes into `updater/overlay/`:

- `hashlist.dat`, `hashlist.ver`, `hashlist.dat.compressed`
- `*.compressed` for each uncompressed file in the overlay tree

Docker nginx mounts that tree read-only — **no container rebuild**; just rehash
and clients pick up the new hashlist on next update run.

## Client configuration

**Host/IP checklist** (VersionData, ImagineUpdate-user, ExternalIP, webaccess):
[client-host-config.md](client-host-config.md).

**Prefer `ImagineUpdate-user.dat`** for your local BaseURL. The COMP updater
reads that file first if it exists, and Settings → Save does **not** overwrite
it.

```bash
cp updater/ImagineUpdate-user.dat.example /path/to/client/ImagineUpdate-user.dat
```

```ini
[Setting]
BaseURL1 = http://127.0.0.1:8765/files
Information = http://127.0.0.1:8765/
```

Plain `ImagineUpdate.dat` is fragile: saving Settings replaces it from
`translations/ImagineUpdate_<locale>.dat` (Reimagine ships production URLs
there). The overlay ships local copies of those translation templates so a
Settings save no longer reverts to `dl.reimagine.online`.

[VersionData.txt.example](../updater/VersionData.txt.example) lists server tags
and tagged files (typically `webaccess.sdat`). On Play, the updater copies
`webaccess.sdat.<tag>` → `webaccess.sdat` (for tag `local`, that is
`webaccess.sdat.local`). Build it from
[webaccess.dat.example](../updater/webaccess.dat.example):

```bash
comp_encrypt updater/webaccess.dat.example client-overlay/webaccess.sdat.local
./scripts/build-updater-overlay.sh
```

Run `ImagineUpdate.exe` from the disposable client directory.

## Client patches (`comp_client-user.xml`)

Updater **Settings → Save** writes `comp_client-user.xml`, which overrides
`comp_client.xml`. Two toggles matter for Wine / private-server use:

| Patch | Private-server default | If flipped |
| --- | --- | --- |
| `noWebAuth` | `apply` (native login) | `skip` → Scaleform web login (often a white box under Wine) |
| `updaterCheck` | `skip` (allow `wine ImagineClient.exe`) | `apply` → “must be started from the updater” unless `HACKFROST=dualwield` |

Restore with [comp_client-user.xml.example](../updater/comp_client-user.xml.example), or delete
`comp_client-user.xml` and rely on base `comp_client.xml`.

## Related

Production nginx tries `overlay/` then `base/` for each `/files/...` request.
The local Python server does the same. Unchanged files are already on disk in
the client; only hashes that differ trigger downloads.

## Related

- COMP guide: `/home/cat/repos/smt/comp_hack/docs/guide/chapters/setup.rst`
  (Client Updater with Nginx)
- Manual overlay: `scripts/apply-client-overlay.sh`
- Phase notes: [AI/phases/phase9.md](../AI/phases/phase9.md)
