import { z } from "zod"

import { isAdminLevel } from "@/lib/admin-level"
import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import {
  getEffectivePortraitPreviewUrl,
  getEffectivePortraitWorkerToken,
  getEffectiveStudioToken,
  getEffectiveStudioUrl,
} from "@/lib/studio-settings-store"
import { requireWebSession } from "@/lib/web-session"

const bodySchema = z.object({
  /** Draft fields from the form — empty string means use saved settings. */
  studioUrl: z.string().max(500).optional(),
  studioToken: z.string().max(500).optional(),
  previewUrl: z.string().max(500).optional(),
  workerToken: z.string().max(500).optional(),
})

type ProbeResult = {
  ok: boolean
  skipped?: boolean
  detail: string
  vam1?: boolean
  vaf1?: boolean
}

function pickUrl(draft: string | undefined, saved: string): string {
  const d = draft?.trim()
  if (d) return d.replace(/\/$/, "")
  return saved.replace(/\/$/, "")
}

function pickSecret(draft: string | undefined, saved: string): string {
  const d = draft?.trim()
  if (d) return d
  return saved
}

async function probeChannel(
  baseUrl: string,
  token: string
): Promise<ProbeResult> {
  if (!baseUrl) {
    return { ok: false, detail: "Studio URL is empty" }
  }
  if (!token) {
    return {
      ok: false,
      detail: "Studio token is empty — enter one or Save connection first",
    }
  }
  const url = `${baseUrl}/studio/health`
  let res: Response
  try {
    res = await fetch(url, {
      headers: {
        "X-Studio-Token": token,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    })
  } catch (e) {
    return {
      ok: false,
      detail: `Unreachable ${baseUrl}: ${e instanceof Error ? e.message : "error"}`,
    }
  }
  let json: Record<string, unknown> = {}
  try {
    json = (await res.json()) as Record<string, unknown>
  } catch {
    return { ok: false, detail: `HTTP ${res.status} (non-JSON)` }
  }
  if (res.status === 401 || json.error === "unauthorized") {
    return { ok: false, detail: "Token rejected by channel (mismatch or draft not published)" }
  }
  if (!res.ok || !json.ok) {
    return {
      ok: false,
      detail:
        typeof json.error === "string"
          ? json.error
          : `HTTP ${res.status}`,
    }
  }
  return {
    ok: true,
    detail: `Channel OK (${baseUrl})`,
    vam1: Boolean(json.vam1 ?? json.vam),
    vaf1: Boolean(json.vaf1 ?? json.vaf),
  }
}

async function probePreview(
  baseUrl: string,
  token: string
): Promise<ProbeResult> {
  if (!baseUrl) {
    return {
      ok: true,
      skipped: true,
      detail: "Preview URL empty — skipped (optional; run ./studio ping on Wine host for inbound check)",
    }
  }
  if (!token) {
    return {
      ok: false,
      detail: "Worker/studio token empty — needed for preview agent",
    }
  }
  const url = `${baseUrl}/health`
  let res: Response
  try {
    res = await fetch(url, {
      headers: {
        "X-Portrait-Worker-Token": token,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    })
  } catch (e) {
    return {
      ok: false,
      detail: `Preview unreachable ${baseUrl}: ${
        e instanceof Error ? e.message : "error"
      }. On the Wine host run: ./studio ping (lightweight; no game clients)`,
    }
  }
  if (res.status === 401) {
    return { ok: false, detail: "Preview agent rejected worker token" }
  }
  if (!res.ok) {
    return { ok: false, detail: `Preview HTTP ${res.status}` }
  }
  return { ok: true, detail: `Preview agent OK (${baseUrl})` }
}

export async function POST(request: Request) {
  const blocked = await guardApiMutation("admin-studio-test", 30, 60_000)
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  let body: unknown = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid input",
      400,
      "VALIDATION"
    )
  }

  const studioUrl = pickUrl(parsed.data.studioUrl, getEffectiveStudioUrl())
  const studioToken = pickSecret(
    parsed.data.studioToken,
    getEffectiveStudioToken()
  )
  const previewUrl = pickUrl(
    parsed.data.previewUrl,
    getEffectivePortraitPreviewUrl()
  )
  const workerToken = pickSecret(
    parsed.data.workerToken,
    getEffectivePortraitWorkerToken()
  )

  const channel = await probeChannel(studioUrl, studioToken)
  const preview = await probePreview(previewUrl, workerToken || studioToken)

  const ok = channel.ok && (preview.skipped || preview.ok)
  return apiOk(
    {
      channel,
      preview,
      ok,
      probed: {
        studioUrl,
        previewUrl: previewUrl || null,
        studioTokenSource: parsed.data.studioToken?.trim()
          ? "form"
          : "saved",
        workerTokenSource: parsed.data.workerToken?.trim()
          ? "form"
          : "saved",
      },
    },
    ok ? "Connection OK" : "Connection issues — see details"
  )
}
