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

## TODO (living)

### MVP — ship Path 1 on a real display, then 24/7 headless

Pipeline core (done):

- [x] Studio dress/pose API + admin UI (`vam1` / `vaf1`)
- [x] Fingerprint + sqlite queue + ingest → `portraits/{hash}.png`
- [x] Worker: dress → camera init (once) → S → screenshot → crop → ingest
- [x] Nameplate hide for shot (blank name+title via CHARACTER_DATA; RAM
      restored so DB never keeps blank). Per-job hold S re-faces after
      that packet snaps spawn rotation.
- [x] Login helper: keys + measured Start Game click (`portrait-login.py`)

Still MVP:

- [x] Health watchdog: poll `/studio/health`; Discord webhook if watched
      mannequins offline longer than N seconds (dedupe + recover notify).
      `scripts/portrait/portrait-watchdog.py` / `npm run portrait-watchdog`.
      Set `PORTRAIT_DISCORD_WEBHOOK` in `website/.env.local` (gitignored).
- [x] Soak `portrait-worker loop` on PC (male + nameplate restore stable)
- [x] Dual mannequin ops: `vaf1` client up; pin `PORTRAIT_WINDOW_VAM1` /
      `PORTRAIT_WINDOW_VAF1` when two windows share a display
- [x] Dedicated `portrait-launch` + **`portrait-orch`** (launch two clients,
      auto-pin windows to vam1/vaf1 in `windows.json`, login, init-camera).
      No manual `wmctrl` / `PORTRAIT_WINDOW_*` exports.
- [x] Clear cache for QA: `npm run portrait-queue -- clear` (hash PNGs +
      queue DB; `--stubs` also removes `cat2.png`-style files).
- [x] Homelab headless: Xvfb (+ optional openbox) + Wine clients + worker;
      Wine `SendInput` helper for hold-S / Home / PageUp; studio on LAN.
- [x] Website queue HTTP for remote workers (`/api/portrait/queue/*` +
      `X-Portrait-Worker-Token` / `PORTRAIT_WORKER_TOKEN`)
- [x] Homelab worker uses queue HTTP (no local `website/` sqlite); CLI menu
      (`portrait-cli` / uv + `.env`)
- [ ] **Deploy gate — Tailscale:** website on VPS + worker/studio on
      homelab. Confirm claim → dress → hold S → ingest over Tailscale
      (`PORTRAIT_QUEUE_URL` / `PORTRAIT_STUDIO_URL` / tokens). LAN soak
      done; VPS path **not** verified yet.
- [ ] Boot/systemd (or equivalent): launch → login → init-camera → worker
      loop; restart on crash

### Post-MVP

- [ ] Admin remote kill/restart (Wine client / worker / orch) once processes
      are systemd-unit shaped — not from website until then
- [ ] Auto-relogin when health goes false (launch + login + reset-camera)
- [x] Female path soak + always-on `vaf1` beside `vam1`
- [ ] Queue polish (Redis/BullMQ only if multi-worker / multi-host needs it)
- [ ] WebP (or smaller) portraits; CDN/object storage if files grow
- [ ] Armory UI: clearer queued/missing states, optional poll/revalidate
- [ ] Wall-zoom / alternate studio map if Home+PageUp framing isn’t enough
- [ ] True no-client renderer (approach 3) — only if Path 1 ops stay painful

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

**Do you need a laptop with the game up 24/7?** Path 1 needs _a process
that runs the Imagine client_ so it can draw. That is not the same as you
sitting at a GUI.

| Slice              | What actually runs                                             |
| ------------------ | -------------------------------------------------------------- |
| Now / first worker | Dedicated box or leftover PC (Windows, or Linux + Wine) with a |

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

| What we tried               | Result                                            |
| --------------------------- | ------------------------------------------------- |
| Stay in zone after DB write | No visual change                                  |
| Move between zones          | Still no change (channel keeps EquippedVA in RAM) |
| Full game restart / login   | **VA visible** — Bordia + Desert Rambus           |

**Two copies (do not confuse):**

```
SQLite  --login only-->  channel Character (RAM)  --packets-->  client (RAM/GPU)
```

