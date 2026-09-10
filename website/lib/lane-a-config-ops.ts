/**
 * Lane A config publish — native in website (Docker Hub ops has no website TS tree)
 * with optional ops HTTP when OPS_BACKEND=docker and scripts are available locally.
 */
import { useNativeLaneAPublish } from "@/lib/lane-a-ops"
import {
  applyLaneAConfig,
  rollbackLaneAConfig,
  validateLaneAConfig,
  type LaneAConfigPublishResult,
} from "@/lib/server-config/lane-a-config-publish"
import type { ConfigFileId } from "@/lib/server-config/types"
import {
  applyOpsLaneAConfig,
  restartOpsServices,
  rollbackOpsLaneAConfig,
  validateOpsLaneAConfig,
  type OpsLaneAConfigPublishResult,
} from "@/lib/ops-sidecar"

function mapLocal(result: LaneAConfigPublishResult): OpsLaneAConfigPublishResult {
  return {
    ok: result.ok,
    lane: "A-config",
    backend: "native",
    message: result.ok
      ? `Lane A config ${result.phase}`
      : result.error || result.errors.join("; ") || "Config publish failed",
    detail: result.error || result.errors.join("; ") || undefined,
    phase: result.phase,
    releaseId: result.releaseId,
    filesCopied: result.filesCopied,
    files: result.files,
    restart: result.restart,
    warnings: result.warnings,
    errors: result.errors,
    configDest: result.configDest,
    error: result.error,
  }
}

async function maybeRestart(
  mapped: OpsLaneAConfigPublishResult,
  actor?: string,
  wantRestart = true
): Promise<OpsLaneAConfigPublishResult> {
  if (!mapped.ok || !wantRestart) return mapped
  const services = (mapped.restart ?? []).filter(
    (s): s is "lobby" | "world" | "channel" =>
      s === "lobby" || s === "world" || s === "channel"
  )
  if (!services.length) return mapped
  try {
    const restart = await restartOpsServices(services, actor)
    if (!restart.ok) {
      return {
        ...mapped,
        restartError:
          restart.detail || restart.error || "Service restart failed",
        message: "Config applied but service restart failed",
      }
    }
    return {
      ...mapped,
      restarted: true,
      message: `${mapped.message}; restarted ${services.join(", ")}`,
    }
  } catch (e) {
    return {
      ...mapped,
      restartError: e instanceof Error ? e.message : "Service restart failed",
      message: "Config applied but service restart failed",
    }
  }
}

export async function validateLaneAConfigOps(
  actor?: string,
  options?: { only?: string[] }
): Promise<OpsLaneAConfigPublishResult> {
  if (useNativeLaneAPublish()) {
    const only = options?.only as ConfigFileId[] | undefined
    return mapLocal(await validateLaneAConfig(only))
  }
  return validateOpsLaneAConfig(actor, options)
}

export async function applyLaneAConfigOps(
  releaseId: string,
  actor?: string,
  options?: { restart?: boolean }
): Promise<OpsLaneAConfigPublishResult> {
  if (useNativeLaneAPublish()) {
    const mapped = mapLocal(await applyLaneAConfig(releaseId))
    return maybeRestart(mapped, actor, options?.restart !== false)
  }
  return applyOpsLaneAConfig(releaseId, actor, options)
}

export async function rollbackLaneAConfigOps(
  actor?: string,
  options?: { releaseId?: string; restart?: boolean }
): Promise<OpsLaneAConfigPublishResult> {
  if (useNativeLaneAPublish()) {
    const mapped = mapLocal(await rollbackLaneAConfig(options?.releaseId))
    return maybeRestart(mapped, actor, options?.restart !== false)
  }
  return rollbackOpsLaneAConfig(actor, options)
}
