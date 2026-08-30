# Custom SMT Server Roadmap

The order below is based on dependencies and risk, not just feature
desirability. Each phase should leave a small, testable result.

Post-phase / wishlist backlog (Battle.net launcher, Docker, wiki, true custom
assets, AI bots, etc.): [ideas.md](ideas.md).

The ordered roadmap for new work after Phase 10 is
[IDEA_ROADMAP.md](IDEA_ROADMAP.md). Keep this file as the Phase 0–10 MVP
history.

## Phase 0 — Freeze the working baseline

**Purpose:** Make experimentation reversible.

- [x] Put the COMP_hack changes on a dedicated local Git branch.
- [x] Record the exact server commit and client version (`1666`).
- [x] Back up `/etc/comp_hack`, `/var/lib/comp_hack`, and the working client.
- [x] Record clean build, setup, start, stop, and login smoke-test commands.
- [x] Create an ID registry in `docs/ids.md` before adding content.
- [x] Decide which generated/proprietary files remain local only.

**Done when:** A broken experiment can be discarded and the current playable
server restored without reconstructing it manually.

## Phase 1 — Learn the server content model with a custom encounter

**Purpose:** Learn zones, spawn groups, drops, events, validation, and restart
behavior without changing client BinaryData.

- [x] Copy one small existing zone definition into `server-content/zones/`.
- [x] Add or alter an enemy encounter using an existing demon and map.
- [x] Add a recognizable drop or NPC interaction.
- [x] Validate with `comp_verify server_data`.
- [x] Package the content as a datastore ZIP under `datastore/packages/`.

**Done when:** The custom encounter appears in-game and can be removed by
removing one package.

See [docs/phase1.md](docs/phase1.md) for install/test/remove details.

## Phase 2 — Build the BinaryData round-trip workflow

**Purpose:** Prove that client data can be extracted, edited, rebuilt, and
restored before creating custom records.

- [x] Build `comp_bdpatch`, `comp_encrypt`, `comp_decrypt`, `comp_translator`,
  `comp_verify`, and Cathedral of Content.
- [x] Round-trip one harmless client-facing record through XML.
- [x] Document every command and input/output file.
- [x] Compare rebuilt output and test it in a disposable client copy.
- [x] Establish `client-overlay/` as the only client distribution output.

**Done when:** A small text change is visible in-game and rebuilding it is
repeatable from human-editable source.

See [docs/phase2.md](docs/phase2.md) and
[guides/binarydata/round-trip.md](guides/binarydata/round-trip.md).

## Phase 3 — Add one custom item

**Purpose:** Learn synchronized client/server definitions.

Start by reusing an existing icon and model.

- [x] Reserve an item ID in `docs/ids.md`.
- [x] Add the mechanical `ItemData` record.
- [x] Add matching client display/name/description records such as
  `CItemData`.
- [x] Update any required icon/model/supporting tables.
- [x] Install matching Shield data in the server datastore.
- [x] Put the item in a test shop or drop set.
- [x] Verify inventory, stacking, trade, storage, relog, and deletion.

**Done when:** The item has the intended name and behavior, survives relogging,
and creates no server-data validation errors.

See [docs/phase3.md](docs/phase3.md) and
[guides/binarydata/custom-item.md](guides/binarydata/custom-item.md).

## Phase 4 — Add one custom demon

**Purpose:** Extend the same pipeline across more interconnected tables.

Start with an existing model, race, AI, and skill set. A visually new demon can
come later.

- [x] Reserve a demon ID.
- [x] Add `DevilData` stats and growth data.
- [x] Add client name, model, icon, compendium, and related records.
- [x] Add a controlled spawn in the Phase 1 test zone.
- [ ] Test combat, negotiation, summoning, storage, growth, and relog.
- [ ] Add fusion/book data only after the base demon is stable.

**Done when:** The demon works through its full lifecycle without a new server
mechanic.

See [docs/phase4.md](docs/phase4.md) and
[guides/binarydata/custom-demon.md](guides/binarydata/custom-demon.md).

Base spawn/name POC is installed; remaining checkboxes are the in-game
lifecycle smoke and deferred book/fusion work.

## Phase 5 — Create a custom dungeon

**Purpose:** Combine zones, instances, variants, events, scripts, rewards, and
the custom content above.

First build a dungeon using an existing map. A genuinely new map requires
client map metadata, QMP collision, rendering assets, spot data, and more
testing.

- [x] Define a zone instance and variant.
- [x] Add entry/exit events and completion conditions.
- [x] Add custom encounters, boss, drops, and reward flow.
- [ ] Add failure/re-entry/reconnect behavior.
- [x] Package it independently.
- [ ] Only then investigate a new map and client assets.

Minimal POC installed: `@instance 900001` on stock Home III Service Entrance
(`520101`/`5201001`, same map as `@instance 5201`), AI Test Demon partial,
defeat → lobby `20102`. Real Suginami Tunnels is stock `5401+` (optional
retarget). See [docs/phase5.md](docs/phase5.md) and
[guides/custom-dungeon.md](guides/custom-dungeon.md).

