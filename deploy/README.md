# Deploy — Phase 14 Docker runtime

Hub images:

| Image | Role |
| --- | --- |
| **colpertac/smt-comp** | lobby / world / channel |
| **colpertac/smt-website** | Next.js account site |
| `nginx:1.27-alpine` | updater static files |

Guides: [docker-hub.md](../docs/docker-hub.md), [proxmox-smoke.md](../docs/proxmox-smoke.md),
[website-updater-docker.md](../docs/website-updater-docker.md).

```bash
# Publish (build PC)
../scripts/docker-push-hub.sh
../scripts/docker-push-website-hub.sh

# Run
cp .env.example .env   # EXTERNAL_IP, SESSION_SECRET, UPDATER_ROOT, …
docker compose pull && docker compose up -d
```
