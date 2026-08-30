# Forward Roadmap

This is the active roadmap for work after the original Phase 0–10 MVP.

- [ROADMAP.md](ROADMAP.md) remains the historical record of the MVP.
- [ideas.md](AI/ideas.md) remains the detailed idea catalog.
- This file answers: **what should we build next, and in what order?**

Do not start every track at once. Keep one primary milestone active; translation
may continue as a background content track.

## Current priorities

1. Phase 16A — Website production hardening ← **active**
2. Phase 15 leftovers — HTTPS/backups/monitoring (can parallel)
3. Translation Track A (background)

Completed recently: Phase 11–14; Phase 15 remote play smoke (2026-07-24).

After those foundations, move into website tools, original assets, social
launcher features, AI players, and tutorials.

---

## Phase 11 — Developer and GM quality of life

**Goal:** Make administration discoverable and ensure commands visibly report
success or failure.

- **Status:** MVP completed and tested in-game 2026-07-20.
- [x] Support `@help COMMAND`, such as `@help spawn`.
- [ ] Add command categories or a concise paginated command list.
- [x] Establish the self-chat success/failure response pattern.
- [x] Add confirmations first for `spawn`, `item`, `zone`, `instance`, and
  `speed`.
- [x] Ensure those common commands explain malformed input; existing
  `HaveUserLevel` reports the required and current levels.
- [x] Document common commands and examples in
  [AI/phases/phase11.md](AI/phases/phase11.md).

**MVP done when:** A GM can discover command syntax in-game and determine
whether a common command worked without checking logs or guessing.

**Polish:** Categories/pagination and confirmations across every lower-use
command can be added incrementally.

---

## Phase 12 — Configurable gameplay timings and limits

**Goal:** Move selected hardcoded server behavior into `WorldSharedConfig`
without weakening server authority.

**Status:** Closed 2026-07-22 — see [AI/phases/phase12.md](AI/phases/phase12.md).

Initial candidates:

- [x] Logout / character-switch delay (currently about 10 seconds).
- [x] Loot ownership / pickup window (`LootRestrictedDuration`).
- [x] Loot despawn duration (body with/without loot + post-loot remove).
- [x] Demon egg party claim window and despawn (`LootEggRestrictedDuration` /
  `LootEggDuration`).
- [x] Maximum permitted player movement-speed increase (`MaxMoveIncreaseSum`).
- [x] Record original values as defaults so existing behavior is unchanged.
- [x] Add schema descriptions, example configuration, and validation ranges.
- [x] MVP verified in play (logout, loot, egg timers); formal min/max/invalid
  smoke deferred to end-of-roadmap QA.

**Done when:** These values can be changed in server configuration, survive a
restart, and are still enforced by the server.

**Deferred:** Gift-box / boss-box long timers. Client logout UI countdown sync
moved to Phase 13. Formal config smoke → end-of-roadmap QA.

---

## Ongoing Track A — English translation

**Goal:** Translate the remaining Japanese incrementally without blocking
unrelated engineering work.

### A0 — Reimagine terminology agent (do first)

Evidence-backed glossary from what Reimagine already translated. Spec:
[translation/todo.md](translation/todo.md) (“Mini-project: Reimagine
terminology agent”). Outputs: `glossary/lingo.md`, `glossary/terms.tsv`,
ranked untranslated backlog.

### A1 — Incremental batches (long-running content)

Not one “translate the entire game” job. After A0, keep shipping small tested
batches (UI → tutorials like Mag `9541` → items/demons/skills → quests/story)
through the Phase 8/9 pipeline. “All text EN” is a long-term content milestone.

- [x] Run the Reimagine terminology research pass (A0).
- [x] Translate the Magnetite tutorial direction `9541`.
- [ ] Add placeholder, encoding, missing-record, and duplicate-ID checks.
- [ ] Continue prioritized batches: UI → items/demons/skills → quests/story.
- [ ] Publish each tested batch through the Phase 9 updater.
- [ ] Measure coverage by file/table/record, not an unverifiable percentage.

