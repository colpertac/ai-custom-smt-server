# Custom SMT Server Roadmap

The order below is based on dependencies and risk, not just feature
desirability. Each phase should leave a small, testable result.

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
[guides/client-binarydata.md](guides/client-binarydata.md).

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

See [docs/phase3.md](docs/phase3.md). In-game confirmation of loot/name/stack
is the remaining player-side smoke check.

## Phase 4 — Add one custom demon

**Purpose:** Extend the same pipeline across more interconnected tables.

Start with an existing model, race, AI, and skill set. A visually new demon can
come later.

- [ ] Reserve a demon ID.
- [ ] Add `DevilData` stats and growth data.
- [ ] Add client name, model, icon, compendium, and related records.
- [ ] Add a controlled spawn in the Phase 1 test zone.
- [ ] Test combat, negotiation, summoning, storage, growth, and relog.
- [ ] Add fusion/book data only after the base demon is stable.

**Done when:** The demon works through its full lifecycle without a new server
mechanic.

## Phase 5 — Create a custom dungeon

**Purpose:** Combine zones, instances, variants, events, scripts, rewards, and
the custom content above.

First build a dungeon using an existing map. A genuinely new map requires
client map metadata, QMP collision, rendering assets, spot data, and more
testing.

- [ ] Define a zone instance and variant.
- [ ] Add entry/exit events and completion conditions.
- [ ] Add custom encounters, boss, drops, and reward flow.
- [ ] Add failure/re-entry/reconnect behavior.
- [ ] Package it independently.
- [ ] Only then investigate a new map and client assets.

**Done when:** A party can enter, complete, fail, reconnect, and repeat the
dungeon predictably.

## Phase 6 — Implement generic resource compressors

**Purpose:** Turn the existing hard-coded Macca/Magnetite behavior into a
reusable server feature and add Golden Apples.

This is the first intentional server C++ feature.

- [ ] Document the current `AutoCompressCurrency` path in
  `CharacterManager.cpp`.
- [ ] Design a server-owned compressor mapping:
  `base item -> compressed item -> value`.
- [ ] Load mappings from configuration instead of adding one hard-coded branch
  per resource.
- [ ] Preserve existing Macca Note and Mag Presser behavior.
- [ ] Add Golden Apple and compressed Golden Apple item definitions.
- [ ] Define safe behavior for full inventories, partial stacks, trades,
  shops, bazaars, storage, overflow, and simultaneous updates.
- [ ] Implement decompression as an authoritative server operation.
- [ ] Recompile and add focused tests.

The observed third-party `<compressors>` client configuration belongs to a
newer/custom `comp_client.dll`; that implementation is not in this checkout.
The server feature should not trust a client-side inventory conversion.

**Done when:** Additional compressors can be added through config/data without
another C++ change.

## Phase 7 — Modernize the website

**Purpose:** Use familiar web tooling without coupling website iteration to the
game server.

Recommended initial architecture:

```text
Browser -> HTTPS reverse proxy -> modern web app
                              -> private COMP API on 127.0.0.1:10999
```

A Next.js app is a reasonable fit given existing experience. Its server-side
routes/actions should call the COMP API; browsers should not call port 10999
directly.

- [ ] Document the existing registration and challenge-response endpoints.
- [ ] Build registration, login, account details, and password change.
- [ ] Keep admin routes server-side and enforce authorization.
- [ ] Add validation, rate limiting, CSRF protection, secure cookies, and
  HTTPS.
- [ ] Keep port 10999 firewalled from the public internet.
- [ ] Add server status/news/download pages separately from account auth.
- [ ] Decide later whether to retain the C++ API or build a narrow gateway.

The current jQuery page is not inherently “recursion hell”; it is simply an
older AJAX/callback style. It can remain available as a local recovery/admin
tool until the replacement is complete.

**Done when:** Public users can register and manage accounts without direct
network access to the lobby API.

## Phase 8 — Build the translation pipeline

**Purpose:** Make translation incremental, reviewable, and reproducible.

AI reduces first-pass translation labor, but extraction, context, terminology,
encoding, line-length constraints, reinsertion, and in-game QA remain
substantial. “Full translation” should be treated as an ongoing data project.

- [ ] Inventory all text sources:
  BinaryData, Event/MultiTalk, cutscenes, executable strings, and text baked
  into images.
- [ ] Establish a terminology/glossary database for names, skills, demons,
  places, and UI terms.
- [ ] Extract records with stable IDs and preserve control codes/markup.
- [ ] Add machine checks for missing records, altered placeholders, encoding,
  size limits, and duplicate IDs.
- [ ] Use AI for draft translation in batches with surrounding context.
- [ ] Maintain translation memory so repeated strings stay consistent.
- [ ] Prioritize UI -> items/demons/skills -> main story -> quests -> remaining
  flavor text.
- [ ] Human-review and test each batch in-game.
- [ ] Build BinaryData/Event output with `comp_translator`.
- [ ] Keep runtime `translation.xml` work separate because its addresses are
  tied to the exact 1.666 executable.

**Done when:** Any translated source batch can be rebuilt and distributed
without manual binary editing. Coverage should be measured by translated
records/strings, not an unverifiable percentage.

## Phase 9 — Maintain a client updater overlay

**Purpose:** Keep every player’s client synchronized with server definitions.

- [ ] Create clean `base` and private `overlay` trees.
- [ ] Include only replacement/additional files in the overlay.
- [ ] Generate manifests and compressed payloads with `comp_rehash`.
- [ ] Test clean install, incremental update, interrupted update, and rollback.
- [ ] Version server and client content together.

**Done when:** A clean 1.666-compatible client can become the correct custom
client through the updater alone.

## Phase 10 — Custom client DLL features

**Purpose:** Implement behavior that BinaryData and server scripts cannot.

`comp_client.xml` is not an environment-variable system. A line such as:

```xml
<patch name="infiniteHealth">apply</patch>
```

does nothing until `comp_client.dll` contains code that recognizes that name
and applies the feature.

Current blocker: the injected `comp_client.dll` source is not present in this
COMP_hack checkout. This phase requires locating compatible source or
reimplementing the injection layer through reverse engineering. All fixed
addresses must match the exact 1.666 executable.

For invulnerability, implement a server-authoritative GM/developer mode first.
Changing only the displayed client HP is not real infinite health if the
server owns combat state.

- [ ] Define intended semantics: visual-only, local testing, GM-only, or normal
  gameplay.
- [ ] Implement and authorize server-side invulnerability for test accounts.
- [ ] Locate/recreate the DLL patch framework.
- [ ] Add a recognized config option and client UI behavior only if useful.
- [ ] Ensure ordinary players cannot enable privileged behavior by editing XML.

**Done when:** The server enforces the permission and changing client XML alone
cannot grant invulnerability.

## Recommended first three experiments

1. Custom encounter in an existing zone.
2. One renamed/test item through the BinaryData round trip.
3. A basic Next.js registration page using a server-side proxy to the lobby
   API.

These provide one server-content win, one client-data win, and one familiar
web-development win before tackling the harder C++ and reverse-engineering
work.

Concrete early findings are collected in [docs/research-notes.md](docs/research-notes.md).

