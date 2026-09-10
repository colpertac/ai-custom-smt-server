# Event NPC spot overlaps

Generated **2026-09-10T01:47:36.415Z** from catalog `../website/content/events/events-catalog.json` (catalog `generatedAt`: 2026-09-10T01:47:22.971Z).

Regenerate: `cd website && npm run report-event-spot-overlaps`

## Notes

- Hard mutual-exclusion (admin/schedule blocks) lives in `content/events/event-conflicts.json` — currently Ordeal vs Sage (Thoth).
- Shared spots here are candidates for combo QA; do not auto-promote all of them to hard conflicts.
- Catalog stores at most 40 `npcSpawns` per event (`extract-event-catalog.ts`); open the partial XML if an event may have more.
- Before a QA wave: `npm run extract-event-catalog`, then re-run this report.

## Summary

| Metric | Value |
| --- | --- |
| Shared spots (overlaps) | 35 |
| Events with empty npcSpawns | 18 |
| Aggregates skipped | 999999_all, all_halloween, all_xmas |

## Overlap matrix

| Zone | Placement | Events | NPC names | Count |
| --- | --- | --- | --- | --- |
| Shinjuku Dock (`60101`) | spot 60100 | `201009_arubaito`, `201010_halloween`, `201012_xmasnewyears`, `201102_valentines`, `201107_summer`, `201108_lostsearch`, `201204_anniversary5`, `201210_halloween`, `201407_kappa6` | NPC Saien | 9 |
| Home III (`20101`) | spot 60027 | `200804_anniversary1`, `201306_mensknuckle`, `201310_maskgirl`, `201402_valentines`, `201409_akiakane` | Flustered Staff Takeshi, Hiromu, Part-Time Merchant Takeshi, Saburo | 5 |
| Home III (`20101`) | spot 60028 | `200801_clanpoints3`, `200810_demonelect`, `200810_demonelect_post`, `200902_setsubun`, `200904_blessings` | Archangel, Election Commissioner, Envoy from Shinjuku Babel, Tearful Oni | 5 |
| Shinjuku Babel (`50101`) | spot 68055 | `201307_summer`, `201402_valentines`, `201408_summer`, `201507_summer`, `201604_nagashima` | Part-Time Merchant Hazuki, Y-Kiki Beach Manager Nagashima | 5 |
| Home III (`20101`) | (-4930, 6.16) | `201110_halloween`, `201112_newyears`, `201202_valentines`, `201203_whiteday` | Yagimiya | 4 |
| Home III (`20101`) | spot 60020 | `200707_summer`, `200807_coop`, `200807_coop_post`, `200812_xmas` | Jack Frost | 4 |
| Home III (`20101`) | spot 60058 | `201110_halloween`, `201112_newyears`, `201202_valentines`, `201203_whiteday` | Clumsy Courier Hazuki, Hazuki, Valentine's Envoy, White Day Envoy | 4 |
| Home III (`20101`) | spot 60043 | `200909_halloween_post`, `200912_xmas`, `201401_silentmobius` | Black Youth, Jack Frost, Sae | 3 |
| Nakano (`40101`) | spot 60012 | `201006_kappa1`, `201006_kappa2`, `201008_kappa4` | DB Katori | 3 |
| Shinjuku Babel (`50101`) | (-3515, -2084.4) | `201306_mensknuckle`, `201405_sengoku`, `201409_akiakane` | Sarasvati | 3 |
| Shinjuku Babel (`50101`) | spot 60049 | `200812_newyears`, `200812_xmas`, `200904_ambition` | Commander Lion Dance Frost, NPC Saien, Pyro Jack | 3 |
| Home III (`20101`) | spot 60052 | `201104_anniversary4`, `201206_junebride` | High Pixie | 2 |
| Home III (`20101`) | spot 60057 | `201110_halloween`, `201112_newyears` | Clumsy Courier Takeshi, Mad Takeshi | 2 |
| Home III (`20101`) | spot 60059 | `201202_valentines`, `201203_whiteday` | Foolish Man, Seamstress Lily | 2 |
| Home III (`20101`) | spot 60060 | `200710_halloween`, `200810_halloween` | Pyro Jack | 2 |
| Home III (`20101`) | spot 69069 | `201501_ordeal`, `201506_sage` | Demon God Thoth | 2 |
| 第三ホーム搬入口 (`20102`) | spot 60004 | `200808_h3escape`, `201008_h3escape5` | Saburo | 2 |
| 第三ホーム搬入口 (`20102`) | spot 60017 | `201308_demonrequest1`, `201310_demonrequest2` | Garm, Slime | 2 |
| Nakano (`40101`) | spot 69800 | `201307_summer`, `201409_halloween` | Kurama Tengu, Kurama Tengu of Chaos | 2 |
| Shinjuku Babel (`50101`) | (0, -3900) | `200803_preanniversary`, `200806_candlenight` | Gamers Hat, NPC Saien | 2 |
| Shinjuku Babel (`50101`) | spot 60046 | `200810_halloween`, `200909_halloween` | Pyro Jack | 2 |
| Shinjuku Babel (`50101`) | spot 60048 | `200810_halloween`, `200909_halloween` | Alice | 2 |
| Shinjuku Babel (`50101`) | spot 61024 | `201212_newyears`, `201310_maskgirl` | Alice Juban — Tachibana Anna, Lion Dance Frost | 2 |
| Shinjuku Babel (`50101`) | spot 69950 | `201306_mensknuckle`, `201310_maskgirl` | Freelance Peddler Hazuki, Hiromu | 2 |
| Shinjuku Babel (`50101`) | spot 69957 | `201512_xmasnewyears`, `201604_anne` | DB Anne | 2 |
| Shinjuku Babel (`50101`) | spot 69960 | `201501_ordeal`, `201506_sage` | Demon God Thoth | 2 |
| Shinjuku Babel (`50101`) | spot 69963 | `201512_xmasnewyears`, `201602_valentines` | Jack Frost, Messenger of Love — Succubus | 2 |
| Shinjuku Babel (`50101`) | spot 69964 | `201512_xmasnewyears`, `201602_valentines` | Aya, Little Devil Lilim | 2 |
| Shibuya (`70101`) | spot 69007 | `201409_halloween`, `201510_halloween` | Nekomata | 2 |
| Holy City Arcadia (`100101`) | (-44.66, -9020.18) | `200710_halloween`, `201004_anniversary3` | Yagimiya | 2 |
| Holy City Arcadia (`100101`) | spot 60115 | `200710_halloween`, `201004_anniversary3` | NPC Saien, Pyro Jack | 2 |
| 総本山 (`130101`) | spot 60101 | `200710_halloween`, `200812_newyears` | Lion Dance Frost, Pyro Jack | 2 |
| イケブクロ南地区 (`210101`) | spot 60102 | `201308_demonrequest1`, `201310_demonrequest2` | Garm, Slime | 2 |
| イケブクロ南地区 (`210101`) | spot 60103 | `201112_guiltycrown`, `201312_xmas` | Jack Frost, Rogue Demon Researcher | 2 |
| Zone 11308001 (`11308001`) | spot 60002 | `201408_summer`, `201604_nagashima` | Tajikarao, Yatagarasu | 2 |