**Done when:** This remains a repeatable production pipeline; “all text
translated” is a long-term content milestone rather than a blocker for later
phases.

---

## Phase 13 — Dungeon rewards and economy polish

**Goal:** Make dungeon completion rewarding using server-controlled data.

**Status:** Closed 2026-07-22 (see [AI/phases/phase13.md](AI/phases/phase13.md)).
Dungeon clear rewards + CP on bronze Suginami shipped. Deferred: apple
compress UX, payout webUI schema, logout prepare text (client patch).

- [x] Inventory existing boss-clear events, reward crates, drop sets, and CP
  grant code.
- [x] Prototype one dungeon with randomized completion-crate loot (bronze
  Suginami `@instance 5401`).
- [x] Grant a configurable amount of CP when the boss completion condition is
  satisfied.
- [x] Prevent duplicate payouts from reconnects, repeated event triggers, or
  multiple boss-death packets.
- [x] Decide party payout rules and inventory-full behavior.
- [x] Retarget Phase 6 compression to Magical Golden Apple `21941`.
- [ ] **Deferred → Phase 10 / 17A:** Compressed Magical Golden Apple use UX.
- [ ] **Deferred → Phase 16D:** Stable dungeon payout XML for the webUI editor.
- [ ] **Deferred → Phase 10:** Logout UI text — client `LOGOUT_PREPARE` always
  chats “10 second(s) left…”. Skipping PREPARE breaks character-select logout
  (generic disconnect + stuck “Multiple logins”). Accurate text needs a client
  patch; server still honors `LogoutDelay` for the real timer.

**Done when:** One dungeon reliably gives randomized loot and exactly one CP
payout per eligible completion. *(Met for bronze Suginami; logout text deferred.)*

---

## Phase 14 — Containerized server deployment

**Goal:** A VM runs the server from prebuilt images and does not compile COMP.

**Status:** Closed 2026-07-23 — Proxmox Ubuntu smoke passed (Hub images,
website/updater, overlay-only updater, login + play). See
[AI/phases/phase14.md](AI/phases/phase14.md), [docs/proxmox-smoke.md](docs/proxmox-smoke.md),
[guides/client-host-config.md](guides/client-host-config.md).

- [x] Choose supported CPU architecture (`amd64` first).
- [x] Portable runtime root (`config/`, `database/`, `datastore/`, `logs/`).
- [x] Runtime image path: package prebuilt `comp_*` into Debian Trixie slim
  (multi-stage full in-Docker compile deferred; VMs pull runtime images only).
- [x] Compose services: lobby, world, channel, website, updater (SQLite default;
  MariaDB profile).
- [x] Optional MariaDB via compose profile + `deploy/config/{sqlite,mariadb}/` templates
  (guide: [docs/docker-hub.md](docs/docker-hub.md)).
- [x] Mount configuration, databases, datastore, logs outside the image.
- [x] Health checks, dependency ordering polish, stop grace period
  (TCP probes on 10666/18666/14666; world waits for healthy lobby, etc.).
- [x] Bridge networking + `EXTERNAL_IP` → channel ExternalIP
  (`deploy/docker-compose.yml`, `entrypoint.sh`, `.env.example`).
- [x] Minimal website + updater containers
  ([docs/website-updater-docker.md](docs/website-updater-docker.md)).
- [x] `docker compose` development/homelab file (`deploy/docker-compose.yml`).
- [x] Document backup, restore, upgrade, and rollback
  ([docs/backup-restore.md](docs/backup-restore.md)).
- [x] Test on the Proxmox Ubuntu VM
  ([docs/proxmox-smoke.md](docs/proxmox-smoke.md);
  stage: `scripts/stage-proxmox-bundle.sh` → `/mnt/axecat/smt/`).

**Done when:** A clean Ubuntu VM can start the complete private server with
documented image pulls and `docker compose up`, without a compiler toolchain.

---

## Phase 15 — Oracle VPS deployment

**Goal:** Deploy a secure, recoverable remote server.

