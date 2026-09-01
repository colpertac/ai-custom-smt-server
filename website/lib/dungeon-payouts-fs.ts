import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { putPayoutSchema } from "@/lib/dungeon-payout-schema"
import {
  generateDropSetXml,
  generateEventsXml,
  payoutPackagePaths,
} from "@/lib/dungeon-payout-generate"
import {
  PAYOUT_SCHEMA_VERSION,
  type DungeonPayout,
  type DungeonPayoutFile,
  type PayoutListItem,
} from "@/lib/dungeon-payout-types"
import { getPayoutWireStatusMap } from "@/lib/payout-clear-loot-catalog"

export function getPayoutsDir(): string {
  if (process.env.COMP_PAYOUTS_DIR) {
    return path.resolve(process.env.COMP_PAYOUTS_DIR)
  }
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../server-content/payouts"
  )
}

export function payoutFilename(id: string): string {
  return `${id}.json`
}

export function payoutPath(id: string): string {
  return path.join(getPayoutsDir(), payoutFilename(id))
}

export class PayoutNotFoundError extends Error {
  constructor(id: string) {
    super(`Payout '${id}' not found in working copy`)
    this.name = "PayoutNotFoundError"
  }
}

export class PayoutConflictError extends Error {
  constructor(id: string) {
    super(`Payout '${id}' already exists`)
    this.name = "PayoutConflictError"
  }
}

export async function listPayouts(): Promise<PayoutListItem[]> {
  const dir = getPayoutsDir()
  let entries: string[]
  try {
    entries = await fs.readdir(dir)
  } catch {
    return []
  }

  const wireMap = await getPayoutWireStatusMap()
  const out: PayoutListItem[] = []
  for (const filename of entries) {
    if (!filename.endsWith(".json") || filename.startsWith(".")) continue
    if (filename === "clear-loot-catalog.json") continue
    try {
      const raw = await fs.readFile(path.join(dir, filename), "utf8")
      const parsed = putPayoutSchema.safeParse(JSON.parse(raw))
      if (!parsed.success) continue
      const p = parsed.data.payout
      const wire = wireMap.get(p.id)
      out.push({
        id: p.id,
        name: p.name,
        instanceId: p.instanceId,
        enabled: p.enabled,
        cp: p.cp,
        family: p.family,
        difficulty: p.difficulty,
        mode: p.mode,
        variantLabel: p.variantLabel,
        crateDropCount: p.crateDrops.length,
        clearItemCount: p.clearItems.length,
        filename,
        wireStatus: wire?.status,
        wireLiveEffect: wire?.liveEffect,
        wireIssues: wire?.issues,
      })
    } catch {
      /* skip bad files */
    }
  }
  out.sort((a, b) => a.id.localeCompare(b.id))
  return out
}

export async function readPayout(id: string): Promise<DungeonPayoutFile> {
  let raw: string
  try {
    raw = await fs.readFile(payoutPath(id), "utf8")
  } catch {
    throw new PayoutNotFoundError(id)
  }
  const parsed = putPayoutSchema.safeParse(JSON.parse(raw))
  if (!parsed.success) {
    throw new Error(`Invalid payout file ${id}: ${parsed.error.issues[0]?.message}`)
  }
  if (parsed.data.payout.id !== id) {
    throw new Error(
      `Payout file id mismatch: filename '${id}' vs body '${parsed.data.payout.id}'`
    )
  }
  return parsed.data
}

export async function writePayout(file: DungeonPayoutFile): Promise<void> {
  const parsed = putPayoutSchema.safeParse(file)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid payout")
  }
  const dir = getPayoutsDir()
  await fs.mkdir(dir, { recursive: true })
  const body: DungeonPayoutFile = {
    version: PAYOUT_SCHEMA_VERSION,
    payout: parsed.data.payout,
  }
  await fs.writeFile(
    payoutPath(parsed.data.payout.id),
    `${JSON.stringify(body, null, 2)}\n`,
    "utf8"
  )
}

export async function payoutExists(id: string): Promise<boolean> {
  try {
    await fs.access(payoutPath(id))
    return true
  } catch {
    return false
  }
}

export function emptyPayout(
  id: string,
  name: string,
  instanceId: number
): DungeonPayout {
  const slug = id.replace(/[^a-z0-9]+/gi, "_").toUpperCase()
  return {
    id,
    name,
    description: "",
    enabled: true,
    instanceId,
    dedupFlag: 900000 + (instanceId % 1000),
    bossGroupId: 900000 + (instanceId % 1000),
    dropSetId: 900000 + (instanceId % 1000),
    spotId: 2,
    crateCount: 5,
    cp: 10,
    crateDrops: [
      {
        itemId: 699,
        minStack: 1,
        maxStack: 3,
        rate: 100,
      },
    ],
    clearItems: [],
    hooks: {
      afterNormalLootEventId: `AI_PAY_${slug}_AFTER_NORMAL`,
      afterFiendLootEventId: `AI_PAY_${slug}_AFTER_FIEND`,
      bonusEventId: `AI_PAY_${slug}_BONUS`,
      bonusFiendEventId: `AI_PAY_${slug}_BONUS_FIEND`,
      resumeNormalNext: "TODO_STOCK_RESUME_EVENT",
    },
  }
}

export async function createPayout(payout: DungeonPayout): Promise<void> {
  if (await payoutExists(payout.id)) {
    throw new PayoutConflictError(payout.id)
  }
  await writePayout({ version: PAYOUT_SCHEMA_VERSION, payout })
}

export async function deletePayout(id: string): Promise<void> {
  if (!(await payoutExists(id))) {
    throw new PayoutNotFoundError(id)
  }
  await fs.unlink(payoutPath(id))
}

/** Update CP on many payouts in one pass (preset apply / sheet batch save). */
export async function updatePayoutCpBatch(
  updates: { id: string; cp: number }[]
): Promise<{ updated: string[]; skipped: string[] }> {
  const updated: string[] = []
  const skipped: string[] = []

  for (const { id, cp } of updates) {
    let file: DungeonPayoutFile
    try {
      file = await readPayout(id)
    } catch (error) {
      if (error instanceof PayoutNotFoundError) {
        skipped.push(id)
        continue
      }
      throw error
    }
    if (file.payout.cp === cp) {
      skipped.push(id)
      continue
    }
    await writePayout({
      version: PAYOUT_SCHEMA_VERSION,
      payout: { ...file.payout, cp },
    })
    updated.push(id)
  }

  return { updated, skipped }
}

export function buildPayoutPackageFiles(payout: DungeonPayout): {
  path: string
  content: string
}[] {
  const paths = payoutPackagePaths(payout)
  return [
    { path: paths.eventsPath, content: generateEventsXml(payout) },
    { path: paths.dropSetPath, content: generateDropSetXml(payout) },
  ]
}
