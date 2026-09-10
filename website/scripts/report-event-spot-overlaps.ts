/**
 * Catalog-driven NPC spot overlap report for seasonal event QA.
 *
 * Usage (from website/):
 *   npm run report-event-spot-overlaps
 *   npm run report-event-spot-overlaps -- --set 201501_ordeal,201506_sage
 *   npm run report-event-spot-overlaps -- --day loop:day1
 *   npm run report-event-spot-overlaps -- --include-aggregates
 *   npm run report-event-spot-overlaps -- --stdout
 *
 * Writes:
 *   ../docs/event-spot-overlaps.md
 *   content/events/event-spot-overlaps.json
 */

import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import type {
  CompEvent,
  EventScheduleConfig,
  EventsCatalog,
} from "../lib/events/types"
import { computeDesiredActiveIds } from "../lib/events/event-schedule-math"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const WEBSITE_ROOT = path.resolve(__dirname, "..")
const DOCS_ROOT = path.resolve(WEBSITE_ROOT, "../docs")

const CATALOG_PATH = path.join(WEBSITE_ROOT, "content/events/events-catalog.json")
const SCHEDULE_PATH = path.join(WEBSITE_ROOT, "content/events/event-schedule.json")
const OUT_JSON = path.join(
  WEBSITE_ROOT,
  "content/events/event-spot-overlaps.json"
)
const OUT_MD = path.join(DOCS_ROOT, "event-spot-overlaps.md")

/** Intentional multi-event merges — excluded from overlap matrix by default. */
const DEFAULT_AGGREGATES = new Set([
  "999999_all",
  "all_halloween",
  "all_xmas",
])

type SpawnHit = {
  eventId: string
  titleEn: string
  category: string
  name: string
  zoneName: string
  x: number | null
  y: number | null
}

type SpotOverlap = {
  zoneId: number
  spotId: number
  /** Human label for the shared placement (spot id or fixed x,y). */
  placementLabel: string
  zoneName: string
  eventIds: string[]
  npcNames: string[]
  hits: SpawnHit[]
}

type EventRelation = {
  eventId: string
  titleEn: string
  category: string
  npcSpawnCount: number
  affectedZoneCount: number
  sharesSpotWith: string[]
}

type EmptyNpcSpawnsRow = {
  eventId: string
  titleEn: string
  category: string
  affectedZones: string[]
  featuredNpcs: string[]
}

type ReportPayload = {
  generatedAt: string
  catalogGeneratedAt: string
  catalogPath: string
  skippedAggregates: string[]
  includeAggregates: boolean
  overlapCount: number
  overlaps: SpotOverlap[]
  perEvent: EventRelation[]
  emptyNpcSpawns: EmptyNpcSpawnsRow[]
  setProbe: {
    label: string
    eventIds: string[]
    collisions: SpotOverlap[]
  } | null
  notes: string[]
}

/** SpotID when live; otherwise rounded world X/Y so fixed-coord NPCs don't collide as spot 0. */
function placementKey(s: {
  zoneId: number
  spotId: number
  x: number | null
  y: number | null
}): { key: string; spotId: number; placementLabel: string } {
  if (s.spotId > 0) {
    return {
      key: `${s.zoneId}:spot:${s.spotId}`,
      spotId: s.spotId,
      placementLabel: `spot ${s.spotId}`,
    }
  }
  if (s.x !== null && s.y !== null) {
    const x = Math.round(s.x * 100) / 100
    const y = Math.round(s.y * 100) / 100
    return {
      key: `${s.zoneId}:xy:${x}:${y}`,
      spotId: 0,
      placementLabel: `(${x}, ${y})`,
    }
  }
  return {
    key: `${s.zoneId}:unknown`,
    spotId: 0,
    placementLabel: "unknown",
  }
}