**Status:** Smoke passed 2026-07-24 — Hub deploy on Oracle, VCN+firewalld,
remote curl, ImagineUpdate + direct login/play. Remaining: HTTPS/DNS, backups
drill, monitoring, reboot/rollback polish. Runbook:
[docs/oracle-vps.md](docs/oracle-vps.md).

- [x] Verify Oracle architecture, memory, storage, and bandwidth constraints
  (Ubuntu 24 amd64, ~1 OCPU / 4 GB).
- [x] Deploy Phase 14 images ([docs/oracle-vps.md](docs/oracle-vps.md)).
- [ ] Configure DNS and HTTPS for website and updater.
- [x] Expose only required game/web ports (VCN + firewalld; not ufw).
  (VCN: Source Port = All; firewalld: do not bind docker0 to trusted.)
- [x] Keep lobby HTTP API `10999` private behind the website/gateway
  (compose loopback bind).
- [ ] Configure persistent storage, automated backups, and restore testing.
- [x] Publish updater URLs and test from a clean remote client.
- [ ] Add basic uptime, disk, process, and backup monitoring.
- [ ] Write rollback and incident-recovery steps.

**Done when:** The public server survives reboot/redeploy, clients can update
and log in remotely, and a tested backup can restore it.

---

## Phase 16 — Website data platform and admin tools

**Goal:** Turn the Phase 7 website into a secure portal and content-tool host.

Build in this order:

### 16A — Production hardening

**Status:** Started 2026-07-25 — see [AI/phases/phase16.md](AI/phases/phase16.md).

- [x] Secure cookies (`COOKIE_SECURE` / HTTPS-aware; not forced on plain HTTP)
- [x] Auth validation (Zod) + rate limits + same-origin checks on mutations
- [x] Server status, news, and download pages
- [x] Server-only admin authorization gate (`/admin`, `userLevel >= 1000`)
- [ ] HTTPS reverse proxy in front of website/updater (ops; Phase 15 leftover)
- [ ] Shared/Redis rate limits + stricter CSRF tokens (optional hardening)

### 16B — Item and armor wiki

**Status:** On hold — sample `/wiki` routes kept for later; not linked in nav.

- [x] Prototype: sample export + `/wiki/items` pages (9 items from BinaryData)
- [ ] Plan full catalog extraction pipeline (BinaryData → stable JSON/SQLite).
- [ ] Export stable searchable item/armor data from BinaryData (full catalog).
- [ ] Add item pages, filters, icons, stats, and source/version metadata.
- [ ] Regenerate wiki data as part of the content build.

### 16C — COMP shop editor

**Status:** MVP done — working-copy parse/edit/export at `/admin/shops`.

- [x] Parse and validate existing `compshop-*.xml` (unknown fields preserved).
- [x] Price/currency preview (from ShopProductData extract) and package export.
- [ ] Full item search UX (follow-up; ProductID + extract preview is enough for MVP).
- [x] Preserve unknown XML fields during edits.

### 16D — Dungeon payout editor

**Status:** MVP done — working-copy JSON at `/admin/payouts` + Event/DropSet zip export.

- [x] Define payout JSON schema **with** this editor (Phase 13 Suginami seed).
- [x] Format covers CP, crate DropSets, and Golden Apple–style clear grants.
- [x] List dungeons/difficulties in the website admin UI.
- [x] Edit CP amount, crate item weights, and clear-item amounts.
- [x] Validate item IDs, weights, CP values, and duplicate rewards.
- [x] Export a reviewable server-content package (no direct live mutation).
- [ ] Auto-wire stock dungeon event `next` hooks (still manual / Phase 13 patch).
- [ ] Expand catalog beyond seeded entries (silver/gold / more dungeons).

### 16E — Character armory

**Status:** MVP done — public `/armory` lookup via world SQLite BFF.

