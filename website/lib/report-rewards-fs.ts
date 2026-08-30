import { createHash } from "node:crypto"
import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { listPayouts, readPayout } from "./dungeon-payouts-fs.ts"
import {
  defaultAppendDropSetId,
  defaultReportEnabled,
  defaultReportStacks,
} from "./report-reward-append-catalog.ts"
import {
  putReportRewardDungeonSchema,
  putReportRewardGlobalSchema,
} from "./report-reward-schema.ts"
import {
  normalizeDungeon,
  normalizeDungeonFile,
  normalizeGlobalFile,
  tradableReportItemId,
  dropsFingerprint,
  dungeonBossDrops,
} from "./report-reward-normalize.ts"
import type { ReportRewardDungeonInput } from "./report-reward-normalize.ts"
import { pickCanonicalLootDungeon } from "./report-reward-generate.ts"
import { REPORT_REWARD_SCHEMA_VERSION } from "./report-reward-types.ts"
import type {
  BossCrateDrop,
  ChoiceMessagesStore,
  ReportRewardDungeon,
  ReportRewardDungeonFile,
  ReportRewardGlobal,
  ReportRewardGlobalFile,
  ReportRewardListItem,
} from "./report-reward-types.ts"

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(LIB_DIR, "../..")

function reportRewardsReleasesDir(): string {
  if (process.env.OPS_RELEASES_DIR?.trim()) {
    return path.resolve(process.env.OPS_RELEASES_DIR.trim())
  }
  return path.join(
    process.env.OPS_RUNTIME?.trim()
      ? path.resolve(process.env.OPS_RUNTIME.trim())
      : path.resolve(REPO_ROOT, "../comp_hack/runtime"),
    "releases",
    "lane-a"
  )
}

export function getReportRewardsDir(): string {
  if (process.env.COMP_REPORT_REWARDS_DIR?.trim()) {
    return path.resolve(process.env.COMP_REPORT_REWARDS_DIR.trim())
  }
  const websiteData = process.env.WEBSITE_DATA_DIR?.trim()
  if (websiteData) {
    return path.join(
      path.resolve(websiteData),
      "server-content",
      "report-rewards"
    )
  }
  return path.resolve(LIB_DIR, "../../server-content/report-rewards")
}

export function reportRewardsDungeonsDir(): string {
  return path.join(getReportRewardsDir(), "dungeons")
}

export function reportRewardsGlobalPath(): string {
  return path.join(getReportRewardsDir(), "global.json")
}

export function choiceMessagesPath(): string {
  return path.join(getReportRewardsDir(), "choice-messages.json")
}

export async function readChoiceMessagesStore(): Promise<ChoiceMessagesStore> {
  try {
    const raw = await fs.readFile(choiceMessagesPath(), "utf8")
    const parsed = JSON.parse(raw) as { byCost?: Record<string, unknown> }
    const byCost: Record<string, number> = {}
    for (const [k, v] of Object.entries(parsed.byCost ?? {})) {
      const id = Math.floor(Number(v))
      const cost = Math.floor(Number(k))
      if (
        Number.isFinite(cost) &&
        cost >= 1 &&
        Number.isFinite(id) &&
        id >= 1
      ) {
        byCost[String(cost)] = id
      }
    }
    return { byCost }
  } catch {
    return { byCost: {} }
  }
}

export async function writeChoiceMessagesStore(
  store: ChoiceMessagesStore
): Promise<void> {
  await ensureDirs()
  const sortedKeys = Object.keys(store.byCost).sort(
    (a, b) => Number(a) - Number(b)
  )
  const byCost: Record<string, number> = {}
  for (const k of sortedKeys) {
    byCost[k] = store.byCost[k]!
  }
  await fs.writeFile(
    choiceMessagesPath(),
    `${JSON.stringify({ byCost }, null, 2)}\n`,
    "utf8"
  )
}

export function workingReportRewardsStampPath(): string {
  return path.join(reportRewardsReleasesDir(), "working-report-rewards.digest")
}

export function defaultReportRewardGlobal(): ReportRewardGlobal {
  return {
    reportItemId: 38172,
    reportItemLabel: "Dungeon Report",
    eventPrefix: "AI_REPORT_TRADE",
    greetMessageId: 1183186,
    promptMessageId: 1183186,
    endMessageId: 3411,
    itemsPerCp: 10,
    cpPackages: [1, 5, 10, 50, 100],
    traders: [
      {
        label: "Home III CP trader",
        dynamicMapId: 20101,
        npcId: 90398,
        x: 172,
        y: 603,
        rotation: 4.71239,
      },
    ],
  }
}

