import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type {
  CompEvent,
  EventCategory,
  EventNpcSpawn,
  EventsCatalog,
} from "../lib/events/types"
import {
  extractRawNpcPlacements,
  SpotResolver,
} from "./lib/spot-resolver"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const WEBSITE_ROOT = path.resolve(__dirname, "..")
const REPO_ROOT = path.resolve(__dirname, "../../..")
const I18N_PATH = path.join(WEBSITE_ROOT, "content/events/i18n.json")

type I18nFile = {
  version: number
  titles: Record<
    string,
    {
      titleEn: string
      summary?: string
      /** Public /events detail — player-friendly. */
      notes?: string
      /** Admin /admin/events detail — GM / technical. */
      adminNotes?: string
    }
  >
  npcs: Record<string, string | null>
}

const ZONE_COMMENT_EN: Record<string, string> = {
  第三ホーム: "Home III",
  第二ホーム: "Home II",
  第一ホーム: "Home I",
  スギナミ: "Suginami",
  ナカノ: "Nakano",
  新宿バベル: "Shinjuku Babel",
  シンジュクドック: "Shinjuku Dock",
  シブヤ: "Shibuya",
  イチガヤ: "Ichigaya",
  シナガワ: "Shinagawa",
  聖都アルカディア: "Holy City Arcadia",
  ウエノ: "Ueno",
  シンジュク: "Shinjuku",
  ハロウィンパーティ: "Halloween Party",
  パイ投げ合戦会場: "Pie-Throwing Arena",
  ヴァーチャルバトル: "Virtual Battle",
  ヴァーチャルビーチ・南国: "Virtual Tropical Beach",
  "ヴァーチャルビーチ・南国（昼）": "Virtual Tropical Beach (Day)",
  ネットワーク: "Network",
}

/** Fallback when zone XML is missing — IDs verified against datastore zone comments. */
const KNOWN_MAP_NAMES: Record<number, string> = {
  10101: "Virtual Battle",
  20101: "Home III",
  30101: "Suginami",
  40101: "Nakano",
  50101: "Shinjuku Babel",
  60101: "Shinjuku Dock",
  70101: "Shibuya",
  80101: "Ichigaya",
  90101: "Shinagawa",
  100101: "Holy City Arcadia",
  110101: "Ueno",
  150101: "Shinjuku",
  241001: "Halloween Party",
  1131601: "Pie-Throwing Arena",
}

/** Max DynamicMapIDs in a ServerZonePartial before we treat it as a blanket/global overlay. */
const BLANKET_MAP_THRESHOLD = 12

function hasCjk(s: string): boolean {
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(s)
}

function detectCategory(id: string, titleJp: string): EventCategory {
  const s = `${id.toLowerCase()} ${titleJp.toLowerCase()}`
  if (
    s.includes("summer") ||
    s.includes("サマー") ||
    s.includes("夏") ||
    s.includes("ビーチ") ||
    s.includes("kappa") ||
    s.includes("カッパ") ||
    s.includes("beach")
  ) {
    return "summer"
  }
  if (
    s.includes("halloween") ||
    s.includes("ハロウィン") ||
    s.includes("パイは投げられた") ||
    s.includes("pie")
  ) {
    return "halloween"
  }
  if (
    s.includes("xmas") ||
    s.includes("christmas") ||
    s.includes("newyear") ||
    s.includes("クリスマス") ||
    s.includes("お正月") ||
    s.includes("ダイヤモンドダスト") ||
    s.includes("winter")
  ) {
    return "xmas"
  }
  if (
    s.includes("valentin") ||
    s.includes("whiteday") ||
    s.includes("バレンタイン") ||
    s.includes("ホワイトデー") ||
    s.includes("チョコ") ||
    s.includes("恋")
  ) {
    return "valentines"
  }
  if (s.includes("anniversary") || s.includes("周年") || s.includes("eve")) {
    return "anniversary"
  }
  if (
    s.includes("durarara") ||
    s.includes("toaru") ||
    s.includes("guiltycrown") ||
    s.includes("silentmobius") ||
    s.includes("mensknuckle") ||
    s.includes("maskgirl") ||
    s.includes("akiakane") ||
    s.includes("sengoku") ||
    s.includes("momoiro") ||
    s.includes("lemon")
  ) {
    return "collab"
  }
  if (
    s.includes("aprilfools") ||
    s.includes("escape") ||
    s.includes("demonelect") ||
    s.includes("arubaito")
  ) {
    return "gag"
  }
  return "special"
}

