# Phase 9 Notes

Started 2026-07-20.

See [updater/README.md](../updater/README.md) and [guides/updater.md](../guides/updater.md).

## Goal

Distribute custom client files (BinaryData, Event, later translations) through
the COMP updater HTTP overlay instead of manual `apply-client-overlay.sh` only.

Homelab / Proxmox nginx is **post-MVP**. MVP runs on this dev machine with a
small Python static server (`overlay` → `base` fallback).

## Layout

| Path | Role |
| --- | --- |
| `updater/base/` | `hashlist.dat` (+ optional full `*.compressed` mirror) |
| `updater/overlay/` | Replacement files + `comp_rehash` output |
| `updater/site/` | Static page for updater UI |
| `scripts/seed-updater-base.sh` | Copy hashlist into `base/` |
| `scripts/sync-updater-overlay.sh` | `client-overlay/` → `overlay/` |
| `scripts/build-updater-overlay.sh` | sync + `comp_rehash` |
| `scripts/serve-updater-local.py` | local HTTP on `127.0.0.1:8765` |

## MVP (same machine)

| Step | Status |
| --- | --- |
| Directory layout + config examples | Done |
| `comp_rehash` built (`JOBS=2`) | Done |
| Seed base (`--overlay-only` for MVP) | Done |
| Sync + rehash overlay | Done |
| Local overlay-first HTTP serve | Done (Python + Docker nginx) |
| Local `webaccess.sdat.local` (login → `:10999`) | Done |
| Disposable client + patched `ImagineUpdate.dat` QA | Done (Wine) |
| `ImagineUpdate-user.dat` + translation URL templates | Done |
| `comp_client-user.xml` pitfalls documented | Done |
| nginx / Docker updater service | Done (Phase 14) |
| Full vanilla 1.666 `base/*.compressed` mirror | Deferred |
| Clean install from empty client | Deferred |

## Commands

```bash
cd /home/cat/repos/smt/ai_custom_smt_server
cp updater/config.env.example updater/config.env

cmake --build /home/cat/repos/smt/comp_hack/build-current --target comp_rehash -j16
./scripts/seed-updater-base.sh --overlay-only   # private-server default
./scripts/build-client-overlay.sh               # when client-source changed
./scripts/build-updater-overlay.sh              # every overlay publish
# Docker already serves updater/; or: ./scripts/serve-updater-local.py
```

**Rehash every time** you change `client-overlay/`. Skipping rehash leaves an
stale `hashlist.dat` / missing `*.compressed` and clients 404 or skip updates.

Disposable client QA:

```bash
CLIENT=/home/cat/software/smt/game/reimagine-phase9-updater-test
rsync -a --delete /home/cat/software/smt/game/reimagine/ "$CLIENT/"
cp updater/ImagineUpdate.dat.example "$CLIENT/ImagineUpdate.dat"
# run ImagineUpdate.exe from $CLIENT
```

## Base hashlist source

`comp_rehash` requires `base/hashlist.dat`.

| Mode | Command | Use when |
| --- | --- | --- |
| **Overlay-only** (default) | `seed-updater-base.sh --overlay-only` | Private server; host only custom files |
| Full catalog | seed from `ImagineUpdate2.dat` | Plus full `base/*.compressed` mirror |

Installed Reimagine stock files can **differ** from `ImagineUpdate2.dat` hashes
(same size, different MD5). Full-catalog without a base mirror causes 404s
(e.g. `SItemData.sbin.compressed`). Overlay-only avoids that.

## Deferred (polish / post-MVP)

- Proxmox Ubuntu VM + nginx (`nginx/updates-local.conf.example`)
- HTTPS, firewall, LAN IP in `ImagineUpdate.dat`
- Interrupted update / rollback test matrix
- Version server packages and overlay together in release scripts
- Ship COMP alternate updater bundle in overlay (Qt build from comp_hack)
- Website download page wired to same update host (Phase 7 polish)