export class ReportRewardNotFoundError extends Error {
  constructor(id: string) {
    super(`Report reward dungeon '${id}' not found`)
    this.name = "ReportRewardNotFoundError"
  }
}

async function ensureDirs(): Promise<void> {
  await fs.mkdir(getReportRewardsDir(), { recursive: true })
  await fs.mkdir(reportRewardsDungeonsDir(), { recursive: true })
}

export async function seedReportRewardsFromPayouts(): Promise<number> {
  await ensureDirs()
  const payouts = await listPayouts()
  let written = 0
  for (const p of payouts) {
    const dest = path.join(reportRewardsDungeonsDir(), `${p.id}.json`)
    try {
      await fs.access(dest)
      continue
    } catch {
      /* new */
    }
    const appendId = defaultAppendDropSetId(p.id)
    if (!appendId) continue
    const full = await readPayout(p.id)
    const stacks = defaultReportStacks(full.payout.difficulty)
    const global = defaultReportRewardGlobal()
    const file: ReportRewardDungeonFile = {
      version: REPORT_REWARD_SCHEMA_VERSION,
      dungeon: {
        id: p.id,
        name: p.name,
        family: p.family,
        difficulty: p.difficulty,
        enabled: defaultReportEnabled(p.id),
        appendDropSetId: appendId,
        drops: [
          {
            itemId: global.reportItemId,
            label: global.reportItemLabel ?? "Dungeon report",
            minStack: stacks.minStack,
            maxStack: stacks.maxStack,
            rate: 100,
            tradableForCp: true,
          },
        ],
      },
    }
    await fs.writeFile(dest, `${JSON.stringify(file, null, 2)}\n`, "utf8")
    written++
  }

  try {
    await fs.access(reportRewardsGlobalPath())
  } catch {
    const globalFile: ReportRewardGlobalFile = {
      version: REPORT_REWARD_SCHEMA_VERSION,
      global: defaultReportRewardGlobal(),
    }
    await fs.writeFile(
      reportRewardsGlobalPath(),
      `${JSON.stringify(globalFile, null, 2)}\n`,
      "utf8"
    )
  }
  return written
}

export async function readReportRewardGlobal(): Promise<ReportRewardGlobalFile> {
  await seedReportRewardsFromPayouts()
  const raw = await fs.readFile(reportRewardsGlobalPath(), "utf8")
  const parsed = putReportRewardGlobalSchema.safeParse(JSON.parse(raw))
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "Invalid report-rewards/global.json"
    )
  }
  return normalizeGlobalFile(parsed.data)
}

export async function writeReportRewardGlobal(file: {
  version: typeof REPORT_REWARD_SCHEMA_VERSION
  global: Parameters<typeof normalizeGlobalFile>[0]["global"]
}): Promise<void> {
  const normalized = normalizeGlobalFile(file)
  const parsed = putReportRewardGlobalSchema.safeParse(normalized)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid global config")
  }
  const toWrite = normalizeGlobalFile(parsed.data)
  await ensureDirs()
  await fs.writeFile(
    reportRewardsGlobalPath(),
    `${JSON.stringify(toWrite, null, 2)}\n`,
    "utf8"
  )
}

export async function listReportRewardDungeons(): Promise<ReportRewardListItem[]> {
  await seedReportRewardsFromPayouts()
  const globalFile = await readReportRewardGlobal()
  const dir = reportRewardsDungeonsDir()
  let entries: string[]
  try {
    entries = await fs.readdir(dir)
  } catch {
    return []
  }
  const out: ReportRewardListItem[] = []
  for (const filename of entries) {
    if (!filename.endsWith(".json")) continue
    try {
      const raw = await fs.readFile(path.join(dir, filename), "utf8")
      const json = JSON.parse(raw) as ReportRewardDungeonFile
      const parsed = putReportRewardDungeonSchema.safeParse(json)
      if (!parsed.success) continue
      const d = normalizeDungeon(
        parsed.data.dungeon,
        globalFile.global.reportItemId
      )
      out.push({
        id: d.id,
        name: d.name,
        family: d.family,
        difficulty: d.difficulty,
        enabled: d.enabled,
        appendDropSetId: d.appendDropSetId,
        dropCount: d.drops.length,
        filename,
      })
    } catch {
      /* skip */
    }
  }
  out.sort((a, b) => a.id.localeCompare(b.id))
  return out
}

