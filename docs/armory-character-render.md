# Armory character portrait render (WoW-style)

**Decision:** Do **not** ship Blender / NifSkope / hand-assembled Avatar
`*.nif` compositing for the website. A 2026 PoC (`work/armory-render-poc/`)
proved mesh ID lookup is brittle (VA vs equip, Type vs BasicEffect, Hidden,
gender `M_`/`W_`, `CEquipHairData` vs naive offsets) and still wrong in
NifSkope for **colors** (hair/eyes/skin are runtime materials, not geometry).

**Goal:** Cached PNG (or WebP) on `/armory/[name]`, keyed by an **appearance
fingerprint**, filled by an async worker — same product shape as WoW armory
portraits.

Fingerprint should include at least: gender, Skin/Face/Eye/Hair types +
colors, `EquippedVA` map (incl. Hidden), and the **resolved weapon visual**
rule once locked; invalidate when those change.

---

## Approaches (preferred order)

### 1 — Drive the real client, screenshot, cache (preferred)

Use the same renderer players already trust. Website never builds meshes.

```
armory request → fingerprint
  → cache hit? serve PNG
  → else enqueue job
       worker: make the Imagine client draw that look → capture → store PNG
  → page shows placeholder until ready
```

Ways to “show that look” without rewriting the engine:

- **Preview dummy** — channel (or a tiny preview service) spawns a character /
  NPC with copied appearance + `EquippedVA` in an empty zone; a bot client
  logs in, faces them, screenshot.
- **Packet path** — reuse what the client already gets
  (`OTHER_CHARACTER_DATA` + VA changed); automation only needs camera + grab.
- **Online capture** (optional later) — snapshot when the real player is
  zoned; weaker freshness guarantees.

Worker host: dedicated Wine/Windows box or container with the client tree +
virtual display. Start with a filesystem/DB job queue; Redis later if needed.

**Pros:** Correct colors, fusion/VA/Hidden, weapons.  
**Cons:** Ops weight (client install, GPU/display, flaky UI automation).

**Do you need a laptop with the game up 24/7?** Path 1 needs *a process
that runs the Imagine client* so it can draw. That is not the same as you
sitting at a GUI.

| Slice | What actually runs |
| --- | --- |
| Now / first worker | Dedicated box or leftover PC (Windows, or Linux + Wine) with a
  display or dummy HDMI. Can be a mini PC in a closet, not your daily
  laptop. Does **not** need to render when the PNG cache hits — only on
  enqueue. Could even start the client per job if startup is tolerable. |
| Later “headless server” | Still the **same client**, no monitor: Xvfb / Weston /
  Windows headless GPU / Wine + virtual display. Many VPS have **no GPU**;
  software D3D (llvmpipe/wined3d) may work slowly for one portrait at a
  time. Imagine is old DirectX — Wine is unproven until tried. |
| True no-`game.exe` | Approach **3** (custom renderer). Not Path 1. |

Website/channel stay on any headless VPS as today. Only the **portrait
worker** needs a client-capable host. Cached WebPs are just files.

#### Path 1 — concrete flow (how it would work here)

**Logout pose ≠ camera.** World DB stores `LogoutZone` / `LogoutX` / `LogoutY` /
`LogoutRotation` (character body facing). It does **not** store camera zoom,
pitch, or orbit. For portraits you either:

- fix a **studio zone** + always park the mannequin on a known spot/facing and
  teach the bot a fixed camera (hotkey / first-person / scripted look-at), or
- later hook the client camera (leans into approach 2).

**Do not mutate the real player for renders.** Copy appearance onto a dedicated
**mannequin** account/character (or a server-side preview entity). Touching live
`cat`/`catm` gear mid-session is racy and surprising for the owner.

Suggested pipeline:

1. **Website / BFF** — on armory miss, enqueue
   `{ fingerprint, name, appearance fields, EquippedVA, weapon rule inputs }`.
2. **Worker** — claims job; tells channel (GM/admin RPC or internal socket):
   “dress mannequin as fingerprint X in studio zone Z”.
3. **Channel** — must mutate the **in-memory** mannequin (not SQLite while
   online) and emit the packets the client already understands:
   - VA: `PACKET_VA_CHANGED` (see `VAChange.cpp`)
   - Gear: `PACKET_EQUIPMENT_CHANGED`
   - Full body on **login** / first send: `SendOtherCharacterData`
