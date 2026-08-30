# CItemData slice 1 — context-resolved

Patched **258** names (+ key JP descs for incense / depo / Yagiya).
Overlay rebuilt (`CItemData.sbin`). CJK item **names** now ~**4406** (was ~4664 in extract heuristic / ~8578 backlog stale).

## Constraint

Item `name` / `name2` must be **< 36 bytes** in cp932. Long EN uses Reimagine-style `~` truncation.

## Auto-resolved (no human needed)

| ID | EN | Note |
| --- | --- | --- |
| `9901` | Data Ticket (A Certain Gekota) | Descriptive / series EN; no conflicting Reimagine peer. |
| `9912` | Data Ticket (W Depository Pass, 30~ | W depository COMP ticket; kept **W** (no EN peer). |
| `9913` | Data Ticket (W Depository Pass, 60~ | W depository COMP ticket; kept **W** (no EN peer). |
| `9914` | Data Ticket (W Depository Pass, 90~ | W depository COMP ticket; kept **W** (no EN peer). |
| `9916` | Data Ticket (A Certain Scientific ~ | Descriptive / series EN; no conflicting Reimagine peer. |
| `9917` | Data Ticket (A Certain Armband) | Descriptive / series EN; no conflicting Reimagine peer. |
| `9918` | Data Ticket (A Certain Armband α) | Descriptive / series EN; no conflicting Reimagine peer. |
| `9919` | Data Ticket (A Certain Coin) | Descriptive / series EN; no conflicting Reimagine peer. |
| `12930` | Incense of Law (Small) | Named by alignment effect (Law/Neutral/Chaos), not invented brand EN. |
| `12931` | Incense of Neutral (Small) | Named by alignment effect (Law/Neutral/Chaos), not invented brand EN. |
| `12932` | Incense of Chaos (Small) | Named by alignment effect (Law/Neutral/Chaos), not invented brand EN. |
| `27070` | Data Ticket (Kira Academy Uniform) | Collab cast kept as proper names (Durarara!! etc.). |
| `27072` | Data Ticket (Shizuo Heiwajima) | Collab cast kept as proper names (Durarara!! etc.). |
| `27073` | Data Ticket (Celty) | Collab cast kept as proper names (Durarara!! etc.). |
| `27074` | Data Ticket (Shizuo Heiwajima α) | Collab cast kept as proper names (Durarara!! etc.). |
| `27075` | Data Ticket (Celty α) | Collab cast kept as proper names (Durarara!! etc.). |
| `27081` | Data Ticket (Izaya Orihara) | Collab cast kept as proper names (Durarara!! etc.). |
| `27082` | Data Ticket (Haruna Niekawa) | Collab cast kept as proper names (Durarara!! etc.). |
| `27083` | Data Ticket (Izaya Orihara α) | Collab cast kept as proper names (Durarara!! etc.). |
| `27084` | Data Ticket (Haruna Niekawa α) | Collab cast kept as proper names (Durarara!! etc.). |
| `27085` | Data Ticket (Masaomi Kida) | Collab cast kept as proper names (Durarara!! etc.). |
| `27086` | Data Ticket (Anri Sonohara) | Collab cast kept as proper names (Durarara!! etc.). |
| `27087` | Data Ticket (Masaomi Kida α) | Collab cast kept as proper names (Durarara!! etc.). |
| `27088` | Data Ticket (Anri Sonohara α) | Collab cast kept as proper names (Durarara!! etc.). |
| `27184` | Data Ticket (Soul Union, 3 Enclosu~ | Corrected in slice 2 → **Soul Stone** (Reimagine `7918`/`7921`). |
| `27205` | Data Ticket (Soul Union, 3 Enclosu~ | Corrected in slice 2 → **Soul Stone** (Reimagine `7918`/`7921`). |
| `27210` | Data Ticket (Soul Union, 3 Enclosu~ | Corrected in slice 2 → **Soul Stone** (Reimagine `7918`/`7921`). |
| `27241` | Data Ticket (Soul Union, 3 Enclosu~ | Corrected in slice 2 → **Soul Stone** (Reimagine `7918`/`7921`). |
| `27242` | Data Ticket (Soul Union, 3 Enclosu~ | Corrected in slice 2 → **Soul Stone** (Reimagine `7918`/`7921`). |
| `27243` | Data Ticket (Soul Union, 3 Enclosu~ | Corrected in slice 2 → **Soul Stone** (Reimagine `7918`/`7921`). |
| `27244` | Data Ticket (Soul Union, 3 Enclosu~ | Corrected in slice 2 → **Soul Stone** (Reimagine `7918`/`7921`). |
| `27245` | Data Ticket (Soul Union, 3 Enclosu~ | Corrected in slice 2 → **Soul Stone** (Reimagine `7918`/`7921`). |
| `27342` | Data Ticket (Soul Union (Spring Di~ | Corrected in slice 2 → **Soul Stone** (Reimagine `7918`/`7921`). |
| `27538` | Data Ticket (Floppy Black Frost) | Descriptive / series EN; no conflicting Reimagine peer. |
| `27539` | Data Ticket (Floppy Frost Ace) | Descriptive / series EN; no conflicting Reimagine peer. |
| `27548` | Data Ticket (Soul Union, Ten Realm~ | Corrected in slice 2 → **Soul Stone** (Reimagine `7918`/`7921`). |
| `27563` | Data Ticket (Get-Rich-Quick Tsuzur~ | Descriptive / series EN; no conflicting Reimagine peer. |
| `27573` | Data Ticket (Spiral Idem License) | Descriptive / series EN; no conflicting Reimagine peer. |
| `27582` | Data Ticket (Soul Union, Tanabata) | Corrected in slice 2 → **Soul Stone** (Reimagine `7918`/`7921`). |
| `27633` | Data Ticket (Akane Aki Outfit) | Collab cast kept as proper names (Durarara!! etc.). |
| `27634` | Data Ticket (Akane Aki Outfit α) | Collab cast kept as proper names (Durarara!! etc.). |
| `27637` | Data Ticket (Spiral Idem/Demon) | Descriptive / series EN; no conflicting Reimagine peer. |
| `27644` | Data Ticket (Akane Aki Weapon) | Collab cast kept as proper names (Durarara!! etc.). |
| `27721` | Data Ticket (Floppy Exchange α) | Descriptive / series EN; no conflicting Reimagine peer. |
| `27810` | Data Ticket (Soul Union, Three Pat~ | Corrected in slice 2 → **Soul Stone** (Reimagine `7918`/`7921`). |
| `27821` | Data Ticket (Floppy Mikanagi) | Descriptive / series EN; no conflicting Reimagine peer. |
| `27822` | Data Ticket (Floppy (?) Director Y~ | Descriptive / series EN; no conflicting Reimagine peer. |
| `38150` | Incense of Bethel | Effect is Bethel gain → **Incense of Bethel**. |
| `38151` | Incense of Bethel (Small) | Effect is Bethel gain → **Incense of Bethel**. |
| `38152` | Incense of Bethel (Small, NT) | Effect is Bethel gain → **Incense of Bethel**. |

## Human follow-up

None required for this slice.
None required for this slice.