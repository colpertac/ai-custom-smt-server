import { createHash } from "node:crypto"
import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import JSZip from "jszip"

import {
  generateBonusOnlyEventsXml,
  generateDropSetXml,
  generateSharedAfterEventsXml,
  payoutPackagePaths,
  sharedAfterPackagePath,
} from "./dungeon-payout-generate.ts"
import { putPayoutSchema } from "./dungeon-payout-schema.ts"
import type { DungeonPayout, DungeonPayoutFile } from "./dungeon-payout-types.ts"
import { loadClearLootCatalog } from "./payout-clear-loot-catalog.ts"
import { buildReportRewardsPackageFiles } from "./report-reward-generate.ts"
import {
  readAllReportDungeons,
  readChoiceMessagesStore,
  readReportRewardGlobal,
  writeChoiceMessagesStore,
  writePublishedReportRewardsDigest,
  clearPublishedReportRewardsDigest,
  workingReportRewardsJsonDigest,
} from "./report-rewards-fs.ts"
import type { CustomEventMessage } from "./report-reward-types.ts"
import { parseCompShopXml } from "./comp-shop-xml.ts"
import { validateCompShop } from "./comp-shops-fs.ts"

export const LANE_A_PAYOUTS_ZIP = "zzz_ai_custom_payouts_admin.zip"
export const LANE_A_REPORT_REWARDS_ZIP = "zzz_ai_custom_report_rewards_admin.zip"
export const LANE_A_RELEASES_KEEP = 5

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(LIB_DIR, "../..")

export type LaneAPhase =
  | "validating"
  | "validated"
  | "applying"
  | "applied"
  | "rolled_back"
  | "failed"

export type LaneAPublishResult = {
  ok: boolean
  phase: LaneAPhase
  releaseId?: string
  shopsCopied: number
  shopsRemoved: number
  payoutsPackaged: number
  reportRewardsPackaged: number
  disabledPayouts: string[]
  disabledReportRewards: string[]
  skippedConflicts: string[]
  warnings: string[]
  errors: string[]
  /** Custom CEventMessage rows to upsert into client overlay on apply. */
  customEventMessages?: CustomEventMessage[]
  clientOverlayUpdated?: boolean
  shopsDest: string
  payoutsZipPath: string
  reportRewardsZipPath: string
  releasesDir?: string
  releasePath?: string
  error?: string
}

export type LaneAReleaseSummary = {
  id: string
  path: string
  createdAt?: string
  shopsCopied?: number
  payoutsPackaged?: number
  hasPrevious: boolean
  applied: boolean
}

function shopsWorkingDir(): string {
  if (process.env.COMP_SHOPS_DIR?.trim()) {
    return path.resolve(process.env.COMP_SHOPS_DIR.trim())
  }
  return path.join(REPO_ROOT, "server-content", "shops")
}

function payoutsWorkingDir(): string {
  if (process.env.COMP_PAYOUTS_DIR?.trim()) {
    return path.resolve(process.env.COMP_PAYOUTS_DIR.trim())
  }
  return path.join(REPO_ROOT, "server-content", "payouts")
}

export function getRuntimeDir(): string {
  if (process.env.OPS_RUNTIME?.trim()) {
    return path.resolve(process.env.OPS_RUNTIME.trim())
  }
  return path.resolve(REPO_ROOT, "../comp_hack/runtime")
}

export function getReleasesDir(): string {
  if (process.env.OPS_RELEASES_DIR?.trim()) {
    return path.resolve(process.env.OPS_RELEASES_DIR.trim())
  }
  return path.join(getRuntimeDir(), "releases", "lane-a")
}