4. **Mannequin client** — after dress, **relog** (or worker starts it already
   dressed). Then the camera bot screenshots.
5. **Capture** — OS screenshot of the client window (or DXGI grab). Crop to
   character. Write `portraits/{fingerprint}.webp`. Mark job ready.
6. **Website** — serves URL; placeholder until ready.

**Experiment (2026-08, `cat2`):** wrote `EquippedVA` (Bordia top `23602` +
Desert Rambus `2004`) to world SQLite while the character was online.

| What we tried | Result |
| --- | --- |
| Stay in zone after DB write | No visual change |
| Move between zones | Still no change (channel keeps EquippedVA in RAM) |
| Full game restart / login | **VA visible** — Bordia + Desert Rambus |

**Two copies (do not confuse):**

```
SQLite  --login only-->  channel Character (RAM)  --packets-->  client (RAM/GPU)
```

- **SQLite** — durable. We wrote cat2’s VA here while online. Nothing live reads it.
- **Channel RAM** — source of truth *while logged in*. Loaded at login; zone
  changes resend **this**, not SQLite. That’s why `@zone` after a DB edit did
  nothing: server still had empty VA.
- **Client RAM** — seeded at login from those packets (`OTHER_CHARACTER_DATA` +
  EquippedVA). Relog works because channel reloads SQLite → sends fresh packets
  → client rebuilds the avatar.

Poking **client** costume RAM with Ghidra is approach 2 (fragile, patch-breaks).
The client already has a seed path: `PACKET_VA_CHANGED` / full character data.
If live portraits need no relog, add a **channel GM/RPC** that
`SetEquippedVA` on the live object **and** send that packet — don’t scrape
client memory first.

So: **SQLite edits are login-time only.** Zoning does **not** re-read VA from
DB. Path 1 dress the mannequin with **`@va` (proven live, 2026-08 `cat2`)** —
same packets as the closet UI. Relog-after-SQLite is the slow fallback.

  ```
  @va 3 23602
  @va 24 2004
  @va                  # dump live slots
  @va clear
  ```

  **Weapon VA needs real gear:** slot 24 (e.g. Desert Rambus `2004`) is stored
  even with an empty inventory, but the client will not draw it until a
  matching weapon is **equipped** (any pistol for a pistol VA). `@va`
  warns when slot 24 is set with equip 13 empty. Mannequin: dummy pistol
  in slot 13, then VA 24.

  **`@reloadchar`:** login `PACKET_CHARACTER_DATA` while zoned **despawns**
  the avatar until `@zone`. Fixed to `SHOW_ENTITY` + other-player data only;
  confirmed movement/input stay normal. Prefer `@va` for dress tests.

Do **not** plan on “edit DB + `@zone`” as a refresh.

**Character select ≠ full exe restart (2026-08, `cat2`):** after SQLite
`Level=1` while still in the zone (HUD still 99), **Switch character** showed
level 1 on the list with no game restart. That screen is **lobby**
`PACKET_CHARACTER_LIST`, which **Always reload** `CoreStats` from world SQLite
(`CharacterList.cpp`). Leaving the channel drops the in-memory Character;
the next **StartGame** loads SQLite again. So “relog” for Path 1 means
**channel logout → lobby list → enter**, not kill the client process.

Do **not** treat that as a safe live-edit API: logout still
`Update(CoreStats)` from RAM if those objects are dirty. We got lucky on
Level because this session never `SetLevel` (still 99 in RAM, likely not
dirty), so SQLite `1` survived. XP/VA changes the player made in-game *would*
flush RAM over a sneaky DB write.

**Pseudo logout + load (skip the UI click):** the button is the client
talking to **lobby** (`CharacterList` then `StartGame.cpp`). The server
cannot honestly “click” that on a human client. Options:

- **Bot we own** (the portrait worker): `libclient` already has
  `GetCharacterList()` + `StartGame()` — script logout and re-enter, no
  mouse. This is the practical Path 1 dress cycle if we keep using SQLite.
- **Kick to lobby** (`@kick`): still needs someone/something to send
  StartGame.
