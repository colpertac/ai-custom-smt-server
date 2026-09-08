import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { listPayouts } from "@/lib/dungeon-payouts-fs"
import {
  linkPayoutsToApplePartials,
  type GoldenApplePartial,
  type GoldenApplePayoutLink,
} from "@/lib/golden-apple-types"
import {
  GoldenAppleParseError,
  parseNpc3401Apples,
  setPartialAppleAmountInXml,
} from "@/lib/golden-apple-parse"

export {
  parseNpc3401Apples,
  setPartialAppleAmountInXml,
} from "@/lib/golden-apple-parse"

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(LIB_DIR, "../..")

function runtimeDir(): string {
  if (process.env.OPS_RUNTIME?.trim()) {
    return path.resolve(process.env.OPS_RUNTIME.trim())
  }
  return path.resolve(REPO_ROOT, "../comp_hack/runtime")
}

/** Live channel datastore copy (PhysicsFS / OPS_RUNTIME). */
export function getNpc3401Path(): string {
  if (process.env.COMP_NPC3401_PATH?.trim()) {
    return path.resolve(process.env.COMP_NPC3401_PATH.trim())
  }
  const datastore = process.env.COMP_DATASTORE_DIR?.trim()
  if (datastore) {
    return path.join(
      path.resolve(datastore),
      "zones/partial/npcs/NPC3401.xml"
    )
  }
  return path.join(runtimeDir(), "datastore/zones/partial/npcs/NPC3401.xml")
}

/** Repo / deploy mirror — kept in sync when live path differs. */
export function getNpc3401MirrorPath(): string {
  return path.join(
    REPO_ROOT,
    "deploy/data/datastore/zones/partial/npcs/NPC3401.xml"
  )
}

export class GoldenAppleConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "GoldenAppleConfigError"
  }
}

export async function readNpc3401Xml(): Promise<string> {
  const filePath = getNpc3401Path()
  try {
    return await fs.readFile(filePath, "utf8")
  } catch (error) {
    throw new GoldenAppleConfigError(
      `Cannot read Golden Light config at ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }
}

export async function writeNpc3401Xml(xml: string): Promise<void> {
  const filePath = getNpc3401Path()
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, xml, "utf8")

  const mirror = getNpc3401MirrorPath()
  if (path.resolve(mirror) !== path.resolve(filePath)) {
    try {
      await fs.mkdir(path.dirname(mirror), { recursive: true })
      await fs.writeFile(mirror, xml, "utf8")
    } catch {
      /* mirror is best-effort */
    }
  }

  await markGoldenApplesRestartPending()
}

function goldenApplesRestartPendingPath(): string {
  if (process.env.OPS_RELEASES_DIR?.trim()) {
    return path.join(
      path.resolve(process.env.OPS_RELEASES_DIR.trim()),
      "golden-apples.restart-pending"
    )
  }
  return path.join(
    runtimeDir(),
    "releases",
    "lane-a",
    "golden-apples.restart-pending"
  )
}

/** Channel must reload NPC3401.xml for Golden Light apple edits. */
export async function markGoldenApplesRestartPending(): Promise<void> {
  const stamp = goldenApplesRestartPendingPath()
  await fs.mkdir(path.dirname(stamp), { recursive: true })
  await fs.writeFile(stamp, `${new Date().toISOString()}\n`, "utf8")
}

export async function clearGoldenApplesRestartPending(): Promise<void> {
  try {
    await fs.unlink(goldenApplesRestartPendingPath())
  } catch {
    /* missing ok */
  }
}

export async function isGoldenApplesRestartPending(): Promise<boolean> {
  try {
    await fs.access(goldenApplesRestartPendingPath())
    return true
  } catch {
    return false
  }
}

export async function listGoldenApplePartials(): Promise<GoldenApplePartial[]> {
  return parseNpc3401Apples(await readNpc3401Xml())
}

export async function listGoldenAppleLinks(): Promise<{
  path: string
  links: GoldenApplePayoutLink[]
  partials: GoldenApplePartial[]
}> {
  const partials = await listGoldenApplePartials()
  const { readPayout } = await import("@/lib/dungeon-payouts-fs")
  const payouts = await listPayouts()
  const withIds = await Promise.all(
    payouts.map(async (p) => {
      try {
        const file = await readPayout(p.id)
        return {
          id: p.id,
          instanceId: file.payout.instanceId,
          instanceIds: file.payout.instanceIds,
        }
      } catch {
        return { id: p.id, instanceId: p.instanceId }
      }
    })
  )
  return {
    path: getNpc3401Path(),
    links: linkPayoutsToApplePartials(withIds, partials),
    partials,
  }
}

/**
 * Set Golden Light apple amounts for payouts (updates shared NPC3401 partials).
 */
export async function updateGoldenApplesBatch(
  updates: { id: string; apples: number }[]
): Promise<{ updated: string[]; skipped: string[]; sharedTouched: string[] }> {
  const { links } = await listGoldenAppleLinks()
  const byId = new Map(links.map((l) => [l.payoutId, l]))
  let xml = await readNpc3401Xml()
  const updated: string[] = []
  const skipped: string[] = []
  const sharedTouched = new Set<string>()
  const partialWrites = new Map<number, number>()

  for (const { id, apples } of updates) {
    const link = byId.get(id)
    if (!link || link.partialId == null) {
      skipped.push(id)
      continue
    }
    if (link.apples === apples) {
      skipped.push(id)
      continue
    }
    partialWrites.set(link.partialId, apples)
    updated.push(id)
    for (const other of link.sharedWith) sharedTouched.add(other)
  }

  try {
    for (const [partialId, apples] of partialWrites) {
      xml = setPartialAppleAmountInXml(xml, partialId, apples)
    }
  } catch (error) {
    if (error instanceof GoldenAppleParseError) {
      throw new GoldenAppleConfigError(error.message)
    }
    throw error
  }

  if (partialWrites.size > 0) {
    await writeNpc3401Xml(xml)
  }

  return {
    updated,
    skipped,
    sharedTouched: [...sharedTouched].filter((id) => !updated.includes(id)),
  }
}