function parseYearMonth(id: string): { year: number; month: number } {
  const m = id.match(/^(\d{4})(\d{2})/)
  if (m) {
    return { year: parseInt(m[1], 10), month: parseInt(m[2], 10) }
  }
  return { year: 2010, month: 1 }
}

async function loadI18n(): Promise<I18nFile> {
  const raw = await fs.readFile(I18N_PATH, "utf8")
  return JSON.parse(raw) as I18nFile
}

async function loadGlossaryNpcMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const candidates = [
    path.join(REPO_ROOT, "ai_custom_smt_server/translation/glossary/terms.tsv"),
    path.join(WEBSITE_ROOT, "../translation/glossary/terms.tsv"),
  ]
  for (const p of candidates) {
    try {
      const raw = await fs.readFile(p, "utf8")
      for (const line of raw.split(/\r?\n/)) {
        if (!line || line.startsWith("#")) continue
        const cols = line.split("\t")
        if (cols.length < 3) continue
        const en = cols[1]?.trim()
        const jp = cols[2]?.trim()
        if (jp && en) map.set(jp, en)
      }
      break
    } catch {
      // optional
    }
  }
  return map
}

/** Merge DEVIL-A1 jp→en pairs when available (translation workspace). */
async function loadDevilA1NpcMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const candidates = [
    path.join(REPO_ROOT, "ai_custom_smt_server/translation/work/20260901-devil-a1-map.json"),
    path.join(WEBSITE_ROOT, "../translation/work/20260901-devil-a1-map.json"),
  ]
  for (const p of candidates) {
    try {
      const raw = await fs.readFile(p, "utf8")
      const data = JSON.parse(raw) as {
        mapping?: Record<string, { jp?: string; en?: string }>
      }
      for (const entry of Object.values(data.mapping ?? {})) {
        if (entry.jp && entry.en) map.set(entry.jp, entry.en)
      }
      break
    } catch {
      // optional
    }
  }
  return map
}

function translateNpcName(
  raw: string,
  i18nNpcs: Record<string, string | null>,
  glossaryMap: Map<string, string>,
  devilMap: Map<string, string>
): string | null {
  const name = raw.trim()
  if (!name) return null

  // Explicit suppress in i18n (null)
  if (Object.prototype.hasOwnProperty.call(i18nNpcs, name) && i18nNpcs[name] === null) {
    return null
  }

  // Glossary (terms.tsv / lingo) wins over invented i18n spellings
  if (glossaryMap.has(name)) return glossaryMap.get(name)!

  // Explicit i18n map
  if (Object.prototype.hasOwnProperty.call(i18nNpcs, name) && i18nNpcs[name]) {
    return i18nNpcs[name]
  }

  if (devilMap.has(name)) return devilMap.get(name)!

  // Already English / no CJK
  if (!hasCjk(name)) return name

  // Try longest-prefix / substring replacements for compound labels
  let out = name
  const layered = new Map<string, string>([
    ...devilMap.entries(),
    ...Object.entries(i18nNpcs).filter(([, en]) => !!en) as Array<[string, string]>,
    ...glossaryMap.entries(),
  ])
  const entries = [...layered.entries()].sort((a, b) => b[0].length - a[0].length)
  for (const [jp, en] of entries) {
    if (jp.length >= 2 && out.includes(jp)) {
      out = out.split(jp).join(en)
    }
  }

  // Common role prefixes still in JP
  const roleMap: Array<[RegExp, string]> = [
    [/バイト商人/g, "Part-Time Merchant"],
    [/ドジな運送屋/g, "Clumsy Courier"],
    [/フリーのよろず屋/g, "Freelance Peddler"],
    [/バーテンダー/g, "Bartender"],
    [/会場案内人/g, "Venue Guide"],
    [/管理人/g, "Manager"],
    [/悪魔研究士/g, "Demon Researcher"],
    [/愛の使者/g, "Messenger of Love"],
    [/小悪魔/g, "Little Devil"],
  ]
  for (const [re, en] of roleMap) {
    out = out.replace(re, en)
  }

  out = out.replace(/[　\t]+/g, " ").replace(/\s+/g, " ").trim()
  return out || name
}

