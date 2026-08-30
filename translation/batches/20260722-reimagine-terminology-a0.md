# 2026-07-22 — A0 Reimagine terminology research

Research-only pass (no Magnetite `9541` batch, no full-game translate).

## Goal

Evidence-backed glossary from what Reimagine already translated, plus a ranked
CJK backlog. Spec: [`todo.md`](../todo.md) mini-project.

## Inputs

| Role | Path |
| --- | --- |
| Playable EN draft | `/home/cat/software/smt/game/reimagine` |
| Vanilla JP | `/home/cat/software/smt/game/smt_1666/MegaTen jp` |
| Tools | `comp_hack/build-current/bin/comp_{decrypt,bdpatch}` |
| Scripts | `scripts/translation-extract-table.sh` (JOBS=1 / sequential) |

## Extracts (gitignored under `translation/extract/`)

| Table | Reimagine | Vanilla JP | Notes |
| --- | --- | --- | --- |
| `Client/UIInfoData` | yes | yes | ID-paired |
| `Client/CMessageData_{SysHelp,basicCommandHelp,IFCommandHelp,yorosiku}` | yes | yes | ID-paired |
| `Shield/CEventMessageData` | yes | **no** | JP `\x89XBF` — `comp_decrypt` expects `CHED` |
| `Shield/CEventMessageData2` | yes | **no** | same |
| `Shield/CItemData` | yes | **no** | same |
| `Shield/CMessageData{,_Shop,_System}` | yes | — | backlog counts |

Rewriting JP magic `XBF`→`CHED` and decrypting yields non-BinaryData garbage
(different scheme/key). Documented as follow-up: real XBF support.

## Outputs

| Artifact | Path |
| --- | --- |
| Narrative glossary | [`glossary/lingo.md`](../glossary/lingo.md) |
| Terms TSV | [`glossary/terms.tsv`](../glossary/terms.tsv) |
| Research pairs | [`glossary/research-pairs.tsv`](../glossary/research-pairs.tsv) (~798 rows) |
| Ranked backlog | [`inventory/untranslated-backlog.md`](../inventory/untranslated-backlog.md) |

## Headline evidence (Reimagine `CEventMessageData`+`2` unless noted)

| Preferred EN | JP | EN hits | JP hits | Rejected (0 hits) |
| --- | --- | --- | ---: | --- |
| Cathedral of Shadows | 邪教の館 | 17 | 28 | Pavilion of Heresy |
| Yagiya | 山羊屋 | 126 | 103 | Goat Shop |
| Macca | マッカ | 360 | 253 | — |
| Paper Currency (50,000 Macca) | マッカ紙幣 | item `699` | event leftovers | **Macca Note** (0) |
| MAG Presser α | マグ圧縮機 | item `27375` | — | — |

UI ID pairs (examples): `18107` 必要マッカ→Macca Cost; `22017` 悪魔倉庫→Demon Depository.

## Inconsistent leftovers

Same Shield message tables still mix EN + JP for Yagiya, Cathedral, Macca,
Magnetite, Demon Buster, etc. Listed explicitly in `lingo.md`.

## Acceptance (MVP)

- [x] Event messages + UI + item names covered (Reimagine extracts + Client JP pairs)
- [x] Lingo entries cite Reimagine file + ID or count
- [x] Explicit inconsistent EN/JP leftover list
- [x] No client binaries committed — extracts under gitignored `translation/extract/`

## Not done (by design)

- Magnetite tutorial direction `9541`
- Vanilla JP Shield ID pairing (XBF blocker)
- MultiTalk / movie sampling
- Human review of top ~50 terms
