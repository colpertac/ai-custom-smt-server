import JSZip from "jszip"

import { adminListChatLogs, type AdminChatLogEntry } from "@/lib/comp-api"
import { compApiFailMessage, DEFAULT_WORLD_ID } from "@/lib/comp-api-errors"
import { guardApiMutation } from "@/lib/api-guard"
import { apiFail } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import {
  CompSessionMissingError,
  requireWebSession,
  withCompSession,
} from "@/lib/web-session"
import { z } from "zod"

const exportSchema = z.object({
  characterName: z.string().trim().max(32).optional(),
  since: z.number().int().min(0).optional(),
  until: z.number().int().min(0).optional(),
  worldId: z.number().int().min(0).optional(),
})

const PAGE_LIMIT = 200
const MAX_ROWS = 50_000

const CHAT_TYPE_LABEL: Record<number, string> = {
  41: "Party",
  44: "Shout",
  45: "Say",
  46: "Tell",
  47: "Self",
  48: "Clan",
  597: "Versus",
  714: "Team",
}

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function toCsv(logs: AdminChatLogEntry[]): string {
  const header = [
    "timestamp",
    "iso_time",
    "type",
    "from",
    "to",
    "message",
    "zone_id",
    "channel_id",
    "uid",
  ].join(",")
  const rows = logs.map((row) =>
    [
      String(row.timestamp),
      row.timestamp
        ? new Date(row.timestamp * 1000).toISOString()
        : "",
      CHAT_TYPE_LABEL[row.chatType] ?? String(row.chatType),
      csvEscape(row.characterName),
      csvEscape(row.targetName),
      csvEscape(row.message),
      String(row.zoneId),
      String(row.channelId),
      csvEscape(row.uid),
    ].join(",")
  )
  return [header, ...rows].join("\n")
}

export async function POST(request: Request) {
  const blocked = await guardApiMutation("admin-chat-logs-export", 10, 60_000)
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

  const parsed = exportSchema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid input",
      400,
      "VALIDATION"
    )
  }

  const worldId = parsed.data.worldId ?? DEFAULT_WORLD_ID
  const characterName = parsed.data.characterName || undefined
  const since = parsed.data.since ?? 0
  let until = parsed.data.until ?? Math.floor(Date.now() / 1000)

  try {
    return await withCompSession(async (session) => {
      const all: AdminChatLogEntry[] = []
      const seen = new Set<string>()

      while (all.length < MAX_ROWS) {
        const page = await adminListChatLogs(session, {
          worldId,
          characterName,
          since: since || undefined,
          until,
          limit: PAGE_LIMIT,
        })
        if (!page.length) break

        let oldest = until
        let added = 0
        for (const row of page) {
          if (row.uid && seen.has(row.uid)) continue
          if (row.uid) seen.add(row.uid)
          if (since && row.timestamp < since) continue
          all.push(row)
          added++
          if (row.timestamp < oldest) oldest = row.timestamp
          if (all.length >= MAX_ROWS) break
        }

        if (added === 0 || page.length < PAGE_LIMIT) break
        if (oldest <= since) break
        // Next page: everything strictly older than the oldest row this page.
        until = oldest > 0 ? oldest - 1 : 0
        if (until < since) break
      }

      const exportedAt = new Date().toISOString()
      const meta = {
        exportedAt,
        worldId,
        characterName: characterName ?? null,
        since: since || null,
        until: parsed.data.until ?? null,
        rowCount: all.length,
        truncated: all.length >= MAX_ROWS,
      }

      const zip = new JSZip()
      zip.file("chat-logs.csv", toCsv(all))
      zip.file("meta.json", JSON.stringify(meta, null, 2) + "\n")

      const buf = await zip.generateAsync({
        type: "nodebuffer",
        compression: "DEFLATE",
      })

      const stamp = exportedAt.replace(/[:.]/g, "-").slice(0, 19)
      return new Response(new Uint8Array(buf), {
        status: 200,
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="chat-logs-${stamp}.zip"`,
        },
      })
    })
  } catch (error) {
    if (error instanceof CompSessionMissingError) {
      return apiFail("Unauthorized", 401, "UNAUTHORIZED")
    }
    return apiFail(
      compApiFailMessage(error, "Export chat logs failed"),
      502,
      "COMP"
    )
  }
}
