# 2026-07-22 — A1 batch: UIInfoData high-traffic CJK → EN

Incremental Track A1 batch (not full-game). Stops here for review before
`CMessageData_Shop` / items / Mag `9541`.

## Table

| | |
| --- | --- |
| File | `BinaryData/Client/UIInfoData.bin` |
| Type | `uiinfo` (`comp_bdpatch`) |
| Source XML | `client-source/BinaryData/Client/UIInfoData.xml` (gitignored) |
| Overlay bin | `client-overlay/BinaryData/Client/UIInfoData.bin` |
| Disposable QA client | `/home/cat/software/smt/game/reimagine-phase8-uiinfo-test` |

## Scope

- Translated **172** still-CJK `text` fields (many duplicate labels across widget IDs).
- Focus: inventory actions, economy (Macca/Magnetite), storage/rental, exchange
  chrome, mitama/COMP-adjacent labels, expert-bonus lines.
- Skipped: dummy placeholders (`あああ…`, `テキストN`, `アイテムN`, padded name
  templates), long seasonal/caption blobs, guardian GPL placeholder rows.
- CJK heuristic after rebuild: **117 / 2832** remaining (was 289).

## Glossary / evidence used

| EN used | Basis |
| --- | --- |
| Not enough Macca | Existing UI `20048`; glossary Macca |
| Material Tank | `CMessageData_System` 965 |
| Magnetite / Macca | `glossary/terms.tsv` |
| Ara Mitama / Kushimitama | Event/item Reimagine EN |
| Spiritual Separation | Align with UI “Spiritual Infusion” |
| Ointment | Item `1` name |
| Stop / Execute / No | Existing UIInfo mappings |
| Discard / Details / Use / Combine / Split | Common EN already in client corpus |

`決定` → **Confirm** here (inventory/action). Note: ID `24002` already used
**Save** for JP `決定` in another panel — left untouched.

## IDs changed (by theme)

**Inventory / item pane:** `1000`, `1028`, `1032`–`1035`, `2103`–`2111`

**Camera / room:** `7002`–`7004`

**Buttons:** `5003`, `6003`, `13107`, `13108`, `48010`, `44003`, `20039`,
`20049`, `21038`, `21052`

**Economy:** `18109`, `17055`, `17082` (+ other `170xx` expert lines below)

**Mitama / demon labels:** `18002`–`18003`, `19005`…`19045`, `20000`, `20002`–`20003`,
`21000`, `21002`–`21003`, `21043`, `21047`, `51023`, `52034`

**Storage / rental:** `22004`, `22025`, `22032`…`22082` (expiry / not-in-use dupes),
`23004`, `23018`, `23020`…`23083`

**Exchange:** `26011`…`26174` (`Required` / `Ointment` dupes), `26074` help text

**Demon status:** `26184`–`26189` Demon Dead; `26190`–`26198` Acquired;
`26200`–`26205` Not acquired

**Special item help:** `31008`

**Expert bonuses:** `17007`–`17010`, `17015`–`17018`, `17023`–`17026`,
`17031`–`17034`, `17039`–`17042`, `17047`–`17050`, `17055`–`17058`,
`17063`–`17066`, `17071`–`17074`, `17079`–`17082`, `17087`–`17090`,
`17095`–`17098`

**Card unit:** `9013`, `9021`, `9029`, `9037`, `9045` → `pcs`

## Build / apply

```bash
cd /home/cat/repos/smt/ai_custom_smt_server
BIN_DIR=/home/cat/repos/smt/comp_hack/build-localdeps-v31/bin \
  ./scripts/build-client-overlay.sh

# QA install: UIInfoData ONLY (avoid pulling unrelated Shield rebuilds)
DISP=/home/cat/software/smt/game/reimagine-phase8-uiinfo-test
# first time: cp -al /home/cat/software/smt/game/reimagine "$DISP"
rm -f "$DISP/BinaryData/Client/UIInfoData.bin"
cp -f client-overlay/BinaryData/Client/UIInfoData.bin \
      "$DISP/BinaryData/Client/UIInfoData.bin"
```

`build-client-overlay.sh` now saves `uiinfo` when
`client-source/.../UIInfoData.xml` is present. Tools currently live under
`comp_hack/build-localdeps-v31/bin` (set `BIN_DIR`).

**Do not** point this overlay at the live `reimagine` tree without review.

## Smoke-test (in-game)

Launch **`reimagine-phase8-uiinfo-test`** (Wine/client as you usually do), then:

1. **Inventory** — open item menu: Use / Combine / Split / Discard / Details /
   Valuables / Map / Equipment Check / Material Tank should be English.
2. **Macca** — trigger a purchase you cannot afford (or fusion fee): expect
   **Not enough Macca** (same wording as before on other widgets).
3. **Storage** — open item storage: **Normal Storage**, **Rental**,
   **Not in use** / **Expires within 30 days** where those widgets appear.
4. **Exchange / barter UI** — required-count column **Required**; help text about
   missing materials in red; sample material **Ointment**.
5. **Mitama / reunion chrome** — Demon Name, Reunion Type, Remove Mitama Boost,
   Ara Mitama labels where that panel opens.
6. **Expert gear bonuses** — equip/view an item that shows bonus lines; Magnetite
   / HP cost / element lines should read in EN.

If any widget is still JP, note the on-screen context + we can map the leftover
ID from the remaining 117 CJK rows.

## Not in this batch

- Remaining UIInfoData CJK (~117)
- `CMessageData_Shop`
- `CItemData` mass translate
- Magnetite tutorial direction `9541`
