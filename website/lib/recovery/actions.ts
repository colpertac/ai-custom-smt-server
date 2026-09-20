import { promises as fs } from "node:fs"
import path from "node:path"

import {
  applyLaneAConfigOps,
  rollbackLaneAConfigOps,
  validateLaneAConfigOps,
} from "@/lib/lane-a-config-ops"
import { rollbackLaneAOps } from "@/lib/lane-a-ops"
import {
  LANE_A_PAYOUTS_ZIP,
  LANE_A_REPORT_REWARDS_ZIP,
  getLatestReleaseId,
} from "@/lib/lane-a-publish"
import { restartOpsChannel, restartOpsServices } from "@/lib/ops-sidecar"
import { CONFIG_FILES } from "@/lib/server-config/catalog"
import {
  getLatestConfigReleaseId,
} from "@/lib/server-config/lane-a-config-publish"
import {
  getLiveConfigDir,
  getWorkingConfigDir,
} from "@/lib/server-config/fs"
import type { ConfigFileId } from "@/lib/server-config/types"

import {
  ADMIN_PAYOUTS_ZIP,
  ADMIN_REPORT_REWARDS_ZIP,
  getDatastorePackagesDir,
  getDatastoreShopsDir,
} from "./paths"
import {
  createRecoverySnapshot,
  getLatestRecoverySnapshot,
  listRecoverySnapshots,
} from "./snapshot"
import { writeStockKnobsToWorking } from "./stock-knobs"
import type { RecoveryActionResult, RecoveryStatus } from "./types"

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

/** Force-copy live → working so Admin → Config matches running servers. */
export async function overwriteWorkingFromLive(
  ids?: ConfigFileId[]
): Promise<{ copied: string[] }> {
  const working = getWorkingConfigDir()
  const live = getLiveConfigDir()
  await fs.mkdir(working, { recursive: true })
  const targets = ids?.length
    ? CONFIG_FILES.filter((f) => ids.includes(f.id))
    : CONFIG_FILES
  const copied: string[] = []
  for (const meta of targets) {
    const src = path.join(live, meta.filename)
    const dest = path.join(working, meta.filename)
    if (!(await pathExists(src))) continue
    await fs.copyFile(src, dest)
    copied.push(meta.filename)
  }
  return { copied }
}

export async function getRecoveryStatus(): Promise<RecoveryStatus> {
  const [snapshots, configReleaseId, contentReleaseId] = await Promise.all([
    listRecoverySnapshots(),
    getLatestConfigReleaseId(),
    getLatestReleaseId(),
  ])
  return {
    lastSnapshot: await getLatestRecoverySnapshot(),
    snapshots,
    hasConfigRelease: Boolean(configReleaseId),
    hasContentRelease: Boolean(contentReleaseId),
    configReleaseId,
    contentReleaseId,
  }
}

export async function snapshotRecovery(options?: {
  actor?: string
  reason?: string
}): Promise<RecoveryActionResult> {
  const manifest = await createRecoverySnapshot({
    actor: options?.actor,
    reason: options?.reason ?? "manual",
  })
  return {
    ok: true,
    message: `Snapshot ${manifest.id} saved (${manifest.files.length} file(s))`,
    snapshotId: manifest.id,
  }
}

