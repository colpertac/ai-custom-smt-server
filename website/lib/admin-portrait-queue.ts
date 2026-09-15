/**
 * Admin Studio helpers for listing / enqueueing / bulk-filling the portrait queue.
 */

import {
  getArmoryPortraitEnqueueTarget,
  isArmoryHiddenCharacter,
  listAllArmoryCharacterNames,
} from "@/lib/armory"
import {
  clearPortraitForCharacter,
  enqueuePortraitJob,
  getPortraitJob,
  listPortraitJobs,
  type PortraitJob,
  type PortraitJobStatus,
} from "@/lib/portrait-queue"

export type AdminEnqueueAction =
  | "enqueued"
  | "forced"
  | "skipped"
  | "not_found"
  | "hidden"

export type AdminEnqueueResult = {
  name: string
  action: AdminEnqueueAction
  fingerprint?: string
  status?: PortraitJobStatus
  reason?: string
}

export function summarizePortraitQueue(jobs?: PortraitJob[]): {
  jobs: PortraitJob[]
  counts: Record<PortraitJobStatus, number> & { total: number }
} {
  const list = jobs ?? listPortraitJobs()
  const counts = {
    pending: 0,
    claimed: 0,
    ready: 0,
    failed: 0,
    total: list.length,
  }
  for (const job of list) {
    if (job.status in counts) {
      counts[job.status as PortraitJobStatus] += 1
    }
  }
  return { jobs: list, counts }
}

/** Enqueue one public character. Force clears existing PNG/job first. */
export function adminEnqueuePortraitCharacter(
  rawName: string,
  opts?: { force?: boolean }
): AdminEnqueueResult {
  const name = rawName.trim()
  if (!name) {
    return { name: rawName, action: "not_found", reason: "empty name" }
  }
  if (isArmoryHiddenCharacter(name)) {
    return {
      name,
      action: "hidden",
      reason: "studio mannequin (vam/vaf) excluded",
    }
  }

  let target = getArmoryPortraitEnqueueTarget(name)
  if (!target) {
    return { name, action: "not_found", reason: "character not in world DB" }
  }

  if (opts?.force) {
    clearPortraitForCharacter(target.name, {
      extraFingerprints: [target.fingerprint],
    })
    target = getArmoryPortraitEnqueueTarget(name)
    if (!target) {
      return { name, action: "not_found", reason: "character missing after clear" }
    }
    const enq = enqueuePortraitJob(target.name, target.input)
    return {
      name: target.name,
      action: "forced",
      fingerprint: enq.fingerprint,
      status: enq.status,
    }
  }

  if (target.hasPortrait) {
    return {
      name: target.name,
      action: "skipped",
      fingerprint: target.fingerprint,
      reason: "already has portrait",
    }
  }

  const existing = getPortraitJob(target.fingerprint)
  if (
    existing &&
    (existing.status === "pending" || existing.status === "claimed")
  ) {
    return {
      name: target.name,
      action: "skipped",
      fingerprint: target.fingerprint,
      status: existing.status,
      reason: `already ${existing.status}`,
    }
  }

  const enq = enqueuePortraitJob(target.name, target.input)
  return {
    name: target.name,
    action: "enqueued",
    fingerprint: enq.fingerprint,
    status: enq.status,
  }
}

export type AdminBulkMode = "missing" | "force"

export type AdminBulkEnqueueResult = {
  mode: AdminBulkMode
  scanned: number
  enqueued: number
  forced: number
  skipped: number
  hidden: number
  notFound: number
  results: AdminEnqueueResult[]
}

/** Walk all public characters (excludes vam/vaf). */
export function adminBulkEnqueuePortraits(
  mode: AdminBulkMode
): AdminBulkEnqueueResult {
  const names = listAllArmoryCharacterNames()
  const results: AdminEnqueueResult[] = []
  let enqueued = 0
  let forced = 0
  let skipped = 0
  let hidden = 0
  let notFound = 0

  for (const name of names) {
    const r = adminEnqueuePortraitCharacter(name, {
      force: mode === "force",
    })
    results.push(r)
    if (r.action === "enqueued") enqueued += 1
    else if (r.action === "forced") forced += 1
    else if (r.action === "skipped") skipped += 1
    else if (r.action === "hidden") hidden += 1
    else if (r.action === "not_found") notFound += 1
  }

  return {
    mode,
    scanned: names.length,
    enqueued,
    forced,
    skipped,
    hidden,
    notFound,
    results,
  }
}