- **Better:** never leave the zone — `SetEquippedVA` / `SetLevel` on RAM +
  `SendCharacterData` / `PACKET_VA_CHANGED`. Fake logout is a workaround
  for “we only wrote SQLite.”


**Same RAM rule for level (2026-08, `cat2`):** SQLite `EntityStats.Level` set
99 → 1 while online. Expect HUD still 99 until relog. Live level change already
exists: `@levelup N` calls `CharacterManager::LevelUp` on RAM + packets (up
only). “Retrigger load character” = call `SendCharacterData` /
`SendOtherCharacterData` again (TCP game packets, not a websocket). Fake lag /
illegal move will not reliably resend VA; movement reject is a different
packet.

Studio zone tip: empty map, flat lighting, fixed spawn + body rotation so every
portrait framing matches without stored camera state.

### 2 — Light hook / thin wrapper on the client

If (1) cannot be automated cleanly (no stable UI path), use light RE once:

- Find or hook “draw character” / DXGI/`Present` / backbuffer.
- Force camera + appearance, grab pixels; still **call existing draw code**.

Ghidra/x64dbg here is **glue**, not a full engine reimplementation.

**Pros:** More reliable capture than pure UI automation.  
**Cons:** Breaks on client updates; still need a client binary running.

### 3 — Headless custom renderer (avoid unless necessary)

Reimplement or deeply extract the Gamebryo avatar pipeline outside the game
UI (heavy Ghidra, materials, attachments).

**Pros:** Throughput / no GUI.  
**Cons:** Highest cost, easiest to diverge from live client; do not start here.

---

## Explicitly out of scope for production

| Abandoned | Why |
| --- | --- |
| Blender Niftools / glTF from Imagine NIFs | Wrong tool chain for Gamebryo; materials/colors missing |
| NifSkope composite as source of truth | Good for mesh sanity only; not portrait-accurate |
| Manual “wiki of every item ID → nif” | Client bins already map IDs; QA **rules** + golden chars, not thousands of rows |
| Website assembling `Avatar/*.nif` lists | Flaky composition rules; still not final look |

PoC leftovers under `work/armory-render-poc/` are **reference only** (VA-first
lessons, `CEquip*Data` paths). Do not extend into the Next.js app.

---

## Supporting data (not the renderer)

Still useful later for tooltips / debugging / fingerprint inputs:

- `CEquipHairData` / `CEquipFaceData` / `CEquipEyeData` — appearance id → nif
- `CEquipModelData` + `CItemData` — item / VA id → mesh names
- World DB: `EquippedVA`, appearance fields, `EquippedItems` Type/BasicEffect

Optional: extract bins → JSON catalog for the worker or admin tools. That
catalog does **not** replace approach 1/2 for pixels.

---

## First slice — what to build (in order)

Goal of slice 1: **one** cached WebP of a known look (`cat2` or a mannequin
copy of `cat`) on `/armory/[name]`. Not a fleet of workers, not Wine, not
Ghidra.

### 1. Studio + mannequin (channel)

**Framing (proven):** any zone works. Teleport off the map so walk pads
don’t fire, then use **S (back)** so the default behind-camera is a
front-facing shot — no right-click orbit.

```
@zone <id>          # 10105 black void is nice; not required
@pos 50000 50000    # far from spots / geometry
# tap forward once if partner demon is facing away (aligns with PC)
# hold S ~2s        # face the camera
```

Black void + crop. No greenscreen. No hero vignette — the profile border
shrink-wraps the image (`object-contain` / cover would pillarbox or crop).

`10105` spawn still has spots **40000 → 10104**, **40001 → 10101** — that
is why a step at default spawn dumps you. `@pos 50000 50000` avoids them.
Worker should script `@pos` + brief backstep, not LockMovement-at-spawn.

- [ ] Dedicated mannequin account (not `cat` / `catm`). Copy gender +
      appearance. `@zone` + `@pos 50000 50000` + S.
