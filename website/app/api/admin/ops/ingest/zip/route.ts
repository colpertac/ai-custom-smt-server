import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { guardApiMutation } from "@/lib/api-guard"
import {
  ingestOpsZip,
  type OpsIngestKind,
  type OpsIngestMode,
} from "@/lib/ops-sidecar"
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

const MAX_BYTES: Record<OpsIngestKind, number> = {
  binarydata: 600 * 1024 * 1024,
  maps: 3 * 1024 * 1024 * 1024,
  packages: 100 * 1024 * 1024,
  overlay: 500 * 1024 * 1024,
  content: 3 * 1024 * 1024 * 1024,
  release: 3 * 1024 * 1024 * 1024,
}

export async function POST(request: Request) {
  const blocked = await guardApiMutation("admin-ops-ingest-zip", 5, 60_000)
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return apiFail("Expected multipart form data", 400, "VALIDATION")
  }

  const kindRaw = String(form.get("kind") || "").trim().toLowerCase()
  if (!KINDS.has(kindRaw as OpsIngestKind)) {
    return apiFail(
      `kind must be one of: ${[...KINDS].join(", ")}`,
      400,
      "VALIDATION"
    )
  }
  const kind = kindRaw as OpsIngestKind

  const modeRaw = String(form.get("mode") || "merge").trim().toLowerCase()
  const mode: OpsIngestMode =
    modeRaw === "replace" ? "replace" : "merge"

  const rehashRaw = String(form.get("rehash") || "1").trim().toLowerCase()
  const rehash = !(rehashRaw === "0" || rehashRaw === "false" || rehashRaw === "no")

  const file = form.get("file")
  if (!(file instanceof File)) {
    return apiFail("Missing file", 400, "VALIDATION")
  }
  if (file.size <= 0) {
    return apiFail("Empty file", 400, "VALIDATION")
  }
  if (file.size > MAX_BYTES[kind]) {
    return apiFail(
      `File too large for kind=${kind} (max ${MAX_BYTES[kind]} bytes)`,
      413,
      "PAYLOAD"
    )
  }

  try {
    const result = await ingestOpsZip(kind, file, session.username, mode, {
      rehash: rehash,
    })
    if (!result.ok) {
      const msg =
        result.error === "not_allowed"
          ? "Ops sidecar missing /ingest/zip. Restart pnpm run ops-sidecar."
          : result.error === "ingest_busy"
            ? "Another ingest is still unpacking. Wait, then retry."
            : result.detail || result.error || "Zip ingest failed"
      const status = result.error === "ingest_busy" ? 409 : 502
      return apiFail(msg, status, "OPS")
    }
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
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Zip ingest failed",
      502,
      "OPS"
    )
  }
}
