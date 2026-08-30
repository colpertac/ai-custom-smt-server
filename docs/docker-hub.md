# Docker Hub — build, push, and pull SMT COMP

Published images:

| Image | Hub |
| --- | --- |
| Game | [colpertac/smt-comp](https://hub.docker.com/r/colpertac/smt-comp) |
| Website | [colpertac/smt-website](https://hub.docker.com/r/colpertac/smt-website) |

Tags: `latest` and dated `YYYYMMDD`.

Game image = COMP binaries only (`comp_lobby` / `comp_world` / `comp_channel`).
Config, databases, datastore, updater files, and logs stay on the host.

Networking is **Docker bridge** (not host mode). Clients reach published ports;
inter-server traffic uses service DNS (`lobby`, `world`, `channel`, `mariadb`).

---

## A — Build and upload (dev machine with COMP source)

Prereqs: Docker logged in (`docker login`), COMP built.

```bash
# Build lobby/world/channel
JOBS=16 /home/cat/repos/smt/comp_hack/scripts/build.sh

# Pack + push game image
./deploy/scripts/docker-push-hub.sh

# Build + push website image
./deploy/scripts/docker-push-website-hub.sh
```

Manual equivalent:

```bash
./deploy/scripts/docker-pack-runtime.sh
docker tag smt-comp:local colpertac/smt-comp:latest
docker push colpertac/smt-comp:latest
```

Override Hub user/name:

```bash
DOCKER_HUB_USER=colpertac IMAGE_NAME=smt-comp \
  ./deploy/scripts/docker-push-hub.sh
```

---

## B — Pull and run (any machine, no COMP toolchain)

### 1. Create folder

```bash
mkdir -p ~/docker/smt/data
cd ~/docker/smt
```

### 2. Compose + templates

```bash
REPO=/path/to/ai-custom-smt-server/deploy
cp "$REPO/docker-compose.yml" "$REPO/entrypoint.sh" "$REPO/.env.example" ~/docker/smt/
cp -a "$REPO/config" ~/docker/smt/
cp -a "$REPO/mariadb" ~/docker/smt/
chmod +x ~/docker/smt/entrypoint.sh
cp ~/docker/smt/.env.example ~/docker/smt/.env
```

### 3. Seed `./data`

```bash
rsync -a /home/cat/repos/smt/comp_hack/runtime/ ~/docker/smt/data/
# or: rsync -a /path/to/runtime-backup/ ~/docker/smt/data/
```

```text
data/config/{lobby,world,channel,constants,newcharacter}.xml
data/database/          # SQLite
data/datastore/
data/webroot/
data/logs/
data/mariadb/           # MariaDB profile
```

Configs use **relative** paths and network placeholders:
`__EXTERNAL_IP__`, `__LOBBY_HOST__`, `__WORLD_HOST__`, `__MARIADB_HOST__`
(patched by `entrypoint.sh` from `.env` into `data/config/.runtime-*.xml`
beside the originals so `constants.xml` still resolves).

### 4. Set ExternalIP (required for remote clients)

Edit `~/docker/smt/.env`:

```bash
# Same machine / local client
EXTERNAL_IP=127.0.0.1

# LAN play (example)
# EXTERNAL_IP=192.168.1.50

# VPS / Oracle (public IP or DNS)
# EXTERNAL_IP=203.0.113.10
```

This becomes channel `ExternalIP` — what the lobby tells the client to connect to
for gameplay. Wrong value = login works, then channel connect fails.

### 5. Choose database backend

#### Option 1 — SQLite (default)

```bash
cd ~/docker/smt
cp config/sqlite/{lobby,world,channel}.xml data/config/
docker compose pull
docker compose up -d
docker compose ps
```

#### Option 2 — MariaDB (compose profile)

MariaDB stays on the bridge only (hostname `mariadb`, **not** published to the
host). Fresh `comp_hack` + `world` DBs; no SQLite migration.

```bash
cd ~/docker/smt
cp config/mariadb/{lobby,world,channel}.xml data/config/
docker compose pull
docker compose --profile mariadb up -d
docker compose --profile mariadb ps
```

| | SQLite | MariaDB |
| --- | --- | --- |
| Start | `docker compose up -d` | `docker compose --profile mariadb up -d` |
| Config | `config/sqlite/` → `data/config/` | `config/mariadb/` → `data/config/` |
| Storage | `data/database/` | `data/mariadb/` |
| DB host in XML | n/a | `__MARIADB_HOST__` → `mariadb` |

### 6. Verify

```bash
docker compose ps
# Expect (healthy) on lobby / world / channel

docker compose logs -f lobby world channel
# "Server ready!" on each
```

Ports (host): lobby `10666`, channel `14666`, website `${WEBSITE_PORT:-3000}`
(homelab often `3080` if `pnpm dev` holds 3000), updater `8765`, lobby API
`127.0.0.1:10999` only. World/MariaDB stay on the bridge.

Website + updater: [website-updater-docker.md](website-updater-docker.md).

World waits for healthy lobby; channel waits for healthy world.

### 7. Stop

```bash
docker compose down
# or: docker compose --profile mariadb down
```

---

## Notes

- Do not run bare-metal `scripts/start.sh` and Docker at the same time (same ports).
- Bridge + `EXTERNAL_IP` is the path for Oracle/Phase 15; change `.env` then
  `docker compose up -d` (recreate channel so ExternalIP refreshes).
- Change default DB passwords before public deploy; keep XML `Password` and
  `mariadb/init` in sync (init runs only on first empty `data/mariadb/`).
- Updating binaries: rebuild + `docker-push-hub.sh`, then
  `docker compose pull && docker compose up -d`.
- Backup / restore / upgrade / rollback: [backup-restore.md](backup-restore.md).