## Per-event shares-spot-with

Events that share at least one catalog spot with another non-aggregate event (sorted by partner count).

| Event | Title | Partners | npcSpawns |
| --- | --- | --- | --- |
| `201009_arubaito` | The Demon God & Part-Time Work | `201010_halloween`, `201012_xmasnewyears`, `201102_valentines`, `201107_summer`, `201108_lostsearch`, `201204_anniversary5`, `201210_halloween`, `201407_kappa6` | 1 |
| `201010_halloween` | Saien's Trick or Treat | `201009_arubaito`, `201012_xmasnewyears`, `201102_valentines`, `201107_summer`, `201108_lostsearch`, `201204_anniversary5`, `201210_halloween`, `201407_kappa6` | 1 |
| `201012_xmasnewyears` | Year-End Event — Diamond Dust | `201009_arubaito`, `201010_halloween`, `201102_valentines`, `201107_summer`, `201108_lostsearch`, `201204_anniversary5`, `201210_halloween`, `201407_kappa6` | 1 |
| `201102_valentines` | Valentine's Event 2011 | `201009_arubaito`, `201010_halloween`, `201012_xmasnewyears`, `201107_summer`, `201108_lostsearch`, `201204_anniversary5`, `201210_halloween`, `201407_kappa6` | 2 |
| `201107_summer` | Summer Event 2011: Homura | `201009_arubaito`, `201010_halloween`, `201012_xmasnewyears`, `201102_valentines`, `201108_lostsearch`, `201204_anniversary5`, `201210_halloween`, `201407_kappa6` | 1 |
| `201108_lostsearch` | Find the Lost Items! | `201009_arubaito`, `201010_halloween`, `201012_xmasnewyears`, `201102_valentines`, `201107_summer`, `201204_anniversary5`, `201210_halloween`, `201407_kappa6` | 1 |
| `201204_anniversary5` | 5th Anniversary (JUDGEMENT BATTLE +Kai) | `201009_arubaito`, `201010_halloween`, `201012_xmasnewyears`, `201102_valentines`, `201107_summer`, `201108_lostsearch`, `201210_halloween`, `201407_kappa6` | 1 |
| `201210_halloween` | Welcome to Halloween — I Want Candy Too | `201009_arubaito`, `201010_halloween`, `201012_xmasnewyears`, `201102_valentines`, `201107_summer`, `201108_lostsearch`, `201204_anniversary5`, `201407_kappa6` | 1 |
| `201402_valentines` | Valentine's Event 2014 | `200804_anniversary1`, `201306_mensknuckle`, `201307_summer`, `201310_maskgirl`, `201408_summer`, `201409_akiakane`, `201507_summer`, `201604_nagashima` | 18 |
| `201407_kappa6` | Kappa & Demon Palace Adventure (Kappa Arc Part 6) | `201009_arubaito`, `201010_halloween`, `201012_xmasnewyears`, `201102_valentines`, `201107_summer`, `201108_lostsearch`, `201204_anniversary5`, `201210_halloween` | 7 |
| `200812_xmas` | Christmas Event 2008 | `200707_summer`, `200807_coop`, `200807_coop_post`, `200812_newyears`, `200904_ambition` | 17 |
| `201306_mensknuckle` | MEN'S KNUCKLE Magazine Tie-Up | `200804_anniversary1`, `201310_maskgirl`, `201402_valentines`, `201405_sengoku`, `201409_akiakane` | 3 |
| `201307_summer` | Summer Event 2013: Gen (Y-Kiki Beach) | `201402_valentines`, `201408_summer`, `201409_halloween`, `201507_summer`, `201604_nagashima` | 4 |
| `201310_maskgirl` | Kamen Joshi (Alice Juban & Steam Girls) Collab | `200804_anniversary1`, `201212_newyears`, `201306_mensknuckle`, `201402_valentines`, `201409_akiakane` | 7 |
| `201409_akiakane` | Akiakane Illustrator Collaboration | `200804_anniversary1`, `201306_mensknuckle`, `201310_maskgirl`, `201402_valentines`, `201405_sengoku` | 3 |
| `200801_clanpoints3` | 3rd Clan Contest — BMR | `200810_demonelect`, `200810_demonelect_post`, `200902_setsubun`, `200904_blessings` | 1 |
| `200804_anniversary1` | 1st Anniversary — Legacy of Tokyo | `201306_mensknuckle`, `201310_maskgirl`, `201402_valentines`, `201409_akiakane` | 1 |
| `200810_demonelect` | Demon Presidential Election | `200801_clanpoints3`, `200810_demonelect_post`, `200902_setsubun`, `200904_blessings` | 1 |
| `200810_demonelect_post` | Demon Presidential Election (Post) | `200801_clanpoints3`, `200810_demonelect`, `200902_setsubun`, `200904_blessings` | 1 |
| `200902_setsubun` | Setsubun: Lucky Direction East-North-East | `200801_clanpoints3`, `200810_demonelect`, `200810_demonelect_post`, `200904_blessings` | 1 |
| `200904_blessings` | Awakening of Self — Blessings from Allies | `200801_clanpoints3`, `200810_demonelect`, `200810_demonelect_post`, `200902_setsubun` | 1 |
| `201408_summer` | Thou Shalt Not Die (Summer Beach 2014) | `201307_summer`, `201402_valentines`, `201507_summer`, `201604_nagashima` | 8 |
| `201507_summer` | Masakado Manifestation (Summer 2015) | `201307_summer`, `201402_valentines`, `201408_summer`, `201604_nagashima` | 2 |
| `201604_nagashima` | Y-Kiki Beach Manager Nagashima | `201307_summer`, `201402_valentines`, `201408_summer`, `201507_summer` | 9 |
| `200707_summer` | Summer Imagine Festival 2007 | `200807_coop`, `200807_coop_post`, `200812_xmas` | 4 |
| `200710_halloween` | Imagine Halloween 2007 | `200810_halloween`, `200812_newyears`, `201004_anniversary3` | 4 |
| `200807_coop` | Collect Ice & Rescue the Bazaar Demons! | `200707_summer`, `200807_coop_post`, `200812_xmas` | 1 |
| `200807_coop_post` | Collect Ice & Rescue the Bazaar Demons! (Post) | `200707_summer`, `200807_coop`, `200812_xmas` | 1 |
| `200812_newyears` | Lion Dance Frost Runs Wild!? | `200710_halloween`, `200812_xmas`, `200904_ambition` | 3 |
| `201110_halloween` | Imagine Halloween 2011 | `201112_newyears`, `201202_valentines`, `201203_whiteday` | 3 |
| `201112_newyears` | Imagine New Year 2012 | `201110_halloween`, `201202_valentines`, `201203_whiteday` | 3 |
| `201202_valentines` | Valentine's Event 2012 | `201110_halloween`, `201112_newyears`, `201203_whiteday` | 7 |
| `201203_whiteday` | White Day Event 2012 | `201110_halloween`, `201112_newyears`, `201202_valentines` | 5 |
| `200810_halloween` | Imagine Halloween 2008 | `200710_halloween`, `200909_halloween` | 16 |
| `200904_ambition` | Saien's Ambition / Birth of Devil Saien!? | `200812_newyears`, `200812_xmas` | 1 |
| `200909_halloween_post` | Imagine Halloween 2009 (Post) | `200912_xmas`, `201401_silentmobius` | 2 |
| `200912_xmas` | Imagine Christmas 2009 | `200909_halloween_post`, `201401_silentmobius` | 4 |
| `201006_kappa1` | Kappa's Sea Opening (Kappa Arc Part 1) | `201006_kappa2`, `201008_kappa4` | 1 |
| `201006_kappa2` | Kappa's Tribulations (Kappa Arc Part 2) | `201006_kappa1`, `201008_kappa4` | 1 |
| `201008_kappa4` | Kappa's Request (Kappa Arc Part 4) | `201006_kappa1`, `201006_kappa2` | 1 |
| `201401_silentmobius` | Silent Möbius Collaboration | `200909_halloween_post`, `200912_xmas` | 2 |
| `201405_sengoku` | Sengoku Warlords Chronicles Tie-Up | `201306_mensknuckle`, `201409_akiakane` | 1 |
| `201409_halloween` | For Whom the Violin Sounds | `201307_summer`, `201510_halloween` | 5 |
| `201512_xmasnewyears` | 2015–2016 Winter Event | `201602_valentines`, `201604_anne` | 5 |
| `200803_preanniversary` | 1st Anniversary Eve — East vs West Tokyo Split | `200806_candlenight` | 1 |
| `200806_candlenight` | Candle Night Campaign (1 Million Lights) | `200803_preanniversary` | 1 |
| `200808_h3escape` | Escape from Home III (Versions 1–4) | `201008_h3escape5` | 1 |
| `200909_halloween` | Imagine Halloween 2009 | `200810_halloween` | 3 |
| `201004_anniversary3` | 3rd Anniversary Event | `200710_halloween` | 3 |
| `201008_h3escape5` | Escape from Home III V | `200808_h3escape` | 1 |
| `201104_anniversary4` | 4th Anniversary (+ DEVILSTORM TokyoNostalgia) | `201206_junebride` | 2 |
| `201112_guiltycrown` | Guilty Crown Collaboration | `201312_xmas` | 3 |
| `201206_junebride` | June Bride Wedding Festival | `201104_anniversary4` | 13 |
| `201212_newyears` | Rhapsody of 1/12 | `201310_maskgirl` | 4 |
| `201308_demonrequest1` | A Favor from a Demon (Part 1) | `201310_demonrequest2` | 2 |
| `201310_demonrequest2` | A Favor from a Demon (Part 2) | `201308_demonrequest1` | 2 |
| `201312_xmas` | Christmas Event 2013 | `201112_guiltycrown` | 2 |
| `201501_ordeal` | Ordeal of Soul — Trial of the Spirit | `201506_sage` | 2 |
| `201506_sage` | The Sage's Helper | `201501_ordeal` | 2 |
| `201510_halloween` | The Pie Was Thrown (Halloween Pie-Throwing Battle) | `201409_halloween` | 18 |
| `201602_valentines` | Life Is Short — Fall in Love, Demon! | `201512_xmasnewyears` | 2 |
| `201604_anne` | DB Anne & Virtual Tropical Beach | `201512_xmasnewyears` | 10 |