Party NPC entry, fail/reconnect hardening, and richer rewards remain open.

**Done when:** A party can enter, complete, fail, reconnect, and repeat the
dungeon predictably.

## Phase 6 — Implement generic resource compressors

**Purpose:** Turn the existing hard-coded Macca/Magnetite behavior into a
reusable server feature and add Golden Apples.

This is the first intentional server C++ feature.

### MVP (done)

- [x] Document the current `AutoCompressCurrency` path in
  `CharacterManager.cpp`.
- [x] Design a server-owned compressor mapping:
  `base item -> compressed item -> value`.
- [x] Load mappings from configuration instead of adding one hard-coded branch
  per resource.
- [x] Preserve existing Macca Note and Mag Presser behavior.
- [x] Add Golden Apple and compressed Golden Apple item definitions
  (POC used custom base `900002`; see polish).
- [x] Implement decompression as an authoritative server operation.
- [x] Recompile and verify mappings load (`comp_verify` / in-game smoke).

Minimal POC installed: `CurrencyCompressor` from `/data/compressors`,
`AutoCompressCurrency=true`, custom Golden Apple `900002`/`900003` + skill
`900001`. See [docs/phase6.md](docs/phase6.md) and
[guides/resource-compressors.md](guides/resource-compressors.md).

**Done when:** Additional compressors can be added through config/data without
another C++ change. *(Met.)*

---

### Polish / post-MVP (later)

Not a new phase — content and edge-case hardening on the finished compressor
system.

- [x] Retarget base to stock Magical Golden Apple `21941` (Vivian XP item);
  drop inert custom base `900002`.
- [ ] **Deferred → Phase 10 + 17A:** Compressed Magical Golden Apple
  (`900003`) + Note/Presser-style decompress. Server `CurrencyCompressor` for
  apples is disabled; definitions retained for later. Blockers: client
  hardcodes Note/Presser dialogs; Mag-Presser-clone `900003` rendered as
  invisible inventory without a real custom item/icon pipeline.
- [ ] Define safe behavior for full inventories, partial stacks, trades,
  shops, bazaars, storage, overflow, and simultaneous updates.
- [ ] Mag Presser pay-time break (Macca-style) and ShopSell / Bazaar mapping.

The observed third-party `<compressors>` client configuration belongs to a
newer/custom `comp_client.dll`; that implementation is not in this checkout.
The server feature should not trust a client-side inventory conversion.

## Phase 7 — Modernize the website

**Purpose:** Use familiar web tooling without coupling website iteration to the
game server.

Recommended initial architecture:

```text
Browser -> HTTPS reverse proxy -> modern web app
                              -> private COMP API on 127.0.0.1:10999
```

App path: [`website/`](website/) (Next.js + shadcn). See
[docs/phase7.md](docs/phase7.md) and [docs/lobby-api.md](docs/lobby-api.md).

### MVP (done)

- [x] Document the existing registration and challenge-response endpoints.
- [x] Build registration, login, account details, and password change.

Sealed httpOnly cookie + COMP challenge BFF (not BetterAuth as the account
store). Stock jQuery account manager remains useful as a local recovery tool.

**Done when:** Public users can register and manage accounts without direct
network access to the lobby API. *(Met for local/dev.)*

---

### Polish / post-MVP (later)

Not a new phase — hardening and portal features on top of the working site.

- [ ] Keep admin routes server-side and enforce authorization.
- [ ] Add validation, rate limiting, CSRF protection, secure cookies, and
  HTTPS.
- [ ] Keep port 10999 firewalled from the public internet.
- [ ] Add server status/news/download pages separately from account auth.
- [ ] Decide later whether to retain the C++ API or build a narrow gateway.
- [ ] Character CRUD / friends / clan chat (need new COMP HTTP APIs).
  See also [ideas.md](ideas.md) (Battle.net–style launcher / friend presence).


## Phase 8 — Build the translation pipeline

**Purpose:** Make translation incremental, reviewable, and reproducible.

AI reduces first-pass translation labor, but extraction, context, terminology,
encoding, line-length constraints, reinsertion, and in-game QA remain
substantial. “Full translation” should be treated as an ongoing data project.

Workspace: [`translation/`](translation/). Notes:
[docs/phase8.md](docs/phase8.md), [guides/translation.md](guides/translation.md).

### MVP (in progress)

Pipeline + inventory first; not “full English.”

- [x] Inventory all text sources:
  BinaryData, Event/MultiTalk, cutscenes, executable strings, and text baked
  into images. *(Initial catalog; refresh with `scripts/translation-inventory.sh`.)*
- [x] Establish a terminology/glossary database for names, skills, demons,
  places, and UI terms. *(Stub `translation/glossary/terms.tsv`.)*