function parseArgs(argv: string[]) {
  let includeAggregates = false
  let stdoutOnly = false
  let setIds: string[] | null = null
  let daySpec: string | null = null
  let write = true

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--include-aggregates") includeAggregates = true
    else if (a === "--stdout") stdoutOnly = true
    else if (a === "--no-write") write = false
    else if (a === "--set") {
      const raw = argv[++i] ?? ""
      setIds = raw
        .split(/[,+\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    } else if (a === "--day") {
      daySpec = argv[++i] ?? null
    } else if (a === "--help" || a === "-h") {
      printHelp()
      process.exit(0)
    }
  }

  return { includeAggregates, stdoutOnly, setIds, daySpec, write }
}

function printHelp() {
  console.log(`report-event-spot-overlaps

Options:
  --include-aggregates   Include 999999_all / all_halloween / all_xmas
  --set id1,id2,...      Probe spot collisions inside this set
  --day loop:<id>        Probe alwaysOn ∪ that loop day's eventIds
  --day calendar:YYYY-MM-DD
                         Probe alwaysOn ∪ that calendar day's eventIds
  --day desired          Probe computeDesiredActiveIds(schedule, now)
                         (only meaningful when schedule.enabled)
  --stdout               Print markdown to stdout
  --no-write             Do not write MD/JSON files
  -h, --help             Show this help
`)
}

async function loadCatalog(): Promise<EventsCatalog> {
  const raw = await fs.readFile(CATALOG_PATH, "utf8")
  return JSON.parse(raw) as EventsCatalog
}

async function loadSchedule(): Promise<EventScheduleConfig | null> {
  try {
    const raw = await fs.readFile(SCHEDULE_PATH, "utf8")
    return JSON.parse(raw) as EventScheduleConfig
  } catch {
    return null
  }
}

function resolveDaySet(
  schedule: EventScheduleConfig,
  daySpec: string
): { label: string; eventIds: string[] } {
  const always = schedule.alwaysOnIds ?? []
  if (daySpec === "desired") {
    const ids = computeDesiredActiveIds(schedule, new Date())
    return {
      label: `desired@now (schedule.enabled=${schedule.enabled})`,
      eventIds: ids,
    }
  }
  if (daySpec.startsWith("loop:")) {
    const id = daySpec.slice("loop:".length)
    const day = schedule.loop?.days?.find((d) => d.id === id)
    if (!day) {
      throw new Error(`Unknown loop day id: ${id}`)
    }
    return {
      label: `loop:${id} + alwaysOn`,
      eventIds: [...new Set([...always, ...(day.eventIds ?? [])])].sort(),
    }
  }
  if (daySpec.startsWith("calendar:")) {
    const date = daySpec.slice("calendar:".length)
    const day = schedule.calendar?.days?.find((d) => d.date === date)
    if (!day) {
      throw new Error(`Unknown calendar date: ${date}`)
    }
    return {
      label: `calendar:${date} + alwaysOn`,
      eventIds: [...new Set([...always, ...(day.eventIds ?? [])])].sort(),
    }
  }
  throw new Error(
    `Invalid --day value "${daySpec}" (use loop:<id>, calendar:YYYY-MM-DD, or desired)`
  )
}

function buildOverlaps(
  events: CompEvent[],
  skipIds: Set<string>
): SpotOverlap[] {
  const bySpot = new Map<
    string,
    { meta: { zoneId: number; spotId: number; placementLabel: string }; hits: SpawnHit[] }
  >()

  for (const e of events) {
    if (skipIds.has(e.id)) continue
    for (const s of e.npcSpawns ?? []) {
      const { key, spotId, placementLabel } = placementKey(s)
      const entry = bySpot.get(key) ?? {
        meta: { zoneId: s.zoneId, spotId, placementLabel },
        hits: [],
      }
      entry.hits.push({
        eventId: e.id,
        titleEn: e.titleEn,
        category: e.category,
        name: s.name,
        zoneName: s.zoneName,
        x: s.x,
        y: s.y,
      })
      bySpot.set(key, entry)
    }
  }

  const overlaps: SpotOverlap[] = []
  for (const { meta, hits } of bySpot.values()) {
    const eventIds = [...new Set(hits.map((h) => h.eventId))].sort()
    if (eventIds.length < 2) continue
    overlaps.push({
      zoneId: meta.zoneId,
      spotId: meta.spotId,
      placementLabel: meta.placementLabel,
      zoneName: hits[0]?.zoneName ?? `zone ${meta.zoneId}`,
      eventIds,
      npcNames: [...new Set(hits.map((h) => h.name))].sort(),
      hits,
    })
  }

  overlaps.sort(
    (a, b) =>
      b.eventIds.length - a.eventIds.length ||
      a.zoneId - b.zoneId ||
      a.spotId - b.spotId ||
      a.placementLabel.localeCompare(b.placementLabel)
  )
  return overlaps
}

function buildPerEvent(
  events: CompEvent[],
  overlaps: SpotOverlap[],
  skipIds: Set<string>
): EventRelation[] {
  const shareMap = new Map<string, Set<string>>()
  for (const o of overlaps) {
    for (const id of o.eventIds) {
      const set = shareMap.get(id) ?? new Set<string>()
      for (const other of o.eventIds) {
        if (other !== id) set.add(other)
      }
      shareMap.set(id, set)
    }
  }

  return events
    .filter((e) => !skipIds.has(e.id))
    .map((e) => ({
      eventId: e.id,
      titleEn: e.titleEn,
      category: e.category,
      npcSpawnCount: e.npcSpawns?.length ?? 0,
      affectedZoneCount: e.affectedZones?.length ?? 0,
      sharesSpotWith: [...(shareMap.get(e.id) ?? [])].sort(),
    }))
    .sort((a, b) => {
      const d = b.sharesSpotWith.length - a.sharesSpotWith.length
      if (d !== 0) return d
      return a.eventId.localeCompare(b.eventId)
    })
}

function filterCollisions(
  overlaps: SpotOverlap[],
  setIds: string[]
): SpotOverlap[] {
  const set = new Set(setIds)
  return overlaps
    .map((o) => {
      const hits = o.hits.filter((h) => set.has(h.eventId))
      const eventIds = [...new Set(hits.map((h) => h.eventId))].sort()
      if (eventIds.length < 2) return null
      return {
        ...o,
        eventIds,
        npcNames: [...new Set(hits.map((h) => h.name))].sort(),
        hits,
      }
    })
    .filter((x): x is SpotOverlap => x !== null)
}

function formatPos(x: number | null, y: number | null): string {
  if (x === null || y === null) return "unresolved"
  return `(${x}, ${y})`
}

function toMarkdown(report: ReportPayload): string {
  const lines: string[] = []
  lines.push("# Event NPC spot overlaps")
  lines.push("")
  lines.push(
    `Generated **${report.generatedAt}** from catalog \`${path.relative(DOCS_ROOT, CATALOG_PATH)}\` (catalog \`generatedAt\`: ${report.catalogGeneratedAt}).`
  )
  lines.push("")
  lines.push(
    "Regenerate: `cd website && npm run report-event-spot-overlaps`"
  )
  lines.push("")
  lines.push("## Notes")
  lines.push("")
  for (const n of report.notes) {
    lines.push(`- ${n}`)
  }
  lines.push("")
  lines.push("## Summary")
  lines.push("")
  lines.push(`| Metric | Value |`)
  lines.push(`| --- | --- |`)
  lines.push(`| Shared spots (overlaps) | ${report.overlapCount} |`)
  lines.push(
    `| Events with empty npcSpawns | ${report.emptyNpcSpawns.length} |`
  )
  lines.push(
    `| Aggregates skipped | ${report.skippedAggregates.join(", ") || "(none)"} |`
  )
  lines.push("")

  if (report.setProbe) {
    lines.push("## Set probe")
    lines.push("")
    lines.push(`**${report.setProbe.label}**`)
    lines.push("")
    lines.push("```")
    lines.push(report.setProbe.eventIds.join(", ") || "(empty set)")
    lines.push("```")
    lines.push("")
    if (report.setProbe.collisions.length === 0) {
      lines.push("No shared `(zoneId, spotId)` collisions inside this set.")
    } else {
      lines.push(
        `${report.setProbe.collisions.length} collision(s) inside this set:`
      )
      lines.push("")
      for (const c of report.setProbe.collisions) {
        lines.push(
          `- **${c.zoneName}** ${c.placementLabel} (\`${c.zoneId}\`) — ${c.eventIds.join(" vs ")} (${c.npcNames.join(", ")})`
        )
      }
    }
    lines.push("")
  }

  lines.push("## Overlap matrix")
  lines.push("")
    lines.push(
      "| Zone | Placement | Events | NPC names | Count |"
    )
    lines.push("| --- | --- | --- | --- | --- |")
    for (const o of report.overlaps) {
      lines.push(
        `| ${o.zoneName} (\`${o.zoneId}\`) | ${o.placementLabel} | ${o.eventIds.map((id) => `\`${id}\``).join(", ")} | ${o.npcNames.join(", ")} | ${o.eventIds.length} |`
      )
    }
  lines.push("")

  lines.push("## Per-event shares-spot-with")
  lines.push("")
  lines.push(
    "Events that share at least one catalog spot with another non-aggregate event (sorted by partner count)."
  )
  lines.push("")
  lines.push("| Event | Title | Partners | npcSpawns |")
  lines.push("| --- | --- | --- | --- |")
  for (const e of report.perEvent.filter((x) => x.sharesSpotWith.length > 0)) {
    lines.push(
      `| \`${e.eventId}\` | ${e.titleEn} | ${e.sharesSpotWith.map((id) => `\`${id}\``).join(", ")} | ${e.npcSpawnCount} |`
    )
  }
  lines.push("")

  lines.push("## Empty npcSpawns (manual partial check)")
  lines.push("")
  lines.push(
    "These events have no cataloged NPC placements (cap/extractor miss, arena-only, or dialogue-only). Use `affectedZones` / partial XML."
  )
  lines.push("")
  if (report.emptyNpcSpawns.length === 0) {
    lines.push("_None._")
  } else {
    lines.push("| Event | Title | Zones | Featured NPCs |")
    lines.push("| --- | --- | --- | --- |")
    for (const e of report.emptyNpcSpawns) {
      const zones =
        e.affectedZones.length > 0
          ? e.affectedZones.slice(0, 4).join("; ") +
            (e.affectedZones.length > 4
              ? ` (+${e.affectedZones.length - 4})`
              : "")
          : "—"
      const npcs =
        e.featuredNpcs.length > 0 ? e.featuredNpcs.slice(0, 5).join(", ") : "—"
      lines.push(
        `| \`${e.eventId}\` | ${e.titleEn} | ${zones} | ${npcs} |`
      )
    }
  }
  lines.push("")

  lines.push("## Detail (top hubs)")
  lines.push("")
  for (const o of report.overlaps.slice(0, 12)) {
    lines.push(
      `### ${o.zoneName} — ${o.placementLabel} (\`${o.zoneId}\`)`
    )
    lines.push("")
    for (const h of o.hits) {
      lines.push(
        `- \`${h.eventId}\` (${h.category}) — **${h.name}** @ ${formatPos(h.x, h.y)}`
      )
    }
    lines.push("")
  }

  lines.push("---")
  lines.push("")
  lines.push(
    "Machine-readable twin: [`website/content/events/event-spot-overlaps.json`](../website/content/events/event-spot-overlaps.json)."
  )
  lines.push("")
  lines.push("QA process: [`event-qa-gm.md`](event-qa-gm.md).")
  lines.push("")

  return lines.join("\n")
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const catalog = await loadCatalog()
  const skip = args.includeAggregates
    ? new Set<string>()
    : new Set(DEFAULT_AGGREGATES)

  const overlaps = buildOverlaps(catalog.events, skip)
  const perEvent = buildPerEvent(catalog.events, overlaps, skip)
  const emptyNpcSpawns: EmptyNpcSpawnsRow[] = catalog.events
    .filter((e) => !skip.has(e.id))
    .filter((e) => (e.npcSpawns?.length ?? 0) === 0)
    .map((e) => ({
      eventId: e.id,
      titleEn: e.titleEn,
      category: e.category,
      affectedZones: e.affectedZones ?? [],
      featuredNpcs: e.featuredNpcs ?? [],
    }))
    .sort((a, b) => a.eventId.localeCompare(b.eventId))

  let setProbe: ReportPayload["setProbe"] = null
  if (args.setIds) {
    setProbe = {
      label: `--set (${args.setIds.length} ids)`,
      eventIds: [...args.setIds].sort(),
      collisions: filterCollisions(overlaps, args.setIds),
    }
  } else if (args.daySpec) {
    const schedule = await loadSchedule()
    if (!schedule) {
      throw new Error(`Cannot --day: missing ${SCHEDULE_PATH}`)
    }
    const resolved = resolveDaySet(schedule, args.daySpec)
    setProbe = {
      label: resolved.label,
      eventIds: resolved.eventIds,
      collisions: filterCollisions(overlaps, resolved.eventIds),
    }
  }

  const report: ReportPayload = {
    generatedAt: new Date().toISOString(),
    catalogGeneratedAt: catalog.generatedAt,
    catalogPath: path.relative(WEBSITE_ROOT, CATALOG_PATH),
    skippedAggregates: args.includeAggregates
      ? []
      : [...DEFAULT_AGGREGATES].sort(),
    includeAggregates: args.includeAggregates,
    overlapCount: overlaps.length,
    overlaps,
    perEvent,
    emptyNpcSpawns,
    setProbe,
    notes: [
      "Hard mutual-exclusion (admin/schedule blocks) lives in `content/events/event-conflicts.json` — currently Ordeal vs Sage (Thoth).",
      "Shared spots here are candidates for combo QA; do not auto-promote all of them to hard conflicts.",
      "Catalog stores at most 40 `npcSpawns` per event (`extract-event-catalog.ts`); open the partial XML if an event may have more.",
      "Before a QA wave: `npm run extract-event-catalog`, then re-run this report.",
    ],
  }

  const md = toMarkdown(report)

  if (args.stdoutOnly) {
    process.stdout.write(md)
  } else {
    console.log(`Overlaps: ${report.overlapCount}`)
    console.log(`Empty npcSpawns: ${report.emptyNpcSpawns.length}`)
    if (setProbe) {
      console.log(
        `Set probe (${setProbe.label}): ${setProbe.collisions.length} collision(s)`
      )
      for (const c of setProbe.collisions) {
        console.log(
          `  - ${c.zoneId} ${c.placementLabel} ${c.zoneName}: ${c.eventIds.join(" vs ")}`
        )
      }
    }
  }

  if (args.write) {
    await fs.mkdir(path.dirname(OUT_MD), { recursive: true })
    await fs.mkdir(path.dirname(OUT_JSON), { recursive: true })
    await fs.writeFile(OUT_MD, md, "utf8")
    await fs.writeFile(OUT_JSON, JSON.stringify(report, null, 2) + "\n", "utf8")
    console.log(`Wrote ${path.relative(WEBSITE_ROOT, OUT_MD)}`)
    console.log(`Wrote ${path.relative(WEBSITE_ROOT, OUT_JSON)}`)
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