## Empty npcSpawns (manual partial check)

These events have no cataloged NPC placements (cap/extractor miss, arena-only, or dialogue-only). Use `affectedZones` / partial XML.

| Event | Title | Zones | Featured NPCs |
| --- | --- | --- | --- |
| `200701_oni` | Oni Attack Shinjuku Babel!! | Home III (20101); クリニック　アヤ (20105); 杉並ＣＵＲＩＯＵＳ (20106); Shinjuku Babel (50101) (+1) | — |
| `200702_valentines` | Valentine's Event 2007 | Suginami (30101); Shibuya (70101); Ichigaya (80101); Shinagawa (90101) (+1) | — |
| `200703_whiteday` | White Day Event 2007 | Suginami (30101); Nakano (40101); Shibuya (70101); Ichigaya (80101) (+1) | — |
| `200709_clanpoints1` | Clan Points Contest Round 1 | — | — |
| `200711_clanpoints2` | Delivery Boyz G-Team — Secret Base Scramble | — | — |
| `200802_valentines` | Rakanbaren Tain Festival | Suginami (30101); Shibuya (70101); Ichigaya (80101); Shinagawa (90101) (+1) | — |
| `200806_renegade` | Get the Sequencer! Grand Acquisition Op | Nakano (40101); Shibuya (70101); Ichigaya (80101) | — |
| `200812_lemon` | You're on The Television Cover! Lemon Star Mood | Home III (20101) | — |
| `200902_valentines` | Sweet☆Panic — Seize That Demon's Heart | Shinjuku Babel (50101); メディカルセンター (100104); 卍薬玉店 (130104) | — |
| `201002_decisive` | Shinjuku Decisive Battle | Shinjuku (150101) | — |
| `201002_valentines` | Nora's Chocolate Cheek | Shinjuku Babel (50101) | — |
| `201004_fullmoonwars` | Full Moon Wars | Nakano (40101); Shibuya (70101); Ichigaya (80101) | — |
| `201006_kappa1_weather` | Kappa's Sea Opening — Weather Overlay | Nakano (40101); Shibuya (70101); Ichigaya (80101) | — |
| `201006_momoiro` | Momoiro Clover Collaboration | — | — |
| `201006_momoiro_post` | Momoiro Clover Collaboration (Post) | — | — |
| `201105_durarara` | Durarara!! Anime Collaboration | Home III (20101); イケブクロ東地区 (210201) | — |
| `201305_expertise` | Expertise Liberation Front in Ikebukuro | イケブクロ南地区 (210101); イケブクロ東地区 (210201) | — |
| `201604_misc` | Daily Mission Chests & Hack Limits (2016) | Home III (20101); Shinjuku Babel (50101); Zone 10201001; Zone 10201002 (+1) | — |

