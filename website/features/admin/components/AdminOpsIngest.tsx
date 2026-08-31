"use client"

import { useCallback, useEffect, useId, useState, type ReactNode } from "react"
import { CircleHelp } from "lucide-react"

import { FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { OpsIngestStatus } from "@/features/admin/components/OpsIngestStatus"
import {
  runIngestZip,
  type IngestJobView,
} from "@/features/admin/ops-ingest-client"
import { api } from "@/lib/kyClient"

export type IngestKindId =
  | "release"
  | "content"
  | "binarydata"
  | "maps"
  | "packages"
  | "overlay"

type KindOption = {
  id: IngestKindId
  label: string
  hint: string
}

type ModeId = "merge" | "replace"

const SERVER_KINDS = [
  {
    id: "binarydata",
    label: "Character art (BinaryData)",
    hint: "Live server Shield tables and art. Restart the game channel afterward.",
  },
  {
    id: "maps",
    label: "Zone maps",
    hint: "Live server map files. Restart the game channel afterward.",
  },
  {
    id: "packages",
    label: "Packages",
    hint: "Server package zips under datastore/packages/ (merge only).",
  },
  {
    id: "content",
    label: "Mixed server content",
    hint: "Top-level BinaryData/, Map/, packages/, zones/, events/, data/, etc.",
  },
] as const satisfies readonly KindOption[]

const CLIENT_KINDS = [
  {
    id: "overlay",
    label: "Client files",
    hint: "Paths mirror the game install (e.g. Title/foo.txt). Players run ImagineUpdate; list refresh runs automatically.",
  },
] as const satisfies readonly KindOption[]

type OpsIngestPanelProps = {
  title: string
  description: string
  kinds: readonly KindOption[]
  defaultKind: IngestKindId
  showRehash?: boolean
  trackOverlayStale?: boolean
  zipHint?: string
  helpTitle: string
  helpDescription: string
  helpBody: ReactNode
}

function OpsIngestPanel({
  title,
  description,
  kinds,
  defaultKind,
  showRehash = false,
  trackOverlayStale = false,
  zipHint,
  helpTitle,
  helpDescription,
  helpBody,
}: OpsIngestPanelProps) {
  const modeGroupId = useId()
  const [kind, setKind] = useState<IngestKindId>(defaultKind)
  const [mode, setMode] = useState<ModeId>("merge")
  const [file, setFile] = useState<File | null>(null)
  const [pending, setPending] = useState(false)
  const [rehashing, setRehashing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [uploadPct, setUploadPct] = useState<number | null>(null)
  const [job, setJob] = useState<IngestJobView | null>(null)
  const [overlayStale, setOverlayStale] = useState(false)

  const refreshStale = useCallback(async () => {
    if (!trackOverlayStale) return
    try {
      const response = await api("admin/ops/health")
      const json = (await response.json()) as {
        success?: boolean
        data?: { overlayStale?: boolean }
      }
      if (response.ok && json.success) {
        setOverlayStale(Boolean(json.data?.overlayStale))
      }
    } catch {
      /* ignore */
    }
  }, [trackOverlayStale])

  useEffect(() => {
    void refreshStale()
  }, [refreshStale])

  useEffect(() => {
    const onFreshness = () => {
      void refreshStale()
    }
    window.addEventListener("ops-freshness-changed", onFreshness)
    return () => {
      window.removeEventListener("ops-freshness-changed", onFreshness)
    }
  }, [refreshStale])

  const busy = pending || rehashing
  const replaceAllowed = kind !== "packages"
  const autoRehash = kind === "overlay" || kind === "release"

  const onSubmit = useCallback(async () => {
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
        mode,
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "ingest failed")
    } finally {
      setPending(false)
      setUploadPct(null)
    }
  }, [file, kind, mode])

  const rehash = useCallback(async () => {
    setRehashing(true)
    setError(null)
    setOk(null)
    try {
      const response = await api.post("admin/ops/publish/lane-b")
      const json = (await response.json()) as {
        success?: boolean
        message?: string
      }
      if (!response.ok || !json.success) {
        setError(json.message || `HTTP ${response.status}`)
        return
      }
      setOk(json.message || "Updater list refreshed")
      window.dispatchEvent(new Event("ops-freshness-changed"))
    } catch (e) {
      setError(e instanceof Error ? e.message : "rehash failed")
    } finally {
      setRehashing(false)
    }
  }, [])

  const kindMeta = kinds.find((k) => k.id === kind)

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <div>
          <h2 className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            {title}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          aria-label={`Help: ${title}`}
          onClick={() => setHelpOpen(true)}
        >
          <CircleHelp className="size-4 text-muted-foreground" />
        </Button>
      </div>
      {error ? (
        <FormAlert variant="error">{error}</FormAlert>
      ) : null}
      {ok ? <FormAlert variant="success">{ok}</FormAlert> : null}
      {trackOverlayStale && overlayStale && !ok ? (
        <FormAlert variant="warning">
          Updater files changed but the download list was not refreshed. Click{" "}
          <span className="text-foreground">Refresh updater list</span> so
          players can download the new files.
        </FormAlert>
      ) : null}
      <OpsIngestStatus uploadPct={uploadPct} uploading={pending} job={job} />
      <div className="flex max-w-xl flex-col gap-3 border border-border/80 bg-muted/20 px-3 py-3">
        {kinds.length > 1 ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">What are you uploading?</span>
            <select
              className="border border-border bg-muted/40 px-2 py-1.5 text-sm text-foreground"
              value={kind}
              disabled={busy}
              onChange={(e) => {
                const next = e.target.value as IngestKindId
                setKind(next)
                if (next === "packages") setMode("merge")
              }}
            >
              {kinds.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
            {kindMeta ? (
              <span className="text-xs text-muted-foreground">{kindMeta.hint}</span>
            ) : null}
          </label>
        ) : kindMeta ? (
          <p className="text-xs text-muted-foreground">{kindMeta.hint}</p>
        ) : null}
        <fieldset className="flex flex-col gap-2 text-sm">
          <legend className="text-muted-foreground">Mode</legend>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name={`ingest-mode-${modeGroupId}`}
              checked={mode === "merge"}
              disabled={busy}
              onChange={() => setMode("merge")}
              className="mt-1"
            />
            <span>
              <span className="text-foreground">Merge</span>
              <span className="text-xs text-muted-foreground/60">
                {" "}
                (recommended)
              </span>
              <span className="block text-xs text-muted-foreground">
                Update/add files from the zip. Existing files not in the zip stay.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name={`ingest-mode-${modeGroupId}`}
              checked={mode === "replace"}
              disabled={busy || !replaceAllowed}
              onChange={() => setMode("replace")}
              className="mt-1"
            />
            <span>
              <span className="text-foreground">Replace</span>
              <span className="block text-xs text-muted-foreground">
                Destination becomes an exact copy of the zip for maps, character
                art, or client updater files. Files missing from the zip are
                deleted.
                {!replaceAllowed ? " (Not available for packages.)" : ""}
              </span>
            </span>
          </label>
        </fieldset>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Zip file</span>
          <input
            type="file"
            accept=".zip,application/zip"
            disabled={busy}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm file:mr-2 file:border file:border-border file:bg-muted/40 file:px-2 file:py-1"
          />
          {zipHint ? (
            <span className="text-xs text-muted-foreground">{zipHint}</span>
          ) : null}
          {file ? (
            <span className="text-xs text-muted-foreground">
              {file.name} ({Math.round(file.size / 1024)} KiB)
            </span>
          ) : null}
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={mode === "replace" ? "destructive" : "default"}
            disabled={busy || !file}
            onClick={() => void onSubmit()}
          >
            {pending
              ? "Uploading…"
              : mode === "replace"
                ? "Upload & replace"
                : autoRehash
                  ? "Upload & refresh list"
                  : "Upload & merge"}
          </Button>
          {showRehash ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void rehash()}
            >
              {rehashing ? "Refreshing…" : "Refresh updater list"}
            </Button>
          ) : null}
        </div>
      </div>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{helpTitle}</DialogTitle>
            <DialogDescription>{helpDescription}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[min(70vh,28rem)] space-y-4 overflow-y-auto text-xs/relaxed">
            {helpBody}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}

