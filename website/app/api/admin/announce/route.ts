import { adminGetOnline, adminMessageWorld } from "@/lib/comp-api"
import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import {
  CompSessionMissingError,
  requireWebSession,
  withCompSession,
} from "@/lib/web-session"
import { z } from "zod"

const announceSchema = z.object({
  message: z.string().trim().min(1, "Message is required").max(512),
  /** Ticker color — same ints as in-game `@announce` (0–4). */
  mode: z.number().int().min(0).max(4).default(0),
  worldId: z.number().int().min(0).optional(),
  /** Also broadcast CHAT_SELF like `@announce` does. */
  alsoConsole: z.boolean().default(true),
})

export async function POST(request: Request) {
  const blocked = await guardApiMutation("admin-announce", 20, 60_000)
  if (blocked) return blocked

  const gate = await requireWebSession()
  if (!gate) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(gate.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiFail("Invalid JSON", 400, "BAD_REQUEST")
  }

  const parsed = announceSchema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid input",
      400,
      "VALIDATION"
    )
  }

  const { message, mode, alsoConsole } = parsed.data

  try {
    return await withCompSession(async (session) => {
      let worldId = parsed.data.worldId
      if (worldId === undefined) {
        const online = await adminGetOnline(session)
        const first = online.worlds[0]
        if (!first) {
          return apiFail("No active world found", 502, "NO_WORLD")
        }
        worldId = first.worldId
      }

      const ticker = await adminMessageWorld(session, {
        worldId,
        message,
        type: "ticker",
        mode,
        subMode: 0,
      })
      if (ticker.error !== "Success") {
        return apiFail(ticker.error, 400, "ANNOUNCE")
      }

      if (alsoConsole) {
        const consoleMsg = await adminMessageWorld(session, {
          worldId,
          message,
          type: "console",
          from: "",
        })
        if (consoleMsg.error !== "Success") {
          return apiFail(consoleMsg.error, 400, "ANNOUNCE_CONSOLE")
        }
      }

      return apiOk({ worldId, mode, alsoConsole }, "Announcement sent")
    })
  } catch (error) {
    if (error instanceof CompSessionMissingError) {
      return apiFail("Unauthorized", 401, "UNAUTHORIZED")
    }
    return apiFail(
      error instanceof Error ? error.message : "Announce failed",
      502,
      "COMP"
    )
  }
}
