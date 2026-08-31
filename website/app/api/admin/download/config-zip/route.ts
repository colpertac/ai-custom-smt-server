import { z } from "zod"

import { guardApiMutation } from "@/lib/api-guard"
import { apiFail } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { buildClientPrepZip } from "@/lib/client-config-pack"
import { requireWebSession } from "@/lib/web-session"

const schema = z.object({
  host: z.string().trim().min(1, "Host required").max(253),
  domain: z.string().trim().max(253).optional(),
  lobbyPort: z.number().int().min(1).max(65535).optional(),
  updaterPort: z.number().int().min(1).max(65535).optional(),
  loginPort: z.number().int().min(1).max(65535).optional(),
  updaterScheme: z.enum(["http", "https"]).optional(),
  title: z.string().trim().max(80).optional(),
  tag: z.string().trim().max(40).optional(),
  websiteUrl: z.string().trim().max(2000).optional(),
})

export async function POST(request: Request) {
  const blocked = await guardApiMutation("admin-download-config-zip", 20, 60_000)
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

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid input",
      400,
      "VALIDATION"
    )
  }

  if (parsed.data.websiteUrl?.trim()) {
    try {
      const u = new URL(parsed.data.websiteUrl.trim())
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        return apiFail("Website URL must be http(s)", 400, "VALIDATION")
      }
    } catch {
      return apiFail("Invalid website URL", 400, "VALIDATION")
    }
  }

  try {
    const buf = await buildClientPrepZip({
      host: parsed.data.host,
      domain: parsed.data.domain || undefined,
      lobbyPort: parsed.data.lobbyPort,
      updaterPort: parsed.data.updaterPort,
      loginPort: parsed.data.loginPort,
      updaterScheme: parsed.data.updaterScheme,
      title: parsed.data.title,
      tag: parsed.data.tag,
      websiteUrl: parsed.data.websiteUrl?.trim() || undefined,
    })
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="client-config.zip"',
      },
    })
  } catch (e) {
    return apiFail(
      e instanceof Error ? e.message : "Failed to build config zip",
      502,
      "ENCRYPT"
    )
  }
}