- [ ] **Dummy weapon is dynamic:** VA slot 24’s item `subCategory` must
      match the equipped slot-13 weapon. ItemData (not “any pistol”):

  | subCategory | Class | cheap dummy e.g. |
  | --- | --- | --- |
  | 23 | tonfa | 1901 |
  | 24 | machete / 1H blade | 1201 |
  | 25 | knife | 1301 |
  | 26 | rod | 1401 |
  | 27 | 2H sword | 1501 |
  | 28 | spear | 1601 |
  | 29 | axe | 1701 |
  | 32 | pistol / HG | 2001 Nambu |
  | 33 | rifle / RF | 2101 |
  | 34 | shotgun / SG | 2201 |

  `weaponType` CLOSE_RANGE vs LONG_RANGE is too coarse (sword vs tonfa
  both close). Match **subCategory** (or CEquipModel nif family BS/HG/RF/…).
- [ ] Dress via `@va` (proven). Later RPC. Copy Hidden + face/hair/eyes/
      colors (`@va` does not set those yet).

### 2. Capture host (this PC is fine for the first PNG)

- [ ] Same client (mannequin). After `@pos 50000 50000`: optional 1 step
      forward (demon faces with you), then **S ~2s** (you face camera).
- [ ] Fixed window size. Manual screenshot first; then script that
      sequence + crop.
- [ ] Prove: `@va` → PNG looks like in-game. Border shrink-wraps the crop.

### 3. Fingerprint + files (website)

- [x] Hash `v1|appearance|title|va slots|weapon Type|demon Type` → 16-hex
      SHA-256 (`lib/armory-portrait.ts`). File
      `portraits/{fingerprint}.png`; name-keyed `cat2.png` is PoC fallback.
      API: `portraitFingerprint`, `portraitStatus` ready|queued|missing.
- [x] First capture: `public/armory/portraits/cat2.png` (name-keyed PoC;
      fingerprint filenames later). Source crop in
      `work/armory-render-poc/captures/`.
- [x] `GET /api/armory/[name]` includes `portraitUrl` when the file exists.
- [x] `ArmoryHero` shrink-wraps the image in the slot border (no vignette,
      no cover-crop); else the name stub.

### 4. Job queue (still local / sqlite)

Fingerprint is **not** a Redis cache. It is a **content hash** computed on
each armory read from world DB (appearance + EquippedVA + weapon
subCategory). The **PNG filename** is the cache (`portraits/{hash}.png`).
If the file exists, serve it; if VA changes, the hash changes, miss, enqueue.

| Piece | Store | Not |
| --- | --- | --- |
| Fingerprint | CPU hash of DB fields | Redis key |
| Portrait bytes | filesystem / object storage | Redis (too fat) |
| “please render this hash” | sqlite `pending` first | required Redis |

**Later, if** website replicas or more than one capture worker: Redis
(BullMQ) is enough for the **queue** — one Redis, not Redis + RabbitMQ.
BullMQ *is* Redis. RabbitMQ is a second broker you don’t need for this
volume. Phase 16 already deferred Redis for rate limits; same rule here.

- [x] On miss, insert `pending` row in `website/data/portraits.db`
      (`lib/portrait-queue.ts`). Armory returns `portraitStatus: "queued"`.
      `npm run portrait-queue -- claim` prints mannequin `@va` lines.
      Complete only after `portraits/{fingerprint}.png` exists.
- [ ] Worker loop: claim job → dress mannequin (`@va` RPC) → wait N ms →
      screenshot → write WebP → `ready`.
- [x] No Redis yet. One job at a time (15 min claim timeout).

### 5. Explicitly later

- Appearance GM (`@hair` / skin/face/eyes/colors) if mannequin base isn’t
  copied from the target.
- Auto-equip dummy by VA item `subCategory` (table above).
- Headless Xvfb/Wine.
- Always-on mini PC.
- Interactive 3D.

**You can start 1–2 this week on the machine that already runs the client.**
3–4 are the website slice once one good PNG exists.

---

## Website integration sketch

1. BFF computes fingerprint when serving `/api/armory/[name]`.
2. If `portraits/{fingerprint}.webp` exists → URL on the profile.
3. Else insert job `pending` in `data/portraits.db`; return `portraitStatus: "queued"`.
   Claim with `npm run portrait-queue -- claim` (prints mannequin `@va` lines).
4. Worker claims job → client capture → write object + mark `ready`.
5. UI: CSS bust placeholder until `ready` (poll or revalidate).

Pin with gear-aware stats only at the “async worker / fingerprint” product
layer — not the same implementation.

See also: [IDEA_ROADMAP.md](../IDEA_ROADMAP.md) § 16E.
