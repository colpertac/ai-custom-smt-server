# Seasonal event QA (GM / admin)

Smoke-test seasonal event partials from `/admin/events` without walking every
zone for every combo. Solo enable → launch client remains the truth check;
catalog + spot-overlap report cut blind work.

**Start here for day-to-day QA:** curated activate-together batches in
[`event-qa-slices.md`](event-qa-slices.md) (Slice 1, Slice 2, …).

Related:

- QA slices (friendly titles): [`event-qa-slices.md`](event-qa-slices.md)
- Overlap matrix (regenerated): [`event-spot-overlaps.md`](event-spot-overlaps.md)
- Machine-readable: [`website/content/events/event-spot-overlaps.json`](../website/content/events/event-spot-overlaps.json)
- Hard exclusions: [`website/content/events/event-conflicts.json`](../website/content/events/event-conflicts.json)
- Catalog: [`website/content/events/events-catalog.json`](../website/content/events/events-catalog.json)

## Before a QA wave

From `ai_custom_smt_server/website/`:

```bash
npm run extract-event-catalog
npm run report-event-spot-overlaps
```

`extract-event-catalog` rescans `deploy/data/datastore/partials/*` and SpotData.
`report-event-spot-overlaps` rebuilds the MD/JSON overlap docs.

### Catalog caveats

- Catalog stores **at most 40 `npcSpawns` per event**. If an event may have
  more NPCs, open the partial XML — do not trust the admin drawer alone.
- Events with **empty `npcSpawns`** but non-empty `affectedZones` need a manual
  partial / zone check (listed in the overlap report).
- Aggregates (`999999_all`, `all_halloween`, `all_xmas`) are skipped in the
  default overlap matrix (`--include-aggregates` to include).

## Depth default

| Scope | What to do |
| --- | --- |
| All catalog events | **Spawn smoke**: NPC present at listed spot, open dialogue once |
| Always-on / next schedule days | Full quest / reward flow where practical |
| Shared spots only | Combo enable (see below) — not every pair of 107 events |

## Pass A — Solo spawn smoke

1. Schedule mode **off** (manual toggles) on `/admin/events`.
2. Clear active event partials (empty active set), or disable everything first.
3. Enable **one** event → Lane A publish / channel restart.
4. Open the event drawer: use `npcSpawns` as the warp checklist (zone + coords).
5. Confirm each listed NPC appears; talk once. Note missing / wrong spot /
   unresolved coords / crash / dialogue errors.
6. Disable and move on.

### Hub batching (still one event active)

Order solo passes by primary hub so you stay on one map:

1. Home III (`20101`)
2. Shinjuku Babel (`50101`)
3. Shinjuku Dock (`60101`)
4. Nakano (`40101`)
5. Everything else / empty-`npcSpawns` bucket

Admin category filters (summer / halloween / …) help slice the backlog;
hub order saves teleports.

### Empty npcSpawns bucket

For events with no catalog placements: check `affectedZones` and the partial
folder under `deploy/data/datastore/partials/<id>/`. Spot-check zones for
weather / arenas / unexpected missing base NPCs.

Some events intentionally have **no dialogue NPCs** (enemy invasions, weather
overlays, drop tweaks). Catalog `notes` (player-facing) and `adminNotes`
(GM / technical) come from `content/events/i18n.json` — e.g. Oni Attack is
moon-gated field spawns, not a clerk.

## Pass B — Soft overlaps (combo)

1. Open [`event-spot-overlaps.md`](event-spot-overlaps.md); sort is already by
   partner count (Dock Saien, Home III staff spots, Babel hubs first).
2. For each shared spot, enable **two** events that share it → publish/restart →
   visit that spot.
3. Record outcome: one NPC / wrong NPC / stacked models / missing / broken quest.
4. For large hubs (e.g. Dock Saien × 9), test a few **realistic schedule pairs**,
   not all C(n,2). Also confirm “all sharing that spot never together.”

Verdicts:

| Verdict | Action |
| --- | --- |
| Hard — both must never run | Promote to `event-conflicts.json` (Pass C) |
| Soft — rare / last-write-wins OK | Note in QA tracker only; do not block schedule |
| Never co-scheduled | Rely on schedule design; optional soft note |

Probe a proposed set without guessing:

```bash
cd website
npm run report-event-spot-overlaps -- --set 201010_halloween,201107_summer
npm run report-event-spot-overlaps -- --day loop:day1
npm run report-event-spot-overlaps -- --day calendar:2026-10-31
npm run report-event-spot-overlaps -- --day desired
```

`--day desired` uses `alwaysOn ∪ current day` when schedule is enabled.

## Pass C — Hard conflicts (admin / schedule blocks)

Today the only curated hard group is **Ordeal vs Sage** (Demon God Thoth on
Home III `69069` and Babel `69960`):

- JSON: `content/events/event-conflicts.json`
- UI seed (must stay in sync for client-side flash before API): 
  `DEFAULT_CONFLICT_GROUPS` in `website/lib/events/event-conflicts.ts`

Confirm: toggling both on `/admin/events` rejects; schedule save rejects the
same pair.

### Promoting a confirmed hard conflict

After in-game combo QA proves two (or more) events cannot coexist:

1. Add a group to `website/content/events/event-conflicts.json`:

```json
{
  "id": "short-kebab-id",
  "reason": "Human-readable why (spot + NPC).",
  "eventIds": ["event_a", "event_b"]
}
```

2. Mirror the same group in `DEFAULT_CONFLICT_GROUPS` in
   `website/lib/events/event-conflicts.ts` (admin UI conflict flash uses the
   seed; API/reconciler load the JSON).
3. Add/extend a unit test in `lib/events/event-schedule.test.ts` or
   `app/api/admin/events/route.test.ts` if useful.
4. Do **not** auto-promote every row in the overlap report — many are
   seasonal-exclusive or soft.

## Pass D — Schedule days

Before enabling schedule mode for a day set:

1. `npm run report-event-spot-overlaps -- --day loop:<id>` (or `calendar:…`).
2. Fix hard collisions (remove an event or promote a conflict group).
3. Accept soft collisions consciously.
4. Save schedule; confirm reconciler / flip announcements as needed.

## Pass E — Aggregates

Treat `999999_all`, `all_halloween`, `all_xmas` as combo products, not solo
units. After member smoke, enable the aggregate and sample known hubs
(Dock / Home III / Babel) — not every spawn.

## Priority order

1. Always-on + near-term schedule days
2. High-overlap hubs (see overlap doc)
3. Ordeal / Sage hard-block smoke
4. Remaining events by category
5. Aggregates last

## Success criteria

- Every non-aggregate catalog event has a solo spawn-smoke result
  (pass / fail / N/A no NPCs).
- Every shared spot in the overlap report has a verdict
  (hard / soft / never co-scheduled).
- Hard cases live in `event-conflicts.json` **and** `DEFAULT_CONFLICT_GROUPS`.
- Schedule days you care about probed with `--day` / `--set` before go-live.
