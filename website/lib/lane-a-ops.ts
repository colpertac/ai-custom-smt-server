/**
 * Lane A shops/payouts publish — native in-process or via ops sidecar (Docker).
 * Native avoids shelling out to publish-lane-a.ts (Node cannot resolve @/ aliases).
 */
import {
  applyLaneA,
  publishLaneA,
  rollbackLaneA,
  validateLaneA,
  type LaneAPublishResult,
} from "@/lib/lane-a-publish"
import {
  applyOpsLaneA,
  publishOpsLaneA,
  restartOpsChannel,
  rollbackOpsLaneA,
  upsertCeventMessagesViaSidecar,
  validateOpsLaneA,
  type OpsLaneAPublishResult,
} from "@/lib/ops-sidecar"

function opsBackend(): string {
  return (process.env.OPS_BACKEND || "native").trim().toLowerCase()
}

/** File publish can run in the website process when not Docker-separated. */
export function useNativeLaneAPublish(): boolean {
  const b = opsBackend()
  return b === "native" || b === "local" || b === ""
}

function mapLocal(result: LaneAPublishResult): OpsLaneAPublishResult {
  return {
    ok: result.ok,
    lane: "A",
    backend: "native",
    message: result.ok
      ? `Lane A ${result.phase}`
      : result.error || result.errors.join("; ") || "Lane A failed",
    detail: result.error || result.errors.join("; ") || undefined,
    phase: result.phase,
    releaseId: result.releaseId,
    shopsCopied: result.shopsCopied,
    payoutsPackaged: result.payoutsPackaged,
    reportRewardsPackaged: result.reportRewardsPackaged,
    disabledPayouts: result.disabledPayouts,
    disabledReportRewards: result.disabledReportRewards,
    skippedConflicts: result.skippedConflicts,
    warnings: result.warnings,
    errors: result.errors,
    customEventMessages: result.customEventMessages,
    clientOverlayUpdated: result.clientOverlayUpdated,
  }
}

async function maybeUpsertClientDialogs(
  mapped: OpsLaneAPublishResult,
  actor?: string
): Promise<OpsLaneAPublishResult> {
  const messages = mapped.customEventMessages ?? []
  if (!mapped.ok || !messages.length) return mapped
  const upsert = await upsertCeventMessagesViaSidecar(messages, actor)
  if (!upsert.ok) {
    return {
      ...mapped,
      ok: false,
      clientOverlayUpdated: false,
      error: "ceventmessage_upsert_failed",
      detail: upsert.detail,
      message: "Game content applied but client dialog overlay failed",
      errors: [
        ...(mapped.errors ?? []),
        `CEventMessage upsert failed: ${upsert.detail ?? "unknown"}`,
      ],
      warnings: [
        ...(mapped.warnings ?? []),
        "Install comp_bdpatch/decrypt/encrypt under deploy/ops-tools (see ops/README.md)",
      ],
    }
  }
  return {
    ...mapped,
    clientOverlayUpdated: true,
    warnings: [
      ...(mapped.warnings ?? []),
      "Client overlay updated (CEventMessage) — players must run ImagineUpdate",
    ],
    message: `${mapped.message}; client overlay updated (ImagineUpdate)`,
  }
}

export async function validateLaneAOps(
  actor?: string
): Promise<OpsLaneAPublishResult> {
  if (useNativeLaneAPublish()) {
    return mapLocal(await validateLaneA())
  }
  return validateOpsLaneA(actor)
}

export async function applyLaneAOps(
  releaseId: string,
  actor?: string,
  options?: { restart?: boolean }
): Promise<OpsLaneAPublishResult> {
  if (useNativeLaneAPublish()) {
    let mapped = mapLocal(await applyLaneA(releaseId))
    mapped = await maybeUpsertClientDialogs(mapped, actor)
    if (!mapped.ok || !options?.restart) return mapped
    try {
      const restart = await restartOpsChannel(actor)
      if (!restart.ok) {
        return {
          ...mapped,
          restartError:
            restart.detail || restart.error || "Channel restart failed",
          message:
            "Game content applied but the game channel did not restart",
        }
      }
      return {
        ...mapped,
        restarted: true,
        message: mapped.clientOverlayUpdated
          ? "Lane A applied; game channel restarted; client overlay updated (ImagineUpdate)"
          : "Lane A applied; game channel restarted",
      }
    } catch (e) {
      return {
        ...mapped,
        restartError: e instanceof Error ? e.message : "Channel restart failed",
        message:
          "Game content applied but the game channel did not restart",
      }
    }
  }
  return applyOpsLaneA(releaseId, actor, options)
}

export async function rollbackLaneAOps(
  actor?: string,
  options?: { releaseId?: string; restart?: boolean }
): Promise<OpsLaneAPublishResult> {
  if (useNativeLaneAPublish()) {
    const mapped = mapLocal(await rollbackLaneA(options?.releaseId))
    if (!mapped.ok || options?.restart === false) return mapped
    try {
      const restart = await restartOpsChannel(actor)
      if (!restart.ok) {
        return {
          ...mapped,
          restartError:
            restart.detail || restart.error || "Channel restart failed",
          message: "Rolled back but the game channel did not restart",
        }
      }
      return {
        ...mapped,
        restarted: true,
        message: "Last publish undone; game channel restarted",
      }
    } catch (e) {
      return {
        ...mapped,
        restartError: e instanceof Error ? e.message : "Channel restart failed",
        message: "Rolled back but the game channel did not restart",
      }
    }
  }
  return rollbackOpsLaneA(actor, options)
}

export async function publishLaneAOps(
  actor?: string,
  options?: { restart?: boolean }
): Promise<OpsLaneAPublishResult> {
  if (useNativeLaneAPublish()) {
    let mapped = mapLocal(await publishLaneA())
    mapped = await maybeUpsertClientDialogs(mapped, actor)
    if (!mapped.ok || options?.restart === false) return mapped
    try {
      const restart = await restartOpsChannel(actor)
      if (!restart.ok) {
        return {
          ...mapped,
          restartError:
            restart.detail || restart.error || "Channel restart failed",
          message: "Published but channel restart failed",
        }
      }
      return {
        ...mapped,
        restarted: true,
        message: mapped.clientOverlayUpdated
          ? "Lane A published; game channel restarted; client overlay updated (ImagineUpdate)"
          : "Lane A published; game channel restarted",
      }
    } catch (e) {
      return {
        ...mapped,
        restartError: e instanceof Error ? e.message : "Channel restart failed",
        message: "Published but channel restart failed",
      }
    }
  }
  return publishOpsLaneA(actor, options)
}