- [x] Narrow read-only public character data (world DB; not COMP lobby HTTP).
- [x] Search by exact character name.
- [x] Display stats, equipment, clan; CSS 3D name placeholder for model.
- [x] Privacy: public profile fields only (no account login / friends / bags).
- [x] COMP + account demon storage under `/armory/[name]/demons`.
- [x] Demon detail `/armory/demon/[id]` (reunion ranks, Tarot/Soul gear, force).
- [ ] DevilData name catalog for demon labels.
- [ ] Title/achievement name catalogs.
- [ ] **Gear-aware stats** — world `EntityStats` is unequipped base only.
  Replicate channel `CharacterState::RecalculateStats` offline: ItemData
  CorrectTbl (via BasicEffect) + FuseBonuses + Tarot/Soul/SpecialEffect
  tokusei (`SItem` / Enchant / `data/tokusei`) + dependent CLSR/SPELL/etc.
  UI should match client `Total (Base + Bonus)` with green gear delta.
  **Pinned with portrait render** — same appearance fingerprint / async
  worker story (see below); do not block armory MVP on either.
- [ ] **Portrait render (WoW-style cache)** — preferred path documented in
  [AI/armory-character-render.md](AI/armory-character-render.md):
  (1) drive real Imagine client → screenshot → cache by fingerprint;
  (2) light client hook if automation fails; (3) full headless RE only
  last resort. **Ditch** Blender / NifSkope / website NIF assembly (PoC
  under `work/armory-render-poc/` is reference-only).
- [ ] Rich interactive 3D in-browser (deferred; after static portrait works).

### 16H — Account / character import

**Status:** Wired — `/admin/import` → lobby `POST /import`; vanilla
`webroot/accountmanager/import.html`. See [docs/account-import.md](docs/account-import.md).

Lobby already strips **UserLevel → 0** and **CP → 0** when
`ImportStripUserLevel` / `ImportStripCP` are true (defaults + our configs).

- [x] Bake import into lobby config + contrib webroot + admin BFF UI.
- [ ] **Harden import sanitization** (do not trust dump privilege fields):
  - Confirm strip always runs for admin-proxied imports (fail closed if
    strip flags ever disabled).
  - Reset / clamp other account fields: `TicketCount`, `Enabled`,
    `APIOnly`, clear `BanReason` / `BanInitiator`.
  - Decide policy for password/salt in dump (force reset vs keep hash).
  - Audit character/world objects for GM-only or economy abuse
    (optional caps later).
  - Document the sanitize matrix in `docs/account-import.md`.
- [ ] Prefer admin-only path in ops notes; keep `:10999` `/import` private
  (no auth on lobby handler).

### 16G — Paid account services (CP shop)

WoW-style paid character services on the website, charged against **account CP**
(not a separate cash shop currency). Players pick a character (or clan) and pay
CP for a one-shot service. Extensible for later ideas.

**Depends on:** account session + CP on Account (exists); character list /
world-DB mutate APIs (overlap with 16E); prices configurable server-side.

Initial catalog:

- [ ] **Level boost** — set character to a target level (e.g. 90) and grant a
  defined starter/boost gear package (item IDs configurable).
- [ ] **Appearance change** — face / hair / skin / gender / body-type fields
  already on Character (`FaceType`, `HairType`, `SkinType`, `Gender`, …);
  validate against create-character ranges; apply offline or with forced
  re-sync.
- [ ] **Guild (clan) rename** — change `Clan.Name` (unique key); similar care
  as character rename (caches, UI refresh). Leader-only + CP cost.
- [ ] Shared service framework: price table, CP debit (atomic), audit log,
  “character must be logged out” rule where needed.
- [ ] Website UI under account (or `/services`) listing owned characters +
  confirm/pay flow.
- [ ] Leave room for later: character rename, faction/race swaps, etc.

**Risk notes:** appearance is mostly field writes (lower risk). Level+gear needs
careful XP/stat/equipment application (reuse GM `@levelup` / item grant paths
where possible). Clan rename touches a unique name key.

**Done when:** A player can spend CP on at least boost + appearance from the
site without a GM, and CP balance updates correctly.

### 16F — AI player help (optional / parallel)

