# Ideas backlog (project manager view)

Parking lot for work **outside** the current phase checklist in
[ROADMAP.md](ROADMAP.md). Promote items into the ROADMAP only when you decide
to schedule them.

The ordered execution plan is [IDEA_ROADMAP.md](../IDEA_ROADMAP.md). This file
keeps the longer rationale and unscheduled idea details.

**Legend:** S = small (hours–few days) · M = medium (days–weeks) · L = large
(weeks+) · XL = multi-month / art+platform program

---

## Recommended order (do this sequence)

Principles: **keep the private server fun and operable first**, then **content
pipelines you already proved**, then **ops/deploy**, then **web portal depth**,
then **true art assets**, then **social/AI moonshots**. Tutorials last once
workflows are stable enough to film.

| # | Wave | Items | Why this order |
| --- | --- | --- | --- |
| **1** | Dev QoL (next) | Better `@help` / command feedback · Tunable WorldSharedConfig knobs (logout delay, loot window, max move speed, …) | Unblocks *you* every session; low risk; no players/VPS needed |
| **2** | Content polish (existing tracks) | Phase 8 translation batches · Phase 6 Magical Golden Apple retarget · dungeon crate/CP payouts (+ later webUI) | Builds on skills you already have; players feel it immediately |
| **3** | Ops / deploy | Dockerize (no compile on VM) · then Oracle VPS · Phase 9 nginx/homelab polish as needed | Deploy after QoL+content loops exist; Docker before “ship to VPS” |
| **4** | Website portal | Phase 7 hardening · item/armor wiki · **AI help** · character armory · **CP paid services (boost / appearance / guild rename)** · COMP shop + dungeon-payout webUI | Needs stable lobby APIs + data extracts; paid services after character list APIs |
| **5** | True custom assets | Custom item (icon/model) · custom zone (Blender/texture) · custom demon (model/audio) | Hardest craft; do after server/tools can *consume* the assets |
| **6** | Social / platform | Battle.net–style launcher (friends/realm) · AI “fake players” (DeepSeek bots) | Needs presence APIs, scale, and a live world worth populating |
| **7** | Teaching | YouTube tutorials (item/zone/demon/deploy/customize) | Film only after pipelines are repeatable |

Rough calendar if working part-time: Wave 1 soon → Wave 2 ongoing → Wave 3 when
you want remote play → Waves 4–7 whenever energy/interest peaks (can parallelize
wiki vs translation once Wave 3 exists).

---

## Catalog by theme

### A. Server / GM tooling

#### A1. Better `@help` and command feedback — **S** · Wave 1

**Problem:** `@help` is flat; no `@help spawn`. Many commands succeed silently.
`@invuln` / `@god` (Phase 10) is the desired UX pattern.

**Do:**

- `@help <command>` → usage + short description (reuse the existing help map).
- Standardize success/fail self-chat on more GMands (at least spawn/item/zone/
  instance/speed/common ones).
- Optional: group `@help` by category.

**Depends on:** nothing. **Related:** Phase 10 `@invuln` as reference.

#### A2. Tunable “hardcoded” timings / caps in WorldSharedConfig — **S–M** · Wave 1

**Examples you called out:** logout / character-switch delay (~10s), loot
despawn / pickup window (~10s), max move speed — editable like level cap /
XP bonus in `WorldSharedConfig`.

**Do:** Find each constant → schema field on `WorldSharedConfig` → load from
world config XML → use in channel code. Document defaults in a short guide.

**Depends on:** schema regen / channel rebuild discipline. **Avoid:** client-
only speed cheats; server must remain authoritative.

---

### B. Content & economy (in-game)

#### B1. Translation (most JP → EN) — **L / ongoing** · Wave 2

Continue Phase 8: glossary agent, batches (Magnetite 9541, etc.), measure by
tables not “% done.” Updater (Phase 9) already ships overlays.

**Depends on:** Phase 8 pipeline (done). **Related:** `translation/todo.md`.

#### B2. Phase 6 Magical Golden Apple polish — **S–M** · Wave 2

Retarget stock `21941` etc. (already on ROADMAP polish).

#### B3. Dungeon rewards: random crate loot + CP on boss clear — **M** · Wave 2

Premium currency (CP) on dungeon completion; randomize crate drops. Later:
webUI for payouts (see D5).

**Depends on:** understanding existing instance/boss/crate XML + CP grant APIs.
**Do first as data/scripts**, webUI after.

---

### C. Ops / hosting

#### C1. Dockerize (VM doesn’t compile) — **M** · Wave 3

