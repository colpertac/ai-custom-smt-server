import { z } from "zod"

import { apiFail, apiOk } from "@/lib/api-response"
import { recordPortraitWorkerHeartbeat } from "@/lib/portrait-queue"
import {
  getPortraitRendererMode,
  RENDERER_VERSION,
} from "@/lib/portrait-render-mode"
import { requirePortraitWorker } from "@/lib/portrait-worker-auth"

export const dynamic = "force-dynamic"

const heartbeatSchema = z.object({
  workerId: z.string().trim().min(1).max(64),
  kind: z.string().trim().min(1).max(16).default("three"),
  rendererVersion: z.number().int().nullable().optional(),
  assetsVersion: z
    .union([z.string(), z.number()])
    .nullable()
    .optional()
    .transform((v) => (v == null ? null : String(v).slice(0, 128))),
  chrome: z
    .string()
    .nullable()
    .optional()
    .transform((v) => (v ? v.slice(0, 128) : null)),
  busy: z.boolean().optional().default(false),
})

/**
 * Render worker liveness (avatar/docs/WORKER.md). In three mode a heartbeat in the last 60 s
 * makes armory misses enqueue. Auth: X-Portrait-Worker-Token
 */
export async function POST(request: Request) {
  const denied = requirePortraitWorker(request)
  if (denied) return denied

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return apiFail("Expected JSON body", 400, "VALIDATION")
  }
  const parsed = heartbeatSchema.safeParse(raw)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return apiFail(
      issue ? `${issue.path.join(".") || "body"}: ${issue.message}` : "Invalid heartbeat",
      400,
      "VALIDATION"
    )
  }

  try {
    const hb = recordPortraitWorkerHeartbeat({
      workerId: parsed.data.workerId,
      kind: parsed.data.kind,
      rendererVersion: parsed.data.rendererVersion ?? null,
      assetsVersion: parsed.data.assetsVersion,
      chrome: parsed.data.chrome,
      busy: parsed.data.busy,
    })
    return apiOk({
      ok: true as const,
      mode: getPortraitRendererMode(),
      rendererVersion: RENDERER_VERSION,
      versionMismatch: hb.rendererVersion !== RENDERER_VERSION,
      lastSeen: hb.lastSeen,
    })
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Heartbeat failed",
      500,
      "QUEUE"
    )
  }
}
