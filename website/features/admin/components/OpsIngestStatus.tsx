"use client"

import { useEffect, useRef } from "react"

import type { IngestJobView } from "@/features/admin/ops-ingest-client"

export function OpsIngestStatus({
  uploadPct,
  uploading,
  job,
}: {
  uploadPct: number | null
  uploading: boolean
  job: IngestJobView | null
}) {
  const logRef = useRef<HTMLPreElement>(null)
  const logs = job?.logs ?? []

  useEffect(() => {
    const el = logRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [logs.length])

  if (!uploading && !job) return null

  const files =
    job?.filesTotal && job.filesTotal > 0
      ? `${job.filesDone ?? 0} / ${job.filesTotal} files`
      : null

  let headline = "Preparing upload…"
  if (uploading && uploadPct != null) {
    headline = `Uploading zip… ${uploadPct}%`
  } else if (job?.phase === "unpacking" || job?.phase === "uploaded") {
    headline = files
      ? `Zip uploaded. Unpacking ${files}`
      : "Zip uploaded. Unpacking…"
  } else if (job?.phase === "done") {
    headline = files ? `Unpack complete (${files})` : "Unpack complete"
  } else if (job?.phase === "error") {
    headline = job.error || "Unpack failed"
  }

  return (
    <div className="mt-4 max-w-xl">
      <p className="text-sm text-foreground">{headline}</p>
      {logs.length ? (
        <pre
          ref={logRef}
          className="mt-2 max-h-48 overflow-y-auto border border-border bg-muted/30 p-2 font-mono text-[11px] leading-snug text-muted-foreground"
        >
          {logs.map((line, i) => (
            <span key={`${line.at ?? ""}-${i}`} className="block">
              {line.msg}
            </span>
          ))}
        </pre>
      ) : null}
    </div>
  )
}