Image ships prebuilt `comp_lobby` / `comp_world` / `comp_channel` + config
mounts + DB. Homelab/Proxmox Ubuntu becomes `docker compose up`.

**Depends on:** reproducible build (JOBS=2 discipline). **Do before** Oracle
VPS so deploy is “pull image,” not “compile on ARM/x86 guest.”

#### C2. Deploy on Oracle VPS — **M** · Wave 3

Firewall, HTTPS (website + updater), lobby API not public, backups, updater
BaseURL hostname. Phase 9 polish + Phase 7 HTTPS polish fold in here.

**Depends on:** C1 strongly recommended. **Related:** Phase 9 nginx example.

---

### D. Website / tools

#### D1. Website post-MVP hardening — **M** · Wave 4

Rate limits, CSRF, HTTPS, status/news/download — already Phase 7 polish.

#### D2. Item / armor wiki (“COMP cathedral”) — **M–L** · Wave 4

Browse items/armor from BinaryData extracts; searchable. Static-gen or Next
app reading rebuilt JSON/XML from your extract scripts.

**Depends on:** Phase 2/8 extract tooling. **Synergy:** feeds shop webUI.

#### D3. Character armory / tracker (WoW-style) — **L** · Wave 4

Lookup by name → stats, model, achievements. Needs lobby/world read APIs
(character CRUD was already noted as missing). Privacy: public vs friends.

**Depends on:** new COMP HTTP APIs. **Do after** D1/D2 unless APIs come first.

#### D4. WebUI: custom COMP shop editor — **M** · Wave 4

Edit `compshop-*.xml`-class data with preview; export package. You already
browse `datastore/shops/`.

**Depends on:** schema understanding + package install path. **Nice with** D2.

#### D5. WebUI: dungeon payout editor — **M** · Wave 4

One place to edit **all** dungeon clear rewards without opening each
`dungeon_events-*.xml` / DropSet by hand. Covers what other private servers
tune for economy feel:

- **CP per clear** — grindy (~5) through generous (~100+); per dungeon /
  difficulty (e.g. Suginami bronze vs silver).
- **Boss-crate loot tables** — item IDs, weights, mutex / exclusive picks.
- **Golden Apple (and similar) clear payouts** — amounts private servers often
  change alongside CP.
- Preview + validate IDs, then export a reviewable server-content package
  (same install path as Phase 13).

**Depends on:** B3 / Phase 13 working payout format (not raw stock event XML).
**Don’t build UI before** the server payout logic + a stable edit schema exist.

#### D6. AI help desk (“how do I unlock digitalization?”) — **M–L** · Wave 4

Website tab (or page) where players ask natural-language gameplay questions and
get grounded answers from **your** knowledge pack — not generic ChatGPT lore.

**Sources (mix):**

- Scraped public game wiki (cached / attributed; refresh periodically).
- Private-server notes you author as markdown under something like
  `website/knowledge/` or `docs/player-guide/` (mechanics that differ on this
  shard, quest gotchas, digitalization unlock steps, etc.).

**Retrieval debate (decide at build time, not now):**

| Option | Pros | Cons |
| --- | --- | --- |
| **Markdown file tree + search** | Git-friendly, easy to edit/review, no extra service | Weaker semantic match; need good titles/TOC or grep/BM25 |
| **Vector DB (e.g. Chroma)** | Better “fuzzy” questions | Ops + embedding pipeline; harder to diff in git |
| **Hybrid** | MD is source of truth; optional vectors built in CI | Slightly more moving parts |

**Do (MVP sketch):**

- New website nav tab (e.g. **Help** / **Ask**).
- Ingest wiki scrape + your MD into a retrieval index.
- Answer with citations (“from `digitalization.md` §Unlock” / wiki URL).
- Rate-limit + refuse account/password / exploit questions.
- Optional later: in-game `@ask` that hits the same API.

**Depends on:** Phase 7 website live (D1). **Synergy:** D2 wiki pages can feed
the same corpus. **Not** the same as F2 fake players — this is Q&A only.

#### D7. Paid CP character services (WoW-style) — **L** · Wave 4

Account-tied **CP** purchases on the website: level boost (+ gear package),
appearance change (face/hair/skin/gender/…), guild rename, later extras
(character rename, etc.). See roadmap **Phase 16G**.

**Depends on:** character list + world mutate APIs (with 16E); atomic CP debit;
configurable prices. **Related:** existing `@levelup` / `@addcp` GM paths as
implementation hints — not the player UX.

---