## Detail (top hubs)

### Shinjuku Dock — spot 60100 (`60101`)

- `201009_arubaito` (gag) — **NPC Saien** @ (1197.11, -2752.5)
- `201010_halloween` (halloween) — **NPC Saien** @ (1197.11, -2752.5)
- `201012_xmasnewyears` (xmas) — **NPC Saien** @ (1197.11, -2752.5)
- `201102_valentines` (valentines) — **NPC Saien** @ (1197.11, -2752.5)
- `201107_summer` (summer) — **NPC Saien** @ (1197.11, -2752.5)
- `201108_lostsearch` (special) — **NPC Saien** @ (1197.11, -2752.5)
- `201204_anniversary5` (anniversary) — **NPC Saien** @ (1197.11, -2752.5)
- `201210_halloween` (halloween) — **NPC Saien** @ (1197.11, -2752.5)
- `201407_kappa6` (summer) — **NPC Saien** @ (1197.11, -2752.5)

### Home III — spot 60027 (`20101`)

- `200804_anniversary1` (anniversary) — **Saburo** @ (1030.83, 8.27)
- `201306_mensknuckle` (collab) — **Hiromu** @ (1030.83, 8.27)
- `201310_maskgirl` (collab) — **Flustered Staff Takeshi** @ (1030.83, 8.27)
- `201402_valentines` (valentines) — **Part-Time Merchant Takeshi** @ (1030.83, 8.27)
- `201409_akiakane` (collab) — **Part-Time Merchant Takeshi** @ (1030.83, 8.27)

