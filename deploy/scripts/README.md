# Deploy scripts

Build and publish Docker images, or pack a file bundle for VPS transfer.

Run from the **repository root** (or `cd deploy` and use `./scripts/…`).

| Script | Purpose |
| --- | --- |
| `docker-pack-runtime.sh` | Stage COMP binaries → build `smt-comp:local` |
| `docker-push-hub.sh` | Pack + push `colpertac/smt-comp` |
| `docker-push-website-hub.sh` | Build + push `colpertac/smt-website` |
| `make-deploy-bundle.sh` | Zip compose + local `data/` + `updater/` for scp |
| `stage-proxmox-bundle.sh` | Copy bundle to SMB share (homelab) |

**Prereqs:** `../comp_hack` built (`comp_lobby`, `comp_world`, `comp_channel`).
Override binary path: `BIN_SRC=/path/to/bin ./docker-pack-runtime.sh`.

Docs: [../docs/docker-hub.md](../docs/docker-hub.md), [../README.md](../README.md).
