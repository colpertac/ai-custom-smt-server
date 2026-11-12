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

# Host website port already taken (e.g. Next.js dev on :3000)? Map a free port:
./install.sh --ip YOUR.PUBLIC.IP --website-port 3666
# Or after install: set WEBSITE_PORT=3666 and SITE_URL=http://YOUR.IP:3666 in .env,
# then docker compose up -d website. Container still listens on 3000 internally.

# Windows PowerShell (Docker Desktop) — default C:\smt
# PowerShell uses PascalCase params (-Ip, -Domain, -Prefix, -WebsitePort); order does not matter.
.\install.ps1 -Ip YOUR.PUBLIC.IP
.\install.ps1 -Ip YOUR.PUBLIC.IP -Prefix "$env:USERPROFILE\smt"   # no admin needed
.\install.ps1 -Ip YOUR.PUBLIC.IP -Domain play.example.com         # optional HTTPS
.\install.ps1 -Ip YOUR.PUBLIC.IP -WebsitePort 3666                # if host :3000 is busy
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
# If you changed deploy/ or ops/, rebuild and replace the zip on the release:
./scripts/make-release-zip.sh -o /tmp/smt-deploy-ops.zip --upload v1.0.0
# ./scripts/make-release-zip.sh --upload v1.0.0   # timestamped filename (new asset)

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

## Portrait render worker (optional, profile `renderer`)

`avatar-worker` renders armory portraits with three.js in headless Chrome; it is the only
portrait renderer (contract: [avatar/docs/WORKER.md](../avatar/docs/WORKER.md)).
It is off unless the `renderer` profile is enabled; without it armory pages show the
placeholder portrait and nothing is queued.
The image is built from a repo checkout (`context: ..` needs `avatar/` and the gitignored
`ops/comp-tools/comp_decrypt` + `comp_bdpatch`); the release zip alone cannot build it.

```bash
# .env
COMPOSE_PROFILES=renderer            # add to an existing list: https,renderer
PORTRAIT_WORKER_TOKEN=…              # same token the website expects (Admin → Portraits)
IMAGINE_CLIENT_DIR=/path/to/reimagine   # host path, mounted read-only at /client
AVATAR_NIF_DIR=/path/to/dir-with-nif.xml  # NifSkope's nif.xml; read only when converting

docker compose --profile renderer build avatar-worker
docker compose up -d avatar-worker
docker compose logs -f avatar-worker   # one JSON object per line
```

| Variable | Default | What |
| --- | --- | --- |
| `PORTRAIT_QUEUE_URL` | `http://website:3000` | Website base URL (queue + heartbeat), on the compose network |
| `PORTRAIT_WORKER_TOKEN` | — | `X-Portrait-Worker-Token`; the worker exits if empty |
| `IMAGINE_CLIENT_DIR` | `./client` | Host path of the game client (needs `Avatar/`, `BinaryData/`, `ImagineClient.exe`) |
| `AVATAR_NIF_DIR` | `./avatar-worker` | Host dir containing `nif.xml` |
| `PORTRAIT_WORKER_ID` | `three-docker` | Name shown in Admin → Portraits |
| `PORTRAIT_POLL_MS` / `PORTRAIT_SSAA` | `2000` / `3` | Claim interval when idle; supersampling (changing it changes the PNGs) |
| `AVATAR_CONVERT_JOBS` | all cores | `convert.py -j` on start |
| `AVATAR_WORKER_IMAGE` | `smt-avatar-worker:local` | Image tag |

On start the container brings the `avatar-assets` volume up to date from the client
(`tables.py`, incremental `convert.py all`, `catalog.py`: about 10 s and 420 MB the first
time, under a second afterwards), then runs the worker. Armory misses are queued only while
the worker's heartbeat is fresh (60 s). Golden check inside the container:
`docker compose run --rm --entrypoint node avatar-worker avatar/worker/golden.mjs`.
