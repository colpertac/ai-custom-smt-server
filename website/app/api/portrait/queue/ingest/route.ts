import { apiFail, apiOk } from "@/lib/api-response"
import { requirePortraitWorker } from "@/lib/portrait-worker-auth"
import { ingestPortraitBytes } from "@/lib/portrait-queue"

export const dynamic = "force-dynamic"

/**
 * Upload a cropped PNG and mark the job ready.
 *
 * multipart/form-data:
 *   fingerprint — 16 hex
 *   file — PNG bytes (field name `file` or `image`)
 */
export async function POST(request: Request) {
  const denied = requirePortraitWorker(request)
  if (denied) return denied

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return apiFail("Expected multipart form body", 400, "VALIDATION")
  }

  const fingerprint = String(form.get("fingerprint") ?? "").trim()
  if (!/^[0-9a-f]{16}$/.test(fingerprint)) {
    return apiFail("Invalid fingerprint", 400, "VALIDATION")
  }

  const file =
    form.get("file") ?? form.get("image") ?? form.get("png")
  if (!file || typeof file === "string") {
    return apiFail("Missing file field (PNG)", 400, "VALIDATION")
  }

  const blob = file as Blob
  if (blob.size > 12 * 1024 * 1024) {
    return apiFail("PNG too large (max 12MB)", 413, "VALIDATION")
  }

  try {
    const buf = Buffer.from(await blob.arrayBuffer())
    const result = ingestPortraitBytes(buf, fingerprint)
    return apiOk(result, `Ready ${result.fingerprint}`)
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Ingest failed"
    const status = /not a PNG|empty|invalid fingerprint/i.test(msg)
      ? 400
      : 500
    return apiFail(msg, status, "QUEUE")
  }
}
