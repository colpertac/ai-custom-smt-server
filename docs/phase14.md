# Phase 14 — Containerized server deployment

Started 2026-07-22. Portable `runtime/` + Docker Hub + DB backends + bridge net.

## Goal

Ship **prebuilt amd64 images** so a VM can run lobby + world + channel with
`docker compose` and **no COMP toolchain**.

## Docker Hub

| Image | https://hub.docker.com/r/colpertac/smt-comp |
| Tag | `latest`, dated `YYYYMMDD` |

**Guides:** [docker-hub.md](docker-hub.md) (`smt-comp` + `smt-website`),
[proxmox-smoke.md](proxmox-smoke.md), [website-updater-docker.md](website-updater-docker.md).
Backup/restore: [backup-restore.md](backup-restore.md).

```bash
# Publish (build host)
JOBS=16 /home/cat/repos/smt/comp_hack/scripts/build.sh
/home/cat/repos/smt/ai_custom_smt_server/scripts/docker-push-hub.sh

# Run (any host) — see also ~/docker/smt
cd ~/docker/smt
# set EXTERNAL_IP in .env (127.0.0.1 local; public IP for remote)
docker compose pull && docker compose up -d
```

## Portable server root

```text
comp_hack/runtime/   # or ~/docker/smt/data/
├── config/          # placeholders patched by entrypoint
├── database/        # SQLite
├── mariadb/         # MariaDB datadir (profile)
├── datastore/
├── webroot/
└── logs/
```

Networking: **bridge**. Published: lobby `10666`/`10999`, channel `14666`.
Internal DNS: `lobby`, `world`, `channel`, `mariadb`. Channel `ExternalIP` from
`EXTERNAL_IP` in `.env`.

## Still open

- [x] Healthchecks / ordered readiness
- [x] Bridge networking + ExternalIP for remote clients
- [x] Website + updater containers (MVP)
  — [website-updater-docker.md](website-updater-docker.md)
- [x] Backup / restore runbook for `runtime/` / `./data` (SQLite + MariaDB)
  — [backup-restore.md](backup-restore.md), `deploy/scripts/backup.sh` + `restore.sh`
- [x] Proxmox smoke pulling only from Hub + copied `data/` (+ website/updater)
  — [proxmox-smoke.md](proxmox-smoke.md); stage with `scripts/stage-proxmox-bundle.sh`
  onto `/mnt/axecat/smt/`, then run from **local disk** on the Ubuntu VM
  (passed 2026-07-23: login + play)
- [x] Optional MariaDB via compose profile + config templates
