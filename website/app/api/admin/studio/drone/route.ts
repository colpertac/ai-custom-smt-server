import { z } from "zod"

import { isAdminLevel } from "@/lib/admin-level"
import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import {
  StudioAgentError,
  runDroneMission,
} from "@/lib/studio-agent-remote"
import { DebugSnapError, requestRemoteDebugScreenshot } from "@/lib/studio-debug-remote"
import {
  listStudioDebugScreenshots,
  saveStudioDebugScreenshot,
} from "@/lib/studio-debug-screenshots"
import { requireWebSession } from "@/lib/web-session"

export const maxDuration = 120

const actionSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("click"),
    xFrac: z.number().min(0).max(1),
    yFrac: z.number().min(0).max(1),
    button: z.number().int().min(1).max(3).optional(),
  }),
  z.object({
    op: z.literal("type"),
    text: z.string().min(1).max(128),
  }),
  z.object({
    op: z.literal("key"),
    name: z.string().trim().min(1).max(32),
  }),
  z.object({
    op: z.literal("wait"),
    sec: z.number().min(0).max(15),
  }),
])

const bodySchema = z.object({
  role: z.enum(["vam1", "vaf1"]),
  actions: z.array(actionSchema).min(1).max(20),
  snapAfter: z.boolean().optional(),
})

/** Play a queued click/type/key mission on the Wine-host drone. */
export async function POST(request: Request) {
  const blocked = await guardApiMutation("admin-studio-drone", 20, 60_000)
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiFail("Invalid JSON", 400, "BAD_REQUEST")
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid input",
      400,
      "VALIDATION"
    )
  }

  try {
    const result = await runDroneMission({
      role: parsed.data.role,
      actions: parsed.data.actions,
      snapAfter: parsed.data.snapAfter,
    })

    let screenshot: Awaited<
      ReturnType<typeof requestRemoteDebugScreenshot>
    > | null = null
    let snapNote = ""
    if (parsed.data.snapAfter !== false) {
      const b64 = result.snap?.pngBase64
      if (typeof b64 === "string" && b64.length > 32) {
        try {
          screenshot = saveStudioDebugScreenshot({
            role: parsed.data.role,
            step: "drone",
            bytes: Buffer.from(b64, "base64"),
          })
        } catch {
          screenshot = null
        }
      }
      if (!screenshot) {
        try {
          screenshot = await requestRemoteDebugScreenshot({
            role: parsed.data.role,
            step: "drone",
          })
        } catch {
          screenshot =
            listStudioDebugScreenshots().find(
              (s) => s.role === parsed.data.role && s.step === "drone"
            ) ?? null
        }
      }
      snapNote = screenshot ? " · snapped" : " · snap failed"
    }

    const resultForClient = {
      ...result,
      snap: result.snap
        ? {
            path: result.snap.path,
            bytes: result.snap.bytes,
            step: result.snap.step,
          }
        : undefined,
    }

    return apiOk(
      { result: resultForClient, screenshot },
      `Drone ${parsed.data.role}: ${result.steps?.length ?? 0} step(s)${snapNote}`
    )
  } catch (e) {
    if (e instanceof StudioAgentError) {
      return apiFail(e.message, e.status, "STUDIO_AGENT")
    }
    if (e instanceof DebugSnapError) {
      return apiFail(e.message, e.status, "DEBUG_SNAP")
    }
    return apiFail(
      e instanceof Error ? e.message : "Drone failed",
      502,
      "STUDIO_AGENT"
    )
  }
}