export async function restoreLastConfig(options?: {
  actor?: string
  syncWorking?: boolean
  restart?: boolean
}): Promise<RecoveryActionResult> {
  const releaseId = await getLatestConfigReleaseId()
  if (!releaseId) {
    return {
      ok: false,
      error: "no_config_release",
      message:
        "No published config release to restore — use stock reset or a backup",
    }
  }

  const snap = await createRecoverySnapshot({
    actor: options?.actor,
    reason: "before-restore-config",
  })

  const result = await rollbackLaneAConfigOps(options?.actor, {
    releaseId,
    restart: false,
  })
  if (!result.ok) {
    return {
      ok: false,
      error: result.error || "config_rollback_failed",
      message:
        result.message ||
        result.detail ||
        "Config rollback failed",
      snapshotId: snap.id,
      detail: result.detail,
      warnings: result.warnings,
    }
  }

  const syncWorking = options?.syncWorking !== false
  if (syncWorking) {
    await overwriteWorkingFromLive()
  }

  let restarted = false
  if (options?.restart !== false) {
    const services = (result.restart?.length
      ? result.restart
      : ["lobby", "world", "channel"]) as Array<"lobby" | "world" | "channel">
    const restart = await restartOpsServices(
      services.filter(
        (s): s is "lobby" | "world" | "channel" =>
          s === "lobby" || s === "world" || s === "channel"
      ),
      options?.actor
    )
    if (!restart.ok) {
      return {
        ok: false,
        error: restart.error || "restart_failed",
        message: `Config restored but restart failed: ${restart.detail || restart.error || "unknown"}`,
        snapshotId: snap.id,
        releaseId,
        detail: restart.detail,
      }
    }
    restarted = true
  }

  return {
    ok: true,
    message: restarted
      ? `Restored config release ${releaseId} and restarted services`
      : `Restored config release ${releaseId}`,
    snapshotId: snap.id,
    releaseId,
    restarted,
    warnings: result.warnings,
  }
}

export async function restoreLastContent(options?: {
  actor?: string
  restart?: boolean
}): Promise<RecoveryActionResult> {
  const releaseId = await getLatestReleaseId()
  if (!releaseId) {
    return {
      ok: false,
      error: "no_content_release",
      message:
        "No published shops/loot release to restore — try Disable admin packages or a backup",
    }
  }

  const snap = await createRecoverySnapshot({
    actor: options?.actor,
    reason: "before-restore-content",
  })

  const result = await rollbackLaneAOps(options?.actor, {
    releaseId,
    restart: false,
  })
  if (!result.ok) {
    return {
      ok: false,
      error: result.error || "content_rollback_failed",
      message:
        result.message ||
        result.detail ||
        "Shops/loot rollback failed",
      snapshotId: snap.id,
      detail: result.detail,
      warnings: result.warnings,
    }
  }

  let restarted = false
  if (options?.restart !== false) {
    const restart = await restartOpsChannel(options?.actor)
    if (!restart.ok) {
      return {
        ok: false,
        error: restart.error || "restart_failed",
        message: `Shops/loot restored but channel restart failed: ${restart.detail || restart.error || "unknown"}`,
        snapshotId: snap.id,
        releaseId,
        detail: restart.detail,
      }
    }
    restarted = true
  }

  return {
    ok: true,
    message: restarted
      ? `Restored shops & loot release ${releaseId} and restarted channel`
      : `Restored shops & loot release ${releaseId}`,
    snapshotId: snap.id,
    releaseId,
    restarted,
    warnings: result.warnings,
  }
}

export async function resetStockKnobs(options?: {
  actor?: string
  restart?: boolean
}): Promise<RecoveryActionResult> {
  const snap = await createRecoverySnapshot({
    actor: options?.actor,
    reason: "before-reset-stock-knobs",
  })

  const { files, warnings } = await writeStockKnobsToWorking()
  if (!files.length) {
    return {
      ok: false,
      error: "stock_merge_failed",
      message: "No stock templates could be applied",
      snapshotId: snap.id,
      warnings,
    }
  }

  const validated = await validateLaneAConfigOps(options?.actor, {
    only: files,
  })
  if (!validated.ok || !validated.releaseId) {
    return {
      ok: false,
      error: validated.error || "validate_failed",
      message:
        validated.message ||
        validated.errors?.join("; ") ||
        "Stock knob validate failed",
      snapshotId: snap.id,
      warnings: [...warnings, ...(validated.warnings ?? [])],
      detail: validated.detail,
    }
  }

  const applied = await applyLaneAConfigOps(
    validated.releaseId,
    options?.actor,
    { restart: options?.restart !== false }
  )
  if (!applied.ok) {
    return {
      ok: false,
      error: applied.error || "apply_failed",
      message:
        applied.message ||
        applied.detail ||
        "Stock knob apply failed",
      snapshotId: snap.id,
      releaseId: validated.releaseId,
      warnings: [...warnings, ...(applied.warnings ?? [])],
      detail: applied.detail,
    }
  }

  return {
    ok: true,
    message: applied.restarted
      ? `Reset gameplay knobs to stock (kept identity) and restarted ${applied.restart?.join(", ") || "services"}`
      : "Reset gameplay knobs to stock (kept identity)",
    snapshotId: snap.id,
    releaseId: applied.releaseId ?? validated.releaseId,
    restarted: Boolean(applied.restarted),
    warnings: [...warnings, ...(applied.warnings ?? [])],
  }
}

