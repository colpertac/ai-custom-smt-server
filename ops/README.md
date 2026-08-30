# Ops sidecar (Phase 16I)

Localhost control plane for admin Start/Stop/Restart and later zip ingest.
The public Next.js app never holds the Docker socket; it proxies through here.

**Step 1 (now):** `GET /health` only.

```bash
export OPS_TOKEN=dev-ops-token-change-me
python3 ops/sidecar.py
```

Website `.env.local`:

```bash
OPS_URL=http://127.0.0.1:14710
OPS_TOKEN=dev-ops-token-change-me
```

Then `pnpm run ops-sidecar` from `website/` (or the python command above) and
open `/admin` — “Ops sidecar” should show reachable.

**Step 1 (skeleton):** `GET /health` — sidecar reachability.

**Start / stop:** `POST /start` and `POST /stop` — native `start.sh` / `stop.sh`
(lobby → world → channel, reverse on stop). Docker: `compose up -d lobby world
channel` / `compose stop channel world lobby`.

**Lane A publish:** Validate → stage under `runtime/releases/lane-a/<id>/` →
apply to live → restart. Endpoints: `POST /publish/lane-a/validate`,
`/publish/lane-a/apply`, `/publish/lane-a/rollback`, and one-shot
`/publish/lane-a`. Website BFF mirrors under `/api/admin/ops/publish/lane-a*`.
Shops/payouts only.

**Lane A config:** Same pattern for `runtime/config/*.xml` via
`POST /publish/lane-a-config/validate|apply|rollback` (releases under
`runtime/releases/lane-a-config/`). Admin UI: `/admin/config`. Restarts
lobby/world/channel as listed in the release (`POST /restart/services`).

**Restart channel:** `POST /restart/channel` — native
`comp_hack/scripts/restart-channel.sh` or docker `compose restart channel`.
**Restart services:** `POST /restart/services` body
`{"services":["lobby","world","channel"]}` — native `restart-service.sh`.

**Lane A publish (compat one-shot):** `POST /publish/lane-a` — validate+apply
then restart. Prefer validate/apply from the admin UI.

**Zip ingest:** `POST /ingest/zip?kind=binarydata|maps|packages|overlay|content`
with raw zip body. Allowlisted unpack + zip-slip reject + disk check.
Website: `POST /api/admin/ops/ingest/zip` (multipart) + **Zip ingest** on
`/admin`. Does not rehash (step 8).
BinaryData / Maps / packages mark the channel **stale** until restart
(`runtime/releases/ops-freshness.json`; exposed on `GET /health` as
`channelStale`). Overlay does not.

**Ingest jobs:** `POST /ingest/zip` saves the zip then unpacks in the
background (`202` + `jobId`). Poll `GET /ingest/job?id=` for unzip logs.
Website uses XHR (no 10s ky timeout) plus a live log on `/admin`.

**First boot:** `GET /health` includes `firstBoot` (needed/missing file
counts). Empty BinaryData or Map trees block `POST /start` (`409
first_boot_incomplete`). Admin **First boot** panel prompts zip uploads
then Start. Overlay empty is reported but optional.

**Lane B:** `POST /publish/lane-b` runs `comp_rehash --base updater/base
--overlay updater/overlay`. Overlay/release zip ingest rehashes after
unpack. Kind `release`: `client/` → overlay, `server/BinaryData|Map|packages`
→ datastore. `GET /health` reports `overlayStale` until rehash. Admin: one
**Content zip** panel (ingest kinds + Rehash overlay).

**Lane C (Docker only):** `POST /publish/lane-c` with
`{"confirm": true}` pulls and force-recreates `lobby`/`world`/`channel`
(optional `includeWebsite: true`). Native backend returns
`lane_c_docker_only`. Admin: **Pull & recreate images** (separate from
content upload).

| Env | Default | Notes |
| --- | --- | --- |
| `OPS_TOKEN` | (required) | Header `X-Ops-Token` |
| `OPS_URL` | `http://127.0.0.1:14710` | Website BFF only |
| `OPS_PORT` | `14710` | Sidecar listen port |
| `OPS_BIND` | `127.0.0.1` | Loopback only; other binds refused |
| `OPS_BACKEND` | `native` | Reported in health; `docker` later |
| `OPS_RUNTIME` | `comp_hack/runtime` or `deploy/data` | Datastore root |
| `OPS_UPDATER_ROOT` / `UPDATER_ROOT` | `updater/` | Overlay dest for kind=overlay |
| `OPS_AUDIT` | `ops/audit.log` | Append-only JSON lines |
| `OPS_REHASH` | `comp_hack/build-current/bin/comp_rehash` | Lane B |

Admin BFF: `GET /api/admin/ops/health` (`userLevel >= 1000`).