- **SQLite** — durable. We wrote cat2’s VA here while online. Nothing live reads it.
- **Channel RAM** — source of truth _while logged in_. Loaded at login; zone
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
dirty), so SQLite `1` survived. XP/VA changes the player made in-game _would_
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

| Abandoned                                 | Why                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------- |
| Blender Niftools / glTF from Imagine NIFs | Wrong tool chain for Gamebryo; materials/colors missing                         |
| NifSkope composite as source of truth     | Good for mesh sanity only; not portrait-accurate                                |
| Manual “wiki of every item ID → nif”      | Client bins already map IDs; QA **rules** + golden chars, not thousands of rows |
| Website assembling `Avatar/*.nif` lists   | Flaky composition rules; still not final look                                   |

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
# one-time (init-camera / orch up) — sticky until mannequin relog:
@zone 10105
@pos 50000 50000    # vam1; vaf1 uses -50000 -50000 so they don't stack
# hold S ~2s        # face the camera (character centered in frame)
# per job: @copylook only (pose:false) — facing stays after hot-swap
```

**No demon in the shot.** Partner models are not customizable and need a
summon to appear; leave them dismissed. Character look + title plate matter.

Black void + crop. No greenscreen. No hero vignette — the profile border
shrink-wraps the image (`object-contain` / cover would pillarbox or crop).
Prefer a **centered full-body** crop (manual `_cropped.png` or a tight
trial around the PC). HUD-heavy / off-center crops are worse for the
armory slot.

`10105` spawn still has spots **40000 → 10104**, **40001 → 10101** — that
is why a step at default spawn dumps you. `init-camera` parks via
`POST /studio/pose` (`@pos` offsets); queue jobs only `@copylook`.

- [x] Dedicated mannequin **accounts** (not chars on `catm`): `vam1`
      (male) and `vaf1` (female). One session per account — both can stay
      logged in 24/7. Login helper: `scripts/portrait/portrait-login.py` (Esc →
      user/pass keys → click Start Game). Passwords via env only.
      Legacy `va` / `vam` / `vaf` still accepted by health/pose.
- [x] **Dummy weapon:** `@dummyweapon` (alias `@dummywep`) equips a cheap
      slot-13 item whose ItemData `subCategory` matches EquippedVA slot 24.
      `@clearinventory` unequips all gear except COMP, then scraps
      everything else (full studio wipe). VA is separate (`@va clear`).
      Mapping:

  | subCategory | Class              | cheap dummy e.g. |
  | ----------- | ------------------ | ---------------- |
  | 23          | tonfa              | 1901             |
  | 24          | machete / 1H blade | 1201             |
  | 25          | knife              | 1301             |
  | 26          | rod                | 1401             |
  | 27          | 2H sword           | 1501             |
  | 28          | spear              | 1601             |
  | 29          | axe                | 1701             |
  | 32          | pistol / HG        | 2001 Nambu       |
  | 33          | rifle / RF         | 2101             |
  | 34          | shotgun / SG       | 2201             |

  `weaponType` CLOSE_RANGE vs LONG_RANGE is too coarse (sword vs tonfa
  both close). Match **subCategory** (or CEquipModel nif family BS/HG/RF/…).

- [x] Dress via `@va` (proven). `@copylook NAME` copies skin/hair/face/
      eyes/colors + EquippedVA + active title plate (`CustomTitles` /
      `CurrentTitle`) onto the live mannequin (RAM + salon/VA/title
      packets). Gender is not copied; mismatch is refused. If the source
      has **no VA**, `@copylook` falls back to `@copygear`. Partner
      demon is not copied. Note: `@title ID` only unlocks a title; the
      floating nameplate is the CustomTitles array (e.g. catm
      “COMP_hack Team” = part `1571`).
- [x] `@copygear NAME` generates studio copies of real EquippedItems
      Types and equips them (skips COMP). For flashy non-VA looks
      (`cat3`). Can also be run alone after `@copylook`.

### 2. Capture host (this PC is fine for the first PNG)

- [x] Same client (mannequin). After `@pos 50000 50000`: **S ~2s**
      (face camera, character centered). Do **not** summon a demon.
- [x] Fixed window size. Manual screenshot first; then
      `scripts/portrait/portrait-crop-worker.py watch` (drop OS PNG → trial crops).
      Ingest a centered full-body candidate (or your own `_cropped.png`).
- [x] Prove: `@va` / `@copylook` → PNG looks like in-game. Border
      shrink-wraps the crop.

### 2b. Automation (approach B — channel dresses, worker shoots)

Loopback studio HTTP on channel (`StudioHttpPort` / `StudioToken` in
`runtime/config/channel.xml`). Binds **`127.0.0.1` only**.

```bash
# health — which mannequins are online
curl -H "X-Studio-Token: $PORTRAIT_STUDIO_TOKEN" \
  http://127.0.0.1:14700/studio/health