export async function disableAdminPackages(options?: {
  actor?: string
  clearAdminShops?: boolean
  restart?: boolean
}): Promise<RecoveryActionResult> {
  const snap = await createRecoverySnapshot({
    actor: options?.actor,
    reason: "before-disable-admin-packages",
  })

  const packagesLive = getDatastorePackagesDir()
  await fs.mkdir(packagesLive, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, "")
  const disabled: string[] = []
  const skipped: string[] = []

  for (const name of [ADMIN_PAYOUTS_ZIP, ADMIN_REPORT_REWARDS_ZIP]) {
    const src = path.join(packagesLive, name)
    if (!(await pathExists(src))) {
      skipped.push(name)
      continue
    }
    const dest = path.join(
      packagesLive,
      `${name}.disabled-by-recovery-${stamp}`
    )
    try {
      await fs.rename(src, dest)
      disabled.push(name)
    } catch {
      skipped.push(name)
    }
  }

  // Also try canonical exports in case names diverge
  for (const name of [LANE_A_PAYOUTS_ZIP, LANE_A_REPORT_REWARDS_ZIP]) {
    if (disabled.includes(name) || skipped.includes(name)) continue
  }

  if (options?.clearAdminShops) {
    const shopsLive = getDatastoreShopsDir()
    try {
      const shopFiles = (await fs.readdir(shopsLive)).filter(
        (f) => f.startsWith("compshop-") && f.endsWith(".xml")
      )
      const aside = path.join(shopsLive, `.disabled-by-recovery-${stamp}`)
      await fs.mkdir(aside, { recursive: true })
      for (const name of shopFiles) {
        try {
          await fs.rename(path.join(shopsLive, name), path.join(aside, name))
          disabled.push(`shops/${name}`)
        } catch {
          skipped.push(`shops/${name}`)
        }
      }
    } catch {
      /* no shops dir */
    }
  }

  if (!disabled.length) {
    return {
      ok: true,
      message:
        "No admin payout/report-rewards packages were live to disable",
      snapshotId: snap.id,
      warnings: skipped.length
        ? [`Already absent: ${skipped.join(", ")}`]
        : undefined,
    }
  }

  let restarted = false
  if (options?.restart !== false) {
    const restart = await restartOpsChannel(options?.actor)
    if (!restart.ok) {
      return {
        ok: false,
        error: restart.error || "restart_failed",
        message: `Disabled ${disabled.join(", ")} but channel restart failed: ${restart.detail || restart.error || "unknown"}`,
        snapshotId: snap.id,
        detail: restart.detail,
        warnings: [
          "Editors still have drafts; Publish later will bring content back",
        ],
      }
    }
    restarted = true
  }

  return {
    ok: true,
    message: restarted
      ? `Disabled ${disabled.join(", ")} and restarted channel`
      : `Disabled ${disabled.join(", ")}`,
    snapshotId: snap.id,
    restarted,
    warnings: [
      "Editors still have drafts; Publish later will bring content back",
      ...(skipped.length ? [`Skipped (missing): ${skipped.join(", ")}`] : []),
    ],
  }
}
