# scripts/

Runnable helpers for this repo. Prefer `npm run …` from `website/` for
portrait tools.

## Layout

| Dir / files | Purpose |
| ----------- | ------- |
| [`portrait/`](portrait/) | Armory Path 1: orch, worker, login, watchdog, crop, launch, cli |
| [`../ops/`](../ops/) | Phase 16I localhost ops sidecar (health; later start/restart) |
| `docker-*.sh`, `make-deploy-bundle.sh`, `stage-proxmox-bundle.sh`, … | Image/deploy packaging |
| `build-*-overlay.sh`, `apply-client-overlay.sh`, … | Client / updater overlays |
| `package-phase*.sh`, `install-*.sh` | Historical phase packaging |
| `shop-*.sh`, `payout-*.sh`, `wiki-*.sh` | Shop/payout/wiki content helpers |
| `translation-*.sh` | Translation extract/inventory |
| `serve-updater-local.py` | Local updater HTTP |

Portrait tools live under `scripts/portrait/` with **uv** + `.env`
(no `website/` tree required on the homelab):

```bash
cd ai_custom_smt_server/scripts/portrait
cp .env.example .env          # set PORTRAIT_CLIENT_DIR + vam1/vaf1 passwords
uv sync
./portrait-cli                # interactive menu (uv run)
./portrait-cli status
```

Monorepo convenience (optional):

```bash
npm run portrait-cli
npm run portrait-cli -- status
```
