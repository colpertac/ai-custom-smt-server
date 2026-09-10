import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { guardApiMutation } from "@/lib/api-guard"
import {
  ingestOpsZip,
  ingestOpsZipStream,
  type OpsIngestKind,
  type OpsIngestMode,
  type OpsIngestResult,
} from "@/lib/ops-sidecar"
import { setPlannedMaintenance } from "@/lib/planned-maintenance"
import { requireWebSession } from "@/lib/web-session"

export const runtime = "nodejs"
export const maxDuration = 1800

const KINDS = new Set<OpsIngestKind>([
  "binarydata",
  "maps",
  "packages",
  "overlay",
  "content",
  "release",
])

/** Keep in sync with ops/zip_ingest.py MAX_UPLOAD. */
const MAX_BYTES: Record<OpsIngestKind, number> = {
  binarydata: 3 * 1024 * 1024 * 1024,
  maps: 3 * 1024 * 1024 * 1024,
  packages: 100 * 1024 * 1024,
  overlay: 500 * 1024 * 1024,
  content: 3 * 1024 * 1024 * 1024,
  release: 3 * 1024 * 1024 * 1024,
}

function parseKindModeWiki(source: {
  kind?: string | null
  mode?: string | null
  rehash?: string | null
  wiki?: string | null
}):
  | { ok: true; kind: OpsIngestKind; mode: OpsIngestMode; rehash: boolean; wiki: boolean }
  | { ok: false; message: string } {
  const kindRaw = String(source.kind || "").trim().toLowerCase()
  if (!KINDS.has(kindRaw as OpsIngestKind)) {
    return {
      ok: false,
      message: `kind must be one of: ${[...KINDS].join(", ")}`,
    }
  }
  const modeRaw = String(source.mode || "merge").trim().toLowerCase()
  const mode: OpsIngestMode = modeRaw === "replace" ? "replace" : "merge"
  const rehashRaw = String(source.rehash || "1").trim().toLowerCase()
  const rehash = !(
    rehashRaw === "0" ||
    rehashRaw === "false" ||
    rehashRaw === "no"
  )
  const wikiRaw = String(source.wiki || "0").trim().toLowerCase()
  const wiki =
    wikiRaw === "1" || wikiRaw === "true" || wikiRaw === "yes"
  return {
    ok: true,
    kind: kindRaw as OpsIngestKind,
    mode,
    rehash,
    wiki,
  }
}

function markUploadMaintenance(kind: OpsIngestKind, username: string, label: string) {
  if (kind === "maps") {
    setPlannedMaintenance(
      ["channel", "world"],
      "map_upload",
      300,
      username,
      `Map upload (${label})`
    )
  } else if (kind !== "overlay") {
    setPlannedMaintenance(
      ["channel"],
      "content_upload",
      300,
      username,
      `${kind} upload (${label})`
    )
  }
}

function ingestFailResponse(result: OpsIngestResult) {
  const msg =
    result.error === "not_allowed"
      ? "Ops sidecar missing /ingest/zip. Restart pnpm run ops-sidecar."
      : result.error === "ingest_busy"
        ? "Another ingest is still unpacking. Wait, then retry."
        : result.detail || result.error || "Zip ingest failed"
  const status = result.error === "ingest_busy" ? 409 : 502
  return apiFail(msg, status, "OPS")
}

function ingestOkResponse(result: OpsIngestResult) {
  if (result.jobId) {
    return apiOk(
      result,
      result.message || "Zip uploaded — unpacking in the background"
    )
  }
  const parts = [
    result.message || "Zip ingested",
    result.files != null ? `${result.files} written` : null,
    result.filesRemoved ? `${result.filesRemoved} removed` : null,
  ].filter(Boolean)
  return apiOk(result, parts.join(" — "))
}

export async function POST(request: Request) {
  const blocked = await guardApiMutation("admin-ops-ingest-zip", 5, 60_000)
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  const contentType = (request.headers.get("content-type") || "")
    .split(";")[0]
    .trim()
    .toLowerCase()
  const isMultipart = contentType.startsWith("multipart/")

  // Preferred path: raw zip body + query params (streams through to ops).
  if (!isMultipart) {
    const url = new URL(request.url)
    const parsed = parseKindModeWiki({
      kind: url.searchParams.get("kind"),
      mode: url.searchParams.get("mode"),
      rehash: url.searchParams.get("rehash"),
      wiki: url.searchParams.get("wiki"),
    })
    if (!parsed.ok) return apiFail(parsed.message, 400, "VALIDATION")

    const length = Number(request.headers.get("content-length") || "0")
    if (!Number.isFinite(length) || length <= 0) {
      return apiFail("Content-Length required", 400, "VALIDATION")
    }
    if (length > MAX_BYTES[parsed.kind]) {
      return apiFail(
        `File too large for kind=${parsed.kind} (max ${MAX_BYTES[parsed.kind]} bytes)`,
        413,
        "PAYLOAD"
      )
    }
    if (!request.body) {
      return apiFail("Empty body", 400, "VALIDATION")
    }

    markUploadMaintenance(parsed.kind, session.username, "zip")
    try {
      const result = await ingestOpsZipStream(
        parsed.kind,
        request.body,
        length,
        session.username,
        parsed.mode,
        { rehash: parsed.rehash, wiki: parsed.wiki }
      )
      if (!result.ok) return ingestFailResponse(result)
      return ingestOkResponse(result)
    } catch (error) {
      return apiFail(
        error instanceof Error ? error.message : "Zip ingest failed",
        502,
        "OPS"
      )
    }
  }

  // Legacy multipart (buffers the whole zip in the website — fine for small files).
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return apiFail("Expected multipart form data", 400, "VALIDATION")
  }

  const parsed = parseKindModeWiki({
    kind: String(form.get("kind") || ""),
    mode: String(form.get("mode") || ""),
    rehash: String(form.get("rehash") || ""),
    wiki: String(form.get("wiki") || ""),
  })
  if (!parsed.ok) return apiFail(parsed.message, 400, "VALIDATION")

  const file = form.get("file")
  if (!(file instanceof File)) {
    return apiFail("Missing file", 400, "VALIDATION")
  }
  if (file.size <= 0) {
    return apiFail("Empty file", 400, "VALIDATION")
  }
  if (file.size > MAX_BYTES[parsed.kind]) {
    return apiFail(
      `File too large for kind=${parsed.kind} (max ${MAX_BYTES[parsed.kind]} bytes)`,
      413,
      "PAYLOAD"
    )
  }

  markUploadMaintenance(parsed.kind, session.username, file.name || "zip")

  try {
    const result = await ingestOpsZip(
      parsed.kind,
      file,
      session.username,
      parsed.mode,
      { rehash: parsed.rehash, wiki: parsed.wiki }
    )
    if (!result.ok) return ingestFailResponse(result)
    return ingestOkResponse(result)
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Zip ingest failed",
      502,
      "OPS"
    )
  }
}