### Home III — spot 60028 (`20101`)

- `200801_clanpoints3` (special) — **Envoy from Shinjuku Babel** @ (8218.64, -5.06)
- `200810_demonelect` (gag) — **Election Commissioner** @ (8218.64, -5.06)
- `200810_demonelect_post` (gag) — **Election Commissioner** @ (8218.64, -5.06)
- `200902_setsubun` (special) — **Tearful Oni** @ (8218.64, -5.06)
- `200904_blessings` (special) — **Archangel** @ (8218.64, -5.06)

### Shinjuku Babel — spot 68055 (`50101`)

- `201307_summer` (summer) — **Y-Kiki Beach Manager Nagashima** @ (-3720.92, 892.37)
- `201402_valentines` (valentines) — **Part-Time Merchant Hazuki** @ (-3720.92, 892.37)
- `201408_summer` (summer) — **Y-Kiki Beach Manager Nagashima** @ (-3720.92, 892.37)
- `201507_summer` (summer) — **Y-Kiki Beach Manager Nagashima** @ (-3720.92, 892.37)
- `201604_nagashima` (special) — **Y-Kiki Beach Manager Nagashima** @ (-3720.92, 892.37)

### Home III — (-4930, 6.16) (`20101`)

- `201110_halloween` (halloween) — **Yagimiya** @ (-4930, 6.16)
- `201112_newyears` (xmas) — **Yagimiya** @ (-4930, 6.16)
- `201202_valentines` (valentines) — **Yagimiya** @ (-4930, 6.16)
- `201203_whiteday` (valentines) — **Yagimiya** @ (-4930, 6.16)

