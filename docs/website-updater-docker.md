# Minimal website + updater (Phase 14 MVP)

| Service | Image | Host port | Role |
| --- | --- | --- | --- |
| `website` | **`colpertac/smt-website:latest`** | `3000` | Next.js account BFF → `http://lobby:10999` |
| `updater` | `nginx:1.27-alpine` | `8765` | Overlay-first `/files/` |

Lobby HTTP `10999` is published to **127.0.0.1 only**. The website container
uses `lobby:10999` on the Docker bridge.

## Publish website (build PC)

```bash
/home/cat/repos/smt/ai_custom_smt_server/scripts/docker-push-website-hub.sh
```

## Homelab / Proxmox

```bash
cd ~/docker/smt   # or /opt/smt on Proxmox
# .env: WEBSITE_IMAGE=colpertac/smt-website:latest
#       UPDATER_ROOT=…  SESSION_SECRET=…  EXTERNAL_IP=…
docker compose pull
docker compose up -d
```

Smoke:

```bash
curl -sI http://127.0.0.1:${WEBSITE_PORT:-3000}/ | head -5
curl -sI http://127.0.0.1:8765/files/hashlist.dat | head -5
```

Updater overlay still lives on disk (`UPDATER_ROOT`); rehash after overlay
changes — see [guides/updater.md](../guides/updater.md).

Proxmox full steps: [proxmox-smoke.md](proxmox-smoke.md).
