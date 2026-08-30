export type IngestLogLine = { at?: string; msg: string }

export type IngestJobView = {
  phase?: string
  filesDone?: number
  filesTotal?: number
  logs: IngestLogLine[]
  finished?: boolean
  error?: string | null
  result?: { ok?: boolean; message?: string; firstBoot?: unknown }
}

type ApiEnvelope<T> = {
  success?: boolean
  message?: string
  data?: T
}

export function uploadIngestZipXhr(opts: {
  kind: string
  mode: string
  file: File
  onProgress: (pct: number) => void
}): Promise<ApiEnvelope<{ jobId?: string; message?: string }>> {
  return new Promise((resolve, reject) => {
    const body = new FormData()
    body.set("kind", opts.kind)
    body.set("mode", opts.mode)
    body.set("file", opts.file)
    const xhr = new XMLHttpRequest()
    xhr.open("POST", "/api/admin/ops/ingest/zip")
    xhr.timeout = 0
    xhr.withCredentials = true
    xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest")
    xhr.upload.onprogress = (ev) => {
      if (!ev.lengthComputable || ev.total <= 0) return
      opts.onProgress(Math.min(100, Math.round((100 * ev.loaded) / ev.total)))
    }
    xhr.onload = () => {
      let parsed: ApiEnvelope<{ jobId?: string }>
      try {
        parsed = JSON.parse(xhr.responseText) as ApiEnvelope<{ jobId?: string }>
      } catch {
        reject(new Error(`HTTP ${xhr.status}`))
        return
      }
      if (xhr.status >= 400 || parsed.success === false) {
        resolve({
          success: false,
          message: parsed.message || `HTTP ${xhr.status}`,
          data: parsed.data,
        })
        return
      }
      resolve(parsed)
    }
    xhr.onerror = () => reject(new Error("Upload failed"))
    xhr.ontimeout = () => reject(new Error("Upload timed out"))
    xhr.send(body)
  })
}

export async function fetchIngestJob(
  jobId: string
): Promise<
  ApiEnvelope<
    IngestJobView & { result?: { message?: string; firstBoot?: unknown } }
  >
> {
  const response = await fetch(
    `/api/admin/ops/ingest/job?id=${encodeURIComponent(jobId)}`,
    {
      credentials: "include",
      headers: { "X-Requested-With": "XMLHttpRequest" },
    }
  )
  return (await response.json()) as ApiEnvelope<
    IngestJobView & { result?: { message?: string; firstBoot?: unknown } }
  >
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

export async function runIngestZip(opts: {
  kind: string
  mode: string
  file: File
  onUploadProgress: (pct: number) => void
  onJob: (job: IngestJobView) => void
}): Promise<{
  ok: boolean
  message: string
  job: IngestJobView | null
  firstBoot?: unknown
}> {
  const uploaded = await uploadIngestZipXhr({
    kind: opts.kind,
    mode: opts.mode,
    file: opts.file,
    onProgress: opts.onUploadProgress,
  })
  const jobId = uploaded.data?.jobId
  if (!uploaded.success) {
    return {
      ok: false,
      message: uploaded.message || "Upload failed",
      job: null,
    }
  }
  // Older sidecar (or a fully-synchronous ingest) has no jobId; the zip
  // is already unpacked. Do not treat that as an error.
  if (!jobId) {
    return {
      ok: true,
      message: uploaded.message || "Zip ingested",
      job: {
        phase: "done",
        logs: [{ msg: uploaded.message || "Zip ingested" }],
        finished: true,
      },
    }
  }
  opts.onJob({
    phase: "unpacking",
    logs: [{ msg: uploaded.message || "Zip uploaded — unpacking" }],
  })
  for (let i = 0; i < 36_000; i += 1) {
    await sleep(500)
    const snap = await fetchIngestJob(jobId)
    if (!snap.success || !snap.data) {
      return {
        ok: false,
        message: snap.message || "Lost ingest job (restart ops-sidecar?)",
        job: null,
      }
    }
    opts.onJob(snap.data)
    if (snap.data.finished || snap.data.phase === "done" || snap.data.phase === "error") {
      const resultMsg = snap.data.result?.message
      const failed =
        snap.data.phase === "error" || snap.data.result?.ok === false
      return {
        ok: !failed,
        message:
          resultMsg ||
          (failed
            ? snap.data.error || "Unpack failed"
            : "Unpack complete"),
        job: snap.data,
        firstBoot: snap.data.result?.firstBoot,
      }
    }
  }
  return { ok: false, message: "Timed out waiting for unpack", job: null }
}
