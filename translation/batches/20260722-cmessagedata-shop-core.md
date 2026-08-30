# 2026-07-22 — A1 batch: CMessageData_Shop core vendor dialogue

Incremental Track A1 batch after UIInfoData. Stops here for review before
product-pitch lines (+31–+44), items, or Mag `9541`.

## Table

| | |
| --- | --- |
| File | `BinaryData/Shield/CMessageData_Shop.sbin` |
| Type | `cmessage` (`comp_bdpatch` + `comp_encrypt`) |
| Source XML | `client-source/BinaryData/Shield/CMessageData_Shop.xml` (gitignored) |
| Overlay sbin | `client-overlay/BinaryData/Shield/CMessageData_Shop.sbin` |
| Disposable QA client | `/home/cat/software/smt/game/reimagine-phase8-uiinfo-test` |

## Scope

- Translated **420** CJK shop messages = core transaction offsets
  `+01`–`+17`, `+20`, `+21` across **39** vendor personality blocks.
- **102** unique JP strings → EN, preserving each vendor voice.
- Left for next shop pass: product pitch lines `+31`–`+44` (**310** CJK rows).
- CJK heuristic: **730 → 310** (core cleared; pitches remain).

Vanilla JP Shield still `\x89XBF` (no ID-pair vs JP this pass). EN mirrored from
already-translated vendor templates in the same table (blocks `100`, `200`, …).

## Glossary / evidence used

| Term | Usage in this batch |
| --- | --- |
| **Macca** | Full-Macca / currency lines (never invent alternate money names) |
| **Yagiya** | Delivery line `山羊屋便` → “Yagiya delivery” |
| **MC** | Mini-game costs (`%d CP` / `%dＣＰ`) → `%d MC` (matches existing EN shop lines 114–121) |
| `%d` / `%s` | Placeholders preserved exactly |

## Voice families covered

| Family | Example bases | Tone |
| --- | --- | --- |
| Polite clerk | `26200`, `58100`, `59100`… | Customer-is-god polite |
| Rough/casual | `58200`–`58700` | “Thanks.” / “bag is full” |
| Stuttering formal | `64000`–`64700` | Comma pauses kept as line breaks |
| Character voices | `62100`+ | Cute ♪, tough guy, SALE clerk, “ho!” vendor, etc. |

Sample EN anchors after patch:

| ID | EN |
| --- | --- |
| `26201` | What would you like to buy? |
| `26207` | You're loaded with Macca! … |
| `58201` | So, uh... how about this...? |
| `64001` | Which item would you like to buy? |
| `62112` | Sent it via Yagiya delivery… |

## Build / apply

```bash
BIN=/home/cat/repos/smt/comp_hack/build-localdeps-v31/bin
ROOT=/home/cat/repos/smt/ai_custom_smt_server
SRC=$ROOT/client-source/BinaryData/Shield/CMessageData_Shop.xml
PLAIN=$ROOT/client-overlay/BinaryData/Shield/CMessageData_Shop.plain.bin
SBIN=$ROOT/client-overlay/BinaryData/Shield/CMessageData_Shop.sbin
DISP=/home/cat/software/smt/game/reimagine-phase8-uiinfo-test

"$BIN/comp_bdpatch" save cmessage "$SRC" "$PLAIN"
"$BIN/comp_encrypt" "$PLAIN" "$SBIN"
rm -f "$PLAIN"

# Shop sbin only (same disposable as UIInfo batch)
rm -f "$DISP/BinaryData/Shield/CMessageData_Shop.sbin"
cp -f "$SBIN" "$DISP/BinaryData/Shield/CMessageData_Shop.sbin"
```

`build-client-overlay.sh` now also builds `CMessageData_Shop` when the Shield XML
is present (`BIN_DIR=.../build-localdeps-v31/bin`).

## Smoke-test (in-game)

Launch **`reimagine-phase8-uiinfo-test`**, talk to any shop NPC that still had JP
lines (most non-starter vendors):

1. **Buy / sell / repair prompts** — should be English in that vendor’s voice.
2. **Full bag / full Macca** — overflow warnings mention **Macca** correctly.
3. **Repair** — perfect / broke / durability `-%d` lines.
4. **Mini-game** — “It’s `%d` MC” try / retry / card / box prompts.
5. **Gift bundle** — `%s` gift + retry `%d` MC lines.
6. **Mail / Yagiya delivery** — name-check + “Yagiya delivery” send line (cute vendor).

Pitch/browse flavor (`+31`–`+44`) may still be JP — expected this batch.

## Not in this batch

- Shop pitch lines `+31`–`+44` (310 CJK)
- `CItemData` mass translate
- Magnetite tutorial `9541`
- Remaining UIInfoData CJK (~117)