function isJunkNpcComment(name: string): boolean {
  const n = name.trim()
  if (!n) return true
  if (n.startsWith("Time-limited") || n.startsWith("Event indicator") || n.startsWith("Moved to")) {
    return true
  }
  if (/^Hide\b/i.test(n) && !hasCjk(n)) return true
  if (n === "別のビーチへ移動") return true
  if (/^<member/.test(n)) return true
  return false
}

async function findZonesDir(): Promise<string | null> {
  const candidates = [
    path.join(REPO_ROOT, "comp_hack", "datastore", "zones"),
    path.join(REPO_ROOT, "ai_custom_smt_server", "deploy", "data", "datastore", "zones"),
  ]
  for (const c of candidates) {
    try {
      await fs.access(c)
      return c
    } catch {
      // try next
    }
  }
  return null
}

type ZoneIndex = {
  byZoneId: Map<number, string>
  /** DynamicMapID → owning ServerZone ID + display name */
  byDynamicMapId: Map<number, { zoneId: number; name: string }>
}

async function loadZoneIndex(): Promise<ZoneIndex> {
  const byZoneId = new Map<number, string>(
    Object.entries(KNOWN_MAP_NAMES).map(([k, v]) => [Number(k), v])
  )
  const byDynamicMapId = new Map<number, { zoneId: number; name: string }>()
  const zonesDir = await findZonesDir()
  if (!zonesDir) return { byZoneId, byDynamicMapId }

  const files = await fs.readdir(zonesDir)
  for (const file of files) {
    if (!file.endsWith(".xml")) continue
    const idMatch = file.match(/zone-(\d+)/)
    if (!idMatch) continue
    const zoneId = parseInt(idMatch[1], 10)
    try {
      const head = await fs.readFile(path.join(zonesDir, file), "utf8")
      const comment = head.match(/<!--\s*([^\n\-]+?)\s*(?:-->|--)/)
      let name = byZoneId.get(zoneId) || KNOWN_MAP_NAMES[zoneId]
      if (comment) {
        const jp = comment[1].trim().replace(/\s*-->\s*$/, "").trim()
        if (jp && !jp.startsWith("<")) {
          const en = ZONE_COMMENT_EN[jp] || (!hasCjk(jp) ? jp : null)
          if (en) name = en
          else if (!name) name = jp
        }
      }
      if (name) byZoneId.set(zoneId, name)

      const dm = head.match(/<member name="DynamicMapID">(\d+)<\/member>/)
      if (dm && name) {
        const dynamicMapId = parseInt(dm[1], 10)
        if (!byDynamicMapId.has(dynamicMapId)) {
          byDynamicMapId.set(dynamicMapId, { zoneId, name })
        }
      }
    } catch {
      // skip unreadable
    }
  }
  return { byZoneId, byDynamicMapId }
}

/**
 * Collect player-relevant zone IDs for an event partial.
 * Prefer DynamicMapIDs from ServerZonePartial blocks that spawn NPCs (or are small).
 * Ignore huge blanket overlays (weather/item flags across half the world).
 * Also include zoneID warps from event XML.
 */