# dress + studio pose (zone 10105; vam @ 50000,50000 / vaf @ -50000,-50000)
curl -H "X-Studio-Token: $PORTRAIT_STUDIO_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"mannequin":"vam1","source":"catm"}' \
  http://127.0.0.1:14700/studio/dress

# worker: claim → dress → S → screenshot → crop → ingest
cd website
npm run portrait-worker -- health
npm run portrait-worker -- once          # one job
npm run portrait-worker -- loop          # poll forever
```

Env (optional): `PORTRAIT_STUDIO_URL`, `PORTRAIT_STUDIO_TOKEN`,
`PORTRAIT_MANNEQUIN_M=vam1`, `PORTRAIT_MANNEQUIN_F=vaf1`,
`PORTRAIT_CROP_PRESET=studio` (fractional LRTB from your manual crop vs
1440×900 window — scales to any res), `PORTRAIT_WINDOW_VAM1` /
`PORTRAIT_WINDOW_VAF1` (wmctrl hex ids when both clients are up).

**Login helper** (`scripts/portrait/portrait-login.py` / `npm run portrait-login`):

```bash
export PORTRAIT_VAM1_PASS='…'   # not in git
# optional launch:
# export PORTRAIT_CLIENT_CMD='wine /path/to/Imagine.exe'
npm run portrait-login -- vam1            # game already open
npm run portrait-login -- vam1 --launch   # start client first
npm run portrait-login -- vam1 --start-only  # only click Start Game
```

Tune Start Game click with `PORTRAIT_START_X_FRAC` / `PORTRAIT_START_Y_FRAC`
(defaults 0.12 / 0.92).

**Admin UI:** `/admin/studio` — health + dress button (BFF proxies with
server-side token). Curl / worker still hit channel directly.

**Camera (sticky until relog) — do not zoom/pan every job.**

Keyboard camera (zoom / orbit / pitch) does **not** reset until character
login. If the worker holds Home / PageUp on every capture, offsets stack
and only the first shot looks right.

Preferred approach **A — one-time camera setup** (worker init or after
mannequin login), then each job only does dress + hold **S** (character
facing) + settle + screenshot:

| Step        | Key       | Hold     | When                                             |
| ----------- | --------- | -------- | ------------------------------------------------ |
| Zoom in     | `Home`    | **1.7s** | Once at init (after clean camera / fresh login)  |
| Pitch down  | `Page Up` | **0.5s** | Once at init, after zoom                         |
| Face camera | `S`       | ~2s      | Every job (character move; does not stack orbit) |
| Settle      | —         | ~1s      | After releasing S, before screenshot             |

**Studio crop (resolution-independent):** matched
`Screenshot_20260814_221258.png` (1440×900) to `…_cropped.png`
(577×792) as an exact subimage at LTRB `447,103,1024,895` → fractions
`L=0.310417 R=0.711111 T=0.114444 B=0.994444`. Worker default preset
`studio` applies those fractions at any window size (incl. higher-res
headless). Re-derive if camera init framing changes.

**Nameplate:** do **not** crop the floating name/title out of the image —
tall hats/caps sit under the plate, so a higher top crop chops gear.
Instead the worker dresses with `plate:false` (channel blanks name +
clears `CustomTitles`, sends packets, **never** `QueueUpdate`s the blank
name). After the shot: `POST /studio/nameplate` `{visible:true}` restores.
Admin `/admin/studio` keeps `plate:true` so you still see titles when
dressing by hand.

Rejected / later:

- **B — wall auto-zoom:** teleport near a wall and walk into it so the
  client auto-zooms. Deterministic in theory, but studio void `10105`
  has no wall; needs a different map. Spike later if A is not enough.
- **C — Cheat Engine / RAM inject:** force camera floats (and optionally
  rewrite the floating name). Fragile; channel nameplate hide above
  replaces the temp-rename idea.

Env knobs: `PORTRAIT_CAM_HOME_SEC`, `PORTRAIT_CAM_PGUP_SEC`,
`PORTRAIT_HOLD_S_SEC`, `PORTRAIT_SKIP_INIT_POSE=1` / `--skip-pose`.
State file `work/portrait-captures/camera-ready.json` remembers which
mannequins already got pose+Home/PageUp+S. After relog:
`npm run portrait-worker -- reset-camera` then `init-camera vam1`.
Jobs never re-pose or hold S (optional legacy `--hold-s`).

**Headless later:** still the Imagine client under Xvfb/virtual display
(or a Present hook). Not a standalone renderer library.

- [x] Channel `DressStudioMannequin` + `POST /studio/dress` /
      `GET /studio/health` (token required).
- [x] `POST /studio/ensure-name` — repair blank vam/vaf char Name (online or
      offline DB); orch + `init-camera` call it.
- [x] Admin `/admin/studio` remote preview snaps (worker `preview` + BFF).
- [x] Nameplate hide/restore (`plate:false` + `POST /studio/nameplate`);
      worker uses hide for shots, restores in `finally`.
- [x] `scripts/portrait/portrait-worker.py` once/loop (curl + wmctrl + import +
      crop + ingest).
- [x] Admin `/admin/studio` dress UI (BFF proxy).
- [x] Worker: one-time Home 1.7s + PageUp 0.5s on init; jobs keep S-only.
- [x] `portrait-login.py` + defaults `vam1`/`vaf1`.
- [ ] Ops: leave both clients logged in; pin window ids if running two
      Imagine windows.

### 3. Fingerprint + files (website)

- [x] Hash `v1|appearance|title|va slots|weapon Type|d=0` → 16-hex
      SHA-256 (`lib/armory-portrait.ts`). Partner demon is **not** in the
      hash (character-only portraits). File
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

| Piece                     | Store                       | Not             |
| ------------------------- | --------------------------- | --------------- |
| Fingerprint               | CPU hash of DB fields       | Redis key       |
| Portrait bytes            | filesystem / object storage | Redis (too fat) |
| “please render this hash” | sqlite `pending` first      | required Redis  |

**Later, if** website replicas or more than one capture worker: Redis
(BullMQ) is enough for the **queue** — one Redis, not Redis + RabbitMQ.
BullMQ _is_ Redis. RabbitMQ is a second broker you don’t need for this
volume. Phase 16 already deferred Redis for rate limits; same rule here.

- [x] On miss, insert `pending` row in `website/data/portraits.db`
      (`lib/portrait-queue.ts`). Armory returns `portraitStatus: "queued"`.
      `npm run portrait-queue -- claim` prints mannequin `@va` lines.
      Complete only after `portraits/{fingerprint}.png` exists.
- [x] Worker loop (local): `npm run portrait-worker -- loop` → claim →
      channel `/studio/dress` → framing → screenshot → crop → ingest.
      Crop helper still available standalone:
      `python3 scripts/portrait/portrait-crop-worker.py watch`.
- [x] No Redis yet. One job at a time (15 min claim timeout).

### 5. Explicitly later

- Per-field appearance GM (`@hair` / skin/face/eyes/colors) — `@copylook`
  covers the mannequin case.
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
   Local CLI: `npm run portrait-queue -- claim` / `ingest`.
   Remote worker HTTP (token `X-Portrait-Worker-Token`):
   - `GET  /api/portrait/queue/health`
   - `POST /api/portrait/queue/claim`
   - `POST /api/portrait/queue/fail` JSON `{ fingerprint, error? }`
   - `POST /api/portrait/queue/ingest` multipart `fingerprint` + `file`
   - `GET  /api/portrait/queue/{fingerprint}`
   Ingest: `npm run portrait-queue -- ingest crop.png <fingerprint>`.
4. Worker claims job → client capture → write object + mark `ready`.
5. UI: CSS bust placeholder until `ready` (poll or revalidate).

Pin with gear-aware stats only at the “async worker / fingerprint” product
layer — not the same implementation.

See also: [IDEA_ROADMAP.md](../IDEA_ROADMAP.md) § 16E.