export function AdminOpsServerUpload() {
  return (
    <OpsIngestPanel
      title="Server / backend"
      description="Live game channel data — maps, Shield tables, zone XML, packages. Restart the game channel after upload."
      kinds={SERVER_KINDS}
      defaultKind="binarydata"
      helpTitle="Server uploads"
      helpDescription="These files land on the running game server, not in the client updater."
      helpBody={
        <>
          <p className="text-muted-foreground">
            Use this when only the server needs new data. Players do not run
            ImagineUpdate for BinaryData, maps, or zone/event XML. If a change
            needs both server and client files, upload each side in its section
            below.
          </p>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="py-1.5 pr-2 font-medium">Type</th>
                <th className="py-1.5 font-medium">Goes to</th>
              </tr>
            </thead>
            <tbody className="text-foreground">
              <tr className="border-b border-border/60 align-top">
                <td className="py-2 pr-2">BinaryData</td>
                <td className="py-2">
                  <code className="text-foreground">datastore/BinaryData/</code> —
                  restart channel
                </td>
              </tr>
              <tr className="border-b border-border/60 align-top">
                <td className="py-2 pr-2">Maps</td>
                <td className="py-2">
                  <code className="text-foreground">datastore/Map/</code> —
                  restart channel
                </td>
              </tr>
              <tr className="border-b border-border/60 align-top">
                <td className="py-2 pr-2">Mixed server</td>
                <td className="py-2">
                  Routes by folder: Map/, zones/, events/, data/, BinaryData/,
                  etc.
                </td>
              </tr>
              <tr className="align-top">
                <td className="py-2 pr-2">Packages</td>
                <td className="py-2">
                  <code className="text-foreground">datastore/packages/</code> —
                  merge only
                </td>
              </tr>
            </tbody>
          </table>
        </>
      }
    />
  )
}

