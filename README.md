# SMT Private Server — Docker stack

Docker Compose deployment, ops sidecar, admin website, and docs for running a
[COMP_hack](https://github.com/colpertac/comp_hack)-based Shin Megami Tensei
IMAGINE private server.

## What's in this repo

| Path | Purpose |
| --- | --- |
| [`deploy/`](deploy/) | `install.sh`, compose, nginx, seed config |
| [`deploy/scripts/`](deploy/scripts/) | Build/push Hub images, deploy bundles |
| [`ops/`](ops/) | Admin control-plane sidecar (Docker socket) |
| [`website/`](website/) | Next.js account site + admin UI |
| [`docs/`](docs/) | Setup guides (Oracle VPS, Docker Hub, backups, …) |

Game server source lives in a separate repo — clone as a **sibling**:

```bash
git clone https://github.com/colpertac/comp_hack.git ../comp_hack
```

Published Docker images: `colpertac/smt-comp`, `colpertac/smt-website`.

## Quick start

Prereqs: Docker + Compose v2, correct system clock (NTP).

```bash
cd deploy
./install.sh --ip YOUR.LAN.OR.PUBLIC.IP
# or install under home (no sudo):
./install.sh --ip YOUR.IP --prefix "$HOME/smt"
```

Open `http://YOUR.IP:3000` — default admin `admin` / `admin123` (change on first login).

Full walkthrough: [docs/youtube-1.0-setup.md](docs/youtube-1.0-setup.md).

## Publish images (maintainers)

Build COMP on the host, then from this repo:

```bash
../comp_hack/scripts/build.sh          # game binaries
./deploy/scripts/docker-push-hub.sh    # colpertac/smt-comp
./deploy/scripts/docker-push-website-hub.sh
```

See [docs/docker-hub.md](docs/docker-hub.md).

## Layout on disk

```text
your-workspace/
├── comp_hack/              # game server (separate repo)
└── ai-custom-smt-server/   # this repo
    ├── deploy/
    ├── ops/
    ├── website/
    └── docs/
```

Runtime data (`data/`, `updater/`, custom zones) stays on the host — not in git.

**What install prepares vs what you supply:**

| Content | Source | Copyright |
| --- | --- | --- |
| Config XML (`lobby.xml`, …) | install seeds | no |
| Server zones/events (`datastore/zones`, `data/`, …) | `comp_hack/datastore` submodule (AGPL) — install stages when sibling repo present | no (open server defs) |
| BinaryData + Map | game **client** files — upload via Admin → Game files | **yes** (Atlus) — do not commit |

Do **not** commit copyrighted game assets (BinaryData, client files) to any public repo.