### E. True custom assets (art + client)

Website tab (or page) where players ask natural-language gameplay questions and
get grounded answers from **your** knowledge pack — not generic ChatGPT lore.

**Sources (mix):**

- Scraped public game wiki (cached / attributed; refresh periodically).
- Private-server notes you author as markdown under something like
  `website/knowledge/` or `docs/player-guide/` (mechanics that differ on this
  shard, quest gotchas, digitalization unlock steps, etc.).

**Retrieval debate (decide at build time, not now):**

| Option | Pros | Cons |
| --- | --- | --- |
| **Markdown file tree + search** | Git-friendly, easy to edit/review, no extra service | Weaker semantic match; need good titles/TOC or grep/BM25 |
| **Vector DB (e.g. Chroma)** | Better “fuzzy” questions | Ops + embedding pipeline; harder to diff in git |
| **Hybrid** | MD is source of truth; optional vectors built in CI | Slightly more moving parts |

**Do (MVP sketch):**

- New website nav tab (e.g. **Help** / **Ask**).
- Ingest wiki scrape + your MD into a retrieval index.
- Answer with citations (“from `digitalization.md` §Unlock” / wiki URL).
- Rate-limit + refuse account/password / exploit questions.
- Optional later: in-game `@ask` that hits the same API.

**Depends on:** Phase 7 website live (D1). **Synergy:** D2 wiki pages can feed
the same corpus. **Not** the same as F2 fake players — this is Q&A only.

---

### E. True custom assets (art + client)

#### E1. True custom item (icon, model, …) — **L** · Wave 5

Beyond rename/ID: art pipeline, client overlay, Shield tables, updater ship.

#### E2. True custom zone (Blender, textures, …) — **XL** · Wave 5

Geometry/QMP/map pipeline; hardest “one zone” milestone after tools exist.

#### E3. True custom demon (model, texture, audio) — **XL** · Wave 5

Same class as E2; often after item (smaller asset surface).

**Depends on:** Phase 2–5 data round-trip (done for IDs) + client asset format
research. **Do not** block Waves 1–3 on these.

---

### F. Social / platform

#### F1. Battle.net–style launcher — **L** · Wave 6

Friends online + realm without opening the game. Detail below (legacy section).

**Depends on:** presence APIs; Phase 7/9 solid; preferably VPS live (C2).

#### F2. AI fake players (DeepSeek / Ollama bridge) — **XL** · Wave 6–7

Inspired by WoW AzerothCore playerbots + DeepSeek chat bridge (~1800 bots PoC
on Reddit / u/Mr-Nilsson_85). For SMT Imagine: need bot controllers (move,
quest, combat, group) **plus** chat LLM bridge. COMP has AI for *enemies*, not
playerbots — this is a research program, not a phase.

**Depends on:** live world (C2), population design, cost/rate limits for API,
anti-abuse. **Do last** among gameplay ideas unless you want a pure research
spike.

---

### G. Teaching

#### G1. YouTube tutorials — **M–L** · Wave 7

Custom item / zone / demon / deploy / customize. Film after E1–E3 and C1–C2
have a known-good path so viewers aren’t following a moving target.

---

## Battle.net–style launcher (detail)

**Inspiration:** Blizzard Battle.net / WoW realm select — friends visible in the
launcher without opening the game; see which realm a friend is on.

**What we already have:** COMP_hack Qt updater; `VersionData.txt` multi-server
launch; Phase 7 account site; Phase 9 file updates.

| Capability | Status |
| --- | --- |
| Patch client files | Phase 9 |
| Pick realm / `ImagineClient.dat` | `VersionData.txt` |
| News / branding | Updater `Information` URL / website |
| Friends + realm presence | Needs new APIs |
| Friends without launching game | Same + new launcher UI |

**Rough approach:** presence API → lobby/gateway → Electron/Tauri/Qt fork →
keep stock updater as fallback.

**Do not start until:** Wave 3+ and willingness to add server presence APIs.

---

## Explicit non-goals (for now)

- Replacing COMP with a from-scratch server.
- Public production with no firewall on lobby API `:10999`.
- AI bots before Docker/VPS and a stable content loop.
- Filming tutorials before asset pipelines exist.

---

## Suggested “next three” when you ask “what next?”

1. **A1** — `@help <cmd>` + success messages on common GMands  
2. **A2** — WorldSharedConfig knobs (logout / loot / max speed)  
3. **B1 or B3** — next translation batch *or* dungeon CP/crate prototype  

Then Docker (C1) when you care about remote deploy.
