# Phase 16 — Website data platform

Started 2026-07-25. Builds on Phase 7 account BFF
([phase7.md](phase7.md)). Ordered plan: [IDEA_ROADMAP.md](../../IDEA_ROADMAP.md)
§ Phase 16.

## 16A — Production hardening (in progress)

| Item | Status |
| --- | --- |
| Secure cookies (`COOKIE_SECURE` / HTTPS-aware) | Done |
| Zod + RHF forms; ky + TanStack Query (monno-style) | Done |
| Auth rate limits (in-memory, per IP) on BFF routes | Done |
| Same-origin check on mutating BFF routes | Done |
| `/status`, `/news`, `/download` pages | Done |
| `/admin` gate (`user_level >= 1000`) | Done |
| Account profile: display name + email + password | Done |
| Admin accounts CRUD (level/CP/email/ban/enabled/…) | Done |
| Optional register email (placeholder in COMP DB) | Done (rebuild lobby; Hub push deferred) |
| Welcome email (Resend) + forgot/reset password | Done (lobby `COMP_RESET_SECRET`; no queue worker) |
| Next BFF `/api/auth/*`, `/api/admin/accounts`, `/api/status` | Done |
| HTTPS reverse proxy (Caddy/nginx) | Doc only — terminate TLS in front of `:3000` / `:8765` |
| Redis/shared rate limit, CSRF tokens | Deferred |
| Login username rename | Out of scope (DB key) |
| App route groups `(auth)/(admin)` like monno | Optional follow-up |

### New routes

| Route | Purpose |
| --- | --- |
| `/status` | Lobby API + TCP probes + optional updater HTTP |
| `/news` | Static posts from `website/content/news.ts` |
| `/download` | Client / updater / portal links from env |
| `/admin` | Account list + edit/delete (`userLevel >= 1000`) |
| `/admin/import` | Account export XML import (proxies lobby `POST /import`) |
| `/admin/shops` | COMP shop working-copy editor + XML/zip export |
| `/admin/payouts` | Dungeon payout editor + Event/DropSet package export |
| `/admin/config` | Server config editor (lobby/world/channel + siblings) |
| `GET /api/admin/ops/health` | 16I ops sidecar proxy (`userLevel >= 1000`) |
| `POST /api/admin/ops/restart/channel` | Restart comp_channel (native or docker) |
| `POST /api/admin/ops/publish/lane-a` | Lane A one-shot validate+apply+restart |
| `POST /api/admin/ops/publish/lane-a/validate` | Build candidate release only |
| `POST /api/admin/ops/publish/lane-a/apply` | Snapshot + apply release + restart |
| `POST /api/admin/ops/publish/lane-a/rollback` | Restore previous snapshot + restart |
| `POST /api/admin/ops/publish/lane-a-config/validate` | Stage config XML candidate |
| `POST /api/admin/ops/publish/lane-a-config/apply` | Apply config release + restart services |
| `POST /api/admin/ops/publish/lane-a-config/rollback` | Restore previous config snapshot |
| `POST /api/admin/ops/ingest/zip` | Zip ingest (BinaryData/maps/packages/overlay/content/release) |
| `POST /api/admin/ops/publish/lane-b` | Overlay `comp_rehash` (Lane B) |
| `POST /api/admin/ops/publish/lane-c` | Docker pull + recreate (Lane C) |
| `/armory` | Public character name search |
| `/armory/[name]` | Public character profile (gear / stats / clan) |
| `/armory/[name]/demons` | COMP + account-shared demon storage |
| `/armory/demon/[id]` | Single demon profile (reunion, Tarot/Soul gear, force) |
| `/account` | Details + display name / email / password forms |

### Env (website)

| Var | Purpose |
| --- | --- |
| `SITE_URL` | Public origin (`https://imagine.example` or `http://IP:3000`) |
| `COOKIE_SECURE` | `true` when browsers reach the site over HTTPS |
| `PUBLIC_UPDATER_URL` | e.g. `http://IP:8765` for download + status |
| `LOBBY_PROBE_HOST` / `CHANNEL_PROBE_HOST` | Docker DNS defaults `lobby` / `channel` |
| `COMP_SHOPS_DIR` | Working-copy COMP shops (default `../server-content/shops`) |
| `SHOP_PRODUCTS_PATH` | Optional override for `shop-products.json` |
| `COMP_PAYOUTS_DIR` | Working-copy dungeon payouts (default `../server-content/payouts`) |
| `OPS_URL` / `OPS_TOKEN` | 16I ops sidecar (default `http://127.0.0.1:14710`; token required) |
| `COMP_WORLD_DB` | Read-only world SQLite for armory (default `../../comp_hack/runtime/database/world.sqlite3` from website) |
| `WEBSITE_DATA_DIR` | Website sqlite (password reset + `portraits.db` job queue; default `website/data`) |

### HTTPS (ops)

Keep Next on HTTP inside Docker. Put Caddy/nginx on the host (or a sidecar)
with Let’s Encrypt for website + updater. Set `COOKIE_SECURE=true` and
`SITE_URL=https://…` after TLS works. See [oracle-vps.md](oracle-vps.md).

---

## 16B–F

### 16B — Item wiki

On hold — sample `/wiki` routes kept; not linked in nav. Full BinaryData
catalog still deferred.

### 16C — COMP shop editor (MVP done)

Working-copy editor only (no live datastore/runtime writes).

| Item | Status |
| --- | --- |
| Seed `server-content/shops/` from stock `compshop-*.xml` | Done (`scripts/shop-seed-working-copy.sh`) |
| ShopProductData → `website/content/shops/shop-products.json` | Done (`scripts/shop-export-products.sh`) |
| Parse/serialize with unknown-field preserve | Done (`lib/comp-shop-xml.ts`) |
| Admin BFF list/get/put/export (+ zip all) | Done (`/api/admin/shops/*`) |
| Admin UI `/admin/shops` | Done |
| Full item-search UX | Follow-up (preview by ProductID + extract names) |

