# Install / image defaults

Index of what a fresh `install.sh` + Hub images should ship. Keep this in sync
when changing seeds or rebuilding `colpertac/smt-website`.

Existing installs only pick up `deploy/seed/**` when the matching
`website-data/` (or `data/config/`) directory is **empty**. Website image
catalog (`content/events/events-catalog.json`, etc.) ships with each image;
mutable Admin Events schedule is seeded **once** into `website-data/events/`
and is never overwritten by later image pulls.

## Ship

| Area | Default | Source |
| --- | --- | --- |
| **News** | One post: Hello world | `website/content/news.ts` → empty `web.sqlite` |
| **Download reminder** | Download URL **empty**; label `Download client` | Empty `site_settings` in new `web.sqlite` |
| **Events control** | **Manual** (`enabled: false`) | Image seed `content/events/event-schedule.json` → `website-data/events/event-schedule.json` (first boot only) |
| **Events always-on / live** | Shinjuku Under Wonderground (`201506_wonder`) + Daily Mission Chests & Hack Limits 2016 (`201604_misc`) | Schedule `alwaysOnIds` + `deploy/seed/config/channel.xml` DataStore partials |
| **Events loop (Schedule mode)** | Dense archive cycle preloaded (14 days); flip **00:00** America/New_York; day 1 date **2026-01-01** | Same schedule file (built from `lib/events/dense-archive-cycle.ts`) |
| **Events calendar** | Empty | Same file |
| **Events profiles** | No user profiles; Dense archive remains the builtin Load button | `website-data/events/event-schedule-profiles.json` empty; builtin in code |
| **COMP shops** | `compshop-6001`…`6014` (DCO → ATM) + `shop-order.json` | `deploy/seed/server-content/shops/` |
| **Store** | Code price formula + cart enabled; **no** price overrides | `website/lib/store-pricing.ts` / empty SQLite |
| **Promos** | None | Lobby DB starts empty |
| **Payouts** | Current seed weights/CP (wired subset enabled) | `deploy/seed/server-content/payouts/` |
| **Dungeon loot** | Item **38172** “Dungeon Report”, 1 item / 1 CP; **all** dungeons `enabled: true` | `deploy/seed/server-content/report-rewards/` |
| **World loot eggs** | `LootEggDuration` **300**; `LootEggRestrictedDuration` **0** (immediately free-for-all) | `deploy/seed/config/world.xml` (`WorldSharedConfig`) |
| **Casino / config / email / SQL / …** | Current code + empty runtime DBs | Website / ops images as published |
| **Website feedback** | Empty `feedback` / `feedback_images` in new `web.sqlite` | Public `/feedback` form; Admin → Feedback |
| **Discord notifications** | **No webhook**; services/feedback/reports off until configured | Admin → Notifications → `site_settings` / optional `SERVER_ALERT_DISCORD_WEBHOOK` |
| **Armory expertise / digi editor** | **Off** (`enabled: false`); min GM level **0** when enabled | Admin → Website (expertise digi settings) |
| **Recovery hub** | No snapshots; stock-knob reset uses `deploy/seed/config` templates | Admin → Recovery; snapshots under `data/releases/recovery/` |
| **Backups / rclone** | Empty `deploy/backups/`; no schedule; no rclone.conf | Admin → Backups; never in image or release zip |
| **Live armory stats / portrait worker auth** | Zero-config: random `STUDIO_TOKEN` + `PORTRAIT_WORKER_TOKEN` in `.env` (kept on re-run); channel studio API on `channel:14700`; Admin → Portraits shows status only | `install.sh` / `install.ps1` → compose → `entrypoint.sh` patches runtime `channel.xml` `StudioToken` / `StudioHttpPort` |

Refresh shops / payouts / loot from a working tree:

```bash
./deploy/scripts/stage-server-content-seed.sh
```

Regenerate Dense archive into the baked schedule (then rebuild website image):

```bash
cd website && pnpm exec tsx -e '
import { readFileSync, writeFileSync } from "fs"
import { buildDenseArchiveCycle } from "./lib/events/dense-archive-cycle.ts"
import { randomUUID } from "crypto"
const { events } = JSON.parse(readFileSync("./content/events/events-catalog.json","utf8"))
const built = buildDenseArchiveCycle(events)
writeFileSync("./content/events/event-schedule.json", JSON.stringify({
  version: 2, enabled: false, mode: "loop",
  timezone: "America/New_York", flipTime: "00:00",
  alwaysOnIds: ["201506_wonder", "201604_misc"],
  loop: { anchorDate: "2026-01-01", days: built.days.map(d => ({ id: d.id || randomUUID(), eventIds: [...d.eventIds] })) },
  calendar: { days: [] },
}, null, 2) + "\n")
'
```

## Do not ship

| Area | Why |
| --- | --- |
| **Game files** (BinaryData / Maps) | Copyright — Admin → Game files upload only |
| **Dev download / MediaFire URLs** | Live only in local `website/data/web.sqlite`; never copy that DB into the image |
| **Calendar test days** / ad-hoc Schedule flips | Keep calendar empty; edit live schedule on a running realm |
| **User loop profiles named “test”** | Builtin Dense archive only |
| **Debug store overrides** (e.g. insta-kill CP) | Dev SQLite only |
| **COMP shop 6015+ scratch shops** | Seed stops at 6014 |
| **Dev news posts** beyond Hello world | Seed is `content/news.ts` only |
| **Discord webhook URLs** / notification toggles | Live only in `website-data` `site_settings` or host `.env` — never bake into Hub images |
| **rclone.conf** / cold backup archives | `deploy/backups/` gitignored + excluded from release zip |
| **STUDIO_TOKEN / PORTRAIT_WORKER_TOKEN** values | Generated per install into `deploy/.env`; never in images, seeds or `deploy/seed/config/channel.xml` |
| **COMP_ANNOUNCE_*** real passwords | Install defaults are `admin` / `admin123`; live realms keep their own `.env` |
| **Recovery snapshots** | Operator-created under `data/releases/recovery/` only |

## Where it lands

| Artifact | Consumers |
| --- | --- |
| `colpertac/smt-website` image | News seed code, `content/events/*`, store formula defaults |
| `deploy/seed/server-content/` | `install.sh` → `website-data/server-content/{shops,payouts,report-rewards}` |
| `deploy/seed/config/` | `install.sh` → `data/config/` when missing (`channel.xml` event partials) |
| Lobby / world DB | Promos and accounts — empty until used |