function collectFocusedMapIds(xmlContents: string[]): number[] {
  const scored = new Map<number, number>() // id -> priority score

  const bump = (id: number, score: number) => {
    scored.set(id, Math.max(scored.get(id) ?? 0, score))
  }

  for (const content of xmlContents) {
    // Event warps / zone transitions
    for (const m of content.matchAll(/<member name="zoneID">(\d+)<\/member>/g)) {
      bump(parseInt(m[1], 10), 50)
    }

    // Zone instances (e.g. Pie-Throwing Arena instanceID 11316 → zone 1131601)
    for (const m of content.matchAll(/<member name="instanceID">(\d+)<\/member>/g)) {
      const instanceId = parseInt(m[1], 10)
      // Common pattern: lobby/dynamic map = instanceId * 100 + 1
      bump(instanceId * 100 + 1, 80)
    }

    // Walk ServerZonePartial-ish blocks: DynamicMapIDs near NPCs
    // Split on ServerZonePartial openings to keep NPC association local
    const chunks = content.split(/<object name="ServerZonePartial">/)
    for (const chunk of chunks.slice(1)) {
      const mapBlock = chunk.match(
        /<member name="DynamicMapIDs">\s*([\s\S]*?)\s*<\/member>/
      )
      if (!mapBlock) continue
      const ids = [...mapBlock[1].matchAll(/<element>(\d+)<\/element>/g)].map((x) =>
        parseInt(x[1], 10)
      )
      const hasNpcs = /<object name="ServerNPC">/.test(chunk)
      const isBlanket = ids.length > BLANKET_MAP_THRESHOLD

      if (isBlanket && !hasNpcs) {
        // Global overlay — skip (this is what caused Zone 10101… noise)
        continue
      }

      const score = hasNpcs ? 100 : isBlanket ? 5 : 40
      for (const id of ids) bump(id, score)
    }

    // Fallback: if no ServerZonePartial chunks yielded maps, keep small DynamicMapID lists only
    if (scored.size === 0) {
      for (const mm of content.matchAll(
        /<member name="DynamicMapIDs">\s*([\s\S]*?)\s*<\/member>/g
      )) {
        const ids = [...mm[1].matchAll(/<element>(\d+)<\/element>/g)].map((x) =>
          parseInt(x[1], 10)
        )
        if (ids.length > BLANKET_MAP_THRESHOLD) continue
        for (const id of ids) bump(id, 20)
      }
    }
  }

  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .filter(([_, score], _i, arr) => {
      // Prefer NPC spawns + instance arenas; drop bare zoneID warp fillers when we have those
      const hasPrimary = arr.some(([, s]) => s >= 80)
      if (hasPrimary) return score >= 80
      return score >= 20
    })
    .map(([id]) => id)
}

/**
 * Label a catalog map id (often a DynamicMapID from partials).
 * Resolved dynamic maps use: `Name (zone 740101 · map 7401001)` for UI tooltips.
 */
function formatZoneLabel(id: number, zones: ZoneIndex): string {
  const asZone = zones.byZoneId.get(id) || KNOWN_MAP_NAMES[id]
  if (asZone) return `${asZone} (${id})`
  const asDm = zones.byDynamicMapId.get(id)
  if (asDm) return `${asDm.name} (zone ${asDm.zoneId} · map ${id})`
  return `Zone ${id}`
}

function resolveMapDisplay(
  mapId: number,
  zones: ZoneIndex
): { zoneName: string; serverZoneId: number | null } {
  const asZone = zones.byZoneId.get(mapId) || KNOWN_MAP_NAMES[mapId]
  if (asZone) return { zoneName: asZone, serverZoneId: mapId }
  const asDm = zones.byDynamicMapId.get(mapId)
  if (asDm) return { zoneName: asDm.name, serverZoneId: asDm.zoneId }
  return { zoneName: `Zone ${mapId}`, serverZoneId: null }
}

async function findPartialsDir(): Promise<string> {
  const candidates = [
    path.join(REPO_ROOT, "comp_hack", "datastore", "partials"),
    path.join(REPO_ROOT, "ai_custom_smt_server", "deploy", "data", "datastore", "partials"),
  ]
  for (const c of candidates) {
    try {
      await fs.access(c)
      return c
    } catch {
      // try next
    }
  }
  throw new Error("Could not find comp_hack partials directory")
}

