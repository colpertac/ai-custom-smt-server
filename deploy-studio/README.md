# Deploy Studio

Portable Wine-host package for Path 1 armory portraits. SCP this folder plus
your game client to any Linux PC; no full monorepo checkout required.

## Quick start

```bash
# on the Wine / studio PC
scp -r deploy-studio user@studio-pc:~/studio/
# also copy your Imagine client tree, e.g. to ~/studio/reimagine

ssh user@studio-pc
cd ~/studio/deploy-studio
./requirements.sh          # apt + uv + sendinput.exe + seed .env
$EDITOR .env               # client path, studio/queue URLs, tokens, passwords
./install.sh               # check only — tells you what's missing
./studio up                # agent only: worker + preview/control HTTP
# Start Imagine clients from Admin → Studio → Clients (or ./studio orch-up)
```

Day to day:

```bash
./studio status
./studio down              # stop agent; clients keep running
./studio down --clients    # stop agent + kill Imagine
./studio                 # interactive menu
```

Token handshake only (no game clients) — for Admin → Studio → Test connection:

```bash
./studio ping            # outbound checks + listen on :14701
./studio ping --check-only
```

No tmux needed: `./studio up` backgrounds `worker loop` and the preview/control
agent under `work/*.pid` / `work/*.log`. Game clients are started from Admin
(or `./studio orch-up`), not from `up`.

## What goes in `.env`

| Variable | Purpose |
|----------|---------|
| `PORTRAIT_CLIENT_DIR` | Path to game folder (`ImagineClient.exe`) |
| `PORTRAIT_STUDIO_URL` / `TOKEN` | Channel studio API |
| `PORTRAIT_QUEUE_URL` | Website base URL (queue HTTP) |
| `PORTRAIT_VAM1_PASS` / `VAF1_PASS` | Mannequin account passwords |

See `.env.example` for the full list.

## Layout expectation

```
~/studio/
  deploy-studio/     # this package
  reimagine/         # game client (PORTRAIT_CLIENT_DIR)
```

## Website side

Same GitHub release can ship `smt-deploy-studio.zip` beside `smt-deploy-ops.zip`.
Unpack on the Wine host (game client is separate).

Admin Studio (`/admin/studio`) stays the dashboard. Point the website at this
host for Snap:

```bash
# website/.env.local
PORTRAIT_PREVIEW_URL=http://<studio-pc>:14701
PORTRAIT_WORKER_TOKEN=…   # same as deploy-studio
```

## Requirements vs install

- `./requirements.sh` — installs apt packages, uv, venv, builds sendinput
- `./install.sh` / `./studio check` — verifies everything; does not install
