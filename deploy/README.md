# Deploy — Phase 14 Docker runtime

Hub images:

| Image | Role |
| --- | --- |
| **colpertac/smt-comp** | lobby / world / channel |
| **colpertac/smt-website** | Next.js account site |
| `nginx:1.27-alpine` | updater static files |
| **ops** (compose build) | admin control plane (Docker socket) |

**Quick start (Docker already installed):**

```bash
# Linux / mac
./install.sh --ip YOUR.PUBLIC.IP

# Windows PowerShell (Docker Desktop)
.\install.ps1 -Ip YOUR.PUBLIC.IP
```

See [youtube-1.0-setup.md](../docs/youtube-1.0-setup.md) for the recording checklist.

Guides: [docker-hub.md](../docs/docker-hub.md), [proxmox-smoke.md](../docs/proxmox-smoke.md),
[website-updater-docker.md](../docs/website-updater-docker.md), [oracle-vps.md](../docs/oracle-vps.md).

```bash
# Publish (build PC)
../scripts/docker-push-hub.sh
../scripts/docker-push-website-hub.sh

# Manual run (without install script)
cp .env.example .env   # EXTERNAL_IP, SESSION_SECRET, OPS_TOKEN, UPDATER_ROOT, …
mkdir -p website-data/server-content/{config,shops,payouts}
chmod -R a+rwX website-data   # website container runs as uid 1001
docker compose pull && docker compose up -d --build
```

**Disk:** BinaryData + Map uploads need enough free space under `./data` (and
`./updater` for overlays) for the uncompressed zip plus ~256 MiB headroom.

**Password reset email (optional):** Configure in the admin UI — **Admin → Email**
(Resend API key, from address, public site URL). No SSH required. Settings live
in `website-data/web.sqlite`; the lobby reads `website-data/comp-reset-secret`
on startup. Restart lobby once after the first save.

Legacy `.env` vars (`RESEND_*`, `COMP_RESET_SECRET`) still work and are imported
into the admin store on first load.