async function scanPartials(
  i18n: I18nFile,
  glossaryMap: Map<string, string>,
  devilMap: Map<string, string>,
  zones: ZoneIndex,
  spotResolver: SpotResolver
): Promise<{ events: CompEvent[]; unresolvedNpcs: string[]; missingTitles: string[] }> {
  const partialsDir = await findPartialsDir()
  const entries = await fs.readdir(partialsDir)
  const dirNames = entries.filter((e) => !e.startsWith(".") && e !== "optional").sort()

  const events: CompEvent[] = []
  const unresolvedNpcs = new Set<string>()
  const missingTitles: string[] = []

  // First pass: gather placements so we can preload SpotData files
  const perEventXml = new Map<string, string[]>()
  for (const dirName of dirNames) {
    const fullDir = path.join(partialsDir, dirName)
    const stat = await fs.stat(fullDir)
    if (!stat.isDirectory()) continue

    const xmlFiles: string[] = []
    async function walk(d: string) {
      const list = await fs.readdir(d)
      for (const item of list) {
        const itemPath = path.join(d, item)
        const s = await fs.stat(itemPath)
        if (s.isDirectory()) await walk(itemPath)
        else if (item.endsWith(".xml")) xmlFiles.push(itemPath)
      }
    }
    await walk(fullDir)

    const xmlContents: string[] = []
    for (const xmlFile of xmlFiles) {
      xmlContents.push(await fs.readFile(xmlFile, "utf8"))
    }
    perEventXml.set(dirName, xmlContents)
  }

  const allZoneIds = new Set<number>()
  for (const contents of perEventXml.values()) {
    for (const p of extractRawNpcPlacements(contents)) {
      allZoneIds.add(p.zoneId)
    }
    for (const id of collectFocusedMapIds(contents)) {
      allZoneIds.add(id)
    }
  }
  await spotResolver.preloadZones(allZoneIds)

  for (const dirName of dirNames) {
    const xmlContents = perEventXml.get(dirName)
    if (!xmlContents) continue

    let titleJp = ""
    const npcRaw = new Set<string>()

    for (const content of xmlContents) {
      if (!titleJp) {
        const titleMatch = content.match(
          /<!--\s*(?:Time-limited event(?:\s*\([^)]*\))?:\s*|Event:\s*)([^\n]+?)\s*-->/
        )
        if (titleMatch) {
          titleJp = titleMatch[1].trim()
        }
      }

      const npcMatches = content.matchAll(
        /<!--\s*([^\n<>]+?)\s*-->\s*<object name="ServerNPC">/g
      )
      for (const nm of npcMatches) {
        const name = nm[1].trim()
        if (!isJunkNpcComment(name)) npcRaw.add(name)
      }
    }

    const { year, month } = parseYearMonth(dirName)
    const category = detectCategory(dirName, titleJp)

    const focusedIds = collectFocusedMapIds(xmlContents)
    const zoneLabels: string[] = []
    for (const mid of focusedIds) {
      const label = formatZoneLabel(mid, zones)
      if (!zoneLabels.includes(label)) zoneLabels.push(label)
      if (zoneLabels.length >= 6) break
    }

    const override = i18n.titles[dirName]
    let titleEn = override?.titleEn
    if (!titleEn) {
      missingTitles.push(dirName)
      titleEn = titleJp
        ? titleJp
            .replace(/ハロウィン/g, "Halloween")
            .replace(/クリスマス/g, "Christmas")
            .replace(/お正月/g, "New Year")
            .replace(/バレンタイン/g, "Valentine's")
            .replace(/ホワイトデー/g, "White Day")
            .replace(/イベント/g, "Event")
            .replace(/記念/g, "Anniversary")
            .replace(/IMAGINE/gi, "Imagine")
        : dirName
      if (hasCjk(titleEn)) titleEn = dirName
    }

    const summary =
      override?.summary ||
      (titleJp
        ? `${category} event "${titleEn}" spanning ${zoneLabels.slice(0, 3).join(", ") || "Tokyo"}.`
        : `Server partial ${dirName} adding event NPCs and custom interactions.`)
    const notes = override?.notes?.trim() || undefined
    const adminNotes = override?.adminNotes?.trim() || undefined

    const featuredNpcs: string[] = []
    for (const raw of Array.from(npcRaw)) {
      const translated = translateNpcName(raw, i18n.npcs, glossaryMap, devilMap)
      if (translated === null) continue
      if (hasCjk(translated)) unresolvedNpcs.add(raw)
      if (!featuredNpcs.includes(translated)) featuredNpcs.push(translated)
      if (featuredNpcs.length >= 8) break
    }

    const placements = extractRawNpcPlacements(xmlContents)
    const npcSpawns: EventNpcSpawn[] = []
    for (const p of placements) {
      const translated = translateNpcName(p.nameJp, i18n.npcs, glossaryMap, devilMap)
      if (translated === null) continue
      // Prefer SpotData when SpotID is live; fall back to inline X/Y (retired spots).
      let xy =
        p.spotId > 0 ? await spotResolver.resolve(p.zoneId, p.spotId) : null
      if (!xy && p.x !== null && p.y !== null) {
        xy = { x: p.x, y: p.y }
      }
      const { zoneName, serverZoneId } = resolveMapDisplay(p.zoneId, zones)
      npcSpawns.push({
        name: translated,
        nameJp: p.nameJp !== translated ? p.nameJp : undefined,
        zoneId: p.zoneId,
        zoneName,
        serverZoneId,
        spotId: p.spotId,
        x: xy ? Math.round(xy.x * 100) / 100 : null,
        y: xy ? Math.round(xy.y * 100) / 100 : null,
      })
      if (npcSpawns.length >= 40) break
    }

    // Prefer affected zones from actual NPC spawn zones when available
    let finalZones = zoneLabels.slice(0, 5)
    if (npcSpawns.length > 0) {
      const fromSpawns: string[] = []
      for (const s of npcSpawns) {
        const label = formatZoneLabel(s.zoneId, zones)
        if (!fromSpawns.includes(label)) fromSpawns.push(label)
      }
      // Keep instance arenas from focusedIds that aren't spawn hubs
      for (const label of zoneLabels) {
        if (!fromSpawns.includes(label)) fromSpawns.push(label)
      }
      finalZones = fromSpawns.slice(0, 6)
    }

    events.push({
      id: dirName,
      folder: `datastore/partials/${dirName}`,
      titleJp: titleJp || dirName,
      titleEn,
      category,
      year,
      month,
      summary,
      ...(notes ? { notes } : {}),
      ...(adminNotes ? { adminNotes } : {}),
      affectedZones: finalZones,
      featuredNpcs: featuredNpcs.slice(0, 6),
      npcSpawns,
      xmlCount: xmlContents.length,
    })
  }

  return {
    events,
    unresolvedNpcs: Array.from(unresolvedNpcs).sort(),
    missingTitles,
  }
}

