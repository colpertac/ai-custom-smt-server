"use client"

import { useCallback, useEffect, useState } from "react"
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

const KINDS = [
  {
    id: "release",
    label: "Full release (players + server) — usual",
    hint: "Zip with client/ (files players download) and server/ (live server data). Restart the game channel after server changes.",
  },
  {
    id: "content",
    label: "Mixed content (no client/ folder)",
    hint: "Top-level BinaryData/, Map/, packages/, and/or overlay/ folders in one zip.",
  },
  {
    id: "binarydata",
    label: "Character art data (BinaryData)",
    hint: "Goes to live server data only. Restart the game channel afterward. Players do not download this via the updater.",
  },
  {
    id: "maps",
    label: "Zone maps",
    hint: "Goes to live server data only. Restart the game channel afterward.",
  },
  {
    id: "packages",
    label: "Packages only",
    hint: "Server package zips (merge only — replace is not available).",
  },
  {
    id: "overlay",
    label: "Updater files only",
    hint: "Files the game updater downloads (translations, client assets). Refresh updater list runs automatically.",
  },
] as const

type KindId = (typeof KINDS)[number]["id"]
type ModeId = "merge" | "replace"

export function AdminOpsIngest() {
  const [kind, setKind] = useState<KindId>("release")
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
  }, [])

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

  const kindMeta = KINDS.find((k) => k.id === kind)

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <div>
          <h2 className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            Upload game files
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Add character art, maps, or files players download with the game
            updater. For a new item or demon, use a full release zip when you
            can.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          aria-label="Help: what each upload type means"
          onClick={() => setHelpOpen(true)}
        >
          <CircleHelp className="size-4 text-muted-foreground" />
        </Button>
      </div>
      {error ? (
        <FormAlert variant="error">{error}</FormAlert>
      ) : null}
      {ok ? <FormAlert variant="success">{ok}</FormAlert> : null}
      {overlayStale && !ok ? (
        <FormAlert variant="warning">
          Updater files changed but the download list was not refreshed. Click{" "}
          <span className="text-foreground">Refresh updater list</span> so
          players can download the new files.
        </FormAlert>
      ) : null}
      <OpsIngestStatus uploadPct={uploadPct} uploading={pending} job={job} />
      <div className="flex max-w-xl flex-col gap-3 border border-border/80 bg-muted/20 px-3 py-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">What are you uploading?</span>
          <select
            className="border border-border bg-muted/40 px-2 py-1.5 text-sm text-foreground"
            value={kind}
            disabled={busy}
            onChange={(e) => {
              const next = e.target.value as KindId
              setKind(next)
              if (next === "packages") setMode("merge")
            }}
          >
            {KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
          {kindMeta ? (
            <span className="text-xs text-muted-foreground">{kindMeta.hint}</span>
          ) : null}
        </label>
        <fieldset className="flex flex-col gap-2 text-sm">
          <legend className="text-muted-foreground">Mode</legend>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="ingest-mode"
              checked={mode === "merge"}
              disabled={busy}
              onChange={() => setMode("merge")}
              className="mt-1"
            />
            <span>
              <span className="text-foreground">Merge</span>
              <span className="block text-xs text-muted-foreground">
                Update/add files from the zip. Existing files not in the zip stay.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="ingest-mode"
              checked={mode === "replace"}
              disabled={busy || kind === "packages"}
              onChange={() => setMode("replace")}
              className="mt-1"
            />
            <span>
              <span className="text-foreground">Replace</span>
              <span className="block text-xs text-muted-foreground">
                Destination becomes an exact copy of the zip for maps,
                character art, or updater files. Files missing from the zip are
                deleted.
                {kind === "packages"
                  ? " (Not available for packages.)"
                  : ""}
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
                : kind === "overlay" || kind === "release"
                  ? "Upload & refresh list"
                  : "Upload & merge"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void rehash()}
          >
            {rehashing ? "Refreshing…" : "Refresh updater list"}
          </Button>
        </div>
      </div>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload types</DialogTitle>
            <DialogDescription>
              Some files go to the live game server. Others go to the updater so
              players download them before logging in.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[min(70vh,28rem)] space-y-4 overflow-y-auto text-xs/relaxed">
            <p className="text-muted-foreground">
              New item or demon art: prefer a{" "}
              <span className="font-medium text-foreground">full release</span>{" "}
              zip with both <code className="text-foreground">server/</code>{" "}
              (live server) and <code className="text-foreground">client/</code>{" "}
              (updater). Server-only packages or translation-only updater zips
              are the usual exceptions.
            </p>
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="py-1.5 pr-2 font-medium">Type</th>
                  <th className="py-1.5 font-medium">What it does</th>
                </tr>
              </thead>
              <tbody className="text-foreground">
                <tr className="border-b border-border/60 align-top">
                  <td className="py-2 pr-2">Full release</td>
                  <td className="py-2">
                    Player download files + live server data. Restart the game
                    channel after server changes.
                  </td>
                </tr>
                <tr className="border-b border-border/60 align-top">
                  <td className="py-2 pr-2">BinaryData / Maps / Packages</td>
                  <td className="py-2">
                    Live server only (character art, zones, packages). Restart
                    the game channel.
                  </td>
                </tr>
                <tr className="border-b border-border/60 align-top">
                  <td className="py-2 pr-2">Updater files</td>
                  <td className="py-2">
                    What players download with the game updater. Refresh updater
                    list afterward if needed.
                  </td>
                </tr>
                <tr className="align-top">
                  <td className="py-2 pr-2">Mixed content</td>
                  <td className="py-2">
                    Zip with top-level BinaryData, Map, packages, and/or overlay
                    folders.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}