function newReleaseId(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function rmrf(p: string): Promise<void> {
  await fs.rm(p, { recursive: true, force: true })
}

async function ensureDir(p: string): Promise<void> {
  await fs.mkdir(p, { recursive: true })
}

async function copyFileSafe(src: string, dest: string): Promise<void> {
  await ensureDir(path.dirname(dest))
  await fs.copyFile(src, dest)
}

async function listShopFiles(dir: string): Promise<string[]> {
  let entries: string[]
  try {
    entries = await fs.readdir(dir)
  } catch {
    return []
  }
  return entries.filter((f) => /^compshop-\d+\.xml$/i.test(f)).sort()
}

/**
 * Full mirror of managed shops (`compshop-*.xml` only):
 * copy every source shop into dest, then delete dest shops missing from source.
 */
async function mirrorShops(
  sourceDir: string,
  destDir: string
): Promise<{ copied: number; removed: string[] }> {
  await ensureDir(destDir)
  const sourceFiles = await listShopFiles(sourceDir)
  const sourceSet = new Set(sourceFiles)
  const destFiles = await listShopFiles(destDir)
  const removed: string[] = []

  for (const filename of sourceFiles) {
    await copyFileSafe(
      path.join(sourceDir, filename),
      path.join(destDir, filename)
    )
  }
  for (const filename of destFiles) {
    if (sourceSet.has(filename)) continue
    await fs.unlink(path.join(destDir, filename))
    removed.push(filename)
  }
  return { copied: sourceFiles.length, removed }
}

async function readPayoutJson(id: string): Promise<DungeonPayoutFile> {
  const raw = await fs.readFile(
    path.join(payoutsWorkingDir(), `${id}.json`),
    "utf8"
  )
  const parsed = putPayoutSchema.safeParse(JSON.parse(raw))
  if (!parsed.success) {
    throw new Error(
      `Invalid payout file ${id}: ${parsed.error.issues[0]?.message}`
    )
  }
  if (parsed.data.payout.id !== id) {
    throw new Error(`Payout file id mismatch for ${id}`)
  }
  return parsed.data
}

async function listPayoutIds(): Promise<{ id: string; enabled: boolean }[]> {
  const dir = payoutsWorkingDir()
  let entries: string[]
  try {
    entries = await fs.readdir(dir)
  } catch {
    return []
  }
  const out: { id: string; enabled: boolean }[] = []
  for (const filename of entries) {
    if (!filename.endsWith(".json") || filename.startsWith(".")) continue
    const id = filename.slice(0, -".json".length)
    try {
      const file = await readPayoutJson(id)
      out.push({ id, enabled: file.payout.enabled })
    } catch {
      /* skip invalid */
    }
  }
  out.sort((a, b) => a.id.localeCompare(b.id))
  return out
}

type PackageIndex = {
  dropSets: Map<number, string[]>
  events: Map<string, string[]>
}

async function scanForeignPackages(
  packagesDest: string
): Promise<PackageIndex> {
  const dropSets = new Map<number, string[]>()
  const events = new Map<string, string[]>()
  let entries: string[]
  try {
    entries = await fs.readdir(packagesDest)
  } catch {
    return { dropSets, events }
  }

  for (const name of entries) {
    if (
      !name.endsWith(".zip") ||
      name === LANE_A_PAYOUTS_ZIP ||
      name === LANE_A_REPORT_REWARDS_ZIP
    ) {
      continue
    }
    // Ignore operator-disabled packages (…zip.disabled / …zip.disabled-*)
    if (/\.zip\.disabled/i.test(name)) continue
    try {
      const buf = await fs.readFile(path.join(packagesDest, name))
      const zip = await JSZip.loadAsync(buf)
      for (const [entryName, entry] of Object.entries(zip.files)) {
        if (entry.dir || !entryName.endsWith(".xml")) continue
        const xml = await entry.async("string")
        if (/dropset/i.test(entryName)) {
          for (const m of xml.matchAll(
            /<member\s+name="ID">\s*(\d+)\s*<\/member>/gi
          )) {
            const id = Number(m[1])
            const list = dropSets.get(id) ?? []
            if (!list.includes(name)) list.push(name)
            dropSets.set(id, list)
          }
        }
        if (/(^|\/)events?\//i.test(entryName)) {
          for (const m of xml.matchAll(
            /<member\s+name="ID">\s*([^<]+?)\s*<\/member>/gi
          )) {
            const id = m[1].trim()
            if (!id || /^\d+$/.test(id)) continue
            const list = events.get(id) ?? []
            if (!list.includes(name)) list.push(name)
            events.set(id, list)
          }
        }
      }
    } catch {
      /* skip corrupt zip */
    }
  }
  return { dropSets, events }
}

function payoutHookEventIds(payout: {
  hooks: {
    afterNormalLootEventId: string
    afterFiendLootEventId: string
    bonusEventId: string
    bonusFiendEventId: string
  }
}): string[] {
  const h = payout.hooks
  return [
    h.afterNormalLootEventId,
    h.afterFiendLootEventId,
    h.bonusEventId,
    h.bonusFiendEventId,
  ].filter(Boolean)
}

export type PayoutLiveConflict = {
  payoutId: string
  dropSetId: number
  dropSetPackages: string[]
  eventIds: string[]
  eventPackages: string[]
}

/** Enabled working payouts that would brick channel or be skipped on publish. */
export async function listPayoutLiveConflicts(): Promise<PayoutLiveConflict[]> {
  const packagesLive = path.join(getRuntimeDir(), "datastore", "packages")
  const index = await scanForeignPackages(packagesLive)
  const items = await listPayoutIds()
  const out: PayoutLiveConflict[] = []
  for (const item of items) {
    if (!item.enabled) continue
    let file: DungeonPayoutFile
    try {
      file = await readPayoutJson(item.id)
    } catch {
      continue
    }
    const payout = file.payout
    const dropSetPackages = index.dropSets.get(payout.dropSetId) ?? []
    const eventIds = payoutHookEventIds(payout)
    const eventPackages = [
      ...new Set(eventIds.flatMap((id) => index.events.get(id) ?? [])),
    ]
    if (dropSetPackages.length || eventPackages.length) {
      out.push({
        payoutId: payout.id,
        dropSetId: payout.dropSetId,
        dropSetPackages,
        eventIds: eventIds.filter((id) => (index.events.get(id) ?? []).length),
        eventPackages,
      })
    }
  }
  return out
}

/**
 * Rename foreign packages that own DropSets/events claimed by enabled payouts
 * so Lane A admin zip can load (channel rejects duplicate event/DropSet IDs).
 */
export async function retirePackagesBlockingLaneA(): Promise<{
  retired: string[]
  skipped: string[]
}> {
  const packagesLive = path.join(getRuntimeDir(), "datastore", "packages")
  const conflicts = await listPayoutLiveConflicts()
  const toRetire = new Set<string>()
  for (const c of conflicts) {
    for (const z of c.dropSetPackages) toRetire.add(z)
    for (const z of c.eventPackages) toRetire.add(z)
  }
  const retired: string[] = []
  const skipped: string[] = []
  const stamp = new Date().toISOString().replace(/[:.]/g, "")
  for (const name of [...toRetire].sort()) {
    const src = path.join(packagesLive, name)
    const dest = path.join(
      packagesLive,
      `${name}.disabled-by-lane-a-${stamp}`
    )
    try {
      await fs.rename(src, dest)
      retired.push(name)
    } catch {
      skipped.push(name)
    }
  }
  return { retired, skipped }
}

async function shopsTreeDigest(dir: string): Promise<string> {
  const files = await listShopFiles(dir)
  const h = createHash("sha256")
  for (const filename of files) {
    try {
      const buf = await fs.readFile(path.join(dir, filename))
      h.update(filename)
      h.update("\0")
      h.update(buf)
      h.update("\0")
    } catch {
      h.update(filename)
      h.update("\0missing\0")
    }
  }
  return h.digest("hex")
}

/**
 * Fingerprint of every payout JSON in the working copy (enabled or not).
 * Used for pending-publish UI — package digests skip disabled payouts.
 */
async function workingPayoutsJsonDigest(): Promise<string> {
  const dir = payoutsWorkingDir()
  let entries: string[]
  try {
    entries = await fs.readdir(dir)
  } catch {
    return createHash("sha256").digest("hex")
  }
  const files = entries
    .filter((f) => f.endsWith(".json") && !f.startsWith("."))
    .sort((a, b) => a.localeCompare(b))
  const h = createHash("sha256")
  for (const filename of files) {
    try {
      const buf = await fs.readFile(path.join(dir, filename))
      h.update(filename)
      h.update("\0")
      h.update(buf)
      h.update("\0")
    } catch {
      h.update(filename)
      h.update("\0missing\0")
    }
  }
  return h.digest("hex")
}

function workingPayoutsStampPath(): string {
  return path.join(getReleasesDir(), "working-payouts.digest")
}

async function readPublishedPayoutsJsonDigest(): Promise<string | null> {
  try {
    const raw = (await fs.readFile(workingPayoutsStampPath(), "utf8")).trim()
    return raw || null
  } catch {
    return null
  }
}

async function readPublishedReportRewardsDigest(): Promise<string | null> {
  try {
    const stampPath = path.join(getReleasesDir(), "working-report-rewards.digest")
    return (await fs.readFile(stampPath, "utf8")).trim()
  } catch {
    return null
  }
}

async function writePublishedPayoutsJsonDigest(): Promise<void> {
  const digest = await workingPayoutsJsonDigest()
  const stampPath = workingPayoutsStampPath()
  await ensureDir(path.dirname(stampPath))
  await fs.writeFile(stampPath, `${digest}\n`, "utf8")
}

async function clearPublishedPayoutsJsonDigest(): Promise<void> {
  try {
    await fs.unlink(workingPayoutsStampPath())
  } catch {
    /* missing ok */
  }
}

export type LaneAPendingStatus = {
  pending: boolean
  shopsDirty: boolean
  payoutsDirty: boolean
  reportRewardsDirty: boolean
}

/**
 * True when working shops/payouts differ from what is live on the game server
 * (admin must Publish shops & payouts on Overview).
 *
 * Payouts compare working JSON to a stamp written on successful publish so
 * disabled / conflict-skipped drafts still show as pending.
 */
export async function getLaneAPendingStatus(): Promise<LaneAPendingStatus> {
  const runtime = getRuntimeDir()
  const shopsLive = path.join(runtime, "datastore", "shops")

  const [shopsWorking, shopsLiveDigest, payoutsWorking, publishedPayouts, reportWorking, publishedReports] =
    await Promise.all([
      shopsTreeDigest(shopsWorkingDir()),
      shopsTreeDigest(shopsLive),
      workingPayoutsJsonDigest(),
      readPublishedPayoutsJsonDigest(),
      workingReportRewardsJsonDigest(),
      readPublishedReportRewardsDigest(),
    ])

  const shopsDirty = shopsWorking !== shopsLiveDigest
  // No stamp yet → any working payout draft counts as unpublished.
  const payoutsDirty =
    publishedPayouts == null
      ? payoutsWorking !== createHash("sha256").digest("hex")
      : payoutsWorking !== publishedPayouts
  const reportRewardsDirty =
    publishedReports == null
      ? reportWorking !== createHash("sha256").update("").digest("hex")
      : reportWorking !== publishedReports
  return {
    pending: shopsDirty || payoutsDirty || reportRewardsDirty,
    shopsDirty,
    payoutsDirty,
    reportRewardsDirty,
  }
}

function emptyResult(
  phase: LaneAPhase,
  runtime: string,
  partial?: Partial<LaneAPublishResult>
): LaneAPublishResult {
  return {
    ok: false,
    phase,
    shopsCopied: 0,
    shopsRemoved: 0,
    payoutsPackaged: 0,
    reportRewardsPackaged: 0,
    disabledPayouts: [],
    disabledReportRewards: [],
    skippedConflicts: [],
    warnings: [],
    errors: [],
    shopsDest: path.join(runtime, "datastore", "shops"),
    payoutsZipPath: path.join(
      runtime,
      "datastore",
      "packages",
      LANE_A_PAYOUTS_ZIP
    ),
    reportRewardsZipPath: path.join(
      runtime,
      "datastore",
      "packages",
      LANE_A_REPORT_REWARDS_ZIP
    ),
    ...partial,
  }
}

async function writeManifest(
  releasePath: string,
  data: Record<string, unknown>
): Promise<void> {
  await fs.writeFile(
    path.join(releasePath, "manifest.json"),
    `${JSON.stringify(data, null, 2)}\n`,
    "utf8"
  )
}

function parseCustomEventMessages(raw: unknown): CustomEventMessage[] {
  if (!Array.isArray(raw)) return []
  const out: CustomEventMessage[] = []
  for (const row of raw) {
    if (!row || typeof row !== "object") continue
    const id = Math.floor(Number((row as { id?: unknown }).id))
    const linesRaw = (row as { lines?: unknown }).lines
    if (!Number.isFinite(id) || id < 1 || !Array.isArray(linesRaw)) continue
    const lines = linesRaw
      .filter((l): l is string => typeof l === "string")
      .map((l) => l.slice(0, 132))
    if (!lines.length) continue
    out.push({ id, lines })
  }
  return out
}

async function pruneReleases(releasesDir: string): Promise<void> {
  let entries: string[]
  try {
    entries = await fs.readdir(releasesDir)
  } catch {
    return
  }
  const ids = entries
    .filter((e) => e !== "LATEST" && !e.startsWith("."))
    .sort()
    .reverse()
  for (const id of ids.slice(LANE_A_RELEASES_KEEP)) {
    await rmrf(path.join(releasesDir, id))
  }
}

async function setLatest(releasesDir: string, releaseId: string): Promise<void> {
  await fs.writeFile(path.join(releasesDir, "LATEST"), `${releaseId}\n`, "utf8")
}

export async function getLatestReleaseId(): Promise<string | null> {
  try {
    const raw = await fs.readFile(path.join(getReleasesDir(), "LATEST"), "utf8")
    const id = raw.trim()
    return id || null
  } catch {
    return null
  }
}

export async function listLaneAReleases(): Promise<LaneAReleaseSummary[]> {
  const releasesDir = getReleasesDir()
  let entries: string[]
  try {
    entries = await fs.readdir(releasesDir)
  } catch {
    return []
  }
  const latest = await getLatestReleaseId()
  const out: LaneAReleaseSummary[] = []
  for (const id of entries.filter((e) => e !== "LATEST").sort().reverse()) {
    const releasePath = path.join(releasesDir, id)
    let manifest: Record<string, unknown> = {}
    try {
      manifest = JSON.parse(
        await fs.readFile(path.join(releasePath, "manifest.json"), "utf8")
      ) as Record<string, unknown>
    } catch {
      /* optional */
    }
    out.push({
      id,
      path: releasePath,
      createdAt:
        typeof manifest.createdAt === "string" ? manifest.createdAt : undefined,
      shopsCopied:
        typeof manifest.shopsCopied === "number"
          ? manifest.shopsCopied
          : undefined,
      payoutsPackaged:
        typeof manifest.payoutsPackaged === "number"
          ? manifest.payoutsPackaged
          : undefined,
      hasPrevious: await pathExists(path.join(releasePath, "previous")),
      applied: latest === id || manifest.phase === "applied",
    })
  }
  return out
}

/** Build candidate under releases/<id>/candidate and validate. Does not touch live. */
export async function validateLaneA(): Promise<LaneAPublishResult> {
  const runtime = getRuntimeDir()
  const packagesLive = path.join(runtime, "datastore", "packages")
  const shopsLive = path.join(runtime, "datastore", "shops")
  const releasesDir = getReleasesDir()
  const releaseId = newReleaseId()
  const releasePath = path.join(releasesDir, releaseId)
  const candidateShops = path.join(releasePath, "candidate", "shops")
  const candidatePackages = path.join(releasePath, "candidate", "packages")
  const candidateZip = path.join(candidatePackages, LANE_A_PAYOUTS_ZIP)
  const candidateReportZip = path.join(
    candidatePackages,
    LANE_A_REPORT_REWARDS_ZIP
  )

  const warnings: string[] = []
  const errors: string[] = []
  const disabledPayouts: string[] = []
  const disabledReportRewards: string[] = []
  const skippedConflicts: string[] = []

  await ensureDir(candidateShops)
  await ensureDir(candidatePackages)

  let shopsCopied = 0
  try {
    const files = await listShopFiles(shopsWorkingDir())
    if (!files.length) {
      warnings.push("No compshop-*.xml files in working copy")
    }
    for (const filename of files) {
      const src = path.join(shopsWorkingDir(), filename)
      const xml = await fs.readFile(src, "utf8")
      if (!xml.trim() || !xml.includes("<")) {
        errors.push(`Invalid or empty shop XML: ${filename}`)
        continue
      }
      try {
        const shop = parseCompShopXml(xml, filename)
        for (const issue of validateCompShop(shop, null)) {
          errors.push(`${filename}: ${issue.path}: ${issue.message}`)
        }
      } catch (e) {
        errors.push(
          `${filename}: ${e instanceof Error ? e.message : "parse failed"}`
        )
        continue
      }
      await copyFileSafe(src, path.join(candidateShops, filename))
      shopsCopied++
    }
  } catch (e) {
    const msg =
      e instanceof Error
        ? `Failed to read shops working copy: ${e.message}`
        : "Failed to read shops working copy"
    await writeManifest(releasePath, {
      phase: "failed",
      createdAt: new Date().toISOString(),
      error: msg,
    })
    return emptyResult("failed", runtime, {
      releaseId,
      releasePath,
      releasesDir,
      errors: [msg],
      error: msg,
      shopsDest: shopsLive,
      payoutsZipPath: path.join(packagesLive, LANE_A_PAYOUTS_ZIP),
    })
  }

  let payoutsPackaged = 0
  try {
    const items = await listPayoutIds()
    const foreign = await scanForeignPackages(packagesLive)
    const usedInCandidate = new Set<number>()
    const usedEvents = new Set<string>()
    const catalog = await loadClearLootCatalog()
    const stockNextTargets = new Set<string>()
    for (const ev of catalog?.clearLootEvents ?? []) {
      if (ev.next) stockNextTargets.add(ev.next)
    }
    if (!catalog) {
      warnings.push(
        "clear-loot-catalog.json missing — skipped stock-next gate for payout AFTER IDs"
      )
    }

    if (!items.length) {
      warnings.push("No payout JSON files in working copy")
    }

    const zip = new JSZip()
    /** Enabled payouts that passed DropSet foreign conflict checks. */
    const eligible: DungeonPayout[] = []

    for (const item of items) {
      if (!item.enabled) {
        disabledPayouts.push(item.id)
        continue
      }
      const file = await readPayoutJson(item.id)
      const payout = file.payout
      const dropOwners = foreign.dropSets.get(payout.dropSetId) ?? []
      if (dropOwners.length) {
        skippedConflicts.push(
          `${payout.id} (DropSet ${payout.dropSetId} in ${dropOwners.join(", ")})`
        )
        continue
      }
      if (usedInCandidate.has(payout.dropSetId)) {
        errors.push(
          `Duplicate DropSet ${payout.dropSetId} within candidate (payout ${payout.id})`
        )
        continue
      }
      usedInCandidate.add(payout.dropSetId)
      eligible.push(payout)
    }

    // Group by shared AFTER IDs so one dispatcher Event is emitted per family.
    const byAfter = new Map<string, DungeonPayout[]>()
    for (const payout of eligible) {
      const key = `${payout.hooks.afterNormalLootEventId}\0${payout.hooks.afterFiendLootEventId}`
      const group = byAfter.get(key) ?? []
      group.push(payout)
      byAfter.set(key, group)
    }

    for (const group of byAfter.values()) {
      const head = group[0]
      const afterNormal = head.hooks.afterNormalLootEventId
      const afterFiend = head.hooks.afterFiendLootEventId
      const resume = head.hooks.resumeNormalNext

      for (const p of group) {
        if (p.hooks.resumeNormalNext !== resume) {
          errors.push(
            `Shared AFTER group ${afterNormal}: resume mismatch (${head.id}=${resume} vs ${p.id}=${p.hooks.resumeNormalNext})`
          )
        }
      }

      // Stock splice gate: AFTER must be the next of some clear-loot event.
      if (
        catalog &&
        stockNextTargets.size > 0 &&
        !stockNextTargets.has(afterNormal)
      ) {
        errors.push(
          `Enabled payout(s) ${group.map((p) => p.id).join(", ")}: AFTER ${afterNormal} is not the next of any stock clear-loot event (not mapped yet — patch stock or run payout-wire-families)`
        )
      }

      const sharedEventIds = [afterNormal, afterFiend]
      const allHookIds = [
        ...sharedEventIds,
        ...group.flatMap((p) => [
          p.hooks.bonusEventId,
          p.hooks.bonusFiendEventId,
        ]),
      ]

      const eventHits = allHookIds
        .map((id) => {
          const owners = foreign.events.get(id) ?? []
          return owners.length ? `${id}←${owners.join("|")}` : null
        })
        .filter(Boolean)
      if (eventHits.length) {
        for (const p of group) {
          skippedConflicts.push(
            `${p.id} (event IDs already loaded: ${eventHits.join("; ")} — disable that package or change hooks)`
          )
        }
        continue
      }

      for (const id of allHookIds) {
        if (usedEvents.has(id)) {
          errors.push(
            `Duplicate event ID ${id} within candidate (shared AFTER group ${afterNormal}, payouts ${group.map((p) => p.id).join(", ")})`
          )
        }
        usedEvents.add(id)
      }

      try {
        zip.file(
          sharedAfterPackagePath(afterNormal),
          generateSharedAfterEventsXml(group)
        )
      } catch (e) {
        errors.push(
          e instanceof Error
            ? e.message
            : `Failed to build shared AFTER for ${afterNormal}`
        )
        continue
      }

      for (const payout of group) {
        const paths = payoutPackagePaths(payout)
        zip.file(paths.eventsPath, generateBonusOnlyEventsXml(payout))
        zip.file(paths.dropSetPath, generateDropSetXml(payout))
        payoutsPackaged++
      }
    }

    if (payoutsPackaged > 0) {
      const buf = await zip.generateAsync({
        type: "nodebuffer",
        compression: "DEFLATE",
      })
      await fs.writeFile(candidateZip, buf)
    } else if (items.length) {
      warnings.push(
        "No payout package in candidate (all disabled or package conflicts)"
      )
    }
  } catch (e) {
    const msg =
      e instanceof Error
        ? `Failed to build payout package: ${e.message}`
        : "Failed to build payout package"
    errors.push(msg)
  }

  if (disabledPayouts.length) {
    warnings.push(
      `${disabledPayouts.length} disabled payout(s) skipped (enable in /admin/payouts to publish)`
    )
  }
  if (skippedConflicts.length) {
    // Enabled payouts that cannot ship must fail Check/Publish — silent skip
    // left Suginami bronze on the old Phase 13 package (CP never updated).
    errors.push(
      `Enabled payout(s) blocked by another live package (DropSet or event ID conflict). Retire/rename the old .zip under datastore/packages/ (or use retire packages), then Check again: ${skippedConflicts.join("; ")}`
    )
  }

  let reportRewardsPackaged = 0
  let customEventMessages: CustomEventMessage[] = []
  try {
    const globalFile = await readReportRewardGlobal()
    const allDungeons = await readAllReportDungeons()
    for (const d of allDungeons) {
      if (!d.enabled) disabledReportRewards.push(d.id)
    }
    const choiceStore = await readChoiceMessagesStore()
    const {
      files: packageFiles,
      warnings: reportWarnings,
      choiceStore: nextChoiceStore,
      customEventMessages: customMsgs,
      choiceMessagesAllocated,
    } = buildReportRewardsPackageFiles(
      allDungeons,
      globalFile.global,
      choiceStore
    )
    warnings.push(...reportWarnings)
    customEventMessages = customMsgs
    if (choiceMessagesAllocated) {
      await writeChoiceMessagesStore(nextChoiceStore)
    }
    const enabledCount = allDungeons.filter((d) => d.enabled).length
    if (Object.keys(packageFiles).length) {
      const foreign = await scanForeignPackages(packagesLive)
      const prefix = globalFile.global.eventPrefix
      const coreEvents = [`${prefix}_END`, `${prefix}_GREET`, `${prefix}_PROMPT`]
      const eventHits = coreEvents.filter(
        (id) => (foreign.events.get(id)?.length ?? 0) > 0
      )
      if (eventHits.length) {
        errors.push(
          `Report trade events already in another package: ${eventHits.join(", ")}`
        )
      } else {
        const zip = new JSZip()
        for (const [relPath, content] of Object.entries(packageFiles)) {
          zip.file(relPath, content)
        }
        const buf = await zip.generateAsync({
          type: "nodebuffer",
          compression: "DEFLATE",
        })
        await fs.writeFile(candidateReportZip, buf)
        reportRewardsPackaged = 1
      }
    } else if (enabledCount > 0) {
      warnings.push(
        "Report rewards dungeons enabled but package empty — add trade tiers and at least one trader NPC"
      )
    }
  } catch (e) {
    errors.push(
      e instanceof Error
        ? `Report rewards: ${e.message}`
        : "Report rewards packaging failed"
    )
  }

  if (disabledReportRewards.length) {
    warnings.push(
      `${disabledReportRewards.length} disabled dungeon(s) skipped (enable in /admin/dungeon-loot)`
    )
  }

  const liveShopFiles = await listShopFiles(shopsLive)
  const candidateSet = new Set(await listShopFiles(candidateShops))
  const willRemove = liveShopFiles.filter((f) => !candidateSet.has(f))
  if (willRemove.length) {
    warnings.push(
      `Will remove ${willRemove.length} live shop(s) not in working copy: ${willRemove.join(", ")}`
    )
  }

  if (
    shopsCopied === 0 &&
    payoutsPackaged === 0 &&
    reportRewardsPackaged === 0 &&
    willRemove.length === 0
  ) {
    errors.push(
      "Nothing to publish — seed shops, payouts, or report-rewards working copy first"
    )
  }

  const ok = errors.length === 0
  const phase: LaneAPhase = ok ? "validated" : "failed"
  await writeManifest(releasePath, {
    phase,
    createdAt: new Date().toISOString(),
    shopsCopied,
    shopsRemoved: willRemove.length,
    shopsToRemove: willRemove,
    payoutsPackaged,
    reportRewardsPackaged,
    disabledPayouts,
    disabledReportRewards,
    skippedConflicts,
    warnings,
    errors,
    customEventMessages,
  })

  return {
    ok,
    phase,
    releaseId,
    shopsCopied,
    shopsRemoved: willRemove.length,
    payoutsPackaged,
    reportRewardsPackaged,
    disabledPayouts,
    disabledReportRewards,
    skippedConflicts,
    warnings,
    errors,
    customEventMessages,
    shopsDest: shopsLive,
    payoutsZipPath: path.join(packagesLive, LANE_A_PAYOUTS_ZIP),
    reportRewardsZipPath: path.join(packagesLive, LANE_A_REPORT_REWARDS_ZIP),
    releasesDir,
    releasePath,
    error: ok ? undefined : errors.join("; "),
  }
}

/** Snapshot live → previous/, then copy candidate → live. */
export async function applyLaneA(
  releaseId: string
): Promise<LaneAPublishResult> {
  const runtime = getRuntimeDir()
  const releasesDir = getReleasesDir()
  const releasePath = path.join(releasesDir, releaseId)
  const candidateShops = path.join(releasePath, "candidate", "shops")
  const candidateZip = path.join(
    releasePath,
    "candidate",
    "packages",
    LANE_A_PAYOUTS_ZIP
  )
  const candidateReportZip = path.join(
    releasePath,
    "candidate",
    "packages",
    LANE_A_REPORT_REWARDS_ZIP
  )
  const previousShops = path.join(releasePath, "previous", "shops")
  const previousPackages = path.join(releasePath, "previous", "packages")
  const shopsLive = path.join(runtime, "datastore", "shops")
  const packagesLive = path.join(runtime, "datastore", "packages")
  const liveZip = path.join(packagesLive, LANE_A_PAYOUTS_ZIP)
  const liveReportZip = path.join(packagesLive, LANE_A_REPORT_REWARDS_ZIP)

  if (!(await pathExists(path.join(releasePath, "candidate")))) {
    return emptyResult("failed", runtime, {
      releaseId,
      releasePath,
      releasesDir,
      error: `Release candidate not found: ${releaseId}`,
      errors: [`Release candidate not found: ${releaseId}`],
    })
  }

  let manifest: Record<string, unknown> = {}
  try {
    manifest = JSON.parse(
      await fs.readFile(path.join(releasePath, "manifest.json"), "utf8")
    ) as Record<string, unknown>
  } catch {
    /* ok */
  }
  if (manifest.phase === "failed") {
    return emptyResult("failed", runtime, {
      releaseId,
      releasePath,
      releasesDir,
      error: "Cannot apply a failed validation release",
      errors: ["Cannot apply a failed validation release"],
    })
  }

  try {
    await ensureDir(previousShops)
    await ensureDir(previousPackages)
    await ensureDir(shopsLive)
    await ensureDir(packagesLive)

    // Snapshot current live shops (compshop-*.xml only) and admin payout zip.
    for (const filename of await listShopFiles(shopsLive)) {
      await copyFileSafe(
        path.join(shopsLive, filename),
        path.join(previousShops, filename)
      )
    }
    if (await pathExists(liveZip)) {
      await copyFileSafe(liveZip, path.join(previousPackages, LANE_A_PAYOUTS_ZIP))
    }
    if (await pathExists(liveReportZip)) {
      await copyFileSafe(
        liveReportZip,
        path.join(previousPackages, LANE_A_REPORT_REWARDS_ZIP)
      )
    }

    // Full mirror: copy candidate shops, delete live shops absent from candidate.
    const mirror = await mirrorShops(candidateShops, shopsLive)

    // Apply or remove payout zip.
    if (await pathExists(candidateZip)) {
      await copyFileSafe(candidateZip, liveZip)
    } else if (await pathExists(liveZip)) {
      await fs.unlink(liveZip)
    }

    if (await pathExists(candidateReportZip)) {
      await copyFileSafe(candidateReportZip, liveReportZip)
    } else if (await pathExists(liveReportZip)) {
      await fs.unlink(liveReportZip)
    }

    const shopsCopied =
      typeof manifest.shopsCopied === "number"
        ? manifest.shopsCopied
        : mirror.copied
    const shopsRemoved = mirror.removed.length
    const payoutsPackaged =
      typeof manifest.payoutsPackaged === "number"
        ? manifest.payoutsPackaged
        : (await pathExists(candidateZip))
          ? 1
          : 0
    const reportRewardsPackaged =
      typeof manifest.reportRewardsPackaged === "number"
        ? manifest.reportRewardsPackaged
        : (await pathExists(candidateReportZip))
          ? 1
          : 0

    const warnings = Array.isArray(manifest.warnings)
      ? [...(manifest.warnings as string[])]
      : []
    if (mirror.removed.length) {
      warnings.push(
        `Removed ${mirror.removed.length} shop(s) from live: ${mirror.removed.join(", ")}`
      )
    }

    await writeManifest(releasePath, {
      ...manifest,
      phase: "applied",
      appliedAt: new Date().toISOString(),
      shopsCopied,
      shopsRemoved,
      shopsRemovedFiles: mirror.removed,
      payoutsPackaged,
      reportRewardsPackaged,
      warnings,
    })
    await setLatest(releasesDir, releaseId)
    await pruneReleases(releasesDir)
    await writePublishedPayoutsJsonDigest()
    await writePublishedReportRewardsDigest()

    return {
      ok: true,
      phase: "applied",
      releaseId,
      shopsCopied,
      shopsRemoved,
      payoutsPackaged:
        typeof manifest.payoutsPackaged === "number"
          ? manifest.payoutsPackaged
          : payoutsPackaged,
      reportRewardsPackaged:
        typeof manifest.reportRewardsPackaged === "number"
          ? manifest.reportRewardsPackaged
          : reportRewardsPackaged,
      disabledPayouts: Array.isArray(manifest.disabledPayouts)
        ? (manifest.disabledPayouts as string[])
        : [],
      disabledReportRewards: Array.isArray(manifest.disabledReportRewards)
        ? (manifest.disabledReportRewards as string[])
        : [],
      skippedConflicts: Array.isArray(manifest.skippedConflicts)
        ? (manifest.skippedConflicts as string[])
        : [],
      warnings,
      errors: [],
      customEventMessages: parseCustomEventMessages(manifest.customEventMessages),
      shopsDest: shopsLive,
      payoutsZipPath: liveZip,
      reportRewardsZipPath: liveReportZip,
      releasesDir,
      releasePath,
    }
  } catch (e) {
    const msg =
      e instanceof Error ? `Apply failed: ${e.message}` : "Apply failed"
    await writeManifest(releasePath, {
      ...manifest,
      phase: "failed",
      error: msg,
    })
    return emptyResult("failed", runtime, {
      releaseId,
      releasePath,
      releasesDir,
      error: msg,
      errors: [msg],
    })
  }
}

/** Restore previous/ snapshot from a release (default: LATEST). */
export async function rollbackLaneA(
  releaseId?: string
): Promise<LaneAPublishResult> {
  const runtime = getRuntimeDir()
  const releasesDir = getReleasesDir()
  const id = releaseId?.trim() || (await getLatestReleaseId())
  if (!id) {
    return emptyResult("failed", runtime, {
      releasesDir,
      error: "No Lane A release to roll back",
      errors: ["No Lane A release to roll back"],
    })
  }

  const releasePath = path.join(releasesDir, id)
  const previousShops = path.join(releasePath, "previous", "shops")
  const previousZip = path.join(
    releasePath,
    "previous",
    "packages",
    LANE_A_PAYOUTS_ZIP
  )
  const previousReportZip = path.join(
    releasePath,
    "previous",
    "packages",
    LANE_A_REPORT_REWARDS_ZIP
  )
  const shopsLive = path.join(runtime, "datastore", "shops")
  const packagesLive = path.join(runtime, "datastore", "packages")
  const liveZip = path.join(packagesLive, LANE_A_PAYOUTS_ZIP)
  const liveReportZip = path.join(packagesLive, LANE_A_REPORT_REWARDS_ZIP)

  if (!(await pathExists(path.join(releasePath, "previous")))) {
    return emptyResult("failed", runtime, {
      releaseId: id,
      releasePath,
      releasesDir,
      error: `No previous snapshot for release ${id}`,
      errors: [`No previous snapshot for release ${id}`],
    })
  }

  try {
    await ensureDir(shopsLive)
    await ensureDir(packagesLive)

    // Full mirror back to previous snapshot of managed shops.
    const mirror = await mirrorShops(previousShops, shopsLive)

    if (await pathExists(previousZip)) {
      await copyFileSafe(previousZip, liveZip)
    } else if (await pathExists(liveZip)) {
      await fs.unlink(liveZip)
    }

    if (await pathExists(previousReportZip)) {
      await copyFileSafe(previousReportZip, liveReportZip)
    } else if (await pathExists(liveReportZip)) {
      await fs.unlink(liveReportZip)
    }

    let manifest: Record<string, unknown> = {}
    try {
      manifest = JSON.parse(
        await fs.readFile(path.join(releasePath, "manifest.json"), "utf8")
      ) as Record<string, unknown>
    } catch {
      /* ok */
    }
    const warnings: string[] = []
    if (mirror.removed.length) {
      warnings.push(
        `Rollback removed ${mirror.removed.length} shop(s) not in previous snapshot: ${mirror.removed.join(", ")}`
      )
    }
    await writeManifest(releasePath, {
      ...manifest,
      phase: "rolled_back",
      rolledBackAt: new Date().toISOString(),
      shopsRemoved: mirror.removed.length,
      shopsRemovedFiles: mirror.removed,
    })
    await clearPublishedPayoutsJsonDigest()
    await clearPublishedReportRewardsDigest()

    return {
      ok: true,
      phase: "rolled_back",
      releaseId: id,
      shopsCopied: mirror.copied,
      shopsRemoved: mirror.removed.length,
      payoutsPackaged: (await pathExists(previousZip)) ? 1 : 0,
      reportRewardsPackaged: (await pathExists(previousReportZip)) ? 1 : 0,
      disabledPayouts: [],
      disabledReportRewards: [],
      skippedConflicts: [],
      warnings,
      errors: [],
      shopsDest: shopsLive,
      payoutsZipPath: liveZip,
      reportRewardsZipPath: liveReportZip,
      releasesDir,
      releasePath,
    }
  } catch (e) {
    const msg =
      e instanceof Error ? `Rollback failed: ${e.message}` : "Rollback failed"
    return emptyResult("failed", runtime, {
      releaseId: id,
      releasePath,
      releasesDir,
      error: msg,
      errors: [msg],
    })
  }
}

/** Validate then apply (CLI / sidecar one-shot). */
export async function publishLaneA(): Promise<LaneAPublishResult> {
  const validated = await validateLaneA()
  if (!validated.ok || !validated.releaseId) {
    return validated
  }
  return applyLaneA(validated.releaseId)
}