**Working copy:** `server-content/shops/` (or `COMP_SHOPS_DIR`). XML files are
gitignored; seed locally. **Install:** download XML/zip from admin UI → copy
into channel datastore `shops/` → restart/reload content as usual.

**Currency:** CP vs Macca comes from item `ITEM_FLAG_CP` in the extract, not
from shop XML. `BasePrice` is the charged amount; `ProductID` is a
ShopProductData id (not an item id).

### 16D — Dungeon payout editor (MVP done)

Stable JSON schema under `server-content/payouts/` (seed:
`suginami-bronze.json` from Phase 13). Admin UI edits CP, crate DropSet rows
(weights / mutex), and clear-item grants (e.g. Magical Golden Apple `21941`).
Export downloads a zip of generated Event + DropSet XML — no live mutation.

| Item | Status |
| --- | --- |
| Payout JSON schema + Zod validation | Done |
| Seed Suginami bronze from Phase 13 | Done |
| Catalog stubs from private-server CP sheet (~50) | Done (`scripts/payout-seed-catalog.sh`) |
| Generate Event + DropSet XML | Done (`lib/dungeon-payout-generate.ts`) |
| Admin BFF list/get/put/delete/export | Done (`/api/admin/payouts/*`) |
| Admin UI `/admin/payouts` | Done |
| Auto-patch stock `dungeon_events-*.xml` next hooks | Out of scope (still one-time datastore patch) |
| Full item-name search / multi-dungeon catalog | Follow-up |

**Install:** download zip → install like Phase 13 packages under
`datastore/packages/` (or merge `events/` + `data/dropset/`). Stock loot events
must still `next` into the payout’s `AFTER_*` hook IDs.

### 16E — Character armory (MVP done)

Public exact-name lookup against **world SQLite** (BFF read-only; no new COMP
lobby HTTP). Privacy: show name, level, stats, appearance fields, clan, and
equipped item types — never account username, friends, bags, or logout data.

| Item | Status |
| --- | --- |
| World DB reader (`COMP_WORLD_DB`) | Done |
| `GET /api/armory/[name]` (+ rate limit) | Done |
| `/armory` search + `/armory/[name]` profile | Done |
| WoW-like gear columns + CSS 3D name hero stub | Done (no three.js) |
| `/armory/[name]/demons` (COMP + account demon storage) | Done |
| `/armory/demon/[id]` detail (reunion + Tarot/Soul gear) | Done |
| `GET /api/armory/[name]/demons` | Done |
| DevilData name/icon extract | Done (names via `content/armory/devils.json`) |
| Combat stats / HP-MP / equip Tarot-Soul | Done |
| Expertises + active demon on character | Done |
| Demon inherited skills + combat stats | Done |
| Skill display-name catalog | Follow-up (IDs only; not in Shield SkillData) |
| Title / achievement catalogs | Follow-up |
| Portrait render (client screenshot cache) | Fingerprint + sqlite queue; first PNG on `/armory/cat2` — [armory-character-render.md](armory-character-render.md) |
| Rich interactive 3D in-browser | Deferred (after static portrait) |

### 16F

Not started. AI help (ideas D6).

### 16I — Admin apply / restart (step 1 done)

AMP-like three lanes: **A** datastore/config → restart channel (players log
back in); **B** client overlay (new item/demon art) → ImagineUpdate; **C**
code → image rebuild. First boot: `bundle.zip` + `setup.sh` on the VM, then
web UI **Start** + zip upload for BinaryData/maps (browsers cannot upload
folders). Disk unpack lives in an ops sidecar (not C# unless we choose it).
Full writeup: [IDEA_ROADMAP.md](../../IDEA_ROADMAP.md) § 16I.

**Step 1 (skeleton):** `ops/sidecar.py` listens on `127.0.0.1:14710`, token
`OPS_TOKEN`, allowlist + audit log. Website BFF `GET /api/admin/ops/health`.

**Step 2 (restart channel):** `POST /restart/channel` → native
`comp_hack/scripts/restart-channel.sh` or docker `compose restart channel`.
Admin `POST /api/admin/ops/restart/channel` + button on `/admin`.

**Step 3 (lane A publish):** `POST /publish/lane-a` → copy
`server-content/shops/*.xml` + build `zzz_ai_custom_payouts_admin.zip` from
payout JSON → `runtime/datastore/` → restart channel. Admin
`POST /api/admin/ops/publish/lane-a` + **Publish lane A** on `/admin`.

**Step 4 (stage + rollback):** Validate builds
`runtime/releases/lane-a/<id>/candidate/` (live untouched). Apply snapshots
live → `previous/`, copies candidate → live, keeps last 5 releases. Admin:
`POST …/validate`, `…/apply`, `…/rollback` with UI phases Validating →
Applying → Restarting.

**Step 6 (zip ingest):** `POST /ingest/zip?kind=` raw zip → allowlisted
paths under `OPS_RUNTIME` / `OPS_UPDATER_ROOT`. Zip-slip + symlink + disk
checks. Admin multipart `POST /api/admin/ops/ingest/zip` + **Zip ingest**
panel.

**Step 7 (first boot):** Health `firstBoot` detects empty BinaryData/maps
(and reports optional empty overlay). Admin **First boot** panel + Start
blocked until `Shield/ItemData.sbin` and Map files exist.

**Step 8 (Lane B):** Overlay/release zip ingest + `comp_rehash`. Folded into
admin **Content zip** (not a second panel). Players run ImagineUpdate.
Channel restart only if the zip wrote datastore (`server/`).