export function AdminOpsClientUpload() {
  return (
    <OpsIngestPanel
      title="Client updater"
      description="Files players download with ImagineUpdate before logging in."
      kinds={CLIENT_KINDS}
      defaultKind="overlay"
      showRehash
      trackOverlayStale
      zipHint='Zip paths mirror the game install — e.g. Title/foo.txt lands in <game>/Title/foo.txt after ImagineUpdate.'
      helpTitle="Client updater uploads"
      helpDescription="These files are published to the updater overlay and listed in hashlist.dat after refresh."
      helpBody={
        <>
          <p className="text-muted-foreground">
            Put files in the zip using the same folder layout as a Reimagine
            install. A zip containing{" "}
            <code className="text-foreground">Title/foo.txt</code> publishes{" "}
            <code className="text-foreground">Title/foo.txt</code> to the updater;
            after ImagineUpdate, players have{" "}
            <code className="text-foreground">&lt;game&gt;/Title/foo.txt</code>.
          </p>
          <p className="text-muted-foreground">
            Common paths: <code className="text-foreground">BinaryData/Shield/</code>
            , <code className="text-foreground">Event/</code>,{" "}
            <code className="text-foreground">Interface/</code>,{" "}
            <code className="text-foreground">translations/</code>,{" "}
            <code className="text-foreground">webaccess.sdat</code>. You can
            also prefix everything with{" "}
            <code className="text-foreground">client/</code> or{" "}
            <code className="text-foreground">overlay/</code>.
          </p>
          <p className="text-muted-foreground">
            After upload, the updater list is refreshed automatically. Players
            must run <span className="text-foreground">ImagineUpdate</span>{" "}
            (not just launch the game) to fetch new or changed files.
          </p>
        </>
      }
    />
  )
}

/** @deprecated Use AdminOpsServerUpload and AdminOpsClientUpload */
export function AdminOpsIngest() {
  return (
    <>
      <AdminOpsServerUpload />
      <AdminOpsClientUpload />
    </>
  )
}