### Home III — spot 60020 (`20101`)

- `200707_summer` (summer) — **Jack Frost** @ (113.65, 1367.89)
- `200807_coop` (special) — **Jack Frost** @ (113.65, 1367.89)
- `200807_coop_post` (special) — **Jack Frost** @ (113.65, 1367.89)
- `200812_xmas` (xmas) — **Jack Frost** @ (113.65, 1367.89)

### Home III — spot 60058 (`20101`)

- `201110_halloween` (halloween) — **Clumsy Courier Hazuki** @ (-4023.42, 323.49)
- `201112_newyears` (xmas) — **Hazuki** @ (-4023.42, 323.49)
- `201202_valentines` (valentines) — **Valentine's Envoy** @ (-4023.42, 323.49)
- `201203_whiteday` (valentines) — **White Day Envoy** @ (-4023.42, 323.49)

### Home III — spot 60043 (`20101`)

- `200909_halloween_post` (halloween) — **Black Youth** @ (-8510.03, 41.53)
- `200912_xmas` (xmas) — **Jack Frost** @ (-8510.03, 41.53)
- `201401_silentmobius` (collab) — **Sae** @ (-8510.03, 41.53)

### Nakano — spot 60012 (`40101`)

- `201006_kappa1` (summer) — **DB Katori** @ (23691.5, -5145.77)
- `201006_kappa2` (summer) — **DB Katori** @ (23691.5, -5145.77)
- `201008_kappa4` (summer) — **DB Katori** @ (23691.5, -5145.77)

### Shinjuku Babel — (-3515, -2084.4) (`50101`)

- `201306_mensknuckle` (collab) — **Sarasvati** @ (-3515, -2084.4)
- `201405_sengoku` (collab) — **Sarasvati** @ (-3515, -2084.4)
- `201409_akiakane` (collab) — **Sarasvati** @ (-3515, -2084.4)

### Shinjuku Babel — spot 60049 (`50101`)

- `200812_newyears` (xmas) — **Commander Lion Dance Frost** @ (-0.55, -4329.26)
- `200812_xmas` (xmas) — **Pyro Jack** @ (-0.55, -4329.26)
- `200904_ambition` (special) — **NPC Saien** @ (-0.55, -4329.26)

### Home III — spot 60052 (`20101`)

- `201104_anniversary4` (anniversary) — **High Pixie** @ (2375.77, -3990.22)
- `201206_junebride` (special) — **High Pixie** @ (2375.77, -3990.22)

---

Machine-readable twin: [`website/content/events/event-spot-overlaps.json`](../website/content/events/event-spot-overlaps.json).

QA process: [`event-qa-gm.md`](event-qa-gm.md).
