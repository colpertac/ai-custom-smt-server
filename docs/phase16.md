# Phase 16 — Website data platform

Started 2026-07-25. Builds on Phase 7 account BFF
([docs/phase7.md](phase7.md)). Ordered plan: [IDEA_ROADMAP.md](../IDEA_ROADMAP.md)
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
| `/admin/shops` | COMP shop working-copy editor + XML/zip export |
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

### 16D–F

Not started. Payout editor, armory, AI help (ideas D6).