Natural-language Q&A tab on the website (“how do I unlock digitalization?”),
grounded on scraped wiki + private markdown notes. Storage choice (MD tree vs
Chroma vs hybrid) deferred — see [ideas.md](AI/ideas.md) **D6**.

- [ ] Knowledge corpus layout + wiki scrape pipeline.
- [ ] Help / Ask website tab with cited answers.
- [ ] Rate limits and basic abuse filters.

**Done when:** The website is production-safe and data editors emit validated,
reviewable content rather than directly mutating live data.

---

## Phase 17 — Original client assets

**Goal:** Prove increasingly difficult original-art pipelines.

### 17A — True custom item

- [ ] Original icon.
- [ ] Original or modified model and texture.
- [ ] BinaryData/Shield records and server definitions.
- [ ] Updater packaging and in-game QA.
- [ ] Revisit Compressed Magical Golden Apple (`900003`): real icon + usable
  inventory rendering (with Phase 10 `<compressors>` client patch for
  Note/Presser-style decompress).

### 17B — True custom demon

- [ ] Model, skeleton/animation compatibility, textures, audio, and effects.
- [ ] Demon/skill/server records and updater packaging.

### 17C — True custom zone

- [ ] Research geometry, collision/QMP, placement, lighting, textures, and map
  metadata.
- [ ] Build a small test room before attempting a full zone.
- [ ] Add server zone, spawns, events, updater packaging, and QA.

**Done when:** Each asset type is reproducibly built from editable sources and
installed through the updater, not maintained as an unexplained binary edit.

---

## Phase 18 — Social launcher

**Goal:** A Battle.net-style launcher with realm selection and friend presence.

- [ ] Define account authentication and launcher-session security.
- [ ] Add privacy-aware friends and online-presence APIs.
- [ ] Report character, realm, and channel presence.
- [ ] Choose launcher technology: COMP Qt fork, Tauri, Electron, or another
  native shell.
- [ ] Integrate news, updates, realm status, friends, and Play.
- [ ] Keep the simple COMP updater as a recovery/fallback launcher.

**Depends on:** Phases 15 and 16E.

**Done when:** A logged-in user can see permitted friends and their realm before
launching the correct updated client.

---

## Phase 19 — AI player research

**Goal:** Determine whether believable playerbots are technically and
financially practical before committing to a full implementation.

- [ ] Research COMP packet/session architecture and existing bot/test clients.
- [ ] Build one deterministic bot that logs in, moves, and survives reconnects.
- [ ] Add one bounded gameplay loop (combat or a simple quest).
- [ ] Separate gameplay decisions from optional LLM chat.
- [ ] Prototype a rate-limited Ollama/DeepSeek chat bridge.
- [ ] Measure CPU, memory, bandwidth, API cost, moderation, and failure modes.
- [ ] Decide whether to stop, continue with tens of bots, or pursue scale.

**Do not begin with 1,800 bots.** First prove one, then ten, with deterministic
behavior and no LLM dependency.

**Done when:** A measured prototype supports a go/no-go decision.

---

## Phase 20 — Tutorials and public documentation

**Goal:** Publish workflows only after they are stable and reproducible.

- [ ] Custom item tutorial after Phase 17A.
- [ ] Custom demon tutorial after Phase 17B.
- [ ] Custom zone tutorial after Phase 17C.
- [ ] Docker/homelab deployment tutorial after Phase 14.
- [ ] Oracle deployment and security tutorial after Phase 15.
- [ ] Server customization overview after Phases 11–13.
- [ ] Keep written guides as the source of truth; videos demonstrate them.

**Done when:** A viewer can follow each tutorial from a clean baseline without
depending on undocumented local files.

---

## Deferred research and polish

- Phase 9 full clean-install updater mirror and interruption/rollback tests.
- Phase 10 `comp_client.dll` source recovery or reverse engineering.
- Armory portrait: client screenshot cache (see AI/armory-character-render.md);
  interactive in-browser 3D after that.
- Launcher clan chat or cross-realm messaging.

## Next action

Start **Phase 11** with `@help COMMAND`, then add standardized feedback to the
five most-used GM commands.
