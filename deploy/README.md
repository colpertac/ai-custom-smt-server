# Deploy — Phase 14 Docker runtime

Hub images:

| Image                     | Role                                |
| ------------------------- | ----------------------------------- |
| **colpertac/smt-comp**    | lobby / world / channel             |
| **colpertac/smt-website** | Next.js account site                |
| `nginx:1.27-alpine`       | updater static files                |
| **ops** (compose build)   | admin control plane (Docker socket) |

**Quick start (Docker already installed):**

```bash
# Linux / mac — prompts for install path (default /opt/smt), copies deploy+ops there
# Flags are lowercase and case-sensitive (--domain, not --Domain). Order does not matter.
./install.sh --ip YOUR.PUBLIC.IP
./install.sh --ip YOUR.PUBLIC.IP --prefix /opt/smt

# Optional HTTPS (Caddy + Let's Encrypt). DNS A/AAAA must point at this host.
# Without --domain the stack stays HTTP on :3000 (website) and :8765 (updater).
# With --domain, open https://your.domain (not http://IP:3000) — login cookies are
# Secure/HTTPS-only and CSRF expects that origin. EXTERNAL_IP is still used for
# game TCP (lobby/channel). Needs ports 80+443 reachable for Let's Encrypt.
./install.sh --ip YOUR.PUBLIC.IP --domain play.example.com
./install.sh --ip YOUR.PUBLIC.IP --prefix /opt/smt --domain play.example.com

# Windows PowerShell (Docker Desktop) — default C:\smt
# PowerShell uses PascalCase params (-Ip, -Domain, -Prefix); order does not matter.
.\install.ps1 -Ip YOUR.PUBLIC.IP
.\install.ps1 -Ip YOUR.PUBLIC.IP -Prefix "$env:USERPROFILE\smt"   # no admin needed
.\install.ps1 -Ip YOUR.PUBLIC.IP -Domain play.example.com         # optional HTTPS
```

If the default path is not writable, the script stops with instructions (Linux:
`sudo mkdir` + `chown`; Windows: run as Administrator or use a folder under your profile).

See [youtube-1.0-setup.md](../docs/youtube-1.0-setup.md) for the recording checklist.

Guides: [docker-hub.md](../docs/docker-hub.md), [proxmox-smoke.md](../docs/proxmox-smoke.md),
[website-updater-docker.md](../docs/website-updater-docker.md), [oracle-vps.md](../docs/oracle-vps.md),
[install-defaults.md](../docs/install-defaults.md) (what ships in seeds / images).

```bash
# Publish (build PC — clone comp_hack as sibling ../comp_hack)
./scripts/docker-push-hub.sh
./scripts/docker-push-website-hub.sh

# GitHub release asset: deploy/ + ops/ only (Hub images pulled on install)
./scripts/make-release-zip.sh
# ./scripts/make-release-zip.sh --upload v1.0.0   # attach to an existing release tag

# Manual run (without install script)
cp .env.example .env   # EXTERNAL_IP, SESSION_SECRET, OPS_TOKEN, UPDATER_ROOT, …
mkdir -p website-data/server-content/{config,shops,payouts,report-rewards}
mkdir -p updater/{base,overlay,site}
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
