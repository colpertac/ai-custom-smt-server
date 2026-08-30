# Proxmox Ubuntu smoke (Phase 14)

Goal: run the full MVP stack on the Ubuntu VM (or bare-metal host) with
**Docker Hub pulls only** — no COMP toolchain, no website build, no `docker load`.

| Image   | Hub                            |
| ------- | ------------------------------ |
| Game    | `colpertac/smt-comp:latest`    |
| Website | `colpertac/smt-website:latest` |
| Updater | `nginx:1.27-alpine` (official) |

**Data / updater files** still come from the SMB stage (or rsync). Prefer a
**local disk** path on the server (e.g. `/opt/smt`). If the staged tree already
lives on local disk under the Samba export (same machine as `192.168.0.230`),
you can run from that path after `chown` — do **not** run Docker against a
CIFS client mount.

NAS stage (build PC): `/mnt/axecat/smt/` → `//192.168.0.230/Playground/smt`

---

## A — Stage from the build PC

```bash
# Publish images when they change (from this repo):
./deploy/scripts/docker-push-hub.sh
./deploy/scripts/docker-push-website-hub.sh

# Refresh updater overlay (local dev machine — not in this repo):
#   seed-updater-base.sh --overlay-only && build-updater-overlay.sh

# Copy compose + data + updater to the share (or use the zip bundler):
./deploy/scripts/stage-proxmox-bundle.sh
# Generic zip (scp/Oracle): ./deploy/scripts/make-deploy-bundle.sh -o /tmp/smt-deploy.zip
```

Staged layout:

```text
bundle/     # compose, entrypoint, nginx, scripts, .env.example
updater/    # overlay-only hashlist + custom files
data/       # portable runtime (SQLite)
README.md
```

---

## B — On the Ubuntu host (`192.168.0.230`)

### 1. Docker (once)

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-v2
sudo usermod -aG docker "$USER"
# re-login
```

### 2. Install tree on local disk

If Samba already exports a **local** folder (recommended when host == NAS):

```bash
# find export path, e.g. /srv/Playground/smt
SMT=/path/to/Playground/smt
cd "$SMT"
cp -a bundle/. .
sudo chown -R "$USER:$USER" .
```

Or copy off the share onto `/opt/smt`:

```bash
sudo mkdir -p /opt/smt && sudo chown "$USER:$USER" /opt/smt
SMT=/opt/smt
rsync -a /mnt/share/smt/bundle/  "$SMT/"
rsync -a /mnt/share/smt/updater/ "$SMT/updater/"
rsync -a /mnt/share/smt/data/    "$SMT/data/"
cd "$SMT"
```

### 3. `.env`

```bash
cd "$SMT"
cp .env.example .env
```

Set at least:

```bash
EXTERNAL_IP=192.168.0.230
SESSION_SECRET=$(openssl rand -base64 48)   # paste into .env
UPDATER_ROOT=/absolute/path/to/updater      # e.g. $SMT/updater
COMP_RUNTIME=/absolute/path/to/data
COMP_ENTRYPOINT=/absolute/path/to/entrypoint.sh
UPDATER_NGINX_CONF=/absolute/path/to/nginx/updater.conf
WEBSITE_IMAGE=colpertac/smt-website:latest
COMP_IMAGE=colpertac/smt-comp:latest
WEBSITE_PORT=3000
UPDATER_PORT=8765
```

SQLite configs:

```bash
cp config/sqlite/{lobby,world,channel}.xml data/config/
```

### 4. Pull and start

```bash
cd "$SMT"
docker compose pull
docker compose up -d
docker compose ps
```

Expect healthy: `lobby`, `world`, `channel`, `website`, `updater`.

### 5. Smoke from your PC

```bash
curl -sI http://192.168.0.230:3000/ | head -5
curl -sI http://192.168.0.230:8765/ | head -5
curl -sI http://192.168.0.230:8765/files/hashlist.dat | head -5
```

Client updater (`ImagineUpdate-user.dat`) and lobby target (`VersionData*.txt`):
see the full IP checklist in [guides/client-host-config.md](../guides/client-host-config.md).

```ini
[Setting]
BaseURL1 = http://192.168.0.230:8765/files
Information = http://192.168.0.230:8765/
```

```ini
[versions]
server = 192.168.0.230:10666
```

Website: `http://192.168.0.230:3080/` (or `:3000` if free).  
Game: lobby `10666`, channel `14666` (`EXTERNAL_IP` from `.env`).

### 6. Firewall (if ufw)

```bash
sudo ufw allow 10666/tcp
sudo ufw allow 14666/tcp
sudo ufw allow 3000/tcp
sudo ufw allow 8765/tcp
# 10999 stays on 127.0.0.1 inside the host
```

---

## Updating later

| Change         | Build PC                                         | Server                                        |
| -------------- | ------------------------------------------------ | --------------------------------------------- |
| Game binaries  | `docker-push-hub.sh`                             | `docker compose pull && docker compose up -d` |
| Website        | `docker-push-website-hub.sh`                     | same                                          |
| Client overlay | `build-updater-overlay.sh` + re-stage `updater/` | rsync `updater/`                              |
| Game DB/data   | re-stage `data/` or backup/restore               | rsync / restore                               |

---

## Done when

- [x] `docker compose ps` all healthy
- [x] Website + updater reachable at `192.168.0.230`
- [x] Client updates (overlay-only) and logs in