export async function readReportRewardDungeon(
  id: string
): Promise<ReportRewardDungeonFile> {
  await seedReportRewardsFromPayouts()
  let raw: string
  try {
    raw = await fs.readFile(
      path.join(reportRewardsDungeonsDir(), `${id}.json`),
      "utf8"
    )
  } catch {
    throw new ReportRewardNotFoundError(id)
  }
  const json = JSON.parse(raw) as ReportRewardDungeonFile
  const parsed = putReportRewardDungeonSchema.safeParse(json)
  if (!parsed.success) {
    throw new Error(
      `Invalid dungeon file ${id}: ${parsed.error.issues[0]?.message}`
    )
  }
  if (parsed.data.dungeon.id !== id) {
    throw new Error(
      `Dungeon id mismatch: file ${id} vs body ${parsed.data.dungeon.id}`
    )
  }
  const globalFile = await readReportRewardGlobal()
  return normalizeDungeonFile(parsed.data, globalFile.global.reportItemId)
}

export async function writeReportRewardDungeon(
  file: {
    version: typeof REPORT_REWARD_SCHEMA_VERSION
    dungeon: ReportRewardDungeonInput
  }
): Promise<void> {
  const globalFile = await readReportRewardGlobal()
  const normalized = normalizeDungeonFile(
    file,
    globalFile.global.reportItemId
  )
  const tradableId = tradableReportItemId(
    normalized.dungeon,
    globalFile.global.reportItemId
  )
  if (tradableId && tradableId !== globalFile.global.reportItemId) {
    await writeReportRewardGlobal({
      ...globalFile,
      global: { ...globalFile.global, reportItemId: tradableId },
    })
  }
  const parsed = putReportRewardDungeonSchema.safeParse(normalized)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid dungeon")
  }
  await ensureDirs()
  await fs.writeFile(
    path.join(reportRewardsDungeonsDir(), `${normalized.dungeon.id}.json`),
    `${JSON.stringify(parsed.data, null, 2)}\n`,
    "utf8"
  )
  await syncSharedAppendDrops(
    normalized.dungeon.appendDropSetId,
    normalized.dungeon.drops,
    normalized.dungeon.id,
    globalFile.global.reportItemId
  )
}

/**
 * Stock crates are shared (e.g. bronze + bearcat → same APPEND id).
 * Keep sibling dungeon rows on the same drop table.
 */
async function syncSharedAppendDrops(
  appendDropSetId: number,
  drops: BossCrateDrop[],
  sourceId: string,
  reportItemId: number
): Promise<number> {
  const dir = reportRewardsDungeonsDir()
  let entries: string[]
  try {
    entries = (await fs.readdir(dir)).filter((e) => e.endsWith(".json"))
  } catch {
    return 0
  }
  const sig = dropsFingerprint(drops)
  let synced = 0
  for (const filename of entries) {
    const id = filename.replace(/\.json$/, "")
    if (id === sourceId) continue
    const pathName = path.join(dir, filename)
    let raw: string
    try {
      raw = await fs.readFile(pathName, "utf8")
    } catch {
      continue
    }
    let json: unknown
    try {
      json = JSON.parse(raw)
    } catch {
      continue
    }
    const parsed = putReportRewardDungeonSchema.safeParse(json)
    if (!parsed.success) continue
    if (parsed.data.dungeon.appendDropSetId !== appendDropSetId) continue
    const nextDrops = drops.map((d) => ({ ...d }))
    if (
      dropsFingerprint(
        dungeonBossDrops(parsed.data.dungeon, reportItemId)
      ) === sig
    ) {
      continue
    }
    const next = normalizeDungeonFile(
      {
        ...parsed.data,
        dungeon: { ...parsed.data.dungeon, drops: nextDrops },
      },
      reportItemId
    )
    await fs.writeFile(
      pathName,
      `${JSON.stringify(next, null, 2)}\n`,
      "utf8"
    )
    synced++
  }
  return synced
}