- [x] Extract records with stable IDs and preserve control codes/markup.
  *(Scripted extract via `comp_bdpatch`; first tables TBD for real EN work.)*
- [ ] Add machine checks for missing records, altered placeholders, encoding,
  size limits, and duplicate IDs.
- [ ] Complete one mostly-JP table batch with disposable-client QA.

**Done when (MVP):** Any chosen BinaryData table can be extracted from
Reimagine+JP, edited, rebuilt, and installed without hand-editing binaries.

---

### Polish / post-MVP (later)

- [ ] Use AI for draft translation in batches with surrounding context.
- [ ] Maintain translation memory so repeated strings stay consistent.
- [ ] Prioritize UI -> items/demons/skills -> main story -> quests -> remaining
  flavor text.
- [ ] Human-review and test each batch in-game.
- [ ] Build BinaryData/Event output with `comp_translator`.
- [ ] Keep runtime `translation.xml` work separate because its addresses are
  tied to the exact 1.666 executable.
- [ ] Image-baked UI text.

**Done when (full phase):** Translated source batches rebuild and distribute
without manual binary editing. Coverage measured by translated records/strings,
not an unverifiable percentage.

## Phase 9 — Maintain a client updater overlay

**Purpose:** Keep every player’s client synchronized with server definitions.

### MVP (same machine — completed 2026-07-20)

- [x] Create `base` and `overlay` tree layout + config examples.
- [x] Scripts: seed base hashlist, sync `client-overlay/`, `comp_rehash`, local HTTP serve.
- [x] `comp_rehash` built in COMP checkout.
- [x] Smoke-test incremental update on disposable client (Wine + Phase 8 overlay).
- [x] Document disposable-client QA / Settings pitfalls in [docs/phase9.md](docs/phase9.md)
  and [guides/updater.md](guides/updater.md).

**MVP done:** Overlay rebuilds with `build-updater-overlay.sh`, local HTTP serve,
and a disposable Reimagine-based client pulls changes through `ImagineUpdate.exe`.

### Polish (post-MVP — homelab / production)

- [ ] nginx on Proxmox Ubuntu VM (or this host) with overlay-first `/files/`.
- [ ] Full vanilla 1.666 `base/*.compressed` mirror for clean install.
- [ ] Test clean install, interrupted update, and rollback.
- [ ] Version server packages and client overlay together in release scripts.
- [ ] HTTPS + LAN/public hostname in `ImagineUpdate.dat`.
- [ ] COMP alternate updater bundle in overlay (optional Qt build).

**Full phase done when:** A clean 1.666-compatible client can become the correct
custom client through the updater alone.

## Phase 10 — Custom client DLL features

**Purpose:** Implement behavior that BinaryData and server scripts cannot.

`comp_client.xml` is not an environment-variable system. A line such as:

```xml
<patch name="infiniteHealth">apply</patch>
```

does nothing until `comp_client.dll` contains code that recognizes that name
and applies the feature.

Current blocker for **client-side** patches: the injected `comp_client.dll`
source is not present in this COMP_hack checkout (private GitLab
`comphack/client/comp_client`). All fixed addresses must match the exact
1.666 executable.

For invulnerability, implement a **server-authoritative** GM/developer mode
first. Changing only the displayed client HP is not real infinite health if the
server owns combat state. Notes: [docs/phase10.md](docs/phase10.md).

### MVP (server-side — started 2026-07-20)

- [x] Define intended semantics: GM/test **session toggle** (not visual-only,
  not normal gameplay).
- [x] Implement `@invuln` / `@god` gated by `UserLevel` (`GM_CMD_LVL_INVULN`).
- [x] Ignore HP reductions in `ActiveEntityState::SetHPMP` when session flag set.
- [x] In-game smoke: damage ignored with toggle on; normal with toggle off;
  low-level account cannot enable.

**MVP done:** A privileged account can take zero HP damage in-zone via
`@invuln`, and editing client XML alone cannot grant it.

### Polish (DLL / post-MVP)

- [ ] Locate/recreate the DLL patch framework (or obtain compatible source).
- [ ] Add a recognized config option and client UI behavior only if useful.
- [ ] Ensure ordinary players cannot enable privileged behavior by editing XML
  (already true for server invuln; keep true for any future client visuals).
- [ ] Logout prepare chat: make “N second(s) left…” follow `LogoutDelay`
  (still must send `LOGOUT_PREPARE` before disconnect).
- [ ] Custom currency `<compressors>` decompress dialogs (Golden Apple, etc.).

**Full phase done when:** The server enforces the permission and changing client
XML alone cannot grant invulnerability.

## Recommended first three experiments

1. Custom encounter in an existing zone.
2. One renamed/test item through the BinaryData round trip.
3. A basic Next.js registration page using a server-side proxy to the lobby
   API.

These provide one server-content win, one client-data win, and one familiar
web-development win before tackling the harder C++ and reverse-engineering
work.

Concrete early findings are collected in [docs/research-notes.md](docs/research-notes.md).

