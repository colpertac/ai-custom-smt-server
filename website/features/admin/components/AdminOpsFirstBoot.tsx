"use client"

import { useCallback, useEffect, useState } from "react"

import { FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import { OpsIngestStatus } from "@/features/admin/components/OpsIngestStatus"
import {
  runIngestZip,
  type IngestJobView,
} from "@/features/admin/ops-ingest-client"
import { api } from "@/lib/kyClient"

type Bucket = {
  files: number
  ready: boolean
  optional?: boolean
  hint?: string
}

type FirstBoot = {
  needed: boolean
  ready: boolean
  missing: string[]
  binarydata?: Bucket
  maps?: Bucket
  packages?: Bucket
  overlay?: Bucket
}

type KindId = "content" | "binarydata" | "maps" | "packages"

function BucketRow({
  label,
  required,
  bucket,
}: {
  label: string
  required: boolean
  bucket?: Bucket
}) {
  const ready = Boolean(bucket?.ready)
  return (
    <li className="flex items-start justify-between gap-3 text-sm">
      <span>
        <span className="text-foreground">{label}</span>
        <span className="ml-2 text-xs text-muted-foreground">
          {required ? "required" : "optional"}
          {bucket?.files != null ? ` · ${bucket.files} file(s)` : ""}
        </span>
        {bucket?.hint && !ready ? (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {bucket.hint}
          </span>
        ) : null}
      </span>
      <span className={ready ? "text-gold-hot" : "text-[#ffc9c9]"}>
        {ready ? "Ready" : "Empty"}
      </span>
    </li>
  )
}

export function AdminOpsFirstBoot() {
  const [boot, setBoot] = useState<FirstBoot | null>(null)
  const [sidecarOk, setSidecarOk] = useState(false)
  const [keepVisible, setKeepVisible] = useState(false)
  const [kind, setKind] = useState<KindId>("content")
  const [file, setFile] = useState<File | null>(null)
  const [pending, setPending] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [uploadPct, setUploadPct] = useState<number | null>(null)
  const [job, setJob] = useState<IngestJobView | null>(null)

  const refresh = useCallback(async () => {
    try {
      const response = await api("admin/ops/health")
      const json = (await response.json()) as {
        success?: boolean
        data?: { ok?: boolean; firstBoot?: FirstBoot }
      }
      if (!response.ok || !json.success || !json.data) {
        setSidecarOk(false)
        setBoot(null)
        return
      }
      setSidecarOk(Boolean(json.data.ok))
      const next = json.data.firstBoot ?? null
      setBoot(next)
      if (next?.needed) setKeepVisible(true)
    } catch {
      setSidecarOk(false)
      setBoot(null)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const onFreshness = () => {
      void refresh()
    }
    window.addEventListener("ops-freshness-changed", onFreshness)
    return () => {
      window.removeEventListener("ops-freshness-changed", onFreshness)
    }
  }, [refresh])

  useEffect(() => {
    if (file) return
    const bd = Boolean(boot?.binarydata?.ready)
    const maps = Boolean(boot?.maps?.ready)
    if (!bd && !maps) {
      setKind("content")
      return
    }
    if (!bd) {
      setKind("binarydata")
      return
    }
    if (!maps) setKind("maps")
  }, [boot, file])

  const upload = useCallback(async () => {
    if (!file) {
      setError("Choose a .zip file first")
      return
    }
    setPending(true)
    setError(null)
    setOk(null)
    setJob(null)
    setUploadPct(0)
    try {
      const result = await runIngestZip({
        kind,
        mode: "merge",
        file,
        onUploadProgress: setUploadPct,
        onJob: setJob,
      })
      if (!result.ok) {
        setError(result.message)
        return
      }
      setOk(result.message)
      setFile(null)
      window.dispatchEvent(new Event("ops-freshness-changed"))
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "ingest failed")
    } finally {
      setPending(false)
      setUploadPct(null)
    }
  }, [file, kind])

  const startServers = useCallback(async () => {
    setStarting(true)
    setError(null)
    setOk(null)
    try {
      const response = await api.post("admin/ops/start", { timeout: 180_000 })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
      }
      if (!response.ok || !json.success) {
        setError(json.message || `HTTP ${response.status}`)
        return
      }
      setOk(json.message || "Game servers started")
      setKeepVisible(false)
      window.dispatchEvent(new Event("ops-freshness-changed"))
    } catch (e) {
      setError(e instanceof Error ? e.message : "start failed")
    } finally {
      setStarting(false)
    }
  }, [])

  const show = Boolean(boot?.needed || keepVisible)
  if (!show || !sidecarOk) return null

  const ready = Boolean(boot?.ready)
  const busy = pending || starting

  return (
    <section className="space-y-3 border border-border/80 bg-muted/20 px-3 py-3">
      <div>
        <h2 className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          First-time setup
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          The live server data folders look empty. Upload character art data
          (BinaryData) and zone maps, then start the game servers. Files for the
          player updater can wait until you ship custom content.
        </p>
      </div>
      {error ? (
        <FormAlert variant="error">{error}</FormAlert>
      ) : null}
      {ok ? <FormAlert variant="success">{ok}</FormAlert> : null}
      {ready ? (
        <FormAlert variant="success">
          Character art and maps are in place. Start servers when you are ready.
        </FormAlert>
      ) : (
        <FormAlert variant="warning">
          Start is blocked until character art data and maps are uploaded.
        </FormAlert>
      )}
      <OpsIngestStatus uploadPct={uploadPct} uploading={pending} job={job} />
      <ul className="max-w-xl space-y-2 border border-border bg-background/40 px-3 py-2">
        <BucketRow
          label="Character art (BinaryData)"
          required
          bucket={boot?.binarydata}
        />
        <BucketRow label="Zone maps" required bucket={boot?.maps} />
        <BucketRow label="Packages" required={false} bucket={boot?.packages} />
        <BucketRow
          label="Updater files"
          required={false}
          bucket={boot?.overlay}
        />
      </ul>
      {!ready ? (
        <div className="flex max-w-xl flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Upload next zip</span>
            <select
              className="border border-border bg-muted/40 px-2 py-1.5 text-sm text-foreground"
              value={kind}
              disabled={busy}
              onChange={(e) => setKind(e.target.value as KindId)}
            >
              <option value="content">Mixed (BinaryData + Map)</option>
              <option value="binarydata">Character art only</option>
              <option value="maps">Maps only</option>
              <option value="packages">Packages (optional)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Zip file</span>
            <input
              type="file"
              accept=".zip,application/zip"
              disabled={busy}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm file:mr-2 file:border file:border-border file:bg-muted/40 file:px-2 file:py-1"
            />
          </label>
          <div>
            <Button
              type="button"
              size="sm"
              disabled={busy || !file}
              onClick={() => void upload()}
            >
              {pending ? "Uploading…" : "Upload & merge"}
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => void startServers()}
          >
            {starting ? "Starting…" : "Start servers"}
          </Button>
        </div>
      )}
    </section>
  )
}