async function main() {
  console.log("==> Loading i18n overrides...")
  const i18n = await loadI18n()
  const glossaryMap = await loadGlossaryNpcMap()
  const devilMap = await loadDevilA1NpcMap()
  const zones = await loadZoneIndex()
  const spotResolver = new SpotResolver({ repoRoot: REPO_ROOT })
  await spotResolver.init()
  console.log(
    `==> i18n titles: ${Object.keys(i18n.titles).length}, npc maps: ${Object.keys(i18n.npcs).length}, glossary: ${glossaryMap.size}, devil-a1: ${devilMap.size}, zones: ${zones.byZoneId.size}, dynamicMaps: ${zones.byDynamicMapId.size}`
  )

  console.log("==> Extracting events catalog...")
  const { events, unresolvedNpcs, missingTitles } = await scanPartials(
    i18n,
    glossaryMap,
    devilMap,
    zones,
    spotResolver
  )
  const withPos = events.reduce(
    (n, e) => n + e.npcSpawns.filter((s) => s.x !== null && s.y !== null).length,
    0
  )
  console.log(
    `==> Extracted ${events.length} events (${withPos} NPC spawns with coordinates)`
  )

  const stillJpTitles = events.filter((e) => hasCjk(e.titleEn))
  if (missingTitles.length) {
    console.warn(`!! Missing title overrides (${missingTitles.length}): ${missingTitles.join(", ")}`)
  }
  if (stillJpTitles.length) {
    console.warn(`!! titleEn still has CJK (${stillJpTitles.length}): ${stillJpTitles.map((e) => e.id).join(", ")}`)
  }
  if (unresolvedNpcs.length) {
    console.warn(`!! Unresolved NPC labels (${unresolvedNpcs.length}):`)
    for (const n of unresolvedNpcs) console.warn(`   - ${n}`)
  }

  const catalog: EventsCatalog = {
    version: 1,
    generatedAt: new Date().toISOString(),
    events,
  }

  const outPath = path.join(WEBSITE_ROOT, "content/events/events-catalog.json")
  await fs.mkdir(path.dirname(outPath), { recursive: true })
  await fs.writeFile(outPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8")
  console.log(`==> Wrote catalog to ${outPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
