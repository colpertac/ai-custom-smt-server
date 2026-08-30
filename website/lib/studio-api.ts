/**
 * Server-only proxy to channel loopback studio API
 * (`127.0.0.1:StudioHttpPort`). Never expose StudioToken to the browser.
 */

export type StudioHealth = {
  ok: boolean
  vam1?: boolean
  vaf1?: boolean
  vam?: boolean
  vaf?: boolean
  va?: boolean
  error?: string
}

export type StudioDressResult = {
  ok: boolean
  mannequin?: string
  source?: string
  posed?: boolean
  dressed?: boolean
  error?: string
}

function studioBaseUrl(): string {
  const custom = process.env.PORTRAIT_STUDIO_URL?.trim()
  if (custom) return custom.replace(/\/$/, "")
  return "http://127.0.0.1:14700"
}

function studioToken(): string {
  return (
    process.env.PORTRAIT_STUDIO_TOKEN?.trim() ||
    process.env.COMP_STUDIO_TOKEN?.trim() ||
    ""
  )
}

async function studioFetch(
  path: string,
  init?: RequestInit
): Promise<{ status: number; json: Record<string, unknown> }> {
  const token = studioToken()
  if (!token) {
    throw new Error(
      "PORTRAIT_STUDIO_TOKEN (or COMP_STUDIO_TOKEN) is not set on the website"
    )
  }
  const url = `${studioBaseUrl()}${path}`
  let res: Response
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        "X-Studio-Token": token,
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    })
  } catch (e) {
    throw new Error(
      e instanceof Error
        ? `Studio API unreachable (${studioBaseUrl()}): ${e.message}`
        : "Studio API unreachable"
    )
  }
  let json: Record<string, unknown> = {}
  try {
    json = (await res.json()) as Record<string, unknown>
  } catch {
    json = { ok: false, error: `HTTP ${res.status}` }
  }
  return { status: res.status, json }
}

export async function getStudioHealth(): Promise<StudioHealth> {
  const { json } = await studioFetch("/studio/health")
  return {
    ok: Boolean(json.ok),
    vam1: Boolean(json.vam1 ?? json.vam),
    vaf1: Boolean(json.vaf1 ?? json.vaf),
    vam: Boolean(json.vam1 ?? json.vam),
    vaf: Boolean(json.vaf1 ?? json.vaf),
    va: Boolean(json.va),
    error: typeof json.error === "string" ? json.error : undefined,
  }
}

export async function dressStudioMannequin(input: {
  mannequin: string
  source: string
  pose?: boolean
  /** Floating name/title. Default true (admin). Worker uses false. */
  plate?: boolean
  zone?: number
  x?: number
  y?: number
}): Promise<StudioDressResult> {
  const mannequin = input.mannequin.trim()
  const source = input.source.trim()
  if (!mannequin || !source) {
    return { ok: false, error: "mannequin and source are required" }
  }
  const body: Record<string, unknown> = {
    mannequin,
    source,
    pose: input.pose !== false,
    plate: input.plate !== false,
  }
  if (input.zone != null) body.zone = input.zone
  if (input.x != null) body.x = input.x
  if (input.y != null) body.y = input.y

  const { json } = await studioFetch("/studio/dress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  return {
    ok: Boolean(json.ok),
    mannequin:
      typeof json.mannequin === "string" ? json.mannequin : mannequin,
    source: typeof json.source === "string" ? json.source : source,
    posed: typeof json.posed === "boolean" ? json.posed : undefined,
    dressed: typeof json.dressed === "boolean" ? json.dressed : undefined,
    error: typeof json.error === "string" ? json.error : undefined,
  }
}