/** Align all shared APPEND siblings to each group's canonical drop table. */
export async function reconcileSharedAppendDrops(): Promise<number> {
  const globalFile = await readReportRewardGlobal()
  const all = await readAllReportDungeons()
  const byAppend = new Map<number, ReportRewardDungeon[]>()
  for (const d of all) {
    const list = byAppend.get(d.appendDropSetId) ?? []
    list.push(d)
    byAppend.set(d.appendDropSetId, list)
  }
  let synced = 0
  for (const [, group] of byAppend) {
    if (group.length < 2) continue
    const canonical = pickCanonicalLootDungeon(group)
    const drops = dungeonBossDrops(canonical, globalFile.global.reportItemId)
    synced += await syncSharedAppendDrops(
      canonical.appendDropSetId,
      drops,
      canonical.id,
      globalFile.global.reportItemId
    )
  }
  return synced
}

/** Flip Live for every dungeon in one pass (avoids per-row rate limits). */
export async function setAllReportRewardEnabled(
  enabled: boolean
): Promise<{ updated: number; total: number }> {
  await seedReportRewardsFromPayouts()
  const globalFile = await readReportRewardGlobal()
  const reportItemId = globalFile.global.reportItemId
  const dir = reportRewardsDungeonsDir()
  let entries: string[]
  try {
    entries = (await fs.readdir(dir)).filter((e) => e.endsWith(".json"))
  } catch {
    return { updated: 0, total: 0 }
  }

  let updated = 0
  for (const filename of entries) {
    const pathName = path.join(dir, filename)
    let raw: string
    try {
      raw = await fs.readFile(pathName, "utf8")
    } catch {
      continue
    }
    let json: unknown
    try {
      json = JSON.parse(raw)
    } catch {
      continue
    }
    const parsed = putReportRewardDungeonSchema.safeParse(json)
    if (!parsed.success) continue
    if (parsed.data.dungeon.enabled === enabled) continue
    const next = normalizeDungeonFile(
      {
        ...parsed.data,
        dungeon: { ...parsed.data.dungeon, enabled },
      },
      reportItemId
    )
    await fs.writeFile(
      pathName,
      `${JSON.stringify(next, null, 2)}\n`,
      "utf8"
    )
    updated++
  }
  if (enabled) {
    await reconcileSharedAppendDrops()
  }
  return { updated, total: entries.length }
}

export async function readAllReportDungeons(): Promise<ReportRewardDungeon[]> {
  const items = await listReportRewardDungeons()
  const out: ReportRewardDungeon[] = []
  for (const item of items) {
    const file = await readReportRewardDungeon(item.id)
    out.push(file.dungeon)
  }
  return out
}

export async function workingReportRewardsJsonDigest(): Promise<string> {
  const hash = createHash("sha256")
  try {
    hash.update(await fs.readFile(reportRewardsGlobalPath(), "utf8"))
  } catch {
    hash.update("")
  }
  try {
    hash.update(await fs.readFile(choiceMessagesPath(), "utf8"))
  } catch {
    hash.update("")
  }
  const dir = reportRewardsDungeonsDir()
  let entries: string[]
  try {
    entries = (await fs.readdir(dir)).filter((e) => e.endsWith(".json")).sort()
  } catch {
    return hash.digest("hex")
  }
  for (const name of entries) {
    hash.update(await fs.readFile(path.join(dir, name), "utf8"))
  }
  return hash.digest("hex")
}

async function readPublishedReportRewardsDigest(): Promise<string | null> {
  try {
    return (await fs.readFile(workingReportRewardsStampPath(), "utf8")).trim()
  } catch {
    return null
  }
}

export async function writePublishedReportRewardsDigest(): Promise<void> {
  const digest = await workingReportRewardsJsonDigest()
  await fs.mkdir(path.dirname(workingReportRewardsStampPath()), {
    recursive: true,
  })
  await fs.writeFile(workingReportRewardsStampPath(), `${digest}\n`, "utf8")
}

export async function clearPublishedReportRewardsDigest(): Promise<void> {
  try {
    await fs.unlink(workingReportRewardsStampPath())
  } catch {
    /* ok */
  }
}

export async function getReportRewardsDirty(): Promise<boolean> {
  const working = await workingReportRewardsJsonDigest()
  const published = await readPublishedReportRewardsDigest()
  if (published == null) {
    return working !== createHash("sha256").update("").digest("hex")
  }
  return working !== published
}
