# scripts/

Runnable helpers for this repo. Prefer `npm run …` from `website/` for
portrait tools.

## Layout

| Dir / files | Purpose |
| ----------- | ------- |
| [`portrait/`](portrait/) | Armory Path 1: orch, worker, login, watchdog, crop, launch |
| `docker-*.sh`, `make-deploy-bundle.sh`, `stage-proxmox-bundle.sh`, … | Image/deploy packaging |
| `build-*-overlay.sh`, `apply-client-overlay.sh`, … | Client / updater overlays |
| `package-phase*.sh`, `install-*.sh` | Historical phase packaging |
| `shop-*.sh`, `payout-*.sh`, `wiki-*.sh` | Shop/payout/wiki content helpers |
| `translation-*.sh` | Translation extract/inventory |
| `serve-updater-local.py` | Local updater HTTP |

Portrait (from `website/`):

```bash
npm run portrait-worker -- once
npm run portrait-login -- vam1
npm run portrait-watchdog -- --test
```
